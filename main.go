package main

import (
	"log"
	"net/http"
)

func main() {

	log.Println("Ask Ubuntu Chat Status")
	log.Println("Copyright 2015 - Nathan Osman")

	users := &Users{}

	http.HandleFunc("/ping", PingHandler(users))
	http.ListenAndServe(":8000", nil)
}
