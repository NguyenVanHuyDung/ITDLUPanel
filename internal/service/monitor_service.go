package service

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"os"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// MonitorService provides system monitoring capabilities.
type MonitorService struct{}

// NewMonitorService creates a new MonitorService.
func NewMonitorService() *MonitorService {
	return &MonitorService{}
}

// SystemOverview aggregates all system metrics.
type SystemOverview struct {
	System  SystemInfo  `json:"system"`
	CPU     CPUInfo     `json:"cpu"`
	Memory  MemoryInfo  `json:"memory"`
	Swap    SwapInfo    `json:"swap"`
	Disk    DiskInfo    `json:"disk"`
	DiskIO  DiskIOInfo  `json:"disk_io"`
	Network NetworkInfo `json:"network"`
	Counts  CountInfo   `json:"counts"`
}

// SystemInfo holds basic system identification.
type SystemInfo struct {
	Hostname     string `json:"hostname"`
	OS           string `json:"os"`
	Kernel       string `json:"kernel"`
	Uptime       uint64 `json:"uptime"`
	PanelVersion string `json:"panel_version"`
}

// CPUInfo holds CPU metrics.
type CPUInfo struct {
	Model            string       `json:"model"`
	Cores            int          `json:"cores"`
	PhysicalCores    int          `json:"physical_cores"`
	UsagePercent     float64      `json:"usage_percent"`
	LoadAverage      []float64    `json:"load_average"`
	PerCorePercent   []float64    `json:"per_core_percent"`
	CPUTimes         *CPUTimesInfo `json:"cpu_times,omitempty"`
	TotalProcesses   int          `json:"total_processes"`
	ActiveProcesses  int          `json:"active_processes"`
}

// CPUTimesInfo holds per-state CPU time percentages.
type CPUTimesInfo struct {
	User    float64 `json:"user"`
	Nice    float64 `json:"nice"`
	System  float64 `json:"system"`
	Idle    float64 `json:"idle"`
	Iowait  float64 `json:"iowait"`
	Irq     float64 `json:"irq"`
	Softirq float64 `json:"softirq"`
	Steal   float64 `json:"steal"`
	Guest   float64 `json:"guest"`
}

// MemoryInfo holds memory metrics.
type MemoryInfo struct {
	Total        uint64  `json:"total"`
	Used         uint64  `json:"used"`
	Available    uint64  `json:"available"`
	UsagePercent float64 `json:"usage_percent"`
	Buffers      uint64  `json:"buffers"`
	Cached       uint64  `json:"cached"`
}

// DiskInfo holds disk usage metrics.
type DiskInfo struct {
	Total          uint64  `json:"total"`
	Used           uint64  `json:"used"`
	Available      uint64  `json:"available"`
	UsagePercent   float64 `json:"usage_percent"`
	FsType         string  `json:"fs_type"`
	MountPoint     string  `json:"mount_point"`
	Device         string  `json:"device"`
	InodesTotal    uint64  `json:"inodes_total"`
	InodesUsed     uint64  `json:"inodes_used"`
	InodesFree     uint64  `json:"inodes_free"`
	InodesPercent  float64 `json:"inodes_percent"`
}

// NetworkInfo holds network traffic counters.
type NetworkInfo struct {
	BytesSent uint64 `json:"bytes_sent"`
	BytesRecv uint64 `json:"bytes_recv"`
}

// SwapInfo holds swap memory metrics.
type SwapInfo struct {
	Total        uint64  `json:"total"`
	Used         uint64  `json:"used"`
	Free         uint64  `json:"free"`
	UsagePercent float64 `json:"usage_percent"`
}

// DiskIOInfo holds cumulative disk I/O counters (all disks aggregate).
type DiskIOInfo struct {
	ReadBytes  uint64 `json:"read_bytes"`
	WriteBytes uint64 `json:"write_bytes"`
}

