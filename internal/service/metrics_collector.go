package service

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// MetricsCollector runs a background goroutine that periodically collects
// system metrics and stores them in the database. It also handles aggregation
// of raw data into 5-minute, hourly, and daily summaries, and purges old data.
type MetricsCollector struct {
	db       *sql.DB
	monitor  *MonitorService
	cancel   context.CancelFunc
	wg       sync.WaitGroup
	mu       sync.Mutex
	running  bool
	interval time.Duration
}

// NewMetricsCollector creates a MetricsCollector (does not start it).
func NewMetricsCollector(db *sql.DB, monitor *MonitorService) *MetricsCollector {
	return &MetricsCollector{
		db:       db,
		monitor:  monitor,
		interval: 60 * time.Second,
	}
}

// Start begins the background collection loop. Safe to call multiple times.
func (mc *MetricsCollector) Start() {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	if mc.running {
		return
	}

	// Read settings from DB
	mc.interval = mc.readInterval()
	if !mc.readEnabled() {
		logger.Info().Msg("Monitor metrics collection is disabled")
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	mc.cancel = cancel
	mc.running = true

	mc.wg.Add(1)
	go mc.collectLoop(ctx)

	mc.wg.Add(1)
	go mc.aggregateLoop(ctx)

	logger.Info().
		Dur("interval", mc.interval).
		Msg("Metrics collector started")
}

// Stop gracefully shuts down all background goroutines.
func (mc *MetricsCollector) Stop() {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	if !mc.running {
		return
	}
	mc.cancel()
	mc.wg.Wait()
	mc.running = false
	logger.Info().Msg("Metrics collector stopped")
}

// Restart stops and re-starts the collector (e.g. when settings change).
func (mc *MetricsCollector) Restart() {
	mc.Stop()
	mc.Start()
}

// IsRunning returns whether the collector is currently active.
func (mc *MetricsCollector) IsRunning() bool {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	return mc.running
}

// ---------------------------------------------------------------------------
// Collection loop
// ---------------------------------------------------------------------------

func (mc *MetricsCollector) collectLoop(ctx context.Context) {
	defer mc.wg.Done()

	// Collect one sample immediately at startup
	mc.collectOnce()

	ticker := time.NewTicker(mc.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			mc.collectOnce()
		}
	}
}

