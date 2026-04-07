package migrations

import (
	"database/sql"
	"fmt"
)

// Migration013NotificationTemplates adds custom template columns to notification_rules.
type Migration013NotificationTemplates struct{}

func (m *Migration013NotificationTemplates) Version() int { return 13 }

func (m *Migration013NotificationTemplates) Up(db *sql.DB) error {
	stmts := []string{
		`ALTER TABLE notification_rules ADD COLUMN custom_subject TEXT DEFAULT ''`,
		`ALTER TABLE notification_rules ADD COLUMN custom_body TEXT DEFAULT ''`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			// Column may already exist — ignore "duplicate column" errors.
			if !isDuplicateColumn(err) {
				return fmt.Errorf("migration 013 notification_templates: %w", err)
			}
		}
	}
	return nil
}

func isDuplicateColumn(err error) bool {
	return err != nil && (contains(err.Error(), "duplicate column") || contains(err.Error(), "already exists"))
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && searchString(s, sub)
}

func searchString(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
