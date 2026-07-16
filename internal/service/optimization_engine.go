package service

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// OptimizationEngine performs threshold analysis and generates optimization actions
type OptimizationEngine struct {
	service *OptimizationService
}

// NewOptimizationEngine creates a new OptimizationEngine
func NewOptimizationEngine(service *OptimizationService) *OptimizationEngine {
	return &OptimizationEngine{
		service: service,
	}
}

// AnalyzeAndOptimize performs analysis and applies optimizations if needed
func (e *OptimizationEngine) AnalyzeAndOptimize() {
	mode, err := e.service.GetMode()
	if err != nil {
		logger.Error().Err(err).Msg("Failed to get optimization mode")
		return
	}

	if mode != ModeAdaptive {
		return
	}

	adaptiveSettings, err := e.service.GetAdaptiveSettings()
	if err != nil || !adaptiveSettings.Enabled {
		return
	}

	// Collect metrics
	mariaMetrics, err := e.service.CollectMariaDBMetrics()
	if err != nil {
		logger.Warn().Err(err).Msg("Failed to collect MariaDB metrics")
	}

	nginxMetrics, err := e.service.CollectNginxMetrics()
	if err != nil {
		logger.Warn().Err(err).Msg("Failed to collect Nginx metrics")
	}

	// Analyze and apply
	var actions []OptimizationAction

	if mariaMetrics != nil && adaptiveSettings.MariaDB.AutoTuneConnections {
		actions = append(actions, e.analyzeMariaDBConnections(mariaMetrics, adaptiveSettings)...)
	}

	if mariaMetrics != nil && adaptiveSettings.MariaDB.AutoTuneBufferPool {
		actions = append(actions, e.analyzeMariaDBBufferPool(mariaMetrics, adaptiveSettings)...)
	}

	if mariaMetrics != nil && adaptiveSettings.MariaDB.AutoTuneSlowQuery {
		actions = append(actions, e.analyzeMariaDBSlowQueries(mariaMetrics, adaptiveSettings)...)
	}

	if nginxMetrics != nil && adaptiveSettings.Nginx.AutoTuneConnections {
		actions = append(actions, e.analyzeNginxConnections(nginxMetrics, adaptiveSettings)...)
	}

	// Apply actions
	for _, action := range actions {
		if err := e.applyAction(&action); err != nil {
			logger.Error().Err(err).Str("param", action.Parameter).Msg("Failed to apply optimization")
		}
	}
}

// analyzeMariaDBConnections analyzes MariaDB connection usage
func (e *OptimizationEngine) analyzeMariaDBConnections(metrics *MariaDBMetrics, settings *AdaptiveSettings) []OptimizationAction {
	var actions []OptimizationAction

	if metrics.MaxUsedConnections == 0 {
		return actions
	}

	usagePercent := float64(metrics.ThreadsConnected) / float64(metrics.MaxUsedConnections) * 100

	if usagePercent >= float64(settings.MariaDB.ConnectionCriticalPercent) {
		// Critical - increase max connections
		newMaxConns := int(float64(metrics.MaxUsedConnections) * 1.5)
		if newMaxConns > settings.MariaDB.MaxConnectionsLimit {
			newMaxConns = settings.MariaDB.MaxConnectionsLimit
		}

		actions = append(actions, OptimizationAction{
			Type:        "mariadb",
			Parameter:   "max_connections",
			OldValue:    fmt.Sprintf("%d", metrics.MaxUsedConnections),
			NewValue:    fmt.Sprintf("%d", newMaxConns),
			Reason:      fmt.Sprintf("Connection usage at %.0f%% (critical threshold: %d%%)", usagePercent, settings.MariaDB.ConnectionCriticalPercent),
			AutoApplied: true,
			CreatedAt:   time.Now(),
		})
	} else if usagePercent >= float64(settings.MariaDB.ConnectionWarningPercent) {
		// Warning - suggest increase
		logger.Info().
			Float64("usage", usagePercent).
			Float64("threshold", float64(settings.MariaDB.ConnectionWarningPercent)).
			Msg("MariaDB connection usage warning")
	}

	return actions
}

