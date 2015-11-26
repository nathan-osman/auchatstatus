package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
)

// Retrieve the current working directory or terminate.
func mustGetWorkingDir() string {
	cwd, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
		return ""
	}
	return cwd
}

func main() {
	var (
		addr    = flag.String("addr", ":8000", "address and port to bind to")
		root    = flag.String("root", mustGetWorkingDir(), "root directory of source code")
		tlsCert = flag.String("tls-cert", "", "certificate for TLS")
		tlsKey  = flag.String("tls-key", "", "private key for TLS")
	)
	flag.Parse()

	a, err := NewServer(&ServerConfig{
		Addr:    *addr,
		Root:    *root,
		TLSCert: *tlsCert,
		TLSKey:  *tlsKey,
	})
	if err != nil {
		log.Fatal(err)
	}

	log.Print("Starting server...")
	if err := a.Start(); err != nil {
		log.Fatal(err)
	}
	log.Print("Server started")

	c := make(chan os.Signal)
	signal.Notify(c, syscall.SIGINT)
	<-c

	log.Print("Stopping server...")
	a.Stop()
	log.Print("Server stopped")
}
