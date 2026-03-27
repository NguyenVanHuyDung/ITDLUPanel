package migrations

import "database/sql"

// Migration004PhpMyAdminDefaultPort marks port 888 (phpMyAdmin) as a default
// firewall rule so it cannot be deleted from the UI.
type Migration004PhpMyAdminDefaultPort struct{}

func (m *Migration004PhpMyAdminDefaultPort) Version() int { return 4 }

func (m *Migration004PhpMyAdminDefaultPort) Up(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Check if port 888 rule already exists
	var count int
	if err := tx.QueryRow(
		"SELECT COUNT(*) FROM firewall_rules WHERE port = '888' AND protocol = 'tcp' AND direction = 'in' AND type = 'port'",
	).Scan(&count); err != nil {
		return err
	}

	if count == 0 {
		// Insert new default rule for phpMyAdmin
		_, err = tx.Exec(
			`INSERT INTO firewall_rules (type, protocol, port, action, direction, description, status, is_default)
			 VALUES ('port', 'tcp', '888', 'allow', 'in', 'phpMyAdmin', 1, 1)`,
		)
		if err != nil {
			return err
		}
	} else {
		// Mark existing rule as default
		_, err = tx.Exec(
			"UPDATE firewall_rules SET is_default = 1 WHERE port = '888' AND protocol = 'tcp' AND direction = 'in' AND type = 'port'",
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}