// CountInfo holds counts of managed resources.
type CountInfo struct {
	Sites        int `json:"sites"`
	Databases    int `json:"databases"`
	FTPAccounts  int `json:"ftp_accounts"`
	CronJobs     int `json:"cron_jobs"`
	RunningTasks int `json:"running_tasks"`
}

// RealtimeMetrics holds lightweight metrics for WebSocket streaming.
type RealtimeMetrics struct {
	CPUPercent    float64   `json:"cpu_percent"`
	MemoryPercent float64   `json:"memory_percent"`
	DiskIORead    uint64    `json:"disk_io_read"`
	DiskIOWrite   uint64    `json:"disk_io_write"`
	NetBytesSent  uint64    `json:"net_bytes_sent"`
	NetBytesRecv  uint64    `json:"net_bytes_recv"`
	LoadAverage   []float64 `json:"load_average"`
	Timestamp     time.Time `json:"timestamp"`
}

// ProcessInfo describes a running process.
type ProcessInfo struct {
	PID     int32   `json:"pid"`
	Name    string  `json:"name"`
	CPU     float64 `json:"cpu"`
	Memory  float32 `json:"memory"`
	User    string  `json:"user"`
	Command string  `json:"command"`
}

// ServiceStatus describes the status of a managed system service.
type ServiceStatus struct {
	Name      string `json:"name"`
	Status    string `json:"status"` // running, stopped, not-installed
	IsRunning bool   `json:"is_running"`
}

