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
	Send          chan<- *Message
	conn          *websocket.Conn
	mutex         sync.Mutex
	state         State
	clientMessage chan<- *Message
	clientError   chan<- *User
}

// Process messages from the socket until an error is received, at which point
// the "quit" message should be sent to other connected peers.
func (u *User) read() {
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

// Consolidate writes to the socket into a single goroutine.
func (u *User) write(sendChan <-chan *Message) {
	for msg := range sendChan {
		if err := u.conn.WriteJSON(msg); err != nil {
			u.clientError <- u
		}
	}
}

// Create a new user from the WebSocket.
func NewUser(conn *websocket.Conn, roomId, userId int, clientMessage chan<- *Message, clientError chan<- *User) *User {
	sendChan := make(chan *Message)
	u := &User{
		RoomId:        roomId,
		UserId:        userId,
		Send:          sendChan,
		conn:          conn,
		clientMessage: clientMessage,
		clientError:   clientError,
	}
	go u.read()
	go u.write(sendChan)
	return u
}

// Retrieve a copy of the current state.
func (u *User) State() []*Message {
	u.mutex.Lock()
	defer u.mutex.Unlock()
	return []*Message{
		&Message{
			RoomId: u.RoomId,
			UserId: u.UserId,
			Type:   UserActive,
			Value:  u.state.Active,
		},
		&Message{
			RoomId: u.RoomId,
			UserId: u.UserId,
			Type:   UserPosition,
			Value:  u.state.LastMessageRead,
		},
		&Message{
			RoomId: u.RoomId,
			UserId: u.UserId,
			Type:   UserTyping,
			Value:  u.state.LastCharEntered,
		},
	}
}
