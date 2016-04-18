package main

// Current state of an individual user in a room.
type State struct {
	Active          int
	LastMessageRead int
	LastCharEntered int
}

// Update the state with information from the provided message.
func (s *State) Update(msg *Message) {
	switch msg.Type {
	case UserActive:
		s.Active = msg.Value
	case UserPosition:
		s.LastMessageRead = msg.Value
	case UserTyping:
		s.LastCharEntered = msg.Value
	}
}
