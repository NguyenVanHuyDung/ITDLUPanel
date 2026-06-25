.PHONY: build dev test lint clean build-linux-amd64 build-linux-arm64 build-all

VERSION  := 1.0.0
BUILD_TIME := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
LDFLAGS  := -X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)

# Find Go binary (prefer newer versions)
GO := $(shell \
    for p in /usr/local/go/bin/go /usr/local/go-old/bin/go /usr/bin/go; do \
        if [ -x "$$p" ]; then \
            v=$$($$p version 2>/dev/null | grep -oP 'go\K[0-9]+\.[0-9]+' || echo "0"); \
            major=$$(echo "$$v" | cut -d. -f1); \
            minor=$$(echo "$$v" | cut -d. -f2); \
            if [ "$$major" -ge 2 ] || [ "$$major" -eq 1 ] && [ "$$minor" -ge 21 ]; then \
                echo "$$p"; \
                exit 0; \
            fi; \
        fi; \
    done; \
    echo "go")

build:
	@echo "Building ITDLUPanel with $(GO)..."
	@mkdir -p bin
	CGO_ENABLED=0 $(GO) build -ldflags "$(LDFLAGS)" -o bin/itdlupanel ./cmd/panel

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
