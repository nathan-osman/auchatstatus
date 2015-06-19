package main

import ()

// Information received from the client
type Ping struct {
	UserID           int `json:"user_id"`
	LastMessageID    int `json:"last_message_id"`
	LastKeypressTime int `json:"last_keypress_time"`
}

// Represents an individual chat user
type User struct {
	UserID           int `json:"user_id"`
	LastMessageId    int `json:"last_message_id"`
	LastKeypressTime int `json:"last_keypress_time"`
	LastPing         int `json:"last_ping"`
}

// List of current chat users
type Users struct {
	Users []*User `json:"users"`
}

// When a ping is received, record the information
func (u *Users) Ping(ping *Ping) {
	var user *User
	for _, i := range u.Users {
		if i.UserID == ping.UserID {
			user = i
		}
	}
	if user == nil {
		user = &User{}
		u.Users = append(u.Users, user)
	}
	user.UserID = ping.UserID
	user.LastMessageId = ping.LastMessageID
	user.LastKeypressTime = ping.LastKeypressTime
	user.LastPing = 0
}
