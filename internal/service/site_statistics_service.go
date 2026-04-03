package service

import (
	"bufio"
	"compress/gzip"
	"database/sql"
	"fmt"
	"math"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
)

// DayStats holds aggregated statistics for a single day.
type DayStats struct {
	Date     string `json:"date"`
	Traffic  int64  `json:"traffic"`
	Requests int64  `json:"requests"`
	IP       int64  `json:"ip"`
	UV       int64  `json:"uv"`
	PV       int64  `json:"pv"`
}

// WebsiteStatistics holds summary + chart data.
type WebsiteStatistics struct {
	Today      DayStats   `json:"today"`
	Yesterday  DayStats   `json:"yesterday"`
	DayBefore  DayStats   `json:"day_before"`
	ChartData  []DayStats `json:"chart_data"`
}

// SiteStatisticsService parses nginx access logs to produce statistics.
type SiteStatisticsService struct {
	db *sql.DB
}

// NewSiteStatisticsService creates a new SiteStatisticsService.
func NewSiteStatisticsService(db *sql.DB) *SiteStatisticsService {
	return &SiteStatisticsService{db: db}
}

// nginxLogRe matches combined log format lines:
// IP - user [time] "method path proto" status bytes "referer" "ua"
var nginxLogRe = regexp.MustCompile(
	`^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d+)\s+(\d+)\s+"([^"]*)"\s+"([^"]*)"`,
)

// staticExtensions are file extensions that count as static assets (not PV).
var staticExtensions = map[string]bool{
	".css": true, ".js": true, ".png": true, ".jpg": true, ".jpeg": true,
	".gif": true, ".svg": true, ".ico": true, ".woff": true, ".woff2": true,
	".ttf": true, ".eot": true, ".map": true, ".webp": true, ".avif": true,
	".mp4": true, ".mp3": true, ".webm": true, ".pdf": true,
}

func (s *SiteStatisticsService) getSiteDomain(siteID int64) (string, error) {
	var domain string
	err := s.db.QueryRow("SELECT domain FROM sites WHERE id = ?", siteID).Scan(&domain)
	if err == sql.ErrNoRows {
		return "", apperrors.New(apperrors.ErrNotFound, "site not found")
	}
	if err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to get site domain")
	}
	return domain, nil
}

// GetStatistics returns summary + 7-day chart data for a site.
func (s *SiteStatisticsService) GetStatistics(siteID int64, days int) (*WebsiteStatistics, error) {
	domain, err := s.getSiteDomain(siteID)
	if err != nil {
		return nil, err
	}

	if days < 1 {
		days = 7
	}
	if days > 30 {
		days = 30
	}

	now := time.Now()
	today := now.Format("2006-01-02")
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")
	dayBefore := now.AddDate(0, 0, -2).Format("2006-01-02")

	// Collect all dates we need
	dateSet := make(map[string]bool)
	for i := 0; i < days; i++ {
		d := now.AddDate(0, 0, -i).Format("2006-01-02")
		dateSet[d] = true
	}

	// Initialize stats map
	statsMap := make(map[string]*dayAccumulator)
	for d := range dateSet {
		statsMap[d] = newDayAccumulator()
	}

	// Parse today's log (current log file)
	currentLogPath := fmt.Sprintf("%s/%s.access.log", websiteLogDir, domain)
	s.parseLogFile(currentLogPath, false, dateSet, statsMap)

	// Parse ALL rotated logs — logrotate names files by rotation date, not
	// content date, so we scan all matching files and let processLine filter
	// by the actual timestamp in each log entry.
	prefix := domain + ".access.log."
	entries, _ := os.ReadDir(websiteLogDir)
	for _, e := range entries {
		name := e.Name()
		if !strings.HasPrefix(name, prefix) {
			continue
		}
		path := fmt.Sprintf("%s/%s", websiteLogDir, name)
		isGz := strings.HasSuffix(name, ".gz")
		s.parseLogFile(path, isGz, dateSet, statsMap)
	}

	// Build chart data (oldest first)
	chartData := make([]DayStats, 0, days)
	for i := days - 1; i >= 0; i-- {
		d := now.AddDate(0, 0, -i).Format("2006-01-02")
		if acc, ok := statsMap[d]; ok {
			chartData = append(chartData, acc.toDayStats(d))
		} else {
			chartData = append(chartData, DayStats{Date: d})
		}
	}

	result := &WebsiteStatistics{
		ChartData: chartData,
	}

	// Set summary
	if acc, ok := statsMap[today]; ok {
		result.Today = acc.toDayStats(today)
	} else {
		result.Today = DayStats{Date: today}
	}
	if acc, ok := statsMap[yesterday]; ok {
		result.Yesterday = acc.toDayStats(yesterday)
	} else {
		result.Yesterday = DayStats{Date: yesterday}
	}
	if acc, ok := statsMap[dayBefore]; ok {
		result.DayBefore = acc.toDayStats(dayBefore)
	} else {
		result.DayBefore = DayStats{Date: dayBefore}
	}

	return result, nil
}