func (mc *MetricsCollector) collectOnce() {
	overview, err := mc.monitor.GetOverview(mc.db)
	if err != nil {
		logger.Error().Err(err).Msg("Failed to collect metrics")
		return
	}

	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	loadAvg := overview.CPU.LoadAverage
	var l1, l5, l15 float64
	if len(loadAvg) >= 3 {
		l1, l5, l15 = loadAvg[0], loadAvg[1], loadAvg[2]
	}

	_, err = mc.db.Exec(`INSERT INTO monitor_metrics_raw
		(timestamp, cpu_percent, mem_percent, mem_used, mem_total,
		 swap_percent, disk_percent, disk_used, disk_total,
		 disk_read, disk_write, net_sent, net_recv,
		 load1, load5, load15)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		now,
		overview.CPU.UsagePercent,
		overview.Memory.UsagePercent,
		overview.Memory.Used,
		overview.Memory.Total,
		overview.Swap.UsagePercent,
		overview.Disk.UsagePercent,
		overview.Disk.Used,
		overview.Disk.Total,
		overview.DiskIO.ReadBytes,
		overview.DiskIO.WriteBytes,
		overview.Network.BytesSent,
		overview.Network.BytesRecv,
		l1, l5, l15,
	)
	if err != nil {
		logger.Error().Err(err).Msg("Failed to insert raw metrics")
	}
}

// ---------------------------------------------------------------------------
// Aggregation + Retention loop
// ---------------------------------------------------------------------------

func (mc *MetricsCollector) aggregateLoop(ctx context.Context) {
	defer mc.wg.Done()

	// Stagger tickers so they don't all fire at the same time
	agg5m := time.NewTicker(5 * time.Minute)
	defer agg5m.Stop()

	agg1h := time.NewTicker(1 * time.Hour)
	defer agg1h.Stop()

	agg1d := time.NewTicker(24 * time.Hour)
	defer agg1d.Stop()

	// Run an initial aggregation pass on startup to catch up
	mc.aggregate("monitor_metrics_raw", "monitor_metrics_5m", 5*time.Minute)
	mc.aggregate("monitor_metrics_5m", "monitor_metrics_1h", 1*time.Hour)
	mc.aggregate("monitor_metrics_1h", "monitor_metrics_1d", 24*time.Hour)
	mc.purgeOldData()

	for {
		select {
		case <-ctx.Done():
			return
		case <-agg5m.C:
			mc.aggregate("monitor_metrics_raw", "monitor_metrics_5m", 5*time.Minute)
		case <-agg1h.C:
			mc.aggregate("monitor_metrics_5m", "monitor_metrics_1h", 1*time.Hour)
			mc.purgeOldData()
		case <-agg1d.C:
			mc.aggregate("monitor_metrics_1h", "monitor_metrics_1d", 24*time.Hour)
			mc.purgeOldData()
		}
	}
}

// aggregate reads from srcTable, groups by bucket, and inserts averages into dstTable.
// Only processes rows newer than the latest timestamp in dstTable.
func (mc *MetricsCollector) aggregate(srcTable, dstTable string, bucket time.Duration) {
	// Find the latest timestamp already in the destination table
	var latestStr sql.NullString
	err := mc.db.QueryRow(
		fmt.Sprintf("SELECT MAX(timestamp) FROM %s", dstTable),
	).Scan(&latestStr)
	if err != nil {
		logger.Error().Err(err).Str("table", dstTable).Msg("Failed to query latest timestamp")
		return
	}

	since := time.Now().UTC().Add(-48 * time.Hour) // default lookback
	if latestStr.Valid && latestStr.String != "" {
		if t, err := time.Parse("2006-01-02 15:04:05", latestStr.String); err == nil {
			since = t
		} else if t, err := time.Parse(time.RFC3339, latestStr.String); err == nil {
			since = t
		}
	}

	bucketSec := int(bucket.Seconds())

	// Use SQLite strftime to bucket timestamps, then AVG all columns
	query := fmt.Sprintf(`
		SELECT
			datetime((strftime('%%s', SUBSTR(timestamp, 1, 19)) / %d) * %d, 'unixepoch') as bucket_ts,
			AVG(cpu_percent), AVG(mem_percent),
			AVG(mem_used), AVG(mem_total),
			AVG(swap_percent), AVG(disk_percent),
			AVG(disk_used), AVG(disk_total),
			AVG(disk_read), AVG(disk_write),
			AVG(net_sent), AVG(net_recv),
			AVG(load1), AVG(load5), AVG(load15)
		FROM %s
		WHERE timestamp > ?
		GROUP BY bucket_ts
		ORDER BY bucket_ts
	`, bucketSec, bucketSec, srcTable)

	rows, err := mc.db.Query(query, since.Format("2006-01-02 15:04:05"))
	if err != nil {
		logger.Error().Err(err).Str("src", srcTable).Str("dst", dstTable).Msg("Aggregation query failed")
		return
	}
	defer rows.Close()

	tx, err := mc.db.Begin()
	if err != nil {
		return
	}
	defer tx.Rollback()

	insertSQL := fmt.Sprintf(`INSERT OR IGNORE INTO %s
		(timestamp, cpu_percent, mem_percent, mem_used, mem_total,
		 swap_percent, disk_percent, disk_used, disk_total,
		 disk_read, disk_write, net_sent, net_recv,
		 load1, load5, load15)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, dstTable)
	stmt, err := tx.Prepare(insertSQL)
	if err != nil {
		return
	}
	defer stmt.Close()

	inserted := 0
	for rows.Next() {
		var ts string
		var cpuP, memP, memU, memT, swapP, diskP, diskU, diskT float64
		var diskR, diskW, netS, netR, l1, l5, l15 float64
		if err := rows.Scan(&ts, &cpuP, &memP, &memU, &memT, &swapP, &diskP, &diskU, &diskT,
			&diskR, &diskW, &netS, &netR, &l1, &l5, &l15); err != nil {
			continue
		}
		if _, err := stmt.Exec(ts, cpuP, memP, int64(memU), int64(memT), swapP, diskP,
			int64(diskU), int64(diskT), int64(diskR), int64(diskW),
			int64(netS), int64(netR), l1, l5, l15); err != nil {
			continue
		}
		inserted++
	}

	if err := tx.Commit(); err != nil {
		logger.Error().Err(err).Msg("Aggregation commit failed")
		return
	}
	if inserted > 0 {
		logger.Debug().
			Str("src", srcTable).Str("dst", dstTable).
			Int("rows", inserted).
			Msg("Metrics aggregated")
	}
}

