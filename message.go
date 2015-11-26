package main

// Message types.
const (
	UserActive   = "active"   // input box activated or blurred
	UserPosition = "position" // user position has changed (implies activation)
	UserTyping   = "typing"   // user has typed something
	UserPing     = "ping"     // ping to keep socket alive
	UserQuit     = "quit"     // connection to user closed
)

// Message received from a user and propagated by the server. Each message
// contains a piece of information about the user which needs to be conveyed
// to the other users.
type Message struct {
	RoomId int    `json:"room_id"`
	UserId int    `json:"user_id"`
	Type   string `json:"type"`
	Value  int    `json:"value"`
}