// GetOverview returns a complete system overview.
func (s *MonitorService) GetOverview(db *sql.DB) (*SystemOverview, error) {
	overview := &SystemOverview{}

	// System info
	hostname, _ := os.Hostname()
	osInfo := system.GetOSInfo()
	uptime, _ := host.Uptime()
	kernelVersion, _ := host.KernelVersion()

	cfg := config.Get()
	overview.System = SystemInfo{
		Hostname:     hostname,
		OS:           osInfo.Name + " " + osInfo.Version,
		Kernel:       kernelVersion,
		Uptime:       uptime,
		PanelVersion: cfg.Panel.Version,
	}

	// CPU info
	cpuInfos, _ := cpu.Info()
	cpuModel := ""
	if len(cpuInfos) > 0 {
		cpuModel = cpuInfos[0].ModelName
	}
	cpuCores, _ := cpu.Counts(true)
	cpuPhysical, _ := cpu.Counts(false)
	cpuPercents, _ := cpu.Percent(500*time.Millisecond, false)
	cpuUsage := 0.0
	if len(cpuPercents) > 0 {
		cpuUsage = cpuPercents[0]
	}

	// Per-core usage
	perCorePercents, _ := cpu.Percent(500*time.Millisecond, true)

	// CPU times
	cpuTimes, _ := cpu.Times(false)
	var cpuTimesInfo *CPUTimesInfo
	if len(cpuTimes) > 0 {
		t := cpuTimes[0]
		total := t.User + t.Nice + t.System + t.Idle + t.Iowait + t.Irq + t.Softirq + t.Steal + t.Guest
		if total > 0 {
			cpuTimesInfo = &CPUTimesInfo{
				User:    round2(t.User / total * 100),
				Nice:    round2(t.Nice / total * 100),
				System:  round2(t.System / total * 100),
				Idle:    round2(t.Idle / total * 100),
				Iowait:  round2(t.Iowait / total * 100),
				Irq:     round2(t.Irq / total * 100),
				Softirq: round2(t.Softirq / total * 100),
				Steal:   round2(t.Steal / total * 100),
				Guest:   round2(t.Guest / total * 100),
			}
		}
	}

	// Process counts
	totalProcs := 0
	activeProcs := 0
	procs, _ := process.Processes()
	totalProcs = len(procs)
	for _, p := range procs {
		if st, err := p.Status(); err == nil {
			for _, s := range st {
				if s == "R" {
					activeProcs++
					break
				}
			}
		}
	}

	loadAvg, _ := load.Avg()
	var loadAvgSlice []float64
	if loadAvg != nil {
		loadAvgSlice = []float64{loadAvg.Load1, loadAvg.Load5, loadAvg.Load15}
	}
	overview.CPU = CPUInfo{
		Model:           cpuModel,
		Cores:           cpuCores,
		PhysicalCores:   cpuPhysical,
		UsagePercent:    cpuUsage,
		LoadAverage:     loadAvgSlice,
		PerCorePercent:  perCorePercents,
		CPUTimes:        cpuTimesInfo,
		TotalProcesses:  totalProcs,
		ActiveProcesses: activeProcs,
	}

	// Memory info
	vmStat, _ := mem.VirtualMemory()
	if vmStat != nil {
		overview.Memory = MemoryInfo{
			Total:        vmStat.Total,
			Used:         vmStat.Used,
			Available:    vmStat.Available,
			UsagePercent: vmStat.UsedPercent,
			Buffers:      vmStat.Buffers,
			Cached:       vmStat.Cached,
		}
	}

	// Disk info (root partition)
	diskStat, _ := disk.Usage("/")
	if diskStat != nil {
		overview.Disk = DiskInfo{
			Total:         diskStat.Total,
			Used:          diskStat.Used,
			Available:     diskStat.Free,
			UsagePercent:  diskStat.UsedPercent,
			FsType:        diskStat.Fstype,
			MountPoint:    diskStat.Path,
			InodesTotal:   diskStat.InodesTotal,
			InodesUsed:    diskStat.InodesUsed,
			InodesFree:    diskStat.InodesFree,
			InodesPercent: diskStat.InodesUsedPercent,
		}
		// Find device name from partitions
		parts, _ := disk.Partitions(false)
		for _, p := range parts {
			if p.Mountpoint == "/" {
				overview.Disk.Device = p.Device
				if overview.Disk.FsType == "" {
					overview.Disk.FsType = p.Fstype
				}
				break
			}
		}
	}

	// Network info (aggregate all interfaces)
	netCounters, _ := net.IOCounters(false)
	if len(netCounters) > 0 {
		overview.Network = NetworkInfo{
			BytesSent: netCounters[0].BytesSent,
			BytesRecv: netCounters[0].BytesRecv,
		}
	}

	// Swap info
	swapStat, _ := mem.SwapMemory()
	if swapStat != nil {
		overview.Swap = SwapInfo{
			Total:        swapStat.Total,
			Used:         swapStat.Used,
			Free:         swapStat.Free,
			UsagePercent: swapStat.UsedPercent,
		}
	}

	// Disk I/O counters (aggregate all disks)
	diskCounters, _ := disk.IOCounters()
	var totalRead, totalWrite uint64
	for _, d := range diskCounters {
		totalRead += d.ReadBytes
		totalWrite += d.WriteBytes
	}
	overview.DiskIO = DiskIOInfo{
		ReadBytes:  totalRead,
		WriteBytes: totalWrite,
	}

	// Resource counts from database
	overview.Counts = s.getCounts(db)

	return overview, nil
}

func (s *MonitorService) getCounts(db *sql.DB) CountInfo {
	counts := CountInfo{}
	queryCount := func(table string) int {
		var count int
		row := db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", table))
		if err := row.Scan(&count); err != nil {
			logger.Debug().Err(err).Str("table", table).Msg("failed to count rows")
			return 0
		}
		return count
	}
	counts.Sites = queryCount("sites")
	counts.Databases = queryCount("databases")
	counts.FTPAccounts = queryCount("ftps")
	counts.CronJobs = queryCount("crons")

	var running int
	row := db.QueryRow("SELECT COUNT(*) FROM tasks WHERE status = 'running'")
	if err := row.Scan(&running); err == nil {
		counts.RunningTasks = running
	}
	return counts
}

