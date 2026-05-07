package service

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// WAFLogService handles WAF log parsing and statistics.
type WAFLogService struct {
	db *sql.DB
}

// NewWAFLogService creates a new WAF log service.
func NewWAFLogService(db *sql.DB) *WAFLogService {
	return &WAFLogService{db: db}
}

// GetStats returns aggregated statistics.
func (s *WAFLogService) GetStats(siteID *int, period, periodKey string) (*WAFStats, error) {
	stats := &WAFStats{}

	// Get from waf_stats table
	query := `
		SELECT total_requests, blocked_requests, allowed_requests,
		       sqli_count, xss_count, lfi_count, rce_count, other_count,
		       top_blocked_ips, top_triggered_rules, avg_anomaly_score
		FROM waf_stats
		WHERE period = ? AND period_key = ?
	`
	args := []interface{}{period, periodKey}
	if siteID != nil {
		query += " AND site_id = ?"
		args = append(args, *siteID)
	}

	var topBlockedJSON, topRulesJSON *string
	err := s.db.QueryRow(query, args...).Scan(
		&stats.TotalRequests, &stats.BlockedRequests, &stats.AllowedRequests,
		&stats.SQLiCount, &stats.XSSCount, &stats.LFICount, &stats.RCECount, &stats.OtherCount,
		&topBlockedJSON, &topRulesJSON, &stats.AvgAnomalyScore,
	)
	if err != nil && err != sql.ErrNoRows {
		// Return zeros if no data
	}

	if topBlockedJSON != nil && *topBlockedJSON != "" {
		json.Unmarshal([]byte(*topBlockedJSON), &stats.TopBlockedIPs)
	}
	if topRulesJSON != nil && *topRulesJSON != "" {
		json.Unmarshal([]byte(*topRulesJSON), &stats.TopTriggeredRules)
	}

	return stats, nil
}

// GetOverviewStats returns dashboard overview statistics.
func (s *WAFLogService) GetOverviewStats() (*WAFStats, error) {
	stats := &WAFStats{}

	// Last 24 hours
	now := time.Now()
	since24h := now.Add(-24 * time.Hour)

	// Count from logs table
	row := s.db.QueryRow(`
		SELECT
			COUNT(*) as total,
			COUNT(CASE WHEN action_taken = 'blocked' THEN 1 END) as blocked,
			COUNT(CASE WHEN action_taken = 'allowed' THEN 1 END) as allowed,
			COUNT(CASE WHEN rule_category = 'SQLi' THEN 1 END) as sqli,
			COUNT(CASE WHEN rule_category = 'XSS' THEN 1 END) as xss,
			COUNT(CASE WHEN rule_category = 'LFI' THEN 1 END) as lfi,
			COUNT(CASE WHEN rule_category = 'RCE' THEN 1 END) as rce,
			COUNT(CASE WHEN rule_category NOT IN ('SQLi','XSS','LFI','RCE') OR rule_category IS NULL THEN 1 END) as other
		FROM waf_logs
		WHERE timestamp >= ?
	`, since24h)
	row.Scan(&stats.TotalRequests, &stats.BlockedRequests, &stats.AllowedRequests,
		&stats.SQLiCount, &stats.XSSCount, &stats.LFICount, &stats.RCECount, &stats.OtherCount)

	// Calculate block rate
	if stats.TotalRequests > 0 {
		stats.BlockRate = float64(stats.BlockedRequests) / float64(stats.TotalRequests) * 100
	}

	// Top blocked IPs
	rows, err := s.db.Query(`
		SELECT client_ip, COUNT(*) as cnt
		FROM waf_logs
		WHERE timestamp >= ? AND action_taken = 'blocked'
		GROUP BY client_ip
		ORDER BY cnt DESC
		LIMIT 10
	`, since24h)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ip string
			var count int64
			rows.Scan(&ip, &count)
			stats.TopBlockedIPs = append(stats.TopBlockedIPs, IPStat{IP: ip, Count: count})
		}
	}

	// Top triggered rules
	rows, err = s.db.Query(`
		SELECT COALESCE(rule_id,'N/A') as rule_id, COUNT(*) as cnt
		FROM waf_logs
		WHERE timestamp >= ? AND action_taken = 'blocked'
		GROUP BY rule_id
		ORDER BY cnt DESC
		LIMIT 10
	`, since24h)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ruleID string
			var count int64
			rows.Scan(&ruleID, &count)
			name := ruleID
			if ruleID == "N/A" {
				name = "Unknown Rule"
			}
			stats.TopTriggeredRules = append(stats.TopTriggeredRules, RuleStat{
				RuleID: ruleID, Name: name, Category: "", Count: count,
			})
		}
	}

	// Average anomaly score
	s.db.QueryRow(`
		SELECT COALESCE(AVG(anomaly_score), 0)
		FROM waf_logs
		WHERE timestamp >= ? AND anomaly_score IS NOT NULL
	`, since24h).Scan(&stats.AvgAnomalyScore)

	// Requests by hour
	hourlyStats := make(map[string]HourStat)
	for i := 0; i < 24; i++ {
		h := now.Add(-time.Duration(i) * time.Hour)
		key := h.Format("15:04")
		hourlyStats[key] = HourStat{Hour: key, Allowed: 0, Blocked: 0}
	}

	rows, err = s.db.Query(`
		SELECT strftime('%H:00', timestamp) as hour,
		       COUNT(CASE WHEN action_taken = 'allowed' THEN 1 END) as allowed,
		       COUNT(CASE WHEN action_taken = 'blocked' THEN 1 END) as blocked
		FROM waf_logs
		WHERE timestamp >= ?
		GROUP BY strftime('%H:00', timestamp)
		ORDER BY hour DESC
	`, since24h)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var hour string
			var allowed, blocked int64
			rows.Scan(&hour, &allowed, &blocked)
			if hs, ok := hourlyStats[hour]; ok {
				hs.Allowed = allowed
				hs.Blocked = blocked
				hourlyStats[hour] = hs
			}
		}
	}

	for _, hs := range hourlyStats {
		stats.RequestsByHour = append(stats.RequestsByHour, hs)
	}

	return stats, nil
}

