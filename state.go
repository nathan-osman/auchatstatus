package main

// Current state of an individual user in a room.
type State struct {
	Active          bool
	LastMessageRead int
	LastCharEntered int
}

// Update the state with information from the provided message.
func (s *State) Update(msg *Message) {
	switch msg.Type {
	case UserActive:
		s.Active = msg.Value != 0
	case UserPosition:
		s.Active = true
		s.LastMessageRead = msg.Value
	case UserTyping:
		s.LastCharEntered = msg.Value
	}
}

// Create a slice of messages representing the current state.
func (s *State) Messages(roomId, userId int) []*Message {
	messages := []*Message{
		&Message{
			RoomId: roomId,
			UserId: userId,
			Type:   UserPosition,
			Value:  s.LastMessageRead,
		},
		&Message{
			RoomId: roomId,
			UserId: userId,
			Type:   UserTyping,
			Value:  s.LastCharEntered,
		},
	}
	if !s.Active {
		messages = append(messages, &Message{
			RoomId: roomId,
			UserId: userId,
			Type:   UserActive,
			Value:  0,
		})
	}
	return messages
}
