package service

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/pkg/crypto"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// safeNameRe matches valid database/user names (alphanumeric + underscore).
var safeNameRe = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

// CreateDBRequest holds the data needed to create a new database.
type CreateDBRequest struct {
	Name         string `json:"name" validate:"required,min=1,max=64"`
	DBType       string `json:"db_type" validate:"required,oneof=mysql mariadb"`
	Username     string `json:"username" validate:"required,min=1,max=32"`
	Password     string `json:"password" validate:"required,min=6"`
	Charset      string `json:"charset"`
	Collation    string `json:"collation"`
	RemoteAccess string `json:"remote_access"`
}

// Database represents a managed MySQL/MariaDB database.
type Database struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	DBType       string `json:"db_type"`
	Username     string `json:"username"`
	Password     string `json:"password,omitempty"`
	Charset      string `json:"charset"`
	Collation    string `json:"collation"`
	RemoteAccess string `json:"remote_access"`
	Size         int64  `json:"size"`
	CreatedBy    *int64 `json:"created_by"`
	CreatedAt    string `json:"created_at"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// DatabaseService manages MySQL/MariaDB databases.
type DatabaseService struct {
	db *sql.DB
}

// NewDatabaseService creates a new DatabaseService.
func NewDatabaseService(db *sql.DB) *DatabaseService {
	return &DatabaseService{db: db}
}

// Create provisions a new database and its dedicated user.
func (s *DatabaseService) Create(req CreateDBRequest) (*Database, error) {
	if req.Charset == "" {
		req.Charset = "utf8mb4"
	}
	if req.Collation == "" {
		req.Collation = "utf8mb4_general_ci"
	}
	if req.RemoteAccess == "" {
		req.RemoteAccess = "localhost"
	}

	if !safeNameRe.MatchString(req.Name) {
		return nil, apperrors.New(apperrors.ErrValidation, "database name contains invalid characters")
	}
	if !safeNameRe.MatchString(req.Username) {
		return nil, apperrors.New(apperrors.ErrValidation, "username contains invalid characters")
	}

	ctx := context.Background()

	// Create the database.
	createDBSQL := fmt.Sprintf("CREATE DATABASE `%s` CHARACTER SET %s COLLATE %s",
		req.Name, req.Charset, req.Collation)
	if _, err := system.Exec(ctx, "mysql", "-u", "root", "-e", createDBSQL); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create database")
	}

	// Create user and grant privileges.
	host := req.RemoteAccess
	userSQL := fmt.Sprintf(
		"CREATE USER '%s'@'%s' IDENTIFIED BY '%s'; GRANT ALL PRIVILEGES ON `%s`.* TO '%s'@'%s'; FLUSH PRIVILEGES;",
		req.Username, host, req.Password, req.Name, req.Username, host,
	)
	if _, err := system.Exec(ctx, "mysql", "-u", "root", "-e", userSQL); err != nil {
		// Rollback: drop the database we just created.
		dropSQL := fmt.Sprintf("DROP DATABASE IF EXISTS `%s`", req.Name)
		_, _ = system.Exec(ctx, "mysql", "-u", "root", "-e", dropSQL)
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create database user")
	}

	// Encrypt password for storage.
	cfg := config.Get()
	encryptedPass, err := crypto.EncryptAES(req.Password, cfg.Auth.JWTSecret)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to encrypt password")
	}

	// Persist record in SQLite.
	result, err := s.db.Exec(
		`INSERT INTO databases (name, db_type, username, password, charset, collation, remote_access) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		req.Name, req.DBType, req.Username, encryptedPass, req.Charset, req.Collation, req.RemoteAccess,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to store database record")
	}

	id, _ := result.LastInsertId()
	logger.Info().Str("name", req.Name).Str("db_type", req.DBType).Msg("database created")

	return s.GetByID(id)
}

