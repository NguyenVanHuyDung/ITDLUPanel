package v1

import (
	"context"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
)

// SystemHandler handles panel/host lifecycle operations (restart panel,
// reboot server, shutdown server). These operations are dangerous —
// endpoints must be admin-only and trigger a delayed, cancellable action
// after the HTTP response has been sent.
type SystemHandler struct {
	// mu protects pendingAction — only one dangerous action can be in
	// flight at a time so the user can't queue two reboots.
	mu             sync.Mutex
	pendingAction  string
	pendingCancel  context.CancelFunc
	pendingExpires time.Time
}

// NewSystemHandler creates a new SystemHandler.
func NewSystemHandler() *SystemHandler {
	return &SystemHandler{}
}

// RegisterRoutes registers the system lifecycle routes.
func (h *SystemHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, adminMW gin.HandlerFunc) {
	sys := rg.Group("/system")
	sys.Use(authMW, adminMW)
	{
		sys.POST("/panel-restart", h.PanelRestart)
		sys.POST("/server-reboot", h.ServerReboot)
		sys.POST("/server-shutdown", h.ServerShutdown)
		sys.POST("/cancel", h.CancelPending)
		sys.GET("/pending-action", h.GetPendingAction)
	}
}

// ---------------------------------------------------------------------------
// Process-spawn state
// ---------------------------------------------------------------------------

// panelRestartState stores the args used to spawn the current process so
// PanelRestart can re-exec itself with the same arguments.
var panelRestartState = struct {
	sync.RWMutex
	argv0   string
	configs []string
}{}

// SetPanelRestartState is called once during startup so the
// /system/panel-restart endpoint knows how to re-exec the panel.
func SetPanelRestartState(argv0 string, configs []string) {
	panelRestartState.Lock()
	defer panelRestartState.Unlock()
	panelRestartState.argv0 = argv0
	panelRestartState.configs = configs
}

// ---------------------------------------------------------------------------
// Pending-action bookkeeping
// ---------------------------------------------------------------------------

const defaultCountdown = 5 * time.Second

// claim attempts to set the pending action. Returns true if claimed
// (caller should proceed with the countdown), false if another action is
// already pending.
func (h *SystemHandler) claim(action string, ttl time.Duration) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.pendingAction != "" && h.pendingExpires.After(time.Now()) {
		return false
	}
	h.pendingAction = action
	h.pendingExpires = time.Now().Add(ttl)
	return true
}

func (h *SystemHandler) snapshot() (string, time.Time) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.pendingAction == "" || !h.pendingExpires.After(time.Now()) {
		return "", time.Time{}
	}
	return h.pendingAction, h.pendingExpires
}

func (h *SystemHandler) clearIf(action string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.pendingAction != action {
		return false
	}
	h.pendingAction = ""
	h.pendingCancel = nil
	h.pendingExpires = time.Time{}
	return true
}

func (h *SystemHandler) setCancel(fn context.CancelFunc) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.pendingCancel = fn
}

// GetPendingAction returns the current pending action (if any). The
// frontend polls this to display a countdown and to know whether the
// action was cancelled.
func (h *SystemHandler) GetPendingAction(c *gin.Context) {
	action, expires := h.snapshot()
	if action == "" {
		response.Success(c, gin.H{"pending": false})
		return
	}
	remaining := time.Until(expires)
	if remaining < 0 {
		remaining = 0
	}
	response.Success(c, gin.H{
		"pending":           true,
		"action":            action,
		"remaining_seconds": int(remaining.Seconds()),
	})
}

// CancelPending attempts to cancel the pending action (only valid for
// server-reboot and server-shutdown; panel-restart cannot be cancelled
// once the response has been sent because the process is already on its
// way down).
func (h *SystemHandler) CancelPending(c *gin.Context) {
	h.mu.Lock()
	cancel := h.pendingCancel
	action := h.pendingAction
	h.mu.Unlock()

	if action == "" {
		response.Success(c, gin.H{"cancelled": false, "reason": "no pending action"})
		return
	}
	if cancel == nil {
		response.Success(c, gin.H{"cancelled": false, "reason": "action cannot be cancelled (already executing)"})
		return
	}
	cancel()
	h.clearIf(action)
	logger.Warn().Str("action", action).Msg("dangerous action cancelled by user")
	response.Success(c, gin.H{"cancelled": true, "action": action})
}

