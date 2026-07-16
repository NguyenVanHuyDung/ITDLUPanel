package service

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/system"
)

// ConfigMode represents the optimization mode
type ConfigMode string

const (
	ModeManual   ConfigMode = "manual"   // Manual configuration
	ModeAdaptive ConfigMode = "adaptive" // Auto optimization
)

// ConfigPreset represents a predefined configuration preset
type ConfigPreset struct {
	ID          string               `json:"id"`
	Name        string               `json:"name"`
	Description string               `json:"description"`
	MariaDB     ManualMariaDBConfig `json:"maria_db"`
	Nginx       ManualNginxConfig   `json:"nginx"`
}

// DefaultPresets contains the predefined configuration presets
var DefaultPresets = []ConfigPreset{
	{
		ID:          "low",
		Name:        "Low Traffic",
		Description: "For small websites with < 1000 visits/day",
		MariaDB: ManualMariaDBConfig{
			MaxConnections:      100,
			BufferPoolSize:    "256M",
			ThreadCacheSize:    8,
			SlowQueryLog:       false,
			SlowQueryThreshold: 1.0,
		},
		Nginx: ManualNginxConfig{
			WorkerProcesses:   "auto",
			WorkerConnections: 1024,
			KeepaliveTimeout:  15,
			GzipOn:           true,
			GzipLevel:        1,
		},
	},
	{
		ID:          "medium",
		Name:        "Medium Traffic",
		Description: "For websites with 1000-10000 visits/day",
		MariaDB: ManualMariaDBConfig{
			MaxConnections:      300,
			BufferPoolSize:      "1G",
			ThreadCacheSize:     16,
			SlowQueryLog:        true,
			SlowQueryThreshold:  1.0,
		},
		Nginx: ManualNginxConfig{
			WorkerProcesses:   "auto",
			WorkerConnections: 2048,
			KeepaliveTimeout:  30,
			GzipOn:           true,
			GzipLevel:        5,
		},
	},
	{
		ID:          "high",
		Name:        "High Traffic",
		Description: "For websites with > 10000 visits/day",
		MariaDB: ManualMariaDBConfig{
			MaxConnections:      500,
			BufferPoolSize:      "4G",
			ThreadCacheSize:     32,
			SlowQueryLog:        true,
			SlowQueryThreshold:  0.5,
		},
		Nginx: ManualNginxConfig{
			WorkerProcesses:   "auto",
			WorkerConnections: 4096,
			KeepaliveTimeout:  45,
			GzipOn:           true,
			GzipLevel:        6,
		},
	},
	{
		ID:          "enterprise",
		Name:        "Enterprise",
		Description: "For large scale applications",
		MariaDB: ManualMariaDBConfig{
			MaxConnections:       1000,
			BufferPoolSize:       "8G",
			BufferPoolInstances:  8,
			ThreadCacheSize:      64,
			SlowQueryLog:         true,
			SlowQueryThreshold:   0.5,
		},
		Nginx: ManualNginxConfig{
			WorkerProcesses:   "auto",
			WorkerConnections: 8192,
			KeepaliveTimeout:  60,
			GzipOn:           true,
			GzipLevel:        7,
		},
	},
}

// ManualConfig holds manual configuration settings
type ManualConfig struct {
	MariaDB ManualMariaDBConfig `json:"maria_db"`
	Nginx   ManualNginxConfig   `json:"nginx"`
}

// ManualMariaDBConfig holds manual MariaDB configuration
type ManualMariaDBConfig struct {
	MaxConnections       int     `json:"max_connections"`
	BufferPoolSize     string   `json:"buffer_pool_size"`
	BufferPoolInstances int     `json:"buffer_pool_instances"`
	ThreadCacheSize    int     `json:"thread_cache_size"`
	QueryCacheSize     int     `json:"query_cache_size"`
	SlowQueryLog       bool    `json:"slow_query_log"`
	SlowQueryThreshold float64 `json:"slow_query_threshold"`
	MaxHeapTableSize   string  `json:"max_heap_table_size"`
	TmpTableSize       string  `json:"tmp_table_size"`
}

