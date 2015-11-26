package main

import (
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/hectane/go-asyncserver"

	"crypto/tls"
	"encoding/json"
	"net/http"
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
	router        *mux.Router
	server        *server.AsyncServer
	upgrader      *websocket.Upgrader
	rooms         map[int]UserMap
	clientMessage chan *Message
	clientError   chan *User
	stop          chan bool
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
	_, ok := s.rooms[roomId]
	if !ok {
		s.rooms[roomId] = make(UserMap)
	}
	room := s.rooms[roomId]
	_, ok = room[userId]
	if ok {
		// TODO: better error handling
		conn.Close()
		return
	}
	newUser := NewUser(conn, roomId, userId, s.clientMessage, s.clientError)
	room[userId] = newUser
	for _, user := range room {
		s := user.State()
		for _, msg := range s.Messages(user.RoomId, user.UserId) {
			newUser.Send(msg)
		}
	}
}

// Process a ping from the user.
func (s *Server) ping(w http.ResponseWriter, r *http.Request) {
	b, err := json.Marshal(struct{}{})
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Add("Content-Length", strconv.Itoa(len(b)))
	w.Header().Add("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(b)
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
	s := &Server{
		router: mux.NewRouter(),
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
	s.router.HandleFunc("/api/connect/{room:[0-9]+}/{user:[0-9]+}", s.connect)
	s.router.HandleFunc("/api/ping", s.ping)
	s.router.PathPrefix("/static/").Handler(http.FileServer(http.Dir(config.Root)))
	s.server.Handler = s.router
	if config.TLSCert != "" && config.TLSKey != "" {
		c, err := tls.LoadX509KeyPair(config.TLSCert, config.TLSKey)
		if err != nil {
			return nil, err
		}
		s.server.TLSConfig.Certificates = make([]tls.Certificate, 1)
		s.server.TLSConfig.Certificates[0] = c
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
