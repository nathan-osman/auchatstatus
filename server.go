package main

import (
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/hectane/go-asyncserver"

	"crypto/tls"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strconv"
	"sync"
)

// Map user IDs to *User instances.
type UserMap map[int]*User

// Server configuration.
type ServerConfig struct {
	Addr    string
	Root    string
	TLSCert string
	TLSKey  string
}

// Server providing the script installation page and public API.
type Server struct {
	mutex         sync.Mutex
	server        *server.AsyncServer
	upgrader      *websocket.Upgrader
	rooms         map[int]UserMap
	clientMessage chan *Message
	clientError   chan *User
	stop          chan bool
}

// Write a JSON response.
func (s *Server) writeJSON(w http.ResponseWriter, i interface{}) {
	b, err := json.Marshal(i)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Length", strconv.Itoa(len(b)))
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}

// Upgrade the connection to websocket. Note that a client may only have a
// single connection for each room they are in.
func (s *Server) connect(w http.ResponseWriter, r *http.Request) {
	var (
		vars      = mux.Vars(r)
		roomId, _ = strconv.Atoi(vars["room"])
		userId, _ = strconv.Atoi(vars["user"])
	)
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.mutex.Lock()
	defer s.mutex.Unlock()
	room, ok := s.rooms[roomId]
	if ok {
		_, ok = room[userId]
		if ok {
			conn.Close()
			return
		}
	} else {
		room = make(UserMap)
		s.rooms[roomId] = room
	}
	newUser := NewUser(conn, roomId, userId, s.clientMessage, s.clientError)
	for _, user := range room {
		s := user.State()
		for _, msg := range s.Messages(user.RoomId, user.UserId) {
			newUser.Send(msg)
		}
	}
	room[userId] = newUser
}

// Process a ping from the user.
func (s *Server) ping(w http.ResponseWriter, r *http.Request) {
	s.writeJSON(w, struct{}{})
}

// Retrieve statistics about current users.
func (s *Server) stats(w http.ResponseWriter, r *http.Request) {
	var (
		numRooms = 0
		numUsers = 0
	)
	s.mutex.Lock()
	numRooms = len(s.rooms)
	for _, room := range s.rooms {
		numUsers += len(room)
	}
	s.mutex.Unlock()
	s.writeJSON(w, map[string]int{
		"num_rooms": numRooms,
		"num_users": numUsers,
	})
}

// Propagate the specified message to a room.
func (s *Server) propagateMessage(msg *Message) {
	for _, u := range s.rooms[msg.RoomId] {
		u.Send(msg)
	}
}

// Remove the specified user from the room they are in. If there are no more
// users in the room, delete it - otherwise, notify the other users.
func (s *Server) processError(u *User) {
	delete(s.rooms[u.RoomId], u.UserId)
	if len(s.rooms[u.RoomId]) == 0 {
		delete(s.rooms, u.RoomId)
	} else {
		s.propagateMessage(&Message{
			RoomId: u.RoomId,
			UserId: u.UserId,
			Type:   UserQuit,
		})
	}
}

// Listen for messages and propagate them as necessary.
// TODO: politely close all client connections when server terminates.
func (s *Server) run() {
	defer func() {
		s.stop <- true
	}()
	for {
		select {
		case msg := <-s.clientMessage:
			s.mutex.Lock()
			if _, ok := s.rooms[msg.RoomId]; ok {
				s.propagateMessage(msg)
			}
			s.mutex.Unlock()
		case u := <-s.clientError:
			s.mutex.Lock()
			s.processError(u)
			s.mutex.Unlock()
		case <-s.stop:
			return
		}
	}
}

// Create a new API server with the provided configuration.
func NewServer(config *ServerConfig) (*Server, error) {
	var (
		r = mux.NewRouter()
		s = &Server{
			server: server.New(config.Addr),
			upgrader: &websocket.Upgrader{
				CheckOrigin: func(r *http.Request) bool {
					return true
				},
			},
			rooms:         make(map[int]UserMap),
			clientMessage: make(chan *Message),
			clientError:   make(chan *User),
			stop:          make(chan bool),
		}
	)
	r.HandleFunc("/api/connect/{room:[0-9]+}/{user:[0-9]+}", s.connect)
	r.HandleFunc("/api/ping", s.ping)
	r.HandleFunc("/api/stats", s.stats)
	r.PathPrefix("/").Handler(http.FileServer(http.Dir(filepath.Join(config.Root, "www"))))
	s.server.Handler = r
	if config.TLSCert != "" && config.TLSKey != "" {
		c, err := tls.LoadX509KeyPair(config.TLSCert, config.TLSKey)
		if err != nil {
			return nil, err
		}
		s.server.TLSConfig = &tls.Config{
			Certificates: []tls.Certificate{c},
		}
	}
	return s, nil
}

// Start the API server.
func (s *Server) Start() error {
	if err := s.server.Start(); err != nil {
		return err
	}
	go s.run()
	return nil
}

// Stop the API server.
func (s *Server) Stop() {
	s.server.Stop()
	s.stop <- true
	<-s.stop
}