// analyzeMariaDBBufferPool analyzes MariaDB buffer pool efficiency
func (e *OptimizationEngine) analyzeMariaDBBufferPool(metrics *MariaDBMetrics, settings *AdaptiveSettings) []OptimizationAction {
	var actions []OptimizationAction

	if metrics.InnodbBufferPoolHit < float64(settings.MariaDB.BufferHitWarningPercent) {
		// Low buffer hit rate - might need larger buffer pool
		// Calculate suggested size based on current usage
		actions = append(actions, OptimizationAction{
			Type:        "mariadb",
			Parameter:   "innodb_buffer_pool_size",
			OldValue:    "current",
			NewValue:    "suggested",
			Reason:      fmt.Sprintf("Buffer pool hit rate low: %.1f%% (threshold: %d%%)", metrics.InnodbBufferPoolHit, settings.MariaDB.BufferHitWarningPercent),
			AutoApplied: false, // Don't auto-apply buffer pool changes
			CreatedAt:   time.Now(),
		})
	}

	return actions
}

// analyzeMariaDBSlowQueries analyzes slow query patterns
func (e *OptimizationEngine) analyzeMariaDBSlowQueries(metrics *MariaDBMetrics, settings *AdaptiveSettings) []OptimizationAction {
	var actions []OptimizationAction

	if metrics.SlowQueries > 10 && settings.MariaDB.SlowQueryThreshold > 0 {
		// High slow query count - suggest enabling slow query log
		actions = append(actions, OptimizationAction{
			Type:        "mariadb",
			Parameter:   "slow_query_log",
			OldValue:    "off",
			NewValue:    "on",
			Reason:      fmt.Sprintf("High slow query count: %d queries", metrics.SlowQueries),
			AutoApplied: true,
			CreatedAt:   time.Now(),
		})
	}

	return actions
}

// analyzeNginxConnections analyzes Nginx connection usage
func (e *OptimizationEngine) analyzeNginxConnections(metrics *NginxOptimizationMetrics, settings *AdaptiveSettings) []OptimizationAction {
	var actions []OptimizationAction

	if metrics.WorkerProcesses == 0 || metrics.ActiveConnections == 0 {
		return actions
	}

	connPerWorker := metrics.ActiveConnections / metrics.WorkerProcesses

	if connPerWorker >= settings.Nginx.ConnPerWorkerCritical {
		// Critical - increase worker connections
		actions = append(actions, OptimizationAction{
			Type:        "nginx",
			Parameter:   "worker_connections",
			OldValue:    fmt.Sprintf("%d", settings.Nginx.MaxWorkerConnections/2),
			NewValue:    fmt.Sprintf("%d", settings.Nginx.MaxWorkerConnections),
			Reason:      fmt.Sprintf("Connections per worker at %d (critical threshold: %d)", connPerWorker, settings.Nginx.ConnPerWorkerCritical),
			AutoApplied: true,
			CreatedAt:   time.Now(),
		})
	} else if connPerWorker >= settings.Nginx.ConnPerWorkerWarning {
		// Warning
		logger.Info().
			Int("connPerWorker", connPerWorker).
			Int("threshold", settings.Nginx.ConnPerWorkerWarning).
			Msg("Nginx connection per worker warning")
	}

	return actions
}

// applyAction applies a single optimization action
func (e *OptimizationEngine) applyAction(action *OptimizationAction) error {
	// Add to history
	if err := e.service.AddHistory(action); err != nil {
		logger.Error().Err(err).Msg("Failed to add optimization history")
	}

	if !action.AutoApplied {
		logger.Info().
			Str("type", action.Type).
			Str("param", action.Parameter).
			Str("reason", action.Reason).
			Msg("Optimization recommendation (not auto-applied)")
		return nil
	}

	switch action.Type {
	case "mariadb":
		return e.applyMariaDBConfig(action)
	case "nginx":
		return e.applyNginxConfig(action)
	}

	return nil
}

