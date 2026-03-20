package models

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// Setting represents a panel configuration setting.
type Setting struct {
	Key         string    `json:"key"`
	Value       string    `json:"value"`
	Description string    `json:"description,omitempty"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// SettingRepository provides CRUD operations for settings.
type SettingRepository struct {
	db *sql.DB
}

// NewSettingRepository creates a new SettingRepository.
func NewSettingRepository(db *sql.DB) *SettingRepository {
	return &SettingRepository{db: db}
}

// Get retrieves a single setting value by key.
func (r *SettingRepository) Get(key string) (string, error) {
	var value string
	err := r.db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("setting %q not found", key)
	}
	if err != nil {
		return "", fmt.Errorf("failed to get setting %q: %w", key, err)
	}
	return value, nil
}

// Set creates or updates a setting.
func (r *SettingRepository) Set(key, value string) error {
	_, err := r.db.Exec(
		`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
		key, value,
	)
	if err != nil {
		return fmt.Errorf("failed to set setting %q: %w", key, err)
	}
	return nil
}

// GetAll retrieves all settings.
func (r *SettingRepository) GetAll() ([]Setting, error) {
	rows, err := r.db.Query("SELECT key, value, description, updated_at FROM settings ORDER BY key")
	if err != nil {
		return nil, fmt.Errorf("failed to get all settings: %w", err)
	}
	defer rows.Close()

	var settings []Setting
	for rows.Next() {
		var s Setting
		var desc sql.NullString
		if err := rows.Scan(&s.Key, &s.Value, &desc, &s.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan setting: %w", err)
		}
		s.Description = desc.String
		settings = append(settings, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating settings: %w", err)
	}
	return settings, nil
}

// GetMultiple retrieves multiple settings by keys as a map.
func (r *SettingRepository) GetMultiple(keys ...string) (map[string]string, error) {
	if len(keys) == 0 {
		return map[string]string{}, nil
	}

	placeholders := make([]string, len(keys))
	args := make([]interface{}, len(keys))
	for i, k := range keys {
		placeholders[i] = "?"
		args[i] = k
	}

	query := fmt.Sprintf(
		"SELECT key, value FROM settings WHERE key IN (%s)",
		strings.Join(placeholders, ","),
	)

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get multiple settings: %w", err)
	}
	defer rows.Close()

	result := make(map[string]string, len(keys))
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, fmt.Errorf("failed to scan setting: %w", err)
		}
		result[key] = value
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating settings: %w", err)
	}
	return result, nil
}