// ManualNginxConfig holds manual Nginx configuration
type ManualNginxConfig struct {
	WorkerProcesses    string `json:"worker_processes"`
	WorkerConnections int    `json:"worker_connections"`
	KeepaliveTimeout  int    `json:"keepalive_timeout"`
	KeepaliveRequests int    `json:"keepalive_requests"`
	GzipOn           bool   `json:"gzip_on"`
	GzipLevel        int    `json:"gzip_level"`
	OpenFileCacheMax int    `json:"open_file_cache_max"`
	ClientMaxBodySize string `json:"client_max_body_size"`
}

// AdaptiveSettings holds adaptive optimization settings
type AdaptiveSettings struct {
	Enabled bool `json:"enabled"`
	MariaDB MariaDBAdaptiveSettings `json:"maria_db"`
	Nginx   NginxAdaptiveSettings   `json:"nginx"`
}

// MariaDBAdaptiveSettings holds MariaDB adaptive settings
type MariaDBAdaptiveSettings struct {
	AutoTuneConnections         bool    `json:"auto_tune_connections"`
	AutoTuneBufferPool          bool    `json:"auto_tune_buffer_pool"`
	AutoTuneQueryCache         bool    `json:"auto_tune_query_cache"`
	AutoTuneSlowQuery          bool    `json:"auto_tune_slow_query"`
	MaxConnectionsLimit        int     `json:"max_connections_limit"`
	BufferPoolPercent          int     `json:"buffer_pool_percent"`
	ConnectionWarningPercent    int     `json:"connection_warning_pct"`
	ConnectionCriticalPercent   int     `json:"connection_critical_pct"`
	BufferHitWarningPercent    int     `json:"buffer_hit_warning_pct"`
	SlowQueryThreshold         float64 `json:"slow_query_threshold"`
}

// NginxAdaptiveSettings holds Nginx adaptive settings
type NginxAdaptiveSettings struct {
	AutoTuneWorkers        bool `json:"auto_tune_workers"`
	AutoTuneConnections    bool `json:"auto_tune_connections"`
	AutoTuneKeepalive      bool `json:"auto_tune_keepalive"`
	AutoTuneGzip           bool `json:"auto_tune_gzip"`
	MinWorkerConnections   int  `json:"min_worker_connections"`
	MaxWorkerConnections   int  `json:"max_worker_connections"`
	KeepaliveTimeout       int  `json:"keepalive_timeout"`
	GzipMinLevel           int  `json:"gzip_min_level"`
	GzipMaxLevel           int  `json:"gzip_max_level"`
	ConnPerWorkerWarning   int  `json:"conn_per_worker_warning"`
	ConnPerWorkerCritical  int  `json:"conn_per_worker_critical"`
}

// MariaDBMetrics holds real-time MariaDB metrics
type MariaDBMetrics struct {
	ThreadsConnected     int     `json:"threads_connected"`
	ThreadsRunning      int     `json:"threads_running"`
	ThreadsCached       int     `json:"threads_cached"`
	MaxUsedConnections int     `json:"max_used_connections"`
	QcacheHits         int     `json:"qcache_hits"`
	QcacheInserts      int     `json:"qcache_inserts"`
	InnodbBufferPoolHit float64 `json:"innodb_buffer_pool_hit"`
	TableLocksWaited   int     `json:"table_locks_waited"`
	SlowQueries        int     `json:"slow_queries"`
	BytesSent          int64   `json:"bytes_sent"`
	BytesReceived      int64   `json:"bytes_received"`
}

// NginxOptimizationMetrics holds real-time Nginx metrics
type NginxOptimizationMetrics struct {
	ActiveConnections int     `json:"active_connections"`
	Accepts         int     `json:"accepts"`
	Handled         int     `json:"handled"`
	Requests        int     `json:"requests"`
	Reading         int     `json:"reading"`
	Writing         int     `json:"writing"`
	Waiting         int     `json:"waiting"`
	CacheHitRate    float64 `json:"cache_hit_rate"`
	WorkerProcesses int     `json:"worker_processes"`
}

