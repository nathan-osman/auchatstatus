package main

import (
	"flag"
	"log"
)

func main() {
	addr := flag.String("addr", ":8000", "address and port to bind to")
	flag.Parse()

	log.Println("Starting server...")
	a := NewAPI(*addr)
	a.Listen()
}
