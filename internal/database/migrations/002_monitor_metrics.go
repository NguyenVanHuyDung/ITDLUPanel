package migrations

import (
	"database/sql"
	"fmt"
)

// Migration002MonitorMetrics creates tables for storing historical monitor metrics.
type Migration002MonitorMetrics struct{}

func (m *Migration002MonitorMetrics) Version() int {
	return 2
}

func (m *Migration002MonitorMetrics) Up(db *sql.DB) error {
	// All 4 tables share the same column layout, differing only in resolution.
	resolutions := []string{"raw", "5m", "1h", "1d"}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	for _, res := range resolutions {
		table := fmt.Sprintf("monitor_metrics_%s", res)
		ddl := fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp    DATETIME NOT NULL,
			cpu_percent  REAL NOT NULL DEFAULT 0,
			mem_percent  REAL NOT NULL DEFAULT 0,
			mem_used     INTEGER NOT NULL DEFAULT 0,
			mem_total    INTEGER NOT NULL DEFAULT 0,
			swap_percent REAL NOT NULL DEFAULT 0,
			disk_percent REAL NOT NULL DEFAULT 0,
			disk_used    INTEGER NOT NULL DEFAULT 0,
			disk_total   INTEGER NOT NULL DEFAULT 0,
			disk_read    INTEGER NOT NULL DEFAULT 0,
			disk_write   INTEGER NOT NULL DEFAULT 0,
			net_sent     INTEGER NOT NULL DEFAULT 0,
			net_recv     INTEGER NOT NULL DEFAULT 0,
			load1        REAL NOT NULL DEFAULT 0,
			load5        REAL NOT NULL DEFAULT 0,
			load15       REAL NOT NULL DEFAULT 0
		)`, table)
		if _, err := tx.Exec(ddl); err != nil {
			return fmt.Errorf("failed to create table %s: %w", table, err)
		}

		idx := fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_%s_ts ON %s(timestamp)", table, table)
		if _, err := tx.Exec(idx); err != nil {
			return fmt.Errorf("failed to create index on %s: %w", table, err)
		}
	}

	// Default monitor settings
	settings := []struct {
		key, value, desc string
	}{
		{"monitor_enabled", "true", "Enable background metrics collection"},
		{"monitor_interval", "60", "Metrics collection interval in seconds"},
		{"monitor_retention_raw", "2", "Days to keep raw (1-min) metrics"},
		{"monitor_retention_5m", "7", "Days to keep 5-minute aggregated metrics"},
		{"monitor_retention_1h", "90", "Days to keep hourly aggregated metrics"},
		{"monitor_retention_1d", "365", "Days to keep daily aggregated metrics"},
	}
	for _, s := range settings {
		if _, err := tx.Exec(
			"INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)",
			s.key, s.value, s.desc,
		); err != nil {
			return fmt.Errorf("failed to insert setting %s: %w", s.key, err)
		}
	}

	return tx.Commit()
}