// OptimizationAction represents a single optimization action
type OptimizationAction struct {
	Type        string    `json:"type"`
	Parameter   string    `json:"parameter"`
	OldValue    string    `json:"old_value"`
	NewValue    string    `json:"new_value"`
	Reason      string    `json:"reason"`
	AutoApplied bool      `json:"auto_applied"`
	CreatedAt   time.Time `json:"created_at"`
}

// OptimizationHistory represents a history record
type OptimizationHistory struct {
	ID              int64     `json:"id"`
	Mode            string    `json:"mode"`
	OptimizationType string   `json:"optimization_type"`
	Parameter       string   `json:"parameter"`
	OldValue        string   `json:"old_value"`
	NewValue        string   `json:"new_value"`
	Reason          string   `json:"reason"`
	AutoApplied     bool     `json:"auto_applied"`
	CreatedAt       string   `json:"created_at"`
}

// OptimizationService manages server optimization (both manual and adaptive)
type OptimizationService struct {
	db             *sql.DB
	monitorService *MonitorService
}

// NewOptimizationService creates a new OptimizationService
func NewOptimizationService(db *sql.DB) *OptimizationService {
	return &OptimizationService{
		db: db,
	}
}

// GetMode returns the current optimization mode
func (s *OptimizationService) GetMode() (ConfigMode, error) {
	var mode string
	err := s.db.QueryRow("SELECT mode FROM optimization_settings WHERE id = 1").Scan(&mode)
	if err != nil {
		return ModeManual, err
	}
	return ConfigMode(mode), nil
}

// SetMode changes the optimization mode
func (s *OptimizationService) SetMode(mode ConfigMode) error {
	_, err := s.db.Exec(
		"UPDATE optimization_settings SET mode = ?, updated_at = datetime('now') WHERE id = 1",
		string(mode),
	)
	return err
}

// GetManualConfig returns the current manual configuration
func (s *OptimizationService) GetManualConfig() (*ManualConfig, error) {
	var cfg ManualConfig
	var mode string

	row := s.db.QueryRow(`
		SELECT mode,
			manual_max_connections, manual_buffer_pool_size, manual_buffer_pool_instances,
			manual_thread_cache_size, manual_slow_query_log, manual_slow_query_threshold,
			manual_max_heap_table_size, manual_tmp_table_size,
			manual_nginx_worker_processes, manual_nginx_worker_connections,
			manual_nginx_keepalive_timeout, manual_nginx_keepalive_requests,
			manual_nginx_gzip_on, manual_nginx_gzip_level,
			manual_nginx_open_file_cache_max, manual_nginx_client_max_body_size
		FROM optimization_settings WHERE id = 1
	`)

	err := row.Scan(
		&mode,
		&cfg.MariaDB.MaxConnections, &cfg.MariaDB.BufferPoolSize, &cfg.MariaDB.BufferPoolInstances,
		&cfg.MariaDB.ThreadCacheSize, &cfg.MariaDB.SlowQueryLog, &cfg.MariaDB.SlowQueryThreshold,
		&cfg.MariaDB.MaxHeapTableSize, &cfg.MariaDB.TmpTableSize,
		&cfg.Nginx.WorkerProcesses, &cfg.Nginx.WorkerConnections,
		&cfg.Nginx.KeepaliveTimeout, &cfg.Nginx.KeepaliveRequests,
		&cfg.Nginx.GzipOn, &cfg.Nginx.GzipLevel,
		&cfg.Nginx.OpenFileCacheMax, &cfg.Nginx.ClientMaxBodySize,
	)
	if err != nil {
		return nil, err
	}

	return &cfg, nil
}

