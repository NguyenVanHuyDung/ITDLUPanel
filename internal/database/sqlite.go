package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/ITDLUPanel/panel/internal/database/migrations"

	_ "modernc.org/sqlite"
)

var (
	instance *DB
	once     sync.Once
)

// DB wraps *sql.DB with additional functionality.
type DB struct {
	db     *sql.DB
	dbPath string
}

// New opens a SQLite database at dbPath and applies performance pragmas.
func New(dbPath string) (*DB, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA foreign_keys=ON",
		"PRAGMA busy_timeout=5000",
		"PRAGMA journal_size_limit=67108864",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			db.Close()
			return nil, fmt.Errorf("failed to execute %q: %w", p, err)
		}
	}

	d := &DB{db: db, dbPath: dbPath}

	once.Do(func() {
		instance = d
	})

	return d, nil
}

// Close closes the underlying database connection.
func (d *DB) Close() error {
	if d.db != nil {
		return d.db.Close()
	}
	return nil
}

// GetDB returns the underlying *sql.DB.
func (d *DB) GetDB() *sql.DB {
	return d.db
}

// Migrate runs all registered migrations in order.
func (d *DB) Migrate() error {
	allMigrations := migrations.All()

	for _, m := range allMigrations {
		version := m.Version()

		var count int
		err := d.db.QueryRow("SELECT COUNT(*) FROM schema_migrations WHERE version = ?", version).Scan(&count)
		if err != nil {
			// schema_migrations table might not exist yet for the first migration
			count = 0
		}

		if count > 0 {
			continue
		}

		if err := m.Up(d.db); err != nil {
			return fmt.Errorf("migration %d failed: %w", version, err)
		}

		// The first migration creates schema_migrations, so this insert will work
		if _, err := d.db.Exec("INSERT INTO schema_migrations (version) VALUES (?)", version); err != nil {
			return fmt.Errorf("failed to record migration %d: %w", version, err)
		}
	}

	return nil
}

// Get returns the global database instance.
func Get() *DB {
	return instance
}
