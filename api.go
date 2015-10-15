package main

import (
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"

	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"sync"
)

// Public API used for communication between clients.
type API struct {
	sync.Mutex
	server       *http.Server
	router       *mux.Router
	upgrader     *websocket.Upgrader
	users        []*User
	stateChanged chan *User
	socketError  chan *User
}

// Upgrade the connection to websocket.
func (a *API) connect(w http.ResponseWriter, r *http.Request) {
	if conn, err := a.upgrader.Upgrade(w, r, nil); err == nil {
		newUser := NewUser(conn, a.stateChanged, a.socketError)
		a.Lock()
		for _, u := range a.users {
			newUser.Send(u.State())
		}
		a.users = append(a.users, newUser)
		a.Unlock()
	} else {
		log.Println(err)
	}
}

// Report the current version of the server.
func (a *API) version(w http.ResponseWriter, r *http.Request) {
	if data, err := json.Marshal(map[string]interface{}{
		"version": "1.0",
	}); err == nil {
		w.Header().Set("Content-Length", strconv.Itoa(len(data)))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write(data)
	} else {
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}
}

// Wait for a notification from a user and broadcast it to the others.
func (a *API) notifyUsers() {
	for {
		changedUser := <-a.stateChanged
		a.Lock()
		for _, u := range a.users {
			u.Send(changedUser.State())
		}
		a.Unlock()
	}
}

// Wait for a request that a user be removed from the list.
func (a *API) removeUser() {
	for {
		removedUser := <-a.socketError
		a.Lock()
		for i, u := range a.users {
			if u == removedUser {
				a.users = append(a.users[:i], a.users[i+1:]...)
			}
		}
		a.Unlock()
	}
}

// Create a new instance of the API.
func NewAPI(addr string) *API {
	a := &API{
		server: &http.Server{
			Addr: addr,
		},
		router: mux.NewRouter(),
		upgrader: &websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		users:        make([]*User, 0),
		stateChanged: make(chan *User),
		socketError:  make(chan *User),
	}
	a.server.Handler = a
	a.router.HandleFunc("/api/connect", a.connect)
	a.router.HandleFunc("/api/version", a.version)
	go a.notifyUsers()
	go a.removeUser()
	return a
}

// Process an incoming request, setting CORS headers where possible.
func (a *API) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	a.router.ServeHTTP(w, r)
}

// Listen for new connections.
func (a *API) Listen() error {
	return a.server.ListenAndServe()
}
