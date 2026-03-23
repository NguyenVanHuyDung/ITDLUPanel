package migrations

import (
	"database/sql"
	"fmt"
)

// Migration003FirewallSettings adds firewall settings table and is_default column.
type Migration003FirewallSettings struct{}

func (m *Migration003FirewallSettings) Version() int {
	return 3
}

func (m *Migration003FirewallSettings) Up(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Firewall settings key/value store
	if _, err := tx.Exec(`CREATE TABLE IF NOT EXISTS firewall_settings (
		key        TEXT PRIMARY KEY,
		value      TEXT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		return fmt.Errorf("failed to create firewall_settings table: %w", err)
	}

	// Defaults: both OFF to avoid locking users out
	defaults := []struct{ key, value string }{
		{"enabled", "false"},
		{"icmp_block", "false"},
	}
	for _, d := range defaults {
		if _, err := tx.Exec(
			"INSERT OR IGNORE INTO firewall_settings (key, value) VALUES (?, ?)",
			d.key, d.value,
		); err != nil {
			return fmt.Errorf("failed to insert setting %s: %w", d.key, err)
		}
	}

	// Add is_default column to firewall_rules (1 = default rule, cannot be deleted from UI)
	// SQLite ALTER TABLE ADD COLUMN is safe even if column exists — we catch the error.
	_, _ = tx.Exec(`ALTER TABLE firewall_rules ADD COLUMN is_default INTEGER DEFAULT 0`)

	// Seed default rules: SSH (22) and Panel (8888)
	seedRules := []struct {
		port, protocol, action, direction, description string
	}{
		{"22", "tcp", "allow", "in", "SSH"},
		{"8888", "tcp", "allow", "in", "Panel"},
	}
	for _, r := range seedRules {
		// Only insert if not already present
		var count int
		if err := tx.QueryRow(
			"SELECT COUNT(*) FROM firewall_rules WHERE port = ? AND protocol = ? AND direction = ?",
			r.port, r.protocol, r.direction,
		).Scan(&count); err != nil {
			return fmt.Errorf("failed to check existing rule for port %s: %w", r.port, err)
		}
		if count == 0 {
			if _, err := tx.Exec(
				`INSERT INTO firewall_rules (type, protocol, port, action, direction, description, status, is_default)
				 VALUES ('port', ?, ?, ?, ?, ?, 1, 1)`,
				r.protocol, r.port, r.action, r.direction, r.description,
			); err != nil {
				return fmt.Errorf("failed to seed default rule for port %s: %w", r.port, err)
			}
		}
	}

	return tx.Commit()
}
