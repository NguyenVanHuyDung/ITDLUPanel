package v1

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/net"

	"github.com/ITDLUPanel/panel/internal/database"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// MonitorHandler handles monitoring-related API requests.
type MonitorHandler struct {
	monitorService   *service.MonitorService
	metricsCollector *service.MetricsCollector
}

// NewMonitorHandler creates a new MonitorHandler.
func NewMonitorHandler(monitorService *service.MonitorService, metricsCollector *service.MetricsCollector) *MonitorHandler {
	return &MonitorHandler{
		monitorService:   monitorService,
		metricsCollector: metricsCollector,
	}
}

// RegisterRoutes registers monitor routes on the given router group.
//
// The rbac factory is used to apply permission checks. Without it the
// fallback is auth-only, but callers (router.go) should always pass it.
//
// Permission map:
//   - monitor.read:        view-only endpoints (system, processes list,
//                          services, network, disk, history, settings GET)
//   - monitor.processes:   process management (kill)
//   - logs.manage:         destructive ops (clean history)
func (h *MonitorHandler) RegisterRoutes(rg *gin.RouterGroup, rbacFactory ...func(string) gin.HandlerFunc) {
	monitor := rg.Group("/monitor")

	var factory func(string) gin.HandlerFunc
	if len(rbacFactory) > 0 {
		factory = rbacFactory[0]
	}

	apply := func(perm string) gin.HandlerFunc {
		if factory != nil {
			return factory(perm)
		}
		// Fallback: no permission check. This is only reached if the
		// router was misconfigured; log so it doesn't go unnoticed.
		logger.Warn().Str("perm", perm).Msg("monitor route registered without RBAC factory")
		return func(c *gin.Context) { c.Next() }
	}

	{
		monitor.GET("/system", apply("monitor.read"), h.systemMetrics)
		monitor.GET("/processes", apply("monitor.read"), h.processList)
		monitor.POST("/processes/kill", apply("monitor.processes"), h.killProcess)
		monitor.GET("/services", apply("monitor.read"), h.services)
		monitor.GET("/network", apply("monitor.read"), h.network)
		monitor.GET("/disk", apply("monitor.read"), h.diskStats)
		monitor.GET("/history", apply("monitor.read"), h.history)
		monitor.DELETE("/history", apply("logs.manage"), h.cleanHistory)
		monitor.GET("/settings", apply("monitor.read"), h.monitorSettings)
		monitor.PUT("/settings", apply("settings.manage"), h.updateMonitorSettings)
	}
}

// systemMetrics returns full system metrics.
func (h *MonitorHandler) systemMetrics(c *gin.Context) {
	db := database.Get().GetDB()
	overview, err := h.monitorService.GetOverview(db)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, overview)
}

// processList returns the top processes.
func (h *MonitorHandler) processList(c *gin.Context) {
	limit := 50
	if v := c.Query("limit"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	procs, err := h.monitorService.GetProcessList(limit)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, procs)
}

