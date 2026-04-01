package service

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/config"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Backup represents a backup record from the backups table.
type Backup struct {
	ID         int64   `json:"id"`
	Type       string  `json:"type"`
	Name       string  `json:"name"`
	TargetID   *int64  `json:"target_id"`
	TargetName *string `json:"target_name"`
	FilePath   string  `json:"file_path"`
	FileSize   int64   `json:"file_size"`
	Storage    string  `json:"storage"`
	Checksum   *string `json:"checksum"`
	Status     string  `json:"status"`
	CreatedBy  *int64  `json:"created_by"`
	CreatedAt  string  `json:"created_at"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const backupCmdTimeout = 5 * time.Minute

// BackupService manages backup creation, listing, deletion, and restore.
type BackupService struct {
	db *sql.DB
}

// NewBackupService creates a new BackupService.
func NewBackupService(db *sql.DB) *BackupService {
	return &BackupService{db: db}
}

// ---------------------------------------------------------------------------
// Create backups
// ---------------------------------------------------------------------------

// CreateSiteBackup archives a website's document root into a tarball.
func (s *BackupService) CreateSiteBackup(siteID int64, createdBy int64) (*Backup, error) {
	site, err := s.getSite(siteID)
	if err != nil {
		return nil, err
	}

	cfg := config.Get()
	backupDir := filepath.Join(cfg.Paths.Backup, "site")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create backup directory")
	}

	timestamp := time.Now().Format("20060102_150405")
	fileName := fmt.Sprintf("%s_%s.tar.gz", site.Domain, timestamp)
	backupPath := filepath.Join(backupDir, fileName)

	docRoot := filepath.Join(cfg.Paths.WWWRoot, site.Domain)
	if _, err := os.Stat(docRoot); os.IsNotExist(err) {
		return nil, apperrors.New(apperrors.ErrNotFound, "site document root not found")
	}

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	if _, err := system.Exec(ctx, "tar", "czf", backupPath, "-C", cfg.Paths.WWWRoot, site.Domain); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create site backup")
	}

	fileSize := fileSize(backupPath)
	backupName := fmt.Sprintf("Site backup - %s", site.Domain)

	return s.insertRecord("site", backupName, &siteID, &site.Domain, backupPath, fileSize, createdBy)
}

// CreateDatabaseBackup creates a mysqldump of the specified database.
func (s *BackupService) CreateDatabaseBackup(dbID int64, createdBy int64) (*Backup, error) {
	dbInfo, err := s.getDatabase(dbID)
	if err != nil {
		return nil, err
	}

	cfg := config.Get()
	backupDir := filepath.Join(cfg.Paths.Backup, "database")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create backup directory")
	}

	timestamp := time.Now().Format("20060102_150405")
	sqlFile := filepath.Join(backupDir, fmt.Sprintf("%s_%s.sql", dbInfo.name, timestamp))
	gzFile := sqlFile + ".gz"

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	// Dump database to file.
	if _, err := system.Exec(ctx, "mysqldump", "-u", "root", "--result-file="+sqlFile, dbInfo.name); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to dump database")
	}

	// Compress the dump.
	if _, err := system.Exec(ctx, "gzip", "-f", sqlFile); err != nil {
		os.Remove(sqlFile)
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to compress database backup")
	}

	size := fileSize(gzFile)
	backupName := fmt.Sprintf("Database backup - %s", dbInfo.name)

	return s.insertRecord("database", backupName, &dbID, &dbInfo.name, gzFile, size, createdBy)
}

// CreatePanelBackup archives the panel config directory and SQLite database.
func (s *BackupService) CreatePanelBackup(createdBy int64) (*Backup, error) {
	cfg := config.Get()
	backupDir := filepath.Join(cfg.Paths.Backup, "panel")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create backup directory")
	}

	timestamp := time.Now().Format("20060102_150405")
	fileName := fmt.Sprintf("panel_%s.tar.gz", timestamp)
	backupPath := filepath.Join(backupDir, fileName)

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	// Archive panel config, data, and server directory (software configs/data).
	// -h follows symlinks so actual config files are archived.
	args := []string{"czf", backupPath, "-h", "-C", cfg.Paths.Base, "config", "data"}
	// Include server dir if it exists (contains software configs via symlinks)
	serverDir := filepath.Join(cfg.Paths.Base, "server")
	if _, err := os.Stat(serverDir); err == nil {
		args = append(args, "server")
	}
	if _, err := system.Exec(ctx, "tar", args...); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create panel backup")
	}

	size := fileSize(backupPath)
	backupName := fmt.Sprintf("Panel backup - %s", timestamp)

	return s.insertRecord("panel", backupName, nil, nil, backupPath, size, createdBy)
}

// ---------------------------------------------------------------------------
// List / Get
// ---------------------------------------------------------------------------

// List returns a paginated list of backups, optionally filtered by type and target_id.
func (s *BackupService) List(page, pageSize int, backupType string, targetID int64) ([]*Backup, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	where := ""
	args := []any{}
	if backupType != "" {
		where = " WHERE type = ?"
		args = append(args, backupType)
	}
	if targetID > 0 {
		if where == "" {
			where = " WHERE target_id = ?"
		} else {
			where += " AND target_id = ?"
		}
		args = append(args, targetID)
	}

	var total int
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	if err := s.db.QueryRow("SELECT COUNT(*) FROM backups"+where, countArgs...).Scan(&total); err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to count backups")
	}

	offset := (page - 1) * pageSize
	query := `SELECT id, type, name, target_id, target_name, file_path, file_size,
	                 storage, checksum, status, created_by, created_at
	          FROM backups` + where + ` ORDER BY id DESC LIMIT ? OFFSET ?`
	args = append(args, pageSize, offset)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list backups")
	}
	defer rows.Close()

	var backups []*Backup
	for rows.Next() {
		b := &Backup{}
		if err := rows.Scan(&b.ID, &b.Type, &b.Name, &b.TargetID, &b.TargetName,
			&b.FilePath, &b.FileSize, &b.Storage, &b.Checksum, &b.Status,
			&b.CreatedBy, &b.CreatedAt); err != nil {
			return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to scan backup row")
		}
		backups = append(backups, b)
	}

	return backups, total, nil
}

// SiteBackupCounts returns a map of site_id → backup count for type='site'.
func (s *BackupService) SiteBackupCounts() (map[int64]int, error) {
	rows, err := s.db.Query(
		"SELECT target_id, COUNT(*) FROM backups WHERE type = 'site' AND target_id IS NOT NULL GROUP BY target_id",
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to count site backups")
	}
	defer rows.Close()

	counts := make(map[int64]int)
	for rows.Next() {
		var id int64
		var cnt int
		if err := rows.Scan(&id, &cnt); err != nil {
			continue
		}
		counts[id] = cnt
	}
	return counts, nil
}

// DatabaseBackupCounts returns a map of database_id → backup count for type='database'.
func (s *BackupService) DatabaseBackupCounts() (map[int64]int, error) {
	rows, err := s.db.Query(
		"SELECT target_id, COUNT(*) FROM backups WHERE type = 'database' AND target_id IS NOT NULL GROUP BY target_id",
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to count database backups")
	}
	defer rows.Close()

	counts := make(map[int64]int)
	for rows.Next() {
		var id int64
		var cnt int
		if err := rows.Scan(&id, &cnt); err != nil {
			continue
		}
		counts[id] = cnt
	}
	return counts, nil
}
func (s *BackupService) GetByID(id int64) (*Backup, error) {
	b := &Backup{}
	err := s.db.QueryRow(
		`SELECT id, type, name, target_id, target_name, file_path, file_size,
		        storage, checksum, status, created_by, created_at
		 FROM backups WHERE id = ?`, id,
	).Scan(&b.ID, &b.Type, &b.Name, &b.TargetID, &b.TargetName,
		&b.FilePath, &b.FileSize, &b.Storage, &b.Checksum, &b.Status,
		&b.CreatedBy, &b.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, apperrors.New(apperrors.ErrNotFound, "backup not found")
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get backup")
	}
	return b, nil
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

// Delete removes the backup file and its database record.
func (s *BackupService) Delete(id int64) error {
	b, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if b.FilePath != "" {
		os.Remove(b.FilePath)
	}

	if _, err := s.db.Exec("DELETE FROM backups WHERE id = ?", id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete backup record")
	}

	logger.Info().Int64("id", id).Str("type", b.Type).Msg("backup deleted")
	return nil
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

// Restore applies a backup based on its type.
func (s *BackupService) Restore(id int64) error {
	b, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if _, err := os.Stat(b.FilePath); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrNotFound, "backup file not found on disk")
	}

	switch b.Type {
	case "site":
		return s.restoreSite(b)
	case "database":
		return s.restoreDatabase(b)
	case "panel":
		return s.restorePanel(b)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported backup type: "+b.Type)
	}
}

func (s *BackupService) restoreSite(b *Backup) error {
	if b.TargetName == nil || *b.TargetName == "" {
		return apperrors.New(apperrors.ErrInternal, "missing target name for site restore")
	}

	cfg := config.Get()
	docRoot := filepath.Join(cfg.Paths.WWWRoot, *b.TargetName)
	if err := os.MkdirAll(docRoot, 0755); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create document root")
	}

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	if _, err := system.Exec(ctx, "tar", "xzf", b.FilePath, "-C", docRoot); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to restore site backup")
	}

	logger.Info().Int64("id", b.ID).Str("domain", *b.TargetName).Msg("site restored from backup")
	return nil
}

func (s *BackupService) restoreDatabase(b *Backup) error {
	if b.TargetID == nil {
		return apperrors.New(apperrors.ErrInternal, "missing target ID for database restore")
	}

	dbInfo, err := s.getDatabase(*b.TargetID)
	if err != nil {
		return err
	}

	// Decompress .gz to a temporary .sql file.
	sqlFile := strings.TrimSuffix(b.FilePath, ".gz")

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	if _, err := system.Exec(ctx, "gunzip", "-k", "-f", b.FilePath); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to decompress database backup")
	}
	defer os.Remove(sqlFile)

	sourceCmd := fmt.Sprintf("SOURCE %s", sqlFile)
	if _, err := system.Exec(ctx, "mysql", "-u", "root", dbInfo.name, "-e", sourceCmd); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to restore database backup")
	}

	logger.Info().Int64("id", b.ID).Str("database", dbInfo.name).Msg("database restored from backup")
	return nil
}

func (s *BackupService) restorePanel(b *Backup) error {
	cfg := config.Get()

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	if _, err := system.Exec(ctx, "tar", "xzf", b.FilePath, "-C", cfg.Paths.Base); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to restore panel backup")
	}

	logger.Info().Int64("id", b.ID).Msg("panel restored from backup — software symlinks may need re-creation on next install")
	return nil
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

// GetDownloadPath returns the file path for downloading a backup.
func (s *BackupService) GetDownloadPath(id int64) (string, error) {
	b, err := s.GetByID(id)
	if err != nil {
		return "", err
	}

	if _, err := os.Stat(b.FilePath); os.IsNotExist(err) {
		return "", apperrors.New(apperrors.ErrNotFound, "backup file not found on disk")
	}

	return b.FilePath, nil
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

// CleanOldBackups removes backups older than the specified number of days.
func (s *BackupService) CleanOldBackups(keepDays int) error {
	cutoff := time.Now().AddDate(0, 0, -keepDays).Format("2006-01-02 15:04:05")

	rows, err := s.db.Query("SELECT id, file_path FROM backups WHERE created_at < ?", cutoff)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to query old backups")
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		var filePath string
		if err := rows.Scan(&id, &filePath); err != nil {
			continue
		}
		os.Remove(filePath)
		ids = append(ids, id)
	}

	for _, id := range ids {
		s.db.Exec("DELETE FROM backups WHERE id = ?", id)
	}

	logger.Info().Int("removed", len(ids)).Int("keep_days", keepDays).Msg("old backups cleaned")
	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type siteInfo struct {
	Domain string
}

type dbInfo struct {
	name string
}

func (s *BackupService) getSite(siteID int64) (*siteInfo, error) {
	var domain string
	err := s.db.QueryRow("SELECT domain FROM sites WHERE id = ?", siteID).Scan(&domain)
	if err == sql.ErrNoRows {
		return nil, apperrors.New(apperrors.ErrNotFound, "site not found")
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get site")
	}
	return &siteInfo{Domain: domain}, nil
}

func (s *BackupService) getDatabase(dbID int64) (*dbInfo, error) {
	var name string
	err := s.db.QueryRow("SELECT name FROM databases WHERE id = ?", dbID).Scan(&name)
	if err == sql.ErrNoRows {
		return nil, apperrors.New(apperrors.ErrNotFound, "database not found")
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get database")
	}
	return &dbInfo{name: name}, nil
}

func (s *BackupService) insertRecord(
	backupType, name string,
	targetID *int64, targetName *string,
	filePath string, size int64,
	createdBy int64,
) (*Backup, error) {
	result, err := s.db.Exec(
		`INSERT INTO backups (type, name, target_id, target_name, file_path, file_size, storage, status, created_by)
		 VALUES (?, ?, ?, ?, ?, ?, 'local', 'completed', ?)`,
		backupType, name, targetID, targetName, filePath, size, createdBy,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to store backup record")
	}

	id, _ := result.LastInsertId()
	logger.Info().Int64("id", id).Str("type", backupType).Str("name", name).Msg("backup created")

	return s.GetByID(id)
}

// ---------------------------------------------------------------------------
// Bulk backup
// ---------------------------------------------------------------------------

type siteBasic struct {
	ID     int64
	Domain string
}

type dbBasic struct {
	ID   int64
	Name string
}

// ListAllSites returns all sites (id + domain).
func (s *BackupService) ListAllSites() ([]siteBasic, error) {
	rows, err := s.db.Query("SELECT id, domain FROM sites ORDER BY id")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list sites")
	}
	defer rows.Close()
	var sites []siteBasic
	for rows.Next() {
		var sb siteBasic
		if err := rows.Scan(&sb.ID, &sb.Domain); err != nil {
			continue
		}
		sites = append(sites, sb)
	}
	return sites, nil
}

// ListAllDatabases returns all databases (id + name).
func (s *BackupService) ListAllDatabases() ([]dbBasic, error) {
	rows, err := s.db.Query("SELECT id, name FROM databases ORDER BY id")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list databases")
	}
	defer rows.Close()
	var dbs []dbBasic
	for rows.Next() {
		var db dbBasic
		if err := rows.Scan(&db.ID, &db.Name); err != nil {
			continue
		}
		dbs = append(dbs, db)
	}
	return dbs, nil
}

// GetSiteByDomain looks up a site by domain name.
func (s *BackupService) GetSiteByDomain(domain string) (int64, error) {
	var id int64
	err := s.db.QueryRow("SELECT id FROM sites WHERE domain = ?", domain).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, apperrors.New(apperrors.ErrNotFound, "site not found: "+domain)
	}
	if err != nil {
		return 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to lookup site by domain")
	}
	return id, nil
}

// GetDatabaseByName looks up a database by name.
func (s *BackupService) GetDatabaseByName(name string) (int64, error) {
	var id int64
	err := s.db.QueryRow("SELECT id FROM databases WHERE name = ?", name).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, apperrors.New(apperrors.ErrNotFound, "database not found: "+name)
	}
	if err != nil {
		return 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to lookup database by name")
	}
	return id, nil
}

// CreateAllSitesBackup backs up every site.
func (s *BackupService) CreateAllSitesBackup(createdBy int64) ([]*Backup, error) {
	sites, err := s.ListAllSites()
	if err != nil {
		return nil, err
	}
	var results []*Backup
	for _, site := range sites {
		b, err := s.CreateSiteBackup(site.ID, createdBy)
		if err != nil {
			logger.Warn().Int64("site_id", site.ID).Str("domain", site.Domain).Err(err).Msg("failed to backup site, skipping")
			continue
		}
		results = append(results, b)
	}
	return results, nil
}

// CreateAllDatabasesBackup backs up every database.
func (s *BackupService) CreateAllDatabasesBackup(createdBy int64) ([]*Backup, error) {
	dbs, err := s.ListAllDatabases()
	if err != nil {
		return nil, err
	}
	var results []*Backup
	for _, db := range dbs {
		b, err := s.CreateDatabaseBackup(db.ID, createdBy)
		if err != nil {
			logger.Warn().Int64("db_id", db.ID).Str("name", db.Name).Err(err).Msg("failed to backup database, skipping")
			continue
		}
		results = append(results, b)
	}
	return results, nil
}

// EnforceRetention keeps only the newest maxKeep backups for a given type
// and optional target. Older backups are deleted from disk and DB.
func (s *BackupService) EnforceRetention(backupType string, targetID *int64, maxKeep int) error {
	if maxKeep <= 0 {
		return nil
	}

	var rows *sql.Rows
	var err error
	if targetID != nil {
		rows, err = s.db.Query(
			`SELECT id, file_path FROM backups
			 WHERE type = ? AND target_id = ?
			 ORDER BY created_at DESC`,
			backupType, *targetID,
		)
	} else {
		rows, err = s.db.Query(
			`SELECT id, file_path FROM backups
			 WHERE type = ? AND target_id IS NULL
			 ORDER BY created_at DESC`,
			backupType,
		)
	}
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to query backups for retention")
	}
	defer rows.Close()

	var idx int
	var toDelete []struct {
		id       int64
		filePath string
	}
	for rows.Next() {
		var id int64
		var filePath string
		if err := rows.Scan(&id, &filePath); err != nil {
			continue
		}
		idx++
		if idx > maxKeep {
			toDelete = append(toDelete, struct {
				id       int64
				filePath string
			}{id, filePath})
		}
	}

	for _, item := range toDelete {
		if item.filePath != "" {
			os.Remove(item.filePath)
		}
		s.db.Exec("DELETE FROM backups WHERE id = ?", item.id)
	}

	if len(toDelete) > 0 {
		logger.Info().
			Str("type", backupType).
			Int("max_keep", maxKeep).
			Int("deleted", len(toDelete)).
			Msg("backup retention enforced")
	}

	return nil
}

func fileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}