// UpdateManualConfig updates the manual configuration
func (s *OptimizationService) UpdateManualConfig(cfg *ManualConfig) error {
	_, err := s.db.Exec(`
		UPDATE optimization_settings SET
			manual_max_connections = ?,
			manual_buffer_pool_size = ?,
			manual_buffer_pool_instances = ?,
			manual_thread_cache_size = ?,
			manual_slow_query_log = ?,
			manual_slow_query_threshold = ?,
			manual_max_heap_table_size = ?,
			manual_tmp_table_size = ?,
			manual_nginx_worker_processes = ?,
			manual_nginx_worker_connections = ?,
			manual_nginx_keepalive_timeout = ?,
			manual_nginx_keepalive_requests = ?,
			manual_nginx_gzip_on = ?,
			manual_nginx_gzip_level = ?,
			manual_nginx_open_file_cache_max = ?,
			manual_nginx_client_max_body_size = ?,
			updated_at = datetime('now')
		WHERE id = 1
	`,
		cfg.MariaDB.MaxConnections, cfg.MariaDB.BufferPoolSize, cfg.MariaDB.BufferPoolInstances,
		cfg.MariaDB.ThreadCacheSize, cfg.MariaDB.SlowQueryLog, cfg.MariaDB.SlowQueryThreshold,
		cfg.MariaDB.MaxHeapTableSize, cfg.MariaDB.TmpTableSize,
		cfg.Nginx.WorkerProcesses, cfg.Nginx.WorkerConnections,
		cfg.Nginx.KeepaliveTimeout, cfg.Nginx.KeepaliveRequests,
		cfg.Nginx.GzipOn, cfg.Nginx.GzipLevel,
		cfg.Nginx.OpenFileCacheMax, cfg.Nginx.ClientMaxBodySize,
	)
	return err
}

// ApplyPreset applies a configuration preset
func (s *OptimizationService) ApplyPreset(presetID string) error {
	var preset *ConfigPreset
	for _, p := range DefaultPresets {
		if p.ID == presetID {
			preset = &p
			break
		}
	}
	if preset == nil {
		return fmt.Errorf("preset not found: %s", presetID)
	}

	cfg := &ManualConfig{
		MariaDB: preset.MariaDB,
		Nginx:   preset.Nginx,
	}

	if err := s.UpdateManualConfig(cfg); err != nil {
		return err
	}

	return s.SetMode(ModeManual)
}

// GetPresets returns all available presets
func (s *OptimizationService) GetPresets() []ConfigPreset {
	return DefaultPresets
}

// GetAdaptiveSettings returns the adaptive optimization settings
func (s *OptimizationService) GetAdaptiveSettings() (*AdaptiveSettings, error) {
	var cfg AdaptiveSettings

	row := s.db.QueryRow(`
		SELECT
			adaptive_mariadb_enabled,
			adaptive_mariadb_auto_tune_connections, adaptive_mariadb_auto_tune_buffer_pool,
			adaptive_mariadb_auto_tune_query_cache, adaptive_mariadb_auto_tune_slow_query,
			adaptive_mariadb_max_connections_limit, adaptive_mariadb_buffer_pool_percent,
			adaptive_mariadb_connection_warning_pct, adaptive_mariadb_connection_critical_pct,
			adaptive_mariadb_buffer_hit_warning_pct, adaptive_mariadb_slow_query_threshold,
			adaptive_nginx_enabled,
			adaptive_nginx_auto_tune_workers, adaptive_nginx_auto_tune_connections,
			adaptive_nginx_auto_tune_keepalive, adaptive_nginx_auto_tune_gzip,
			adaptive_nginx_min_worker_connections, adaptive_nginx_max_worker_connections,
			adaptive_nginx_keepalive_timeout, adaptive_nginx_gzip_min_level,
			adaptive_nginx_gzip_max_level, adaptive_nginx_conn_per_worker_warning,
			adaptive_nginx_conn_per_worker_critical
		FROM optimization_settings WHERE id = 1
	`)

	err := row.Scan(
		&cfg.MariaDB.AutoTuneConnections,
		&cfg.MariaDB.AutoTuneConnections, &cfg.MariaDB.AutoTuneBufferPool,
		&cfg.MariaDB.AutoTuneQueryCache, &cfg.MariaDB.AutoTuneSlowQuery,
		&cfg.MariaDB.MaxConnectionsLimit, &cfg.MariaDB.BufferPoolPercent,
		&cfg.MariaDB.ConnectionWarningPercent, &cfg.MariaDB.ConnectionCriticalPercent,
		&cfg.MariaDB.BufferHitWarningPercent, &cfg.MariaDB.SlowQueryThreshold,
		&cfg.Nginx.AutoTuneWorkers,
		&cfg.Nginx.AutoTuneWorkers, &cfg.Nginx.AutoTuneConnections,
		&cfg.Nginx.AutoTuneKeepalive, &cfg.Nginx.AutoTuneGzip,
		&cfg.Nginx.MinWorkerConnections, &cfg.Nginx.MaxWorkerConnections,
		&cfg.Nginx.KeepaliveTimeout, &cfg.Nginx.GzipMinLevel,
		&cfg.Nginx.GzipMaxLevel, &cfg.Nginx.ConnPerWorkerWarning,
		&cfg.Nginx.ConnPerWorkerCritical,
	)
	if err != nil {
		return nil, err
	}

	cfg.Enabled = true
	return &cfg, nil
}

