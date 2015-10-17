package main

import (
	"github.com/gorilla/websocket"

	"encoding/json"
	"io/ioutil"
	"sync"
)

// State of a user.
type State struct {
	Id   int               `json:"id"`
	Data map[string]string `json:"data"`
}

// An individual chat user connected via a websocket.
type User struct {
	sync.Mutex
	conn         *websocket.Conn
	state        State
	stateChanged chan<- State
	socketError  chan<- *User
}

// Process messages from the socket.
func (u *User) processMessages() {
	for {
		if messageType, r, err := u.conn.NextReader(); err == nil {
			switch messageType {
			case websocket.TextMessage:
				if data, err := ioutil.ReadAll(r); err == nil {
					if len(data) == 0 {
						// Because JavaScript doesn't do ping/pong control
						// messages, we use our own implementation - a blank
						// message. Reply to the ping with the same thing.
						u.conn.WriteMessage(websocket.TextMessage, data)
					} else {
						// Otherwise, assume it's JSON and contains a map of
						// fields to update and their new values. Also
						// propagate the message to the other users.
						var newState State
						if err := json.Unmarshal(data, &newState); err == nil {
							u.Lock()
							u.state.Id = newState.Id
							for k, v := range newState.Data {
								u.state.Data[k] = v
							}
							u.Unlock()
							u.stateChanged <- newState
						}
					}
				}
			}
		} else {
			// TODO: there may be a better way to check for closed sockets
			u.socketError <- u
			break
		}
	}
}

// Initialize a User instance from a newly connected websocket client.
func NewUser(conn *websocket.Conn, stateChanged chan<- State, socketError chan<- *User) *User {
	u := &User{
		conn: conn,
		state: State{
			Data: make(map[string]string),
		},
		stateChanged: stateChanged,
		socketError:  socketError,
	}
	go u.processMessages()
	return u
}

// Atomically retrieve the current state of the user.
func (u *User) State() State {
	u.Lock()
	defer u.Unlock()
	return u.state
}

// Notify the user that another user's state has changed. An error results in
// the assumption the socket has been closed and the appropriate action is then
// taken.
func (u *User) Send(state State) {
	if err := u.conn.WriteJSON(state); err != nil {
		u.socketError <- u
	}
}
