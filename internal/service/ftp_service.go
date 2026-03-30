package service

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/pkg/crypto"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

// CreateFTPRequest holds the data needed to create a new FTP account.
type CreateFTPRequest struct {
	Username string `json:"username" validate:"required,min=1,max=32"`
	Password string `json:"password" validate:"required,min=6"`
	Path     string `json:"path" validate:"required,min=1"`
}

// UpdateFTPRequest holds the mutable fields of an FTP account.
type UpdateFTPRequest struct {
	Path string `json:"path" validate:"required,min=1"`
}

// FTPAccount represents a Pure-FTPd virtual user.
type FTPAccount struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	Password  string `json:"-"`
	Path      string `json:"path"`
	Status    int    `json:"status"`
	CreatedBy *int64 `json:"created_by"`
	CreatedAt string `json:"created_at"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// FTPService manages Pure-FTPd virtual user accounts.
type FTPService struct {
	db *sql.DB
}

// NewFTPService creates a new FTPService.
func NewFTPService(db *sql.DB) *FTPService {
	return &FTPService{db: db}
}

// Create provisions a new Pure-FTPd virtual user.
func (s *FTPService) Create(req CreateFTPRequest) (*FTPAccount, error) {
	if !safeNameRe.MatchString(req.Username) {
		return nil, apperrors.New(apperrors.ErrValidation, "username contains invalid characters")
	}

	ctx := context.Background()

	// Ensure home directory exists and is owned by ftpuser.
	if err := os.MkdirAll(req.Path, 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create FTP home directory")
	}
	_, _ = system.Exec(ctx, "chown", "ftpuser:ftpgroup", req.Path)

	// Create virtual user: pipe password twice (password + confirmation) to pure-pw.
	addCmd := fmt.Sprintf("printf '%%s\\n%%s\\n' %s %s | pure-pw useradd %s -u ftpuser -g ftpgroup -d %s",
		shellQuote(req.Password), shellQuote(req.Password),
		shellQuote(req.Username), shellQuote(req.Path))
	if _, err := system.Exec(ctx, "bash", "-c", addCmd); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create FTP user")
	}

	// Rebuild the puredb.
	if _, err := system.Exec(ctx, "pure-pw", "mkdb"); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to rebuild puredb")
	}

	// Encrypt password for storage.
	cfg := config.Get()
	encryptedPass, err := crypto.EncryptAES(req.Password, cfg.Auth.JWTSecret)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to encrypt password")
	}

	// Persist record in SQLite.
	result, err := s.db.Exec(
		`INSERT INTO ftps (username, password, path) VALUES (?, ?, ?)`,
		req.Username, encryptedPass, req.Path,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to store FTP account record")
	}

	id, _ := result.LastInsertId()
	logger.Info().Str("username", req.Username).Msg("FTP account created")

	return s.GetByID(id)
}

// List returns a paginated list of FTP accounts.
func (s *FTPService) List(page, pageSize int) ([]*FTPAccount, int, error) {
	var total int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM ftps").Scan(&total); err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to count FTP accounts")
	}

	offset := (page - 1) * pageSize
	rows, err := s.db.Query(
		`SELECT id, username, path, status, created_by, created_at
		 FROM ftps ORDER BY id DESC LIMIT ? OFFSET ?`,
		pageSize, offset,
	)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list FTP accounts")
	}
	defer rows.Close()

	var accounts []*FTPAccount
	for rows.Next() {
		a := &FTPAccount{}
		if err := rows.Scan(&a.ID, &a.Username, &a.Path, &a.Status, &a.CreatedBy, &a.CreatedAt); err != nil {
			return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to scan FTP account row")
		}
		accounts = append(accounts, a)
	}

	return accounts, total, nil
}

// GetByID returns a single FTP account by its ID.
func (s *FTPService) GetByID(id int64) (*FTPAccount, error) {
	a := &FTPAccount{}
	err := s.db.QueryRow(
		`SELECT id, username, path, status, created_by, created_at FROM ftps WHERE id = ?`, id,
	).Scan(&a.ID, &a.Username, &a.Path, &a.Status, &a.CreatedBy, &a.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, apperrors.New(apperrors.ErrNotFound, "FTP account not found")
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get FTP account")
	}
	return a, nil
}

// Update modifies an FTP account's home directory.
func (s *FTPService) Update(id int64, req UpdateFTPRequest) error {
	a, err := s.GetByID(id)
	if err != nil {
		return err
	}

	ctx := context.Background()

	// Update home directory in Pure-FTPd.
	if _, err := system.Exec(ctx, "pure-pw", "usermod", a.Username, "-d", req.Path); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update FTP user")
	}
	if _, err := system.Exec(ctx, "pure-pw", "mkdb"); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to rebuild puredb")
	}

	if _, err := s.db.Exec("UPDATE ftps SET path = ? WHERE id = ?", req.Path, id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update FTP account record")
	}

	logger.Info().Str("username", a.Username).Str("path", req.Path).Msg("FTP account updated")
	return nil
}

// Delete removes a Pure-FTPd virtual user and its record.
func (s *FTPService) Delete(id int64) error {
	a, err := s.GetByID(id)
	if err != nil {
		return err
	}

	ctx := context.Background()

	if _, err := system.Exec(ctx, "pure-pw", "userdel", a.Username); err != nil {
		logger.Error().Err(err).Str("username", a.Username).Msg("failed to delete FTP user from puredb")
	}
	if _, err := system.Exec(ctx, "pure-pw", "mkdb"); err != nil {
		logger.Error().Err(err).Msg("failed to rebuild puredb")
	}

	if _, err := s.db.Exec("DELETE FROM ftps WHERE id = ?", id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete FTP account record")
	}

	logger.Info().Str("username", a.Username).Msg("FTP account deleted")
	return nil
}

// ChangePassword updates the Pure-FTPd user password.
func (s *FTPService) ChangePassword(id int64, newPassword string) error {
	a, err := s.GetByID(id)
	if err != nil {
		return err
	}

	ctx := context.Background()

	passwdCmd := fmt.Sprintf("printf '%%s\\n%%s\\n' %s %s | pure-pw passwd %s",
		shellQuote(newPassword), shellQuote(newPassword), shellQuote(a.Username))
	if _, err := system.Exec(ctx, "bash", "-c", passwdCmd); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to change FTP password")
	}
	if _, err := system.Exec(ctx, "pure-pw", "mkdb"); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to rebuild puredb")
	}

	cfg := config.Get()
	encryptedPass, err := crypto.EncryptAES(newPassword, cfg.Auth.JWTSecret)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to encrypt password")
	}

	if _, err := s.db.Exec("UPDATE ftps SET password = ? WHERE id = ?", encryptedPass, id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update password record")
	}

	logger.Info().Str("username", a.Username).Msg("FTP password changed")
	return nil
}

// SetStatus enables or disables an FTP account.
// Disabling removes the user from puredb; enabling re-adds them.
func (s *FTPService) SetStatus(id int64, enabled bool) error {
	a, err := s.GetByID(id)
	if err != nil {
		return err
	}

	ctx := context.Background()
	newStatus := 0
	if enabled {
		newStatus = 1
	}

	if enabled && a.Status == 0 {
		// Re-add user to puredb using stored password.
		cfg := config.Get()
		var encPassword string
		if err := s.db.QueryRow("SELECT password FROM ftps WHERE id = ?", id).Scan(&encPassword); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read password")
		}
		password, err := crypto.DecryptAES(encPassword, cfg.Auth.JWTSecret)
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to decrypt password")
		}

		addCmd := fmt.Sprintf("printf '%%s\\n%%s\\n' %s %s | pure-pw useradd %s -u ftpuser -g ftpgroup -d %s",
			shellQuote(password), shellQuote(password),
			shellQuote(a.Username), shellQuote(a.Path))
		if _, err := system.Exec(ctx, "bash", "-c", addCmd); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to re-enable FTP user")
		}
	} else if !enabled && a.Status == 1 {
		// Remove user from puredb.
		if _, err := system.Exec(ctx, "pure-pw", "userdel", a.Username); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to disable FTP user")
		}
	}

	if _, err := system.Exec(ctx, "pure-pw", "mkdb"); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to rebuild puredb")
	}

	if _, err := s.db.Exec("UPDATE ftps SET status = ? WHERE id = ?", newStatus, id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update FTP status record")
	}

	logger.Info().Str("username", a.Username).Bool("enabled", enabled).Msg("FTP account status changed")
	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// shellQuote wraps a string in single quotes, escaping embedded single quotes.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}
