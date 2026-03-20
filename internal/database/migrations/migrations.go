package migrations

import "database/sql"

// Migration defines the interface for database migrations.
type Migration interface {
	Up(db *sql.DB) error
	Version() int
}

// All returns all migrations in order.
func All() []Migration {
	return []Migration{
		&Migration001Init{},
	}
}