// GetLogs returns paginated log entries with filtering.
func (s *WAFLogService) GetLogs(query WAFLogQuery) ([]WAFLogEntry, int, error) {
	baseQuery := `
		FROM waf_logs wl
		LEFT JOIN waf_sites ws ON wl.site_id = ws.id
		WHERE 1=1
	`
	args := []interface{}{}

	if query.SiteID != nil {
		baseQuery += " AND wl.site_id = ?"
		args = append(args, *query.SiteID)
	}
	if query.Action != "" {
		baseQuery += " AND wl.action_taken = ?"
		args = append(args, query.Action)
	}
	if query.Category != "" {
		baseQuery += " AND wl.rule_category = ?"
		args = append(args, query.Category)
	}
	if query.Severity != "" {
		baseQuery += " AND wl.rule_severity = ?"
		args = append(args, query.Severity)
	}
	if query.ClientIP != "" {
		baseQuery += " AND wl.client_ip LIKE ?"
		args = append(args, "%"+query.ClientIP+"%")
	}
	if query.RuleID != "" {
		baseQuery += " AND wl.rule_id LIKE ?"
		args = append(args, "%"+query.RuleID+"%")
	}
	if query.StartDate != "" {
		baseQuery += " AND wl.timestamp >= ?"
		args = append(args, query.StartDate)
	}
	if query.EndDate != "" {
		baseQuery += " AND wl.timestamp <= ?"
		args = append(args, query.EndDate)
	}
	if query.Search != "" {
		baseQuery += " AND (wl.uri LIKE ? OR wl.client_ip LIKE ? OR wl.rule_message LIKE ?)"
		search := "%" + query.Search + "%"
		args = append(args, search, search, search)
	}

	// Count total
	countQuery := "SELECT COUNT(*) " + baseQuery
	var total int
	if err := s.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Get page
	page := query.Page
	if page < 1 {
		page = 1
	}
	pageSize := query.PageSize
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}
	offset := (page - 1) * pageSize

	selectQuery := `
		SELECT wl.id, wl.timestamp, wl.site_id, ws.name,
		       wl.client_ip, wl.method, wl.uri, wl.host,
		       wl.rule_id, wl.rule_message, wl.rule_severity, wl.rule_category,
		       wl.action_taken, wl.anomaly_score, wl.geo_country,
		       wl.user_agent, wl.referer, wl.response_code,
		       wl.request_body, wl.request_headers, wl.matched_data
	` + baseQuery + fmt.Sprintf(" ORDER BY wl.timestamp DESC LIMIT %d OFFSET %d", pageSize, offset)

	rows, err := s.db.Query(selectQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var logs []WAFLogEntry
	for rows.Next() {
		var log WAFLogEntry
		err := rows.Scan(
			&log.ID, &log.Timestamp, &log.SiteID, &log.SiteName,
			&log.ClientIP, &log.Method, &log.URI, &log.Host,
			&log.RuleID, &log.RuleMessage, &log.RuleSeverity, &log.RuleCategory,
			&log.ActionTaken, &log.AnomalyScore, &log.GeoCountry,
			&log.UserAgent, &log.Referer, &log.ResponseCode,
			&log.RequestBody, &log.RequestHeaders, &log.MatchedData,
		)
		if err != nil {
			logger.Warn().Err(err).Msg("Failed to scan log entry")
			continue
		}
		logs = append(logs, log)
	}

	return logs, total, nil
}