// GetRealtimeMetrics returns lightweight metrics suitable for WebSocket streaming.
func (s *MonitorService) GetRealtimeMetrics() (*RealtimeMetrics, error) {
	metrics := &RealtimeMetrics{
		Timestamp: time.Now(),
	}

	cpuPercents, err := cpu.Percent(0, false)
	if err == nil && len(cpuPercents) > 0 {
		metrics.CPUPercent = cpuPercents[0]
	}

	vmStat, err := mem.VirtualMemory()
	if err == nil && vmStat != nil {
		metrics.MemoryPercent = vmStat.UsedPercent
	}

	diskCounters, err := disk.IOCounters()
	if err == nil {
		for _, d := range diskCounters {
			metrics.DiskIORead += d.ReadBytes
			metrics.DiskIOWrite += d.WriteBytes
		}
	}

	netCounters, err := net.IOCounters(false)
	if err == nil && len(netCounters) > 0 {
		metrics.NetBytesSent = netCounters[0].BytesSent
		metrics.NetBytesRecv = netCounters[0].BytesRecv
	}

	loadAvg, err := load.Avg()
	if err == nil && loadAvg != nil {
		metrics.LoadAverage = []float64{loadAvg.Load1, loadAvg.Load5, loadAvg.Load15}
	}

	return metrics, nil
}

// GetProcessList returns the top processes sorted by CPU usage.
func (s *MonitorService) GetProcessList(limit int) ([]ProcessInfo, error) {
	if limit <= 0 {
		limit = 50
	}

	procs, err := process.Processes()
	if err != nil {
		return nil, fmt.Errorf("failed to list processes: %w", err)
	}

	var result []ProcessInfo
	for _, p := range procs {
		cpuPct, err := p.CPUPercent()
		if err != nil {
			continue
		}
		memPct, err := p.MemoryPercent()
		if err != nil {
			continue
		}
		name, _ := p.Name()
		user, _ := p.Username()
		cmdline, _ := p.Cmdline()

		result = append(result, ProcessInfo{
			PID:     p.Pid,
			Name:    name,
			CPU:     cpuPct,
			Memory:  memPct,
			User:    user,
			Command: cmdline,
		})
	}

	// Sort by CPU descending (simple selection for top N)
	for i := 0; i < len(result) && i < limit; i++ {
		maxIdx := i
		for j := i + 1; j < len(result); j++ {
			if result[j].CPU > result[maxIdx].CPU {
				maxIdx = j
			}
		}
		result[i], result[maxIdx] = result[maxIdx], result[i]
	}

	if len(result) > limit {
		result = result[:limit]
	}

	return result, nil
}

// GetServiceStatuses returns the status of managed system services.
func (s *MonitorService) GetServiceStatuses() ([]ServiceStatus, error) {
	services := []string{
		"nginx",
		"apache2",
		"httpd",
		"mysql",
		"mariadb",
		"pure-ftpd",
		"redis-server",
		"docker",
	}

	// Add common PHP-FPM versions
	phpVersions := []string{"7.4", "8.0", "8.1", "8.2", "8.3", "8.4"}
	for _, v := range phpVersions {
		services = append(services, fmt.Sprintf("php%s-fpm", v))
	}

	var statuses []ServiceStatus
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	for _, svc := range services {
		status := checkServiceStatus(ctx, svc)
		statuses = append(statuses, status)
	}

	return statuses, nil
}

func checkServiceStatus(ctx context.Context, name string) ServiceStatus {
	result, err := system.Exec(ctx, "systemctl", "is-active", name)
	if err != nil {
		// Distinguish between stopped and not installed
		output := strings.TrimSpace(result.Stderr + result.Stdout)
		if strings.Contains(output, "could not be found") || strings.Contains(output, "not-found") {
			return ServiceStatus{Name: name, Status: "not-installed", IsRunning: false}
		}
		return ServiceStatus{Name: name, Status: "stopped", IsRunning: false}
	}

	output := strings.TrimSpace(result.Stdout)
	if output == "active" {
		return ServiceStatus{Name: name, Status: "running", IsRunning: true}
	}
	return ServiceStatus{Name: name, Status: "stopped", IsRunning: false}
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
