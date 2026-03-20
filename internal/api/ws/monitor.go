package ws

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	gorillaws "github.com/gorilla/websocket"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/service"
	"github.com/ITDLUPanel/panel/internal/websocket"
)

var upgrader = gorillaws.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool { return true },
}

// HandleMonitorWS upgrades the HTTP connection to a WebSocket and streams
// realtime system metrics every 2 seconds until the client disconnects.
func HandleMonitorWS(hub *websocket.Hub, monitorService *service.MonitorService) gin.HandlerFunc {
	return func(c *gin.Context) {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			logger.Error().Err(err).Msg("websocket upgrade failed")
			return
		}

		client := &websocket.Client{
			ID:   uuid.New().String(),
			Conn: conn,
			Send: make(chan []byte, 256),
			Hub:  hub,
		}
		hub.Register(client)

		// Writer goroutine: drains client.Send to the WS connection.
		go func() {
			defer conn.Close()
			for msg := range client.Send {
				if err := conn.WriteMessage(gorillaws.TextMessage, msg); err != nil {
					return
				}
			}
		}()

		// Reader goroutine: reads (and discards) client messages; detects disconnect.
		done := make(chan struct{})
		go func() {
			defer close(done)
			for {
				if _, _, err := conn.ReadMessage(); err != nil {
					return
				}
			}
		}()

		// Ticker: push metrics every 2 seconds.
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		defer hub.Unregister(client)

		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				metrics, err := monitorService.GetRealtimeMetrics()
				if err != nil {
					logger.Error().Err(err).Msg("failed to get realtime metrics")
					continue
				}
				event := websocket.NewEvent(websocket.EventMetrics, metrics)
				hub.BroadcastJSON(event)
			}
		}
	}
}