// applyMariaDBConfig applies a MariaDB configuration change
func (e *OptimizationEngine) applyMariaDBConfig(action *OptimizationAction) error {
	ctx := context.Background()
	osInfo := system.GetOSInfo()

	configDir := "/etc/mysql/mariadb.conf.d"
	if osInfo.PkgManager == "dnf" {
		configDir = "/etc/my.cnf.d"
	}

	configFile := filepath.Join(configDir, "99-itdlu-adaptive.cnf")

	// Read existing config
	var existingConfig string
	if data, err := os.ReadFile(configFile); err == nil {
		existingConfig = string(data)
	}

	// Build new config content
	newLine := fmt.Sprintf("%s = %s\n", action.Parameter, action.NewValue)

	// Update or add the parameter
	lines := strings.Split(existingConfig, "\n")
	var found bool
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), action.Parameter+" =") {
			lines[i] = newLine
			found = true
			break
		}
	}

	if !found {
		lines = append(lines, "", newLine)
	}

	newConfig := strings.Join(lines, "\n")

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(configFile), 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Write config
	if err := os.WriteFile(configFile, []byte(newConfig), 0644); err != nil {
		return fmt.Errorf("failed to write MariaDB config: %w", err)
	}

	logger.Info().
		Str("param", action.Parameter).
		Str("value", action.NewValue).
		Str("file", configFile).
		Msg("Applied MariaDB optimization")

	// Reload MariaDB
	e.reloadMariaDB(ctx)

	return nil
}

// applyNginxConfig applies a Nginx configuration change
func (e *OptimizationEngine) applyNginxConfig(action *OptimizationAction) error {
	ctx := context.Background()

	configFile := "/etc/nginx/conf.d/99-itdlu-adaptive.conf"

	// Build config content based on parameter
	var content string
	switch action.Parameter {
	case "worker_connections":
		content = fmt.Sprintf("# ITDLUPanel Adaptive Optimization\nworker_connections %s;\n", action.NewValue)
	case "worker_processes":
		content = fmt.Sprintf("# ITDLUPanel Adaptive Optimization\nworker_processes %s;\n", action.NewValue)
	case "keepalive_timeout":
		content = fmt.Sprintf("# ITDLUPanel Adaptive Optimization\nkeepalive_timeout %s;\n", action.NewValue)
	default:
		content = fmt.Sprintf("# ITDLUPanel Adaptive Optimization\n%s %s;\n", action.Parameter, action.NewValue)
	}

	// Write config
	if err := os.WriteFile(configFile, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write Nginx config: %w", err)
	}

	logger.Info().
		Str("param", action.Parameter).
		Str("value", action.NewValue).
		Str("file", configFile).
		Msg("Applied Nginx optimization")

	// Reload Nginx
	e.reloadNginx(ctx)

	return nil
}

// reloadMariaDB reloads the MariaDB service
func (e *OptimizationEngine) reloadMariaDB(ctx context.Context) {
	// Try systemctl reload first (graceful)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "reload", "mariadb"); err != nil {
		// Fallback to mysql admin reload
		if _, err := system.ExecWithTimeout(10*time.Second, "mysqladmin", "-u", "root", "reload"); err != nil {
			logger.Warn().Err(err).Msg("Failed to reload MariaDB")
		}
	}
}

// reloadNginx reloads the Nginx service
func (e *OptimizationEngine) reloadNginx(ctx context.Context) {
	if _, err := system.ExecWithTimeout(10*time.Second, "nginx", "-s", "reload"); err != nil {
		logger.Warn().Err(err).Msg("Failed to reload Nginx")
	}
}

