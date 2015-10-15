package main

import (
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"

	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
)

// Public API used for communication between clients.
type API struct {
	sync.Mutex
	server       *http.Server
	upgrader     *websocket.Upgrader
	users        []*User
	stateChanged chan *User
	socketError  chan *User
}

// Upgrade the connection to websocket.
func (a *API) connect(w http.ResponseWriter, r *http.Request) {
	if conn, err := a.upgrader.Upgrade(w, r, nil); err == nil {
		a.Lock()
		a.users = append(a.users, NewUser(conn, a.stateChanged, a.socketError))
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
func NewAPI(port int) *API {
	var (
		a = &API{
			server: &http.Server{
				Addr: fmt.Sprintf("0.0.0.0:%d", port),
			},
			upgrader:     &websocket.Upgrader{},
			users:        make([]*User, 0),
			stateChanged: make(chan *User),
			socketError:  make(chan *User),
		}
		router = mux.NewRouter()
	)
	router.HandleFunc("/api/connect", a.connect)
	router.HandleFunc("/api/version", a.version)
	a.server.Handler = router
	go a.notifyUsers()
	go a.removeUser()
	return a
}

// Listen for new connections.
func (a *API) Listen() error {
	return a.server.ListenAndServe()
}
