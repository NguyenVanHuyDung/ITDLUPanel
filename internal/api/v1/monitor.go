package v1

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/net"

	"github.com/ITDLUPanel/panel/internal/database"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// MonitorHandler handles monitoring-related API requests.
type MonitorHandler struct {
	monitorService *service.MonitorService
}

// NewMonitorHandler creates a new MonitorHandler.
func NewMonitorHandler(monitorService *service.MonitorService) *MonitorHandler {
	return &MonitorHandler{monitorService: monitorService}
}

// RegisterRoutes registers monitor routes on the given router group.
func (h *MonitorHandler) RegisterRoutes(rg *gin.RouterGroup) {
	monitor := rg.Group("/monitor")
	{
		monitor.GET("/system", h.systemMetrics)
		monitor.GET("/processes", h.processList)
		monitor.POST("/processes/kill", h.killProcess)
		monitor.GET("/services", h.services)
		monitor.GET("/network", h.network)
		monitor.GET("/disk", h.diskStats)
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
