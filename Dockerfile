FROM golang:alpine
MAINTAINER Nathan Osman <nathan@quickmediasolutions.com>

# Make Git available
RUN apk add --update git && \
    rm -rf /var/cache/apk/*

# Add the source files
ADD . /go/src/github.com/nathan-osman/auchatstatus

# Fetch dependencies
RUN go get ./...

# Build the application
RUN go install github.com/nathan-osman/auchatstatus

# Set the command to run
CMD auchatstatus \
    -root /go/src/github.com/nathan-osman/auchatstatus

# Expose the port
EXPOSE 8000