// UpdateAdaptiveSettings updates the adaptive optimization settings
func (s *OptimizationService) UpdateAdaptiveSettings(cfg *AdaptiveSettings) error {
	_, err := s.db.Exec(`
		UPDATE optimization_settings SET
			adaptive_mariadb_enabled = ?,
			adaptive_mariadb_auto_tune_connections = ?,
			adaptive_mariadb_auto_tune_buffer_pool = ?,
			adaptive_mariadb_auto_tune_query_cache = ?,
			adaptive_mariadb_auto_tune_slow_query = ?,
			adaptive_mariadb_max_connections_limit = ?,
			adaptive_mariadb_buffer_pool_percent = ?,
			adaptive_mariadb_connection_warning_pct = ?,
			adaptive_mariadb_connection_critical_pct = ?,
			adaptive_mariadb_buffer_hit_warning_pct = ?,
			adaptive_mariadb_slow_query_threshold = ?,
			adaptive_nginx_enabled = ?,
			adaptive_nginx_auto_tune_workers = ?,
			adaptive_nginx_auto_tune_connections = ?,
			adaptive_nginx_auto_tune_keepalive = ?,
			adaptive_nginx_auto_tune_gzip = ?,
			adaptive_nginx_min_worker_connections = ?,
			adaptive_nginx_max_worker_connections = ?,
			adaptive_nginx_keepalive_timeout = ?,
			adaptive_nginx_gzip_min_level = ?,
			adaptive_nginx_gzip_max_level = ?,
			adaptive_nginx_conn_per_worker_warning = ?,
			adaptive_nginx_conn_per_worker_critical = ?,
			updated_at = datetime('now')
		WHERE id = 1
	`,
		cfg.MariaDB.AutoTuneConnections,
		cfg.MariaDB.AutoTuneConnections, cfg.MariaDB.AutoTuneBufferPool,
		cfg.MariaDB.AutoTuneQueryCache, cfg.MariaDB.AutoTuneSlowQuery,
		cfg.MariaDB.MaxConnectionsLimit, cfg.MariaDB.BufferPoolPercent,
		cfg.MariaDB.ConnectionWarningPercent, cfg.MariaDB.ConnectionCriticalPercent,
		cfg.MariaDB.BufferHitWarningPercent, cfg.MariaDB.SlowQueryThreshold,
		cfg.Nginx.AutoTuneWorkers,
		cfg.Nginx.AutoTuneWorkers, cfg.Nginx.AutoTuneConnections,
		cfg.Nginx.AutoTuneKeepalive, cfg.Nginx.AutoTuneGzip,
		cfg.Nginx.MinWorkerConnections, cfg.Nginx.MaxWorkerConnections,
		cfg.Nginx.KeepaliveTimeout, cfg.Nginx.GzipMinLevel,
		cfg.Nginx.GzipMaxLevel, cfg.Nginx.ConnPerWorkerWarning,
		cfg.Nginx.ConnPerWorkerCritical,
	)
	return err
}

