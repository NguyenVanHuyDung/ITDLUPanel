package migrations

import (
	"database/sql"
	"fmt"
)

type Migration016WAF struct{}

func (m *Migration016WAF) Version() int { return 16 }

func (m *Migration016WAF) Up(db *sql.DB) error {
	stmts := []string{
		// WAF Sites - protected sites configuration
		`CREATE TABLE IF NOT EXISTS waf_sites (
			id                INTEGER PRIMARY KEY AUTOINCREMENT,
			name              TEXT    NOT NULL,
			domain            TEXT    NOT NULL,
			backend_url       TEXT    NOT NULL,
			listen_port       INTEGER NOT NULL DEFAULT 80,
			ssl_port          INTEGER NOT NULL DEFAULT 443,
			enabled           INTEGER NOT NULL DEFAULT 1,
			mode              TEXT    NOT NULL DEFAULT 'blocking',
			ssl_enabled       INTEGER NOT NULL DEFAULT 0,
			ssl_cert_path     TEXT,
			ssl_key_path      TEXT,
			health_check_path TEXT,
			max_connections   INTEGER NOT NULL DEFAULT 2000,
			timeout_client   INTEGER NOT NULL DEFAULT 30000,
			timeout_server   INTEGER NOT NULL DEFAULT 30000,
			description       TEXT,
			created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		// WAF Rules - custom and OWASP rules
		`CREATE TABLE IF NOT EXISTS waf_rules (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			name            TEXT    NOT NULL,
			rule_type       TEXT    NOT NULL DEFAULT 'custom',
			category        TEXT    NOT NULL DEFAULT 'custom',
			phase           INTEGER NOT NULL DEFAULT 1,
			action          TEXT    NOT NULL DEFAULT 'block',
			rule_content    TEXT    NOT NULL,
			enabled         INTEGER NOT NULL DEFAULT 1,
			priority        INTEGER NOT NULL DEFAULT 100,
			log_level       TEXT    NOT NULL DEFAULT 'alert',
			description     TEXT,
			rule_group      TEXT,
			owasp_rule_id   TEXT,
			created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		// WAF OWASP Categories - togglable OWASP rule categories
		`CREATE TABLE IF NOT EXISTS waf_owasp_categories (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			category_id     TEXT    NOT NULL UNIQUE,
			name            TEXT    NOT NULL,
			description     TEXT,
			enabled         INTEGER NOT NULL DEFAULT 1,
			severity        TEXT    NOT NULL DEFAULT 'warning',
			mitre_technique TEXT,
			created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		// WAF Logs - audit trail
		`CREATE TABLE IF NOT EXISTS waf_logs (
			id                INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			site_id           INTEGER REFERENCES waf_sites(id) ON DELETE SET NULL,
			client_ip         TEXT    NOT NULL,
			method            TEXT,
			uri               TEXT,
			host              TEXT,
			rule_id           TEXT,
			rule_message      TEXT,
			rule_severity     TEXT,
			rule_category     TEXT,
			action_taken      TEXT    NOT NULL DEFAULT 'allowed',
			anomaly_score     REAL,
			geo_country       TEXT,
			user_agent        TEXT,
			referer           TEXT,
			response_code     INTEGER,
			request_body      TEXT,
			request_headers   TEXT,
			matched_data      TEXT,
			created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		// WAF Statistics - aggregated stats
		`CREATE TABLE IF NOT EXISTS waf_stats (
			id                    INTEGER PRIMARY KEY AUTOINCREMENT,
			period                TEXT    NOT NULL,
			period_key            TEXT    NOT NULL,
			site_id               INTEGER REFERENCES waf_sites(id) ON DELETE CASCADE,
			total_requests        INTEGER NOT NULL DEFAULT 0,
			blocked_requests      INTEGER NOT NULL DEFAULT 0,
			allowed_requests      INTEGER NOT NULL DEFAULT 0,
			sqli_count            INTEGER NOT NULL DEFAULT 0,
			xss_count             INTEGER NOT NULL DEFAULT 0,
			lfi_count             INTEGER NOT NULL DEFAULT 0,
			rce_count             INTEGER NOT NULL DEFAULT 0,
			other_count           INTEGER NOT NULL DEFAULT 0,
			top_blocked_ips       TEXT,
			top_triggered_rules   TEXT,
			avg_anomaly_score     REAL,
			created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(period, period_key, site_id)
		)`,

		// WAF Settings - global configuration
		`CREATE TABLE IF NOT EXISTS waf_settings (
			key     TEXT PRIMARY KEY,
			value   TEXT NOT NULL,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		// WAF IP Lists - whitelist and blacklist
		`CREATE TABLE IF NOT EXISTS waf_ip_list (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			ip_address TEXT    NOT NULL,
			list_type  TEXT    NOT NULL DEFAULT 'whitelist',
			description TEXT,
			expires_at  DATETIME,
			created_by  INTEGER REFERENCES users(id),
			created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(ip_address, list_type)
		)`,

		// Indexes
		`CREATE INDEX IF NOT EXISTS idx_waf_sites_domain ON waf_sites(domain)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_sites_enabled ON waf_sites(enabled)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_rules_type ON waf_rules(rule_type)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_rules_enabled ON waf_rules(enabled)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_rules_category ON waf_rules(category)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_logs_timestamp ON waf_logs(timestamp DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_logs_site ON waf_logs(site_id)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_logs_action ON waf_logs(action_taken)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_logs_ip ON waf_logs(client_ip)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_logs_severity ON waf_logs(rule_severity)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_stats_period ON waf_stats(period, period_key)`,
		`CREATE INDEX IF NOT EXISTS idx_waf_ip_list_type ON waf_ip_list(list_type)`,
	}

	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return fmt.Errorf("migration 016 waf: %w", err)
		}
	}

	// Seed default OWASP categories
	categories := []struct {
		id          string
		name        string
		description string
		severity    string
		mitre       string
	}{
		{"SQLi", "SQL Injection", "Attacks that involve inserting SQL queries into input fields", "critical", "T1505"},
		{"XSS", "Cross-Site Scripting", "Injecting malicious scripts into web pages", "error", "T1059"},
		{"LFI", "Local File Inclusion", "Including files on a server through manipulation of input", "warning", "T1005"},
		{"RFI", "Remote File Inclusion", "Including remote files through user-controlled input", "critical", "T1190"},
		{"RCE", "Remote Code Execution", "Executing arbitrary code on the server", "critical", "T1210"},
		{"CRLF", "CRLF Injection", "Injecting carriage return and line feed characters", "warning", "T1059"},
		{"TRAVERSAL", "Path Traversal", "Accessing files outside the web root directory", "error", "T1005"},
		{"PROTOCOL", "Protocol Attack", "Attacks targeting HTTP protocol vulnerabilities", "warning", "T1499"},
		{"EVASION", "Evasion", "Techniques to bypass WAF detection", "warning", "T1005"},
		{"GENERIC", "Generic Attack Detection", "General malicious pattern detection", "warning", "T1190"},
		{"PHP", "PHP Injection", "Injecting PHP code into input fields", "critical", "T1059"},
		{"JAVA", "Java Injection", "Injecting Java code or payloads", "critical", "T1059"},
		{"NODE", "Node.js Injection", "Injecting Node.js code or payloads", "critical", "T1059"},
		{"HTTPOVY", "HTTP Method Violations", "Invalid or dangerous HTTP method usage", "warning", "T1499"},
		{"USERAGENT", "Malicious User Agent", "Requests from known malicious user agents", "warning", "T1499"},
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	for _, c := range categories {
		if _, err := tx.Exec(
			`INSERT OR IGNORE INTO waf_owasp_categories 
			 (category_id, name, description, severity, mitre_technique) 
			 VALUES (?, ?, ?, ?, ?)`,
			c.id, c.name, c.description, c.severity, c.mitre,
		); err != nil {
			return fmt.Errorf("failed to seed OWASP category %s: %w", c.id, err)
		}
	}

	// Seed default settings
	settings := []struct {
		key   string
		value string
	}{
		{"global_mode", "blocking"},
		{"owasp_rules_enabled", "true"},
		{"owasp_ruleset_version", "4.0.0"},
		{"paranoia_level", "1"},
		{"anomaly_threshold", "5"},
		{"log_requests", "blocked"},
		{"log_retention_days", "30"},
		{"log_request_body", "false"},
		{"geo_blocking_enabled", "false"},
		{"geo_blocked_countries", "[]"},
		{"whitelist_ips", "[]"},
		{"blacklist_ips", "[]"},
		{"service_status", "stopped"},
		{"haproxy_installed", "false"},
		{"coraza_installed", "false"},
	}

	for _, s := range settings {
		if _, err := tx.Exec(
			`INSERT OR IGNORE INTO waf_settings (key, value) VALUES (?, ?)`,
			s.key, s.value,
		); err != nil {
			return fmt.Errorf("failed to seed setting %s: %w", s.key, err)
		}
	}

	return tx.Commit()
}
