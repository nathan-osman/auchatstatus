package main

import (
	"github.com/gorilla/websocket"

	"encoding/json"
	"sync"
)

// Current state of a user.
type State struct {
	Id              int `json:"id"`
	LastMessageSeen int `json:"last_message_seen"`
	LastCharEntered int `json:"last_char_entered"`
}

// An individual chat user connected via a websocket.
type User struct {
	sync.Mutex
	conn         *websocket.Conn
	state        State
	stateChanged chan<- *User
	socketError  chan<- *User
}

// Process messages from the socket.
func (u *User) processMessages() {
	for {
		if messageType, r, err := u.conn.NextReader(); err == nil {
			switch messageType {
			case websocket.TextMessage:
				var newState State
				if err := json.NewDecoder(r).Decode(&newState); err == nil {
					u.Lock()
					u.state = newState
					u.Unlock()
					u.stateChanged <- u
				}
			}
		} else {
			u.socketError <- u
			break
		}
	}
}

// Initialize a User instance from a newly connected websocket client.
func NewUser(conn *websocket.Conn, stateChanged chan<- *User, socketError chan<- *User) *User {
	u := &User{
		conn:         conn,
		stateChanged: stateChanged,
		socketError:  socketError,
	}
	go u.processMessages()
	return u
}

// Retrieve the current state of the user.
func (u *User) State() State {
	u.Lock()
	defer u.Unlock()
	return u.state
}

// Notify the user that another user's state has changed. An error results in
// the assumption the socket has been closed and the appropriate notification
// is then sent.
func (u *User) Send(state State) {
	if err := u.conn.WriteJSON(state); err != nil {
		u.socketError <- u
	}
}