// GetHistory returns optimization history
func (s *OptimizationService) GetHistory(limit int) ([]OptimizationHistory, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.Query(`
		SELECT id, mode, optimization_type, parameter, old_value, new_value, reason, auto_applied, created_at
		FROM optimization_history
		ORDER BY created_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []OptimizationHistory
	for rows.Next() {
		var h OptimizationHistory
		if err := rows.Scan(&h.ID, &h.Mode, &h.OptimizationType, &h.Parameter,
			&h.OldValue, &h.NewValue, &h.Reason, &h.AutoApplied, &h.CreatedAt); err != nil {
			continue
		}
		history = append(history, h)
	}
	return history, nil
}

// AddHistory adds a record to optimization history
func (s *OptimizationService) AddHistory(action *OptimizationAction) error {
	_, err := s.db.Exec(`
		INSERT INTO optimization_history (mode, optimization_type, parameter, old_value, new_value, reason, auto_applied, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`,
		s.getCurrentMode(),
		action.Type,
		action.Parameter,
		action.OldValue,
		action.NewValue,
		action.Reason,
		action.AutoApplied,
		time.Now().Format("2006-01-02 15:04:05"),
	)
	return err
}

func (s *OptimizationService) getCurrentMode() string {
	mode, _ := s.GetMode()
	return string(mode)
}

// CollectMariaDBMetrics collects real-time MariaDB metrics
func (s *OptimizationService) CollectMariaDBMetrics() (*MariaDBMetrics, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	metrics := &MariaDBMetrics{}

	// Get basic status
	result, err := system.Exec(ctx, "mysql", "-u", "root", "-N", "-e",
		"SHOW STATUS WHERE Variable_name IN ('Threads_connected', 'Threads_running', 'Threads_cached', 'Max_used_connections', 'Slow_queries', 'Bytes_sent', 'Bytes_received', 'Table_locks_waited')")
	if err != nil {
		return nil, fmt.Errorf("failed to get MariaDB status: %w", err)
	}

	for _, line := range strings.Split(result.Stdout, "\n") {
		fields := strings.Split(strings.TrimSpace(line), "\t")
		if len(fields) < 2 {
			continue
		}
		key := fields[0]
		val := fields[1]

		switch key {
		case "Threads_connected":
			metrics.ThreadsConnected, _ = strconv.Atoi(val)
		case "Threads_running":
			metrics.ThreadsRunning, _ = strconv.Atoi(val)
		case "Threads_cached":
			metrics.ThreadsCached, _ = strconv.Atoi(val)
		case "Max_used_connections":
			metrics.MaxUsedConnections, _ = strconv.Atoi(val)
		case "Slow_queries":
			metrics.SlowQueries, _ = strconv.Atoi(val)
		case "Bytes_sent":
			metrics.BytesSent, _ = strconv.ParseInt(val, 10, 64)
		case "Bytes_received":
			metrics.BytesReceived, _ = strconv.ParseInt(val, 10, 64)
		case "Table_locks_waited":
			metrics.TableLocksWaited, _ = strconv.Atoi(val)
		}
	}

	// Get InnoDB buffer pool hit rate
	result, err = system.Exec(ctx, "mysql", "-u", "root", "-N", "-e",
		"SHOW STATUS WHERE Variable_name LIKE 'Innodb_buffer_pool%'")
	if err == nil {
		var hits, reads int64
		for _, line := range strings.Split(result.Stdout, "\n") {
			fields := strings.Split(strings.TrimSpace(line), "\t")
			if len(fields) < 2 {
				continue
			}
			key := fields[0]
			val, _ := strconv.ParseInt(fields[1], 10, 64)
			if key == "Innodb_buffer_pool_read_requests" {
				reads = val
			} else if key == "Innodb_buffer_pool_reads" {
				hits = val
			}
		}
		if reads > 0 {
			metrics.InnodbBufferPoolHit = float64(reads-hits) / float64(reads) * 100
		}
	}

	// Get QCache stats
	result, err = system.Exec(ctx, "mysql", "-u", "root", "-N", "-e",
		"SHOW STATUS WHERE Variable_name LIKE 'Qcache%'")
	if err == nil {
		for _, line := range strings.Split(result.Stdout, "\n") {
			fields := strings.Split(strings.TrimSpace(line), "\t")
			if len(fields) < 2 {
				continue
			}
			key := fields[0]
			val, _ := strconv.Atoi(fields[1])
			if key == "Qcache_hits" {
				metrics.QcacheHits = val
			} else if key == "Qcache_inserts" {
				metrics.QcacheInserts = val
			}
		}
	}

	return metrics, nil
}

// CollectNginxMetrics collects real-time Nginx metrics via stub_status
func (s *OptimizationService) CollectNginxMetrics() (*NginxOptimizationMetrics, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	metrics := &NginxOptimizationMetrics{}

	// Try to get stub_status
	result, err := system.Exec(ctx, "curl", "-s", "http://localhost/nginx_status")
	if err != nil {
		// Fallback: try to get worker count from nginx -V
		metrics.WorkerProcesses = 1
		return metrics, nil
	}

	lines := strings.Split(strings.TrimSpace(result.Stdout), "\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}

		switch fields[0] {
		case "Active":
			metrics.ActiveConnections, _ = strconv.Atoi(fields[2])
		case "Reading":
			metrics.Reading, _ = strconv.Atoi(fields[1])
			metrics.Waiting, _ = strconv.Atoi(fields[5])
		case "Writing":
			metrics.Writing, _ = strconv.Atoi(fields[1])
		case "Waiting":
			metrics.Waiting, _ = strconv.Atoi(fields[1])
		}
	}

	// Get worker count from nginx.conf
	result, err = system.Exec(ctx, "bash", "-c", "grep -c '^worker_processes' /etc/nginx/nginx.conf 2>/dev/null || echo 0")
	if err == nil {
		count, _ := strconv.Atoi(strings.TrimSpace(result.Stdout))
		if count > 0 {
			metrics.WorkerProcesses = count
		}
	}

	// Get total accepts/handled/requests from stub_status
	if len(lines) > 0 {
		fields := strings.Fields(lines[0])
		if len(fields) >= 4 {
			metrics.Accepts, _ = strconv.Atoi(fields[1])
			metrics.Handled, _ = strconv.Atoi(fields[2])
			metrics.Requests, _ = strconv.Atoi(fields[3])
		}
	}

	return metrics, nil
}

// GetOptimizationStatus returns current optimization status
type OptimizationStatus struct {
	Mode       ConfigMode              `json:"mode"`
	Manual     *ManualConfig           `json:"manual"`
	Adaptive   *AdaptiveSettings       `json:"adaptive"`
	MariaDB    *MariaDBMetrics         `json:"maria_db_metrics"`
	Nginx      *NginxOptimizationMetrics `json:"nginx_metrics"`
	History    []OptimizationHistory   `json:"recent_history"`
}

func (s *OptimizationService) GetStatus() (*OptimizationStatus, error) {
	status := &OptimizationStatus{}

	mode, err := s.GetMode()
	if err != nil {
		return nil, err
	}
	status.Mode = mode

	manual, err := s.GetManualConfig()
	if err == nil {
		status.Manual = manual
	}

	adaptive, err := s.GetAdaptiveSettings()
	if err == nil {
		status.Adaptive = adaptive
	}

	mariaMetrics, err := s.CollectMariaDBMetrics()
	if err == nil {
		status.MariaDB = mariaMetrics
	}

	nginxMetrics, err := s.CollectNginxMetrics()
	if err == nil {
		status.Nginx = nginxMetrics
	}

	history, err := s.GetHistory(10)
	if err == nil {
		status.History = history
	}

	return status, nil
}