// List returns a paginated list of databases.
func (s *DatabaseService) List(page, pageSize int) ([]*Database, int, error) {
	var total int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM databases").Scan(&total); err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to count databases")
	}

	offset := (page - 1) * pageSize
	rows, err := s.db.Query(
		`SELECT id, name, db_type, username, password, charset, collation, remote_access, size, created_by, created_at
		 FROM databases ORDER BY id DESC LIMIT ? OFFSET ?`,
		pageSize, offset,
	)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list databases")
	}
	defer rows.Close()

	var databases []*Database
	for rows.Next() {
		d := &Database{}
		if err := rows.Scan(&d.ID, &d.Name, &d.DBType, &d.Username, &d.Password, &d.Charset,
			&d.Collation, &d.RemoteAccess, &d.Size, &d.CreatedBy, &d.CreatedAt); err != nil {
			return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to scan database row")
		}
		databases = append(databases, d)
	}

	return databases, total, nil
}

// GetByID returns a single database by its ID.
func (s *DatabaseService) GetByID(id int64) (*Database, error) {
	d := &Database{}
	err := s.db.QueryRow(
		`SELECT id, name, db_type, username, password, charset, collation, remote_access, size, created_by, created_at
		 FROM databases WHERE id = ?`, id,
	).Scan(&d.ID, &d.Name, &d.DBType, &d.Username, &d.Password, &d.Charset,
		&d.Collation, &d.RemoteAccess, &d.Size, &d.CreatedBy, &d.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, apperrors.New(apperrors.ErrNotFound, "database not found")
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get database")
	}
	return d, nil
}

// Delete drops the MySQL database and user, then removes the record.
func (s *DatabaseService) Delete(id int64) error {
	d, err := s.GetByID(id)
	if err != nil {
		return err
	}

	ctx := context.Background()

	dropDBSQL := fmt.Sprintf("DROP DATABASE IF EXISTS `%s`", d.Name)
	if _, err := system.Exec(ctx, "mysql", "-u", "root", "-e", dropDBSQL); err != nil {
		logger.Error().Err(err).Str("name", d.Name).Msg("failed to drop database")
	}

	dropUserSQL := fmt.Sprintf("DROP USER IF EXISTS '%s'@'%s'; FLUSH PRIVILEGES;", d.Username, d.RemoteAccess)
	if _, err := system.Exec(ctx, "mysql", "-u", "root", "-e", dropUserSQL); err != nil {
		logger.Error().Err(err).Str("username", d.Username).Msg("failed to drop database user")
	}

	if _, err := s.db.Exec("DELETE FROM databases WHERE id = ?", id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete database record")
	}

	logger.Info().Str("name", d.Name).Msg("database deleted")
	return nil
}

// ChangePassword updates the MySQL user password.
func (s *DatabaseService) ChangePassword(id int64, newPassword string) error {
	d, err := s.GetByID(id)
	if err != nil {
		return err
	}

	ctx := context.Background()
	alterSQL := fmt.Sprintf("ALTER USER '%s'@'%s' IDENTIFIED BY '%s'; FLUSH PRIVILEGES;",
		d.Username, d.RemoteAccess, newPassword)
	if _, err := system.Exec(ctx, "mysql", "-u", "root", "-e", alterSQL); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to change database password")
	}

	cfg := config.Get()
	encryptedPass, err := crypto.EncryptAES(newPassword, cfg.Auth.JWTSecret)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to encrypt password")
	}

	if _, err := s.db.Exec("UPDATE databases SET password = ? WHERE id = ?", encryptedPass, id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update password record")
	}

	logger.Info().Str("name", d.Name).Msg("database password changed")
	return nil
}

