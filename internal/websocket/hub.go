package websocket

import (
	"encoding/json"
	"sync"

	ws "github.com/gorilla/websocket"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// Client represents a single WebSocket connection.
type Client struct {
	ID     string
	Conn   *ws.Conn
	Send   chan []byte
	Hub    *Hub
	UserID int64
}

// Hub manages active WebSocket clients and message broadcasting.
type Hub struct {
	clients    map[string]*Client
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

// NewHub creates a new Hub.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run processes register, unregister, and broadcast events.
// It should be started in its own goroutine.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			logger.Debug().Str("client_id", client.ID).Int("total", h.ClientCount()).Msg("websocket client registered")

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				close(client.Send)
			}
			h.mu.Unlock()
			logger.Debug().Str("client_id", client.ID).Int("total", h.ClientCount()).Msg("websocket client unregistered")

		case message := <-h.broadcast:
			h.mu.RLock()
			for id, client := range h.clients {
				select {
				case client.Send <- message:
				default:
					// Client send buffer full — disconnect.
					h.mu.RUnlock()
					h.mu.Lock()
					delete(h.clients, id)
					close(client.Send)
					h.mu.Unlock()
					h.mu.RLock()
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

// BroadcastJSON encodes the value to JSON and sends it to all connected clients.
func (h *Hub) BroadcastJSON(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		logger.Error().Err(err).Msg("failed to marshal broadcast message")
		return
	}
	h.broadcast <- data
}

// ClientCount returns the number of connected clients.
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
