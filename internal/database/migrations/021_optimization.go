package migrations

import (
	"database/sql"
	"fmt"
)

// Migration021Optimization adds tables for dual-mode server optimization
// (Manual Config and Adaptive Optimization) for MariaDB and Nginx.
//
// Tables added:
//   - optimization_settings: Stores mode (manual/adaptive) and all config values
//   - optimization_history: Audit trail of all optimization changes
//   - optimization_metrics: Temporary metrics storage for adaptive mode
type Migration021Optimization struct{}

func (m *Migration021Optimization) Version() int { return 21 }

func (m *Migration021Optimization) Up(db *sql.DB) error {
	stmts := []string{
		// Main settings table with dual-mode support
		`CREATE TABLE IF NOT EXISTS optimization_settings (
			id INTEGER PRIMARY KEY,
			mode TEXT NOT NULL DEFAULT 'manual',
			enabled BOOLEAN NOT NULL DEFAULT true,

			-- Manual Config - MariaDB
			manual_max_connections INTEGER NOT NULL DEFAULT 200,
			manual_buffer_pool_size TEXT NOT NULL DEFAULT '1G',
			manual_buffer_pool_instances INTEGER NOT NULL DEFAULT 0,
			manual_thread_cache_size INTEGER NOT NULL DEFAULT 16,
			manual_slow_query_log BOOLEAN NOT NULL DEFAULT false,
			manual_slow_query_threshold REAL NOT NULL DEFAULT 1.0,
			manual_max_heap_table_size TEXT NOT NULL DEFAULT '64M',
			manual_tmp_table_size TEXT NOT NULL DEFAULT '64M',

			-- Manual Config - Nginx
			manual_nginx_worker_processes TEXT NOT NULL DEFAULT 'auto',
			manual_nginx_worker_connections INTEGER NOT NULL DEFAULT 2048,
			manual_nginx_keepalive_timeout INTEGER NOT NULL DEFAULT 30,
			manual_nginx_keepalive_requests INTEGER NOT NULL DEFAULT 1000,
			manual_nginx_gzip_on BOOLEAN NOT NULL DEFAULT true,
			manual_nginx_gzip_level INTEGER NOT NULL DEFAULT 5,
			manual_nginx_open_file_cache_max INTEGER NOT NULL DEFAULT 10000,
			manual_nginx_client_max_body_size TEXT NOT NULL DEFAULT '64m',

			-- Adaptive Settings - MariaDB
			adaptive_mariadb_enabled BOOLEAN NOT NULL DEFAULT true,
			adaptive_mariadb_auto_tune_connections BOOLEAN NOT NULL DEFAULT true,
			adaptive_mariadb_auto_tune_buffer_pool BOOLEAN NOT NULL DEFAULT true,
			adaptive_mariadb_auto_tune_query_cache BOOLEAN NOT NULL DEFAULT true,
			adaptive_mariadb_auto_tune_slow_query BOOLEAN NOT NULL DEFAULT true,
			adaptive_mariadb_max_connections_limit INTEGER NOT NULL DEFAULT 2000,
			adaptive_mariadb_buffer_pool_percent INTEGER NOT NULL DEFAULT 70,
			adaptive_mariadb_connection_warning_pct INTEGER NOT NULL DEFAULT 80,
			adaptive_mariadb_connection_critical_pct INTEGER NOT NULL DEFAULT 95,
			adaptive_mariadb_buffer_hit_warning_pct INTEGER NOT NULL DEFAULT 90,
			adaptive_mariadb_slow_query_threshold REAL NOT NULL DEFAULT 1.0,

			-- Adaptive Settings - Nginx
			adaptive_nginx_enabled BOOLEAN NOT NULL DEFAULT true,
			adaptive_nginx_auto_tune_workers BOOLEAN NOT NULL DEFAULT true,
			adaptive_nginx_auto_tune_connections BOOLEAN NOT NULL DEFAULT true,
			adaptive_nginx_auto_tune_keepalive BOOLEAN NOT NULL DEFAULT true,
			adaptive_nginx_auto_tune_gzip BOOLEAN NOT NULL DEFAULT true,
			adaptive_nginx_min_worker_connections INTEGER NOT NULL DEFAULT 1024,
			adaptive_nginx_max_worker_connections INTEGER NOT NULL DEFAULT 8192,
			adaptive_nginx_keepalive_timeout INTEGER NOT NULL DEFAULT 30,
			adaptive_nginx_gzip_min_level INTEGER NOT NULL DEFAULT 1,
			adaptive_nginx_gzip_max_level INTEGER NOT NULL DEFAULT 7,
			adaptive_nginx_conn_per_worker_warning INTEGER NOT NULL DEFAULT 1500,
			adaptive_nginx_conn_per_worker_critical INTEGER NOT NULL DEFAULT 3000,

			-- General Settings
			check_interval_minutes INTEGER NOT NULL DEFAULT 5,
			notify_on_change BOOLEAN NOT NULL DEFAULT true,
			require_confirmation BOOLEAN NOT NULL DEFAULT false,

			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,

		// Optimization history for audit trail
		`CREATE TABLE IF NOT EXISTS optimization_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			mode TEXT NOT NULL,
			optimization_type TEXT NOT NULL,
			parameter TEXT NOT NULL,
			old_value TEXT,
			new_value TEXT,
			reason TEXT,
			auto_applied BOOLEAN NOT NULL DEFAULT false,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,

		// Optimization metrics for adaptive mode
		`CREATE TABLE IF NOT EXISTS optimization_metrics (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			metric_type TEXT NOT NULL,
			metric_name TEXT NOT NULL,
			metric_value REAL NOT NULL,
			collected_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,

		// Indexes for performance
		`CREATE INDEX IF NOT EXISTS idx_optimization_history_type ON optimization_history(optimization_type)`,
		`CREATE INDEX IF NOT EXISTS idx_optimization_history_created ON optimization_history(created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_optimization_metrics_type ON optimization_metrics(metric_type)`,
		`CREATE INDEX IF NOT EXISTS idx_optimization_metrics_collected ON optimization_metrics(collected_at)`,

		// Insert default settings row
		`INSERT OR IGNORE INTO optimization_settings (id, mode) VALUES (1, 'manual')`,
	}

	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return fmt.Errorf("migration 021 optimization: %w", err)
		}
	}
	return nil
}
