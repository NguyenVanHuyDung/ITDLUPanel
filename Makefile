.PHONY: build dev test lint clean build-linux-amd64 build-linux-arm64 build-all

VERSION  := 4.0.0
BUILD_TIME := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
LDFLAGS  := -X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)

build:
	@echo "Building ITDLUPanel..."
	@mkdir -p bin
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o bin/itdlupanel ./cmd/panel

dev:
	@echo "Running in development mode..."
	go run -ldflags "$(LDFLAGS)" ./cmd/panel -config config/panel.json

test:
	go test ./... -v -cover

lint:
	golangci-lint run ./...

clean:
	rm -rf bin/
	rm -f config/panel.json
	rm -f data/panel.db

build-linux-amd64:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS) -s -w" -o bin/itdlupanel-linux-amd64 ./cmd/panel

build-linux-arm64:
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags "$(LDFLAGS) -s -w" -o bin/itdlupanel-linux-arm64 ./cmd/panel

build-all: build-linux-amd64 build-linux-arm64
