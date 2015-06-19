package main

import (
	"encoding/json"
	"net/http"
)

// The API is stupidly simple - there is a single method that is invoked by the
// client, named /ping. It serves two purposes - the first is to indicate its
// status to the server and the second is to retrieve the status of other
// users. Certain actions trigger the ping, otherwise it is run at regular
// intervals to keep things up-to-date.

func PingHandler(users *Users) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var (
			decoder = json.NewDecoder(r.Body)
			ping    Ping
		)
		if err := decoder.Decode(&ping); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		users.Ping(&ping)
		data, err := json.Marshal(users)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)
	}
}