// ApplyManualMariaDB applies manual MariaDB configuration
func (e *OptimizationEngine) ApplyManualMariaDB(cfg *ManualMariaDBConfig) error {
	ctx := context.Background()
	osInfo := system.GetOSInfo()

	configDir := "/etc/mysql/mariadb.conf.d"
	if osInfo.PkgManager == "dnf" {
		configDir = "/etc/my.cnf.d"
	}

	configFile := filepath.Join(configDir, "99-itdlu-manual.cnf")

	// Build config content
	content := fmt.Sprintf(`[mysqld]
# ITDLUPanel Manual Configuration
max_connections = %d
innodb_buffer_pool_size = %s
`, cfg.MaxConnections, cfg.BufferPoolSize)

	if cfg.BufferPoolInstances > 0 {
		content += fmt.Sprintf("innodb_buffer_pool_instances = %d\n", cfg.BufferPoolInstances)
	}
	if cfg.ThreadCacheSize > 0 {
		content += fmt.Sprintf("thread_cache_size = %d\n", cfg.ThreadCacheSize)
	}
	if cfg.SlowQueryLog {
		content += "slow_query_log = 1\n"
		content += fmt.Sprintf("long_query_time = %.1f\n", cfg.SlowQueryThreshold)
	}
	if cfg.MaxHeapTableSize != "" {
		content += fmt.Sprintf("max_heap_table_size = %s\n", cfg.MaxHeapTableSize)
	}
	if cfg.TmpTableSize != "" {
		content += fmt.Sprintf("tmp_table_size = %s\n", cfg.TmpTableSize)
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(configFile), 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Write config
	if err := os.WriteFile(configFile, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write MariaDB config: %w", err)
	}

	logger.Info().Str("file", configFile).Msg("Applied manual MariaDB configuration")

	// Reload MariaDB
	e.reloadMariaDB(ctx)

	return nil
}

// ApplyManualNginx applies manual Nginx configuration
func (e *OptimizationEngine) ApplyManualNginx(cfg *ManualNginxConfig) error {
	ctx := context.Background()

	configFile := "/etc/nginx/conf.d/99-itdlu-manual.conf"

	// Build config content
	content := fmt.Sprintf(`# ITDLUPanel Manual Configuration
worker_processes %s;
worker_connections %d;
keepalive_timeout %d;
`, cfg.WorkerProcesses, cfg.WorkerConnections, cfg.KeepaliveTimeout)

	if cfg.KeepaliveRequests > 0 {
		content += fmt.Sprintf("keepalive_requests %d;\n", cfg.KeepaliveRequests)
	}
	if cfg.GzipOn {
		content += fmt.Sprintf("gzip on;\ngzip_comp_level %d;\n", cfg.GzipLevel)
	}
	if cfg.OpenFileCacheMax > 0 {
		content += fmt.Sprintf("open_file_cache max=%d inactive=30s;\n", cfg.OpenFileCacheMax)
	}
	if cfg.ClientMaxBodySize != "" {
		content += fmt.Sprintf("client_max_body_size %s;\n", cfg.ClientMaxBodySize)
	}

	// Write config
	if err := os.WriteFile(configFile, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write Nginx config: %w", err)
	}

	logger.Info().Str("file", configFile).Msg("Applied manual Nginx configuration")

	// Reload Nginx
	e.reloadNginx(ctx)

	return nil
}

// ApplyConfig applies the current mode configuration
func (e *OptimizationEngine) ApplyConfig() error {
	mode, err := e.service.GetMode()
	if err != nil {
		return err
	}

	switch mode {
	case ModeManual:
		cfg, err := e.service.GetManualConfig()
		if err != nil {
			return err
		}
		if err := e.ApplyManualMariaDB(&cfg.MariaDB); err != nil {
			return err
		}
		return e.ApplyManualNginx(&cfg.Nginx)

	case ModeAdaptive:
		// Apply baseline adaptive config
		settings, err := e.service.GetAdaptiveSettings()
		if err != nil {
			return err
		}
		// For adaptive mode, set reasonable defaults
		mariaCfg := &ManualMariaDBConfig{
			MaxConnections: settings.MariaDB.MaxConnectionsLimit / 2,
			BufferPoolSize: fmt.Sprintf("%dM", settings.MariaDB.BufferPoolPercent*10),
		}
		if err := e.ApplyManualMariaDB(mariaCfg); err != nil {
			return err
		}
		nginxCfg := &ManualNginxConfig{
			WorkerProcesses:  "auto",
			WorkerConnections: settings.Nginx.MinWorkerConnections,
			KeepaliveTimeout: settings.Nginx.KeepaliveTimeout,
			GzipOn:          true,
			GzipLevel:       settings.Nginx.GzipMaxLevel / 2,
		}
		return e.ApplyManualNginx(nginxCfg)
	}

	return nil
}
