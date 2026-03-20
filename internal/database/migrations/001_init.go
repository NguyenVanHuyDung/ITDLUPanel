package migrations

import (
	"database/sql"
	"fmt"
)

// Migration001Init creates the initial database schema.
type Migration001Init struct{}

// Version returns the migration version number.
func (m *Migration001Init) Version() int {
	return 1
}

// Up applies the initial migration.
func (m *Migration001Init) Up(db *sql.DB) error {
	tables := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password TEXT NOT NULL,
			email TEXT,
			role TEXT NOT NULL DEFAULT 'viewer',
			totp_secret TEXT,
			totp_enabled INTEGER DEFAULT 0,
			status INTEGER DEFAULT 1,
			last_login DATETIME,
			last_ip TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS roles (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT UNIQUE NOT NULL,
			description TEXT,
			permissions TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS user_roles (
			user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
			role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
			PRIMARY KEY (user_id, role_id)
		)`,
		`CREATE TABLE IF NOT EXISTS sites (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			domain TEXT NOT NULL,
			path TEXT NOT NULL,
			webserver TEXT NOT NULL,
			php_version TEXT,
			ssl_enabled INTEGER DEFAULT 0,
			ssl_type TEXT,
			ssl_expiry DATETIME,
			status INTEGER DEFAULT 1,
			config_extra TEXT,
			created_by INTEGER REFERENCES users(id),
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS domains (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
			domain TEXT NOT NULL,
			is_primary INTEGER DEFAULT 0,
			UNIQUE(site_id, domain)
		)`,
		`CREATE TABLE IF NOT EXISTS databases (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			db_type TEXT NOT NULL,
			username TEXT NOT NULL,
			password TEXT NOT NULL,
			charset TEXT DEFAULT 'utf8mb4',
			collation TEXT DEFAULT 'utf8mb4_general_ci',
			remote_access TEXT DEFAULT 'localhost',
			size INTEGER DEFAULT 0,
			created_by INTEGER REFERENCES users(id),
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(name, db_type)
		)`,
		`CREATE TABLE IF NOT EXISTS ftps (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password TEXT NOT NULL,
			path TEXT NOT NULL,
			status INTEGER DEFAULT 1,
			created_by INTEGER REFERENCES users(id),
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS crons (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			type TEXT NOT NULL,
			schedule TEXT NOT NULL,
			command TEXT NOT NULL,
			status INTEGER DEFAULT 1,
			last_run DATETIME,
			last_status TEXT,
			last_output TEXT,
			created_by INTEGER REFERENCES users(id),
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS tasks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL,
			name TEXT NOT NULL,
			status TEXT DEFAULT 'pending',
			progress INTEGER DEFAULT 0,
			log TEXT,
			result TEXT,
			error TEXT,
			created_by INTEGER REFERENCES users(id),
			started_at DATETIME,
			completed_at DATETIME,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS software (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT UNIQUE NOT NULL,
			display_name TEXT NOT NULL,
			version TEXT NOT NULL,
			type TEXT NOT NULL,
			status INTEGER DEFAULT 1,
			config_path TEXT,
			install_path TEXT,
			service_name TEXT,
			installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS plugins (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT UNIQUE NOT NULL,
			display_name TEXT NOT NULL,
			version TEXT NOT NULL,
			description TEXT,
			author TEXT,
			homepage TEXT,
			status INTEGER DEFAULT 1,
			config TEXT,
			installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS firewall_rules (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL,
			protocol TEXT DEFAULT 'tcp',
			port TEXT,
			ip TEXT,
			action TEXT NOT NULL,
			direction TEXT DEFAULT 'in',
			description TEXT,
			status INTEGER DEFAULT 1,
			sort_order INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS backups (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL,
			name TEXT NOT NULL,
			target_id INTEGER,
			target_name TEXT,
			file_path TEXT NOT NULL,
			file_size INTEGER DEFAULT 0,
			storage TEXT DEFAULT 'local',
			checksum TEXT,
			status TEXT DEFAULT 'completed',
			created_by INTEGER REFERENCES users(id),
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS audit_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			username TEXT,
			action TEXT NOT NULL,
			resource TEXT NOT NULL,
			resource_id TEXT,
			detail TEXT,
			ip TEXT,
			user_agent TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			description TEXT,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS docker_containers (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			container_id TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			image TEXT NOT NULL,
			status TEXT,
			ports TEXT,
			volumes TEXT,
			env TEXT,
			restart_policy TEXT DEFAULT 'no',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	for i, ddl := range tables {
		if _, err := tx.Exec(ddl); err != nil {
			return fmt.Errorf("failed to create table %d: %w", i, err)
		}
	}

	// Default roles
	roles := []struct {
		name        string
		description string
		permissions string
	}{
		{"admin", "Full system administrator", `["*"]`},
		{"operator", "Server operator", `["sites.*","databases.*","ftp.*","files.*","cron.*","docker.*","firewall.*","backup.*","terminal.access","monitor.read","logs.read"]`},
		{"viewer", "Read-only viewer", `["monitor.read","logs.read","dashboard.read"]`},
	}
	for _, r := range roles {
		if _, err := tx.Exec(
			"INSERT OR IGNORE INTO roles (name, description, permissions) VALUES (?, ?, ?)",
			r.name, r.description, r.permissions,
		); err != nil {
			return fmt.Errorf("failed to insert role %s: %w", r.name, err)
		}
	}

	// Default settings
	settings := []struct {
		key         string
		value       string
		description string
	}{
		{"panel_port", "8888", "Panel HTTP port"},
		{"panel_ssl", "0", "Panel SSL enabled"},
		{"panel_language", "en", "Default language"},
		{"admin_path", "/", "Custom admin URL path"},
		{"session_timeout", "86400", "Session timeout in seconds"},
		{"backup_path", "/ITDLUPanel/backup", "Backup storage path"},
		{"wwwroot_path", "/ITDLUPanel/wwwroot", "Website root path"},
		{"default_webserver", "", "Default webserver"},
		{"setup_completed", "0", "First-time setup completed"},
	}
	for _, s := range settings {
		if _, err := tx.Exec(
			"INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)",
			s.key, s.value, s.description,
		); err != nil {
			return fmt.Errorf("failed to insert setting %s: %w", s.key, err)
		}
	}

	// Indexes
	indexes := []string{
		"CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites(domain)",
		"CREATE INDEX IF NOT EXISTS idx_domains_site ON domains(site_id)",
		"CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
		"CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)",
		"CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)",
		"CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)",
	}
	for _, idx := range indexes {
		if _, err := tx.Exec(idx); err != nil {
			return fmt.Errorf("failed to create index: %w", err)
		}
	}

	return tx.Commit()
}
