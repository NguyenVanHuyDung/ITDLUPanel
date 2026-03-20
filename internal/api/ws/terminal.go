package ws

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/creack/pty"
	"github.com/gin-gonic/gin"
	gorillaws "github.com/gorilla/websocket"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/service"
)

// resizeMsg is the JSON envelope sent by xterm.js when the terminal is resized.
type resizeMsg struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// PermissionChecker is a callback that reports whether a role has a permission.
// Injected from the app layer to avoid a circular import.
type PermissionChecker func(role, permission string) bool

// HandleTerminal upgrades HTTP to WebSocket, spawns a bash shell via PTY,
// and bidirectionally pipes stdin/stdout between the WebSocket and the PTY.
//
// Authentication is via the query parameter ?token=<JWT> because WebSocket
// connections cannot easily set custom headers.
//
// The client may send a JSON resize message:
//
//	{"type":"resize","cols":80,"rows":24}
//
// All other messages are forwarded to the PTY as stdin input.
func HandleTerminal(termService *service.TerminalService, checkPerm PermissionChecker) gin.HandlerFunc {
	return func(c *gin.Context) {
		// --- authenticate via query-param JWT ---
		token := c.Query("token")
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}

		claims, err := service.ValidateAccessToken(token)
		if err != nil {
			logger.Debug().Err(err).Msg("Terminal WS: invalid token")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		// --- authorise ---
		if !checkPerm(claims.Role, "terminal.access") {
			c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
			return
		}

		// --- upgrade to WebSocket ---
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			logger.Error().Err(err).Msg("Terminal websocket upgrade failed")
			return
		}

		// --- create PTY session ---
		session, err := termService.CreateSession(claims.UserID, claims.Username)
		if err != nil {
			logger.Error().Err(err).Msg("Failed to create terminal session")
			_ = conn.WriteMessage(gorillaws.CloseMessage,
				gorillaws.FormatCloseMessage(gorillaws.CloseInternalServerErr, "failed to create terminal"))
			conn.Close()
			return
		}

		ptmx := session.PTY

		// --- cleanup on exit ---
		defer func() {
			_ = termService.CloseSession(session.ID)
			conn.Close()
		}()

		// --- PTY stdout → WebSocket (goroutine) ---
		done := make(chan struct{})
		go func() {
			defer close(done)
			buf := make([]byte, 4096)
			for {
				n, err := ptmx.Read(buf)
				if err != nil {
					if err != io.EOF {
						logger.Debug().Err(err).Str("session_id", session.ID).Msg("PTY read error")
					}
					return
				}
				if err := conn.WriteMessage(gorillaws.BinaryMessage, buf[:n]); err != nil {
					logger.Debug().Err(err).Str("session_id", session.ID).Msg("WebSocket write error")
					return
				}
			}
		}()

		// --- WebSocket → PTY stdin (main loop, also handles resize) ---
		for {
			msgType, msg, err := conn.ReadMessage()
			if err != nil {
				if gorillaws.IsUnexpectedCloseError(err, gorillaws.CloseGoingAway, gorillaws.CloseNormalClosure) {
					logger.Debug().Err(err).Str("session_id", session.ID).Msg("WebSocket closed unexpectedly")
				}
				break
			}

			// Text messages may be resize commands from xterm.js.
			if msgType == gorillaws.TextMessage {
				var rm resizeMsg
				if json.Unmarshal(msg, &rm) == nil && rm.Type == "resize" {
					if rm.Cols > 0 && rm.Rows > 0 {
						_ = pty.Setsize(ptmx, &pty.Winsize{
							Rows: rm.Rows,
							Cols: rm.Cols,
						})
					}
					continue
				}
			}

			// Everything else is stdin input.
			if _, err := ptmx.Write(msg); err != nil {
				logger.Debug().Err(err).Str("session_id", session.ID).Msg("PTY write error")
				break
			}
		}

		// Wait for the PTY reader goroutine to exit.
		<-done
	}
}
