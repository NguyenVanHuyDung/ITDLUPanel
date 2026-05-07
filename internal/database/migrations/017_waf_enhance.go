package migrations

import (
	"database/sql"
	"fmt"
)

type Migration017WAFEnhance struct{}

func (m *Migration017WAFEnhance) Version() int { return 17 }

func (m *Migration017WAFEnhance) Up(db *sql.DB) error {
	stmts := []string{
		// Traffic stats: hourly bandwidth and request timing
		`CREATE TABLE IF NOT EXISTS waf_traffic_stats (
			id             INTEGER PRIMARY KEY AUTOINCREMENT,
			site_id        INTEGER REFERENCES waf_sites(id) ON DELETE CASCADE,
			period         TEXT    NOT NULL,
			period_key     TEXT    NOT NULL,
			hour            INTEGER,
			date_key        TEXT,
			total_bytes_in  INTEGER NOT NULL DEFAULT 0,
			total_bytes_out INTEGER NOT NULL DEFAULT 0,
			total_requests  INTEGER NOT NULL DEFAULT 0,
			blocked_requests INTEGER NOT NULL DEFAULT 0,
			avg_response_ms REAL    NOT NULL DEFAULT 0,
			max_response_ms INTEGER NOT NULL DEFAULT 0,
			min_response_ms INTEGER NOT NULL DEFAULT 0,
			p95_response_ms INTEGER NOT NULL DEFAULT 0,
			created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(period, period_key, site_id, hour, date_key)
		)`,

		// URI blacklist / whitelist
		`CREATE TABLE IF NOT EXISTS waf_uri_list (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			uri_pattern TEXT    NOT NULL,
			list_type   TEXT    NOT NULL DEFAULT 'whitelist',
			action      TEXT    NOT NULL DEFAULT 'block',
			description TEXT,
			enabled     INTEGER NOT NULL DEFAULT 1,
			priority    INTEGER NOT NULL DEFAULT 100,
			created_by  INTEGER REFERENCES users(id),
			created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(uri_pattern, list_type)
		)`,

		// Lua scripts for HAProxy
		`CREATE TABLE IF NOT EXISTS waf_lua_scripts (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			name        TEXT    NOT NULL,
			description TEXT,
			script_content TEXT NOT NULL,
			enabled     INTEGER NOT NULL DEFAULT 1,
			priority    INTEGER NOT NULL DEFAULT 100,
			created_by  INTEGER REFERENCES users(id),
			created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		// User-Agent whitelist
		`CREATE TABLE IF NOT EXISTS waf_ua_list (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			ua_pattern  TEXT    NOT NULL,
			list_type   TEXT    NOT NULL DEFAULT 'whitelist',
			description TEXT,
			enabled     INTEGER NOT NULL DEFAULT 1,
			created_by  INTEGER REFERENCES users(id),
			created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(ua_pattern, list_type)
		)`,

		// Attack type detection patterns (auto-detect from logs)
		`CREATE TABLE IF NOT EXISTS waf_attack_signatures (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			signature    TEXT    NOT NULL UNIQUE,
			attack_type  TEXT    NOT NULL,
			severity     TEXT    NOT NULL DEFAULT 'warning',
			pattern      TEXT    NOT NULL,
			description  TEXT,
			match_count  INTEGER NOT NULL DEFAULT 0,
			last_seen    DATETIME,
			created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		// Expanded IP entries with hits tracking
		`ALTER TABLE waf_ip_list ADD COLUMN hit_count INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE waf_ip_list ADD COLUMN last_hit DATETIME`,
		`ALTER TABLE waf_ip_list ADD COLUMN is_cidr INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE waf_ip_list ADD COLUMN source TEXT DEFAULT 'manual'`,

		// Attack type stats
		`ALTER TABLE waf_stats ADD COLUMN attack_types TEXT`,

		// Slow requests table
		`CREATE TABLE IF NOT EXISTS waf_slow_requests (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			log_id       INTEGER REFERENCES waf_logs(id) ON DELETE CASCADE,
			site_id      INTEGER REFERENCES waf_sites(id) ON DELETE SET NULL,
			client_ip    TEXT    NOT NULL,
			method       TEXT,
			uri          TEXT,
			host         TEXT,
			response_ms  INTEGER NOT NULL,
			threshold_ms INTEGER NOT NULL DEFAULT 5000,
			timestamp    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		// WAF geo statistics
		`CREATE TABLE IF NOT EXISTS waf_geo_stats (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			site_id     INTEGER REFERENCES waf_sites(id) ON DELETE CASCADE,
			country_code TEXT    NOT NULL,
			total_requests INTEGER NOT NULL DEFAULT 0,
			blocked_requests INTEGER NOT NULL DEFAULT 0,
			period       TEXT    NOT NULL,
			period_key   TEXT    NOT NULL,
			UNIQUE(country_code, period, period_key, site_id)
		)`,

		// Auto-clear hits for IP list
		`CREATE INDEX IF NOT EXISTS idx_waf_traffic_stats_period ON waf_traffic_stats(period, period_key)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_uri_list_type ON waf_uri_list(list_type)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_lua_scripts_enabled ON waf_lua_scripts(enabled)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_ua_list_type ON waf_ua_list(list_type)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_slow_requests_site ON waf_slow_requests(site_id)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_slow_requests_timestamp ON waf_slow_requests(timestamp DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_geo_stats_country ON waf_geo_stats(country_code)`,
	}

	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return fmt.Errorf("migration 017 waf enhance: %w", err)
		}
	}

	return nil
}
