package service

import (
	"fmt"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/google/uuid"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// TerminalSession represents an active PTY shell session.
type TerminalSession struct {
	ID        string
	UserID    int64
	Username  string
	PTY       *os.File
	Cmd       *exec.Cmd
	CreatedAt time.Time
}

// TerminalSessionInfo is a safe-to-serialize view of a session (no PTY/Cmd).
type TerminalSessionInfo struct {
	ID        string    `json:"id"`
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	CreatedAt time.Time `json:"created_at"`
}

// TerminalService manages active terminal sessions.
type TerminalService struct {
	sessions sync.Map // sessionID -> *TerminalSession
}

// NewTerminalService returns a ready-to-use TerminalService.
func NewTerminalService() *TerminalService {
	return &TerminalService{}
}

// CreateSession spawns a bash shell with a PTY and tracks it.
func (s *TerminalService) CreateSession(userID int64, username string) (*TerminalSession, error) {
	shell := "/bin/bash"
	if _, err := os.Stat(shell); err != nil {
		shell = "/bin/sh"
	}

	// Use login shell to load /etc/profile and user profile
	cmd := exec.Command(shell, "--login")
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		fmt.Sprintf("USER=%s", username),
		fmt.Sprintf("HOME=%s", os.Getenv("HOME")),
	)

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, fmt.Errorf("failed to start pty: %w", err)
	}

	// Set a reasonable default size.
	_ = pty.Setsize(ptmx, &pty.Winsize{Rows: 24, Cols: 80})

	session := &TerminalSession{
		ID:        uuid.New().String(),
		UserID:    userID,
		Username:  username,
		PTY:       ptmx,
		Cmd:       cmd,
		CreatedAt: time.Now(),
	}

	s.sessions.Store(session.ID, session)
	logger.Info().
		Str("session_id", session.ID).
		Int64("user_id", userID).
		Str("username", username).
		Msg("Terminal session created")

	return session, nil
}

// GetSession returns a session by ID.
func (s *TerminalService) GetSession(id string) (*TerminalSession, bool) {
	val, ok := s.sessions.Load(id)
	if !ok {
		return nil, false
	}
	return val.(*TerminalSession), true
}

// CloseSession terminates and removes a session.
func (s *TerminalService) CloseSession(id string) error {
	val, ok := s.sessions.LoadAndDelete(id)
	if !ok {
		return fmt.Errorf("session %s not found", id)
	}
	sess := val.(*TerminalSession)

	sess.PTY.Close()
	if sess.Cmd.Process != nil {
		_ = sess.Cmd.Process.Kill()
		_ = sess.Cmd.Wait()
	}

	logger.Info().Str("session_id", id).Msg("Terminal session closed")
	return nil
}

// ListSessions returns info for every active session.
func (s *TerminalService) ListSessions() []*TerminalSessionInfo {
	var list []*TerminalSessionInfo
	s.sessions.Range(func(_, value any) bool {
		sess := value.(*TerminalSession)
		list = append(list, &TerminalSessionInfo{
			ID:        sess.ID,
			UserID:    sess.UserID,
			Username:  sess.Username,
			CreatedAt: sess.CreatedAt,
		})
		return true
	})
	return list
}

// CloseAllForUser terminates every session owned by the given user.
func (s *TerminalService) CloseAllForUser(userID int64) {
	var ids []string
	s.sessions.Range(func(_, value any) bool {
		sess := value.(*TerminalSession)
		if sess.UserID == userID {
			ids = append(ids, sess.ID)
		}
		return true
	})
	for _, id := range ids {
		_ = s.CloseSession(id)
	}
}

// generateMOTD reads the cached MOTD from /run/motd.dynamic.
func generateMOTD() string {
	data, err := os.ReadFile("/run/motd.dynamic")
	if err != nil {
		return ""
	}
	return string(data)
}

// GetMOTD returns the system MOTD (Message of the Day) for display on terminal connect.
func (s *TerminalService) GetMOTD() []byte {
	motd := generateMOTD()
	if motd == "" {
		return nil
	}
	// Convert \n to \r\n for proper terminal display
	result := ""
	for _, line := range splitLines(motd) {
		result += line + "\r\n"
	}
	return []byte(result)
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			line := s[start:i]
			if len(line) > 0 && line[len(line)-1] == '\r' {
				line = line[:len(line)-1]
			}
			lines = append(lines, line)
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}