func (mc *MetricsCollector) purgeOldData() {
	retentions := map[string]string{
		"monitor_metrics_raw": "monitor_retention_raw",
		"monitor_metrics_5m":  "monitor_retention_5m",
		"monitor_metrics_1h":  "monitor_retention_1h",
		"monitor_metrics_1d":  "monitor_retention_1d",
	}
	for table, settingKey := range retentions {
		days := mc.readSettingInt(settingKey, 7)
		cutoff := time.Now().UTC().Add(-time.Duration(days) * 24 * time.Hour)
		res, err := mc.db.Exec(
			fmt.Sprintf("DELETE FROM %s WHERE timestamp < ?", table),
			cutoff.Format("2006-01-02 15:04:05"),
		)
		if err != nil {
			logger.Error().Err(err).Str("table", table).Msg("Purge failed")
			continue
		}
		if n, _ := res.RowsAffected(); n > 0 {
			logger.Debug().Str("table", table).Int64("deleted", n).Msg("Old metrics purged")
		}
	}
}

// CleanHistory deletes all data from the specified table(s).
// target can be "raw", "5m", "1h", "1d", or "all".
func (mc *MetricsCollector) CleanHistory(target string) (int64, error) {
	tables := []string{
		"monitor_metrics_raw",
		"monitor_metrics_5m",
		"monitor_metrics_1h",
		"monitor_metrics_1d",
	}
	if target != "all" {
		tableName := "monitor_metrics_" + target
		valid := false
		for _, t := range tables {
			if t == tableName {
				valid = true
				break
			}
		}
		if !valid {
			return 0, fmt.Errorf("invalid table: %s", target)
		}
		tables = []string{tableName}
	}

	var total int64
	for _, table := range tables {
		res, err := mc.db.Exec(fmt.Sprintf("DELETE FROM %s", table))
		if err != nil {
			return total, fmt.Errorf("clean %s: %w", table, err)
		}
		n, _ := res.RowsAffected()
		total += n
	}
	logger.Info().Str("target", target).Int64("deleted", total).Msg("Monitor history cleaned")
	return total, nil
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

func (mc *MetricsCollector) readEnabled() bool {
	var val string
	err := mc.db.QueryRow("SELECT value FROM settings WHERE key = 'monitor_enabled'").Scan(&val)
	if err != nil {
		return true // default enabled
	}
	return val == "true" || val == "1"
}

func (mc *MetricsCollector) readInterval() time.Duration {
	sec := mc.readSettingInt("monitor_interval", 60)
	if sec < 10 {
		sec = 10
	}
	return time.Duration(sec) * time.Second
}

func (mc *MetricsCollector) readSettingInt(key string, defaultVal int) int {
	var val string
	err := mc.db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&val)
	if err != nil {
		return defaultVal
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		return defaultVal
	}
	return n
}

// ---------------------------------------------------------------------------
// Historical data query
// ---------------------------------------------------------------------------

// MetricRecord represents a single historical metrics data point.
type MetricRecord struct {
	Timestamp   string  `json:"timestamp"`
	CPUPercent  float64 `json:"cpu_percent"`
	MemPercent  float64 `json:"mem_percent"`
	MemUsed     int64   `json:"mem_used"`
	MemTotal    int64   `json:"mem_total"`
	SwapPercent float64 `json:"swap_percent"`
	DiskPercent float64 `json:"disk_percent"`
	DiskUsed    int64   `json:"disk_used"`
	DiskTotal   int64   `json:"disk_total"`
	DiskRead    int64   `json:"disk_read"`
	DiskWrite   int64   `json:"disk_write"`
	NetSent     int64   `json:"net_sent"`
	NetRecv     int64   `json:"net_recv"`
	Load1       float64 `json:"load1"`
	Load5       float64 `json:"load5"`
	Load15      float64 `json:"load15"`
}

