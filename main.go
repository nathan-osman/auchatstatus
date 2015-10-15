package main

import (
	"log"
)

func main() {
	log.Println("Starting server...")
	a := NewAPI(8000)
	a.Listen()
}