// killProcess terminates a process by PID.
func (h *MonitorHandler) killProcess(c *gin.Context) {
	var req struct {
		PID int32 `json:"pid" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "pid", Message: "valid process ID is required"},
		})
		return
	}
	if req.PID <= 1 {
		response.ValidationError(c, []response.FieldError{
			{Field: "pid", Message: "cannot kill PID 0 or 1"},
		})
		return
	}
	if err := h.monitorService.KillProcess(req.PID); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"pid": req.PID, "killed": true})
}

// services returns the status of managed services.
func (h *MonitorHandler) services(c *gin.Context) {
	statuses, err := h.monitorService.GetServiceStatuses()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, statuses)
}

// network returns aggregate network stats.
func (h *MonitorHandler) network(c *gin.Context) {
	counters, err := net.IOCounters(true)
	if err != nil {
		response.Error(c, err)
		return
	}

	type ifaceStats struct {
		Name      string `json:"name"`
		BytesSent uint64 `json:"bytes_sent"`
		BytesRecv uint64 `json:"bytes_recv"`
		PacksSent uint64 `json:"packets_sent"`
		PacksRecv uint64 `json:"packets_recv"`
	}

	var stats []ifaceStats
	for _, iface := range counters {
		stats = append(stats, ifaceStats{
			Name:      iface.Name,
			BytesSent: iface.BytesSent,
			BytesRecv: iface.BytesRecv,
			PacksSent: iface.PacketsSent,
			PacksRecv: iface.PacketsRecv,
		})
	}
	response.Success(c, stats)
}

// diskStats returns disk partition usage.
func (h *MonitorHandler) diskStats(c *gin.Context) {
	partitions, err := disk.Partitions(false)
	if err != nil {
		response.Error(c, err)
		return
	}

	type partInfo struct {
		Device       string  `json:"device"`
		Mountpoint   string  `json:"mountpoint"`
		Fstype       string  `json:"fstype"`
		Total        uint64  `json:"total"`
		Used         uint64  `json:"used"`
		Available    uint64  `json:"available"`
		UsagePercent float64 `json:"usage_percent"`
	}

	var info []partInfo
	for _, p := range partitions {
		usage, err := disk.Usage(p.Mountpoint)
		if err != nil {
			continue
		}
		info = append(info, partInfo{
			Device:       p.Device,
			Mountpoint:   p.Mountpoint,
			Fstype:       p.Fstype,
			Total:        usage.Total,
			Used:         usage.Used,
			Available:    usage.Free,
			UsagePercent: usage.UsedPercent,
		})
	}
	response.Success(c, info)
}

// history returns historical metrics data for a given time range.
func (h *MonitorHandler) history(c *gin.Context) {
	if h.metricsCollector == nil {
		response.Error(c, fmt.Errorf("metrics collector not initialized"))
		return
	}

	now := time.Now().UTC()
	var start, end time.Time

	// Support preset ranges or custom start/end
	rangeStr := c.DefaultQuery("range", "1d")
	if startStr := c.Query("start"); startStr != "" {
		if t, err := time.Parse(time.RFC3339, startStr); err == nil {
			start = t.UTC()
		} else if t, err := time.Parse("2006-01-02", startStr); err == nil {
			start = t.UTC()
		}
	}
	if endStr := c.Query("end"); endStr != "" {
		if t, err := time.Parse(time.RFC3339, endStr); err == nil {
			end = t.UTC()
		} else if t, err := time.Parse("2006-01-02", endStr); err == nil {
			end = t.UTC().Add(24*time.Hour - time.Second)
		}
	}

	if start.IsZero() || end.IsZero() {
		end = now
		switch rangeStr {
		case "7d":
			start = now.Add(-7 * 24 * time.Hour)
		case "30d":
			start = now.Add(-30 * 24 * time.Hour)
		default: // "1d"
			start = now.Add(-24 * time.Hour)
		}
	}

	resolution := c.DefaultQuery("resolution", "auto")

	records, err := h.metricsCollector.GetHistory(start, end, resolution)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{
		"start":      start.Format(time.RFC3339),
		"end":        end.Format(time.RFC3339),
		"resolution": resolution,
		"count":      len(records),
		"records":    records,
	})
}

// monitorSettings returns the current monitor collection settings.
func (h *MonitorHandler) monitorSettings(c *gin.Context) {
	if h.metricsCollector == nil {
		response.Error(c, fmt.Errorf("metrics collector not initialized"))
		return
	}
	settings := h.metricsCollector.GetSettings()
	settings.Enabled = h.metricsCollector.IsRunning() || settings.Enabled
	response.Success(c, settings)
}

// updateMonitorSettings updates the monitor settings and restarts the collector.
func (h *MonitorHandler) updateMonitorSettings(c *gin.Context) {
	if h.metricsCollector == nil {
		response.Error(c, fmt.Errorf("metrics collector not initialized"))
		return
	}

	var req service.MonitorSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid settings payload"},
		})
		return
	}

	// Validate interval (minimum 10 seconds)
	if req.Interval < 10 {
		req.Interval = 10
	}
	if req.RetentionRaw < 1 {
		req.RetentionRaw = 1
	}
	if req.Retention5m < 1 {
		req.Retention5m = 1
	}
	if req.Retention1h < 1 {
		req.Retention1h = 1
	}
	if req.Retention1d < 1 {
		req.Retention1d = 1
	}

	if err := h.metricsCollector.UpdateSettings(req); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, h.metricsCollector.GetSettings())
}

// cleanHistory deletes historical metrics data. Accepts optional "table" query
// param (raw, 5m, 1h, 1d, all). Defaults to "all".
func (h *MonitorHandler) cleanHistory(c *gin.Context) {
	if h.metricsCollector == nil {
		response.Error(c, fmt.Errorf("metrics collector not initialized"))
		return
	}

	target := c.DefaultQuery("table", "all")
	deleted, err := h.metricsCollector.CleanHistory(target)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{
		"table":   target,
		"deleted": deleted,
	})
}
