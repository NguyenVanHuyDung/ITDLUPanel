package websocket

import "time"

// EventType identifies the kind of WebSocket event.
type EventType string

const (
	EventMetrics      EventType = "metrics"
	EventTaskUpdate   EventType = "task_update"
	EventNotification EventType = "notification"
)

// Event is the standard envelope for WebSocket messages.
type Event struct {
	Type      EventType   `json:"type"`
	Timestamp time.Time   `json:"timestamp"`
	Data      interface{} `json:"data"`
}

// NewEvent creates a new Event with the current timestamp.
func NewEvent(eventType EventType, data interface{}) *Event {
	return &Event{
		Type:      eventType,
		Timestamp: time.Now(),
		Data:      data,
	}
}
