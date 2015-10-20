package main

import (
	"flag"
	"log"
	"os"
)

func getwd() string {
	if cwd, err := os.Getwd(); err == nil {
		return cwd
	} else {
		panic(err)
	}
}

func main() {
	var (
		addr = flag.String("addr", ":8000", "address and port to bind to")
		root = flag.String("root", getwd(), "root directory of source code")
	)
	flag.Parse()

	log.Println("Starting server...")
	a := NewAPI(*addr, *root)
	a.Listen()
}