// SetRemoteAccess recreates the MySQL user with a new host binding.
func (s *DatabaseService) SetRemoteAccess(id int64, hosts string) error {
	d, err := s.GetByID(id)
	if err != nil {
		return err
	}

	// Decrypt stored password so we can recreate the user.
	cfg := config.Get()
	var encPassword string
	if err := s.db.QueryRow("SELECT password FROM databases WHERE id = ?", id).Scan(&encPassword); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read password")
	}
	password, err := crypto.DecryptAES(encPassword, cfg.Auth.JWTSecret)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to decrypt password")
	}

	ctx := context.Background()

	// Drop old user.
	dropSQL := fmt.Sprintf("DROP USER IF EXISTS '%s'@'%s'; FLUSH PRIVILEGES;", d.Username, d.RemoteAccess)
	if _, err := system.Exec(ctx, "mysql", "-u", "root", "-e", dropSQL); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to drop old database user")
	}

	// Create user with new host.
	createSQL := fmt.Sprintf(
		"CREATE USER '%s'@'%s' IDENTIFIED BY '%s'; GRANT ALL PRIVILEGES ON `%s`.* TO '%s'@'%s'; FLUSH PRIVILEGES;",
		d.Username, hosts, password, d.Name, d.Username, hosts,
	)
	if _, err := system.Exec(ctx, "mysql", "-u", "root", "-e", createSQL); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create user with new host")
	}

	if _, err := s.db.Exec("UPDATE databases SET remote_access = ? WHERE id = ?", hosts, id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update remote access record")
	}

	logger.Info().Str("name", d.Name).Str("hosts", hosts).Msg("database remote access updated")
	return nil
}

// Backup creates a mysqldump of the database and returns the file path.
func (s *DatabaseService) Backup(id int64) (string, error) {
	d, err := s.GetByID(id)
	if err != nil {
		return "", err
	}

	backupDir := filepath.Join(config.Get().Paths.Backup, "database")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to create backup directory")
	}

	timestamp := time.Now().Format("20060102_150405")
	fileName := fmt.Sprintf("%s_%s.sql", d.Name, timestamp)
	backupPath := filepath.Join(backupDir, fileName)

	ctx := context.Background()
	if _, err := system.Exec(ctx, "mysqldump", "-u", "root", "--result-file="+backupPath, d.Name); err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to backup database")
	}

	logger.Info().Str("name", d.Name).Str("path", backupPath).Msg("database backed up")
	return backupPath, nil
}

// Restore imports a SQL dump into the database.
func (s *DatabaseService) Restore(id int64, filePath string) error {
	d, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrNotFound, "backup file not found")
	}

	// Ensure file is within the backup directory.
	backupDir := filepath.Join(config.Get().Paths.Backup, "database")
	absFile, _ := filepath.Abs(filePath)
	absBackup, _ := filepath.Abs(backupDir)
	if !strings.HasPrefix(absFile, absBackup+string(os.PathSeparator)) {
		return apperrors.New(apperrors.ErrValidation, "file path must be within backup directory")
	}

	ctx := context.Background()
	// Use bash redirect; safe because d.Name is validated and filePath is path-checked.
	cmd := fmt.Sprintf("mysql -u root %s < %s", d.Name, filePath)
	if _, err := system.ExecShell(ctx, cmd); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to restore database")
	}

	logger.Info().Str("name", d.Name).Str("file", filePath).Msg("database restored")
	return nil
}

// GetSize queries the actual database size from MySQL information_schema.
func (s *DatabaseService) GetSize(id int64) (int64, error) {
	d, err := s.GetByID(id)
	if err != nil {
		return 0, err
	}

	ctx := context.Background()
	sizeSQL := fmt.Sprintf(
		"SELECT IFNULL(SUM(data_length + index_length), 0) FROM information_schema.TABLES WHERE table_schema = '%s'",
		d.Name,
	)
	result, err := system.Exec(ctx, "mysql", "-u", "root", "-N", "-e", sizeSQL)
	if err != nil {
		return 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get database size")
	}

	var size int64
	fmt.Sscanf(strings.TrimSpace(result.Stdout), "%d", &size)

	// Cache size in SQLite.
	_, _ = s.db.Exec("UPDATE databases SET size = ? WHERE id = ?", size, id)

	return size, nil
}