// ---------------------------------------------------------------------------
// Panel restart
// ---------------------------------------------------------------------------

// PanelRestart re-execs the current binary with the same arguments.
// This is inherently racy with graceful shutdown: the HTTP server must
// stop accepting new connections, then we spawn the new process and
// exit. The frontend should warn the user that the panel will be
// unavailable for a few seconds.
func (h *SystemHandler) PanelRestart(c *gin.Context) {
	panelRestartState.RLock()
	argv0 := panelRestartState.argv0
	configs := panelRestartState.configs
	panelRestartState.RUnlock()

	if argv0 == "" {
		response.Error(c, apperrors.New(apperrors.ErrInternal, "panel restart state not initialised"))
		return
	}
	if !h.claim("panel-restart", defaultCountdown) {
		response.Error(c, apperrors.New(apperrors.ErrConflict, "another action is already pending"))
		return
	}

	logger.Warn().Str("argv0", argv0).Msg("panel restart requested")

	// Build args from the saved restart state. We deliberately do NOT
	// include os.Args[1:] here because configs already captures every
	// -config flag the user passed (and including os.Args[1:] would
	// duplicate the flag, causing "flag provided more than once" or
	// double-config behaviour).
	args := []string{argv0}
	for _, cfg := range configs {
		args = append(args, "-config", cfg)
	}

	// Respond first, then schedule the actual exec+exit.
	response.Success(c, gin.H{
		"message":           "panel will restart in 5 seconds",
		"action":            "panel-restart",
		"remaining_seconds": int(defaultCountdown.Seconds()),
	})

	go func() {
		time.Sleep(defaultCountdown)
		logger.Info().Strs("args", args).Msg("executing panel restart")
		// Replace the current process image with the new one. This is
		// the cleanest way to "restart" the panel: the same PID is
		// reused, no orphan children, and systemd/init will see a
		// single process with no interruption.
		//
		// syscall.Exec takes the binary as the first arg and argv
		// without the binary name; we mirror that.
		if err := syscall.Exec(args[0], args[1:], os.Environ()); err != nil {
			logger.Error().Err(err).Msg("syscall.Exec failed during panel restart; falling back to fork+exit")
			cmd := exec.Command(args[0], args[1:]...)
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			cmd.Stdin = os.Stdin
			if startErr := cmd.Start(); startErr != nil {
				logger.Error().Err(startErr).Msg("failed to start new panel process")
				h.clearIf("panel-restart")
				return
			}
			_ = cmd.Process.Release()
			os.Exit(0)
		}
	}()
}

// ---------------------------------------------------------------------------
// Server reboot / shutdown
// ---------------------------------------------------------------------------

// serverPowerAction performs `reboot` or `shutdown` after a countdown so
// the user has a chance to cancel from the UI.
func (h *SystemHandler) serverPowerAction(c *gin.Context, action string, binary string, args ...string) {
	if !h.claim(action, defaultCountdown) {
		response.Error(c, apperrors.New(apperrors.ErrConflict, "another action is already pending"))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultCountdown)
	h.setCancel(cancel)

	logger.Warn().Str("action", action).Str("binary", binary).Msg("server power action requested")

	response.Success(c, gin.H{
		"message":           action + " scheduled in 5 seconds",
		"action":            action,
		"remaining_seconds": int(defaultCountdown.Seconds()),
	})

	go func() {
		// Wait either for the countdown to elapse or for the user to
		// cancel via /system/cancel.
		<-ctx.Done()
		if ctx.Err() == context.Canceled {
			// User cancelled — already cleared by CancelPending.
			logger.Info().Str("action", action).Msg("server power action cancelled before execution")
			return
		}
		// Countdown finished — execute the power action.
		logger.Info().Str("action", action).Str("binary", binary).Msg("executing server power action")
		cmd := exec.Command(binary, args...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		_ = cmd.Run() // best effort
	}()
}

// ServerReboot schedules a host reboot.
func (h *SystemHandler) ServerReboot(c *gin.Context) {
	h.serverPowerAction(c, "server-reboot", "shutdown", "-r", "now")
}

// ServerShutdown schedules a host shutdown.
func (h *SystemHandler) ServerShutdown(c *gin.Context) {
	h.serverPowerAction(c, "server-shutdown", "shutdown", "-h", "now")
}
