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
)

// Server configuration.
type ServerConfig struct {
	Addr    string
	Root    string
	TLSCert string
	TLSKey  string
}

// Server providing the script installation page and public API.
type Server struct {
	server        *server.AsyncServer
	upgrader      *websocket.Upgrader
	roomMap       *RoomMap
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

// Upgrade the connection to websocket and add the user.
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
	s.roomMap.AddUser(
		NewUser(conn, roomId, userId, s.clientMessage, s.clientError),
	)
}

// Process a ping from the user.
func (s *Server) ping(w http.ResponseWriter, r *http.Request) {
	s.writeJSON(w, struct{}{})
}

// Retrieve statistics about current users.
func (s *Server) stats(w http.ResponseWriter, r *http.Request) {
	s.writeJSON(w, s.roomMap.Stats())
}

// Listen for messages and propagate them as necessary.
// TODO: politely close all client connections when server terminates.
func (s *Server) run() {
	defer func() {
		s.stop <- true
	}()
	for {
		select {
		case m := <-s.clientMessage:
			s.roomMap.Broadcast(m)
		case u := <-s.clientError:
			s.roomMap.RemoveUser(u)
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
			roomMap:       NewRoomMap(),
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