// dayAccumulator collects raw data for aggregation.
type dayAccumulator struct {
	traffic  int64
	requests int64
	ips      map[string]bool
	uvs      map[string]bool // IP + UA hash
	pv       int64
}

func newDayAccumulator() *dayAccumulator {
	return &dayAccumulator{
		ips: make(map[string]bool),
		uvs: make(map[string]bool),
	}
}

func (a *dayAccumulator) toDayStats(date string) DayStats {
	return DayStats{
		Date:     date,
		Traffic:  a.traffic,
		Requests: a.requests,
		IP:       int64(len(a.ips)),
		UV:       int64(len(a.uvs)),
		PV:       a.pv,
	}
}

// parseLogFile reads a log file and accumulates stats per date.
func (s *SiteStatisticsService) parseLogFile(path string, isGz bool, dateSet map[string]bool, statsMap map[string]*dayAccumulator) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	var scanner *bufio.Scanner
	if isGz {
		gz, err := gzip.NewReader(f)
		if err != nil {
			return
		}
		defer gz.Close()
		scanner = bufio.NewScanner(gz)
	} else {
		scanner = bufio.NewScanner(f)
	}

	scanner.Buffer(make([]byte, 0, 256*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		s.processLine(line, dateSet, statsMap)
	}
}

// processLine parses a single log line and updates accumulators.
func (s *SiteStatisticsService) processLine(line string, dateSet map[string]bool, statsMap map[string]*dayAccumulator) {
	matches := nginxLogRe.FindStringSubmatch(line)
	if matches == nil {
		return
	}

	ip := matches[1]
	timeStr := matches[2]
	method := matches[3]
	path := matches[4]
	// status := matches[5]
	bytesStr := matches[6]
	// referer := matches[7]
	ua := matches[8]

	// Parse date from time_local: "02/Apr/2026:08:24:21 +0000"
	t, err := time.Parse("02/Jan/2006:15:04:05 -0700", timeStr)
	if err != nil {
		return
	}
	date := t.Format("2006-01-02")

	if !dateSet[date] {
		return
	}

	acc, ok := statsMap[date]
	if !ok {
		return
	}

	bytes, _ := strconv.ParseInt(bytesStr, 10, 64)

	acc.requests++
	acc.traffic += bytes
	acc.ips[ip] = true
	acc.uvs[ip+"|"+ua] = true

	// PV: count non-static GET/HEAD requests
	if (method == "GET" || method == "HEAD") && !isStaticAsset(path) {
		acc.pv++
	}
}

// isStaticAsset checks if a URL path is a static file.
func isStaticAsset(path string) bool {
	// Remove query string
	if idx := strings.IndexByte(path, '?'); idx >= 0 {
		path = path[:idx]
	}
	// Find extension
	if idx := strings.LastIndexByte(path, '.'); idx >= 0 {
		ext := strings.ToLower(path[idx:])
		return staticExtensions[ext]
	}
	return false
}

// FormatBytes formats bytes to human-readable string.
func FormatBytes(b int64) string {
	if b == 0 {
		return "0 B"
	}
	units := []string{"B", "KB", "MB", "GB", "TB"}
	i := int(math.Log(float64(b)) / math.Log(1024))
	if i >= len(units) {
		i = len(units) - 1
	}
	val := float64(b) / math.Pow(1024, float64(i))
	if val == math.Trunc(val) {
		return fmt.Sprintf("%.0f %s", val, units[i])
	}
	return fmt.Sprintf("%.2f %s", val, units[i])
}