// MonitorSettings represents the monitor configuration.
type MonitorSettings struct {
	Enabled      bool `json:"enabled"`
	Interval     int  `json:"interval"`
	RetentionRaw int  `json:"retention_raw"`
	Retention5m  int  `json:"retention_5m"`
	Retention1h  int  `json:"retention_1h"`
	Retention1d  int  `json:"retention_1d"`
}

// GetHistory queries historical metrics for a given time range.
// resolution: "auto", "raw", "5m", "1h", "1d"
func (mc *MetricsCollector) GetHistory(start, end time.Time, resolution string) ([]MetricRecord, error) {
	if resolution == "auto" || resolution == "" {
		duration := end.Sub(start)
		switch {
		case duration <= 24*time.Hour:
			resolution = "raw"
		case duration <= 7*24*time.Hour:
			resolution = "5m"
		case duration <= 30*24*time.Hour:
			resolution = "1h"
		default:
			resolution = "1d"
		}
	}

	table := "monitor_metrics_" + resolution
	// Validate table name
	switch table {
	case "monitor_metrics_raw", "monitor_metrics_5m", "monitor_metrics_1h", "monitor_metrics_1d":
		// ok
	default:
		return nil, fmt.Errorf("invalid resolution: %s", resolution)
	}

	query := fmt.Sprintf(`SELECT timestamp, cpu_percent, mem_percent, mem_used, mem_total,
		swap_percent, disk_percent, disk_used, disk_total,
		disk_read, disk_write, net_sent, net_recv,
		load1, load5, load15
		FROM %s
		WHERE timestamp BETWEEN ? AND ?
		ORDER BY timestamp ASC
		LIMIT 2000`, table)

	rows, err := mc.db.Query(query,
		start.UTC().Format("2006-01-02 15:04:05"),
		end.UTC().Format("2006-01-02 15:04:05"),
	)
	if err != nil {
		return nil, fmt.Errorf("query history: %w", err)
	}
	defer rows.Close()

	var records []MetricRecord
	for rows.Next() {
		var r MetricRecord
		if err := rows.Scan(&r.Timestamp, &r.CPUPercent, &r.MemPercent, &r.MemUsed, &r.MemTotal,
			&r.SwapPercent, &r.DiskPercent, &r.DiskUsed, &r.DiskTotal,
			&r.DiskRead, &r.DiskWrite, &r.NetSent, &r.NetRecv,
			&r.Load1, &r.Load5, &r.Load15); err != nil {
			continue
		}
		records = append(records, r)
	}
	return records, nil
}

// GetSettings reads the current monitor settings from the DB.
func (mc *MetricsCollector) GetSettings() MonitorSettings {
	return MonitorSettings{
		Enabled:      mc.readEnabled(),
		Interval:     mc.readSettingInt("monitor_interval", 60),
		RetentionRaw: mc.readSettingInt("monitor_retention_raw", 2),
		Retention5m:  mc.readSettingInt("monitor_retention_5m", 7),
		Retention1h:  mc.readSettingInt("monitor_retention_1h", 90),
		Retention1d:  mc.readSettingInt("monitor_retention_1d", 365),
	}
}

// UpdateSettings writes monitor settings to the DB and restarts the collector.
func (mc *MetricsCollector) UpdateSettings(s MonitorSettings) error {
	settings := map[string]string{
		"monitor_enabled":       fmt.Sprintf("%t", s.Enabled),
		"monitor_interval":      fmt.Sprintf("%d", s.Interval),
		"monitor_retention_raw": fmt.Sprintf("%d", s.RetentionRaw),
		"monitor_retention_5m":  fmt.Sprintf("%d", s.Retention5m),
		"monitor_retention_1h":  fmt.Sprintf("%d", s.Retention1h),
		"monitor_retention_1d":  fmt.Sprintf("%d", s.Retention1d),
	}
	for k, v := range settings {
		if _, err := mc.db.Exec(
			"INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", k, v,
		); err != nil {
			return fmt.Errorf("update setting %s: %w", k, err)
		}
	}

	// Restart collector with new settings
	mc.Restart()
	return nil
}
