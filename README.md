> **Notice:** this project is now abandoned. It has been superceded by its more-than-capable replacement [sechatr](https://github.com/nathan-osman/sechatr). Please visit the project page to learn more.

## Ask Ubuntu Chat Status

This handly little Go application and its accompanying UserScript provides the following features:

- the ability to see how far a user has read
- the ability to see when a user is typing

### Screenshot

![Script Example](http://i.stack.imgur.com/19uGR.gif)

### Installation

You can install the script by visiting the following website:
https://sechat.quickmediasolutions.com/

### Building the Server

The server is written in Go and can be compiled with the following command:

    go install github.com/nathan-osman/auchatstatus

**Note:** a bug exists in versions of Go earlier than 1.6 that can cause issues with the sockets.

### Running the Server

The chat server accepts four command-line arguments, all of them optional:

- `addr` - address in the format "IP:port" to bind to
- `root` - directory containing the application source code
- `tls-cert` - TLS certificate
- `tls-key` - TLS private key

Note that most browsers require that WebSocket connections be made over HTTPS. Because of this, using a certificate and private key are highly recommended.
