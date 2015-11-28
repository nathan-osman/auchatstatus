package main

import (
	"github.com/gorilla/websocket"

	"encoding/json"
	"sync"
)

// An individual chat user connected via WebSocket.
type User struct {
	RoomId        int
	UserId        int
	conn          *websocket.Conn
	mutex         sync.Mutex
	state         State
	clientMessage chan<- *Message
	clientError   chan<- *User
}

// Process messages from the socket until an error is received, at which point
// the "quit" message should be sent to other connected peers.
func (u *User) run() {
	for {
		messageType, r, err := u.conn.NextReader()
		if err != nil {
			break
		}
		if messageType != websocket.TextMessage {
			continue
		}
		msg := &Message{}
		if err := json.NewDecoder(r).Decode(&msg); err != nil {
			continue
		}
		msg.RoomId = u.RoomId
		msg.UserId = u.UserId
		switch msg.Type {
		case UserActive, UserPosition, UserTyping:
			u.mutex.Lock()
			u.state.Update(msg)
			u.mutex.Unlock()
			u.clientMessage <- msg
		case UserPing:
		default:
			continue
		}
	}
	u.clientError <- u
}

// Create a new user from the WebSocket.
func NewUser(conn *websocket.Conn, roomId, userId int, clientMessage chan<- *Message, clientError chan<- *User) *User {
	u := &User{
		RoomId:        roomId,
		UserId:        userId,
		conn:          conn,
		clientMessage: clientMessage,
		clientError:   clientError,
	}
	go u.run()
	return u
}

// Retrieve a copy of the current state.
func (u *User) State() State {
	u.mutex.Lock()
	defer u.mutex.Unlock()
	return u.state
}

// Send a message to the specified user. It is assumed that a socket error has
// occurred if the data cannot be written to the socket.
func (u *User) Send(msg *Message) {
	if err := u.conn.WriteJSON(msg); err != nil {
		u.clientError <- u
	}
}