// InsertLog inserts a WAF log entry.
func (s *WAFLogService) InsertLog(log WAFLogEntry) error {
	_, err := s.db.Exec(`
		INSERT INTO waf_logs (site_id, client_ip, method, uri, host,
			rule_id, rule_message, rule_severity, rule_category,
			action_taken, anomaly_score, geo_country, user_agent,
			referer, response_code, request_body, request_headers, matched_data)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		log.SiteID, log.ClientIP, log.Method, log.URI, log.Host,
		log.RuleID, log.RuleMessage, log.RuleSeverity, log.RuleCategory,
		log.ActionTaken, log.AnomalyScore, log.GeoCountry, log.UserAgent,
		log.Referer, log.ResponseCode, log.RequestBody, log.RequestHeaders, log.MatchedData,
	)
	return err
}

// ParseAuditLog parses Coraza audit log and inserts into database.
func (s *WAFLogService) ParseAuditLog(logPath string) error {
	file, err := os.Open(logPath)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	var currentEntry *WAFLogEntry
	var section string

	for scanner.Scan() {
		line := scanner.Text()

		// Check for audit log section markers
		if strings.HasPrefix(line, "--") {
			if currentEntry != nil && section == "E" {
				// End of entry, insert it
				s.InsertLog(*currentEntry)
			}
			currentEntry = &WAFLogEntry{}
			section = ""
			continue
		}

		// Section headers
		if strings.HasPrefix(line, "A:") {
			section = "A"
			continue
		}
		if strings.HasPrefix(line, "B:") {
			section = "B"
			continue
		}
		if strings.HasPrefix(line, "C:") {
			section = "C"
			continue
		}
		if strings.HasPrefix(line, "E:") {
			section = "E"
			continue
		}
		if strings.HasPrefix(line, "F:") {
			section = "F"
			continue
		}
		if strings.HasPrefix(line, "H:") {
			section = "H"
			continue
		}
		if strings.HasPrefix(line, "Z:") {
			section = "Z"
			continue
		}

		// Parse section content
		if currentEntry == nil {
			continue
		}

		switch section {
		case "A":
			// Request line parsing
			if strings.HasPrefix(line, "Host: ") {
				currentEntry.Host = strings.TrimPrefix(line, "Host: ")
			}
			if strings.HasPrefix(line, "User-Agent: ") {
				ua := strings.TrimPrefix(line, "User-Agent: ")
				currentEntry.UserAgent = &ua
			}
			if strings.HasPrefix(line, "Referer: ") {
				ref := strings.TrimPrefix(line, "Referer: ")
				currentEntry.Referer = &ref
			}

		case "B":
			// Request headers

		case "C":
			// Request body

		case "E":
			// Response body (rule match info often here)
			if strings.Contains(line, "msg:") {
				msg := extractSecLangVar(line, "msg")
				currentEntry.RuleMessage = &msg
			}
			if strings.Contains(line, "id:") {
				ruleID := extractSecLangVar(line, "id")
				currentEntry.RuleID = &ruleID
			}
			if strings.Contains(line, "severity:") {
				sev := extractSecLangVar(line, "severity")
				currentEntry.RuleSeverity = &sev
			}
			if strings.Contains(line, "attack:") {
				cat := extractSecLangVar(line, "attack")
				currentEntry.RuleCategory = &cat
			}

		case "F":
			// Response headers
			if strings.HasPrefix(line, "HTTP/") {
				parts := strings.Split(line, " ")
				if len(parts) >= 2 {
					code := 0
					fmt.Sscanf(parts[1], "%d", &code)
					currentEntry.ResponseCode = &code
				}
			}
		}
	}

	return nil
}

func extractSecLangVar(line, varName string) string {
	pattern := varName + `:"`
	idx := strings.Index(line, pattern)
	if idx < 0 {
		return ""
	}
	start := idx + len(pattern)
	end := strings.Index(line[start:], `"`)
	if end < 0 {
		return ""
	}
	return line[start : start+end]
}
