package main

import (
	"container/list"
	"sync"
)

// RoomMap provides access to a map through a mutex. All public methods are
// protected by the mutex since they can be invoked from multiple goroutines.
type RoomMap struct {
	mutex sync.Mutex
	rooms map[int]*list.List
}

// Find the user in the room.
func (r *RoomMap) findUser(user *User) *list.Element {
	for e := r.rooms[user.RoomId].Front(); e != nil; e = e.Next() {
		if e.Value.(*User) == user {
			return e
		}
	}
	return nil
}

// Update the user with the state of all other users in the room. A new
// goroutine is spawned in order to ensure nothing blocks.
func (r *RoomMap) update(user *User) {
	for e := r.rooms[user.RoomId].Front(); e != nil; e = e.Next() {
		go func(u *User) {
			for _, m := range u.State() {
				user.Send <- m
			}
		}(e.Value.(*User))
	}
}

// Broadcast a message to all users in the specified room. A new goroutine is
// spawned to write the value to the user's WebSocket to ensure nothing blocks.
func (r *RoomMap) broadcast(msg *Message) {
	for e := r.rooms[msg.RoomId].Front(); e != nil; e = e.Next() {
		go func(u *User) {
			u.Send <- msg
		}(e.Value.(*User))
	}
}

// NewRoomMap creates a new RoomMap.
func NewRoomMap() *RoomMap {
	return &RoomMap{
		rooms: make(map[int]*list.List),
	}
}

// AddUser adds a user to a room, creating the room if it does not exist. The
// user is also sent a list of the state of every other user.
func (r *RoomMap) AddUser(user *User) {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	room, ok := r.rooms[user.RoomId]
	if !ok {
		room = list.New()
		r.rooms[user.RoomId] = room
	}
	r.update(user)
	room.PushBack(user)
}

// RemoveUser removes a user from a room, deleting the room if it is empty. The
// other users in the room are notified when the user leaves.
func (r *RoomMap) RemoveUser(user *User) {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	room := r.rooms[user.RoomId]
	room.Remove(r.findUser(user))
	close(user.Send)
	if room.Len() == 0 {
		delete(r.rooms, user.RoomId)
	} else {
		r.broadcast(&Message{
			RoomId: user.RoomId,
			UserId: user.UserId,
			Type:   UserQuit,
		})
	}
}

// Broadcast sends the specified message to all users in the room.
func (r *RoomMap) Broadcast(msg *Message) {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	r.broadcast(msg)
}

// Stats returns a map with some interesting statistics.
func (r *RoomMap) Stats() interface{} {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	var (
		numRooms = 0
		numUsers = 0
	)
	for _, room := range r.rooms {
		numRooms++
		numUsers += room.Len()
	}
	return map[string]int{
		"num_rooms": numRooms,
		"num_users": numUsers,
	}
}
