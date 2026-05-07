package service

import (
	"database/sql"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

const (
	corazaConfigPath    = "/etc/coraza-spoa/coraza.conf"
	corazaSPOAConfigPath = "/etc/coraza-spoa/spoe.cfg"
	corazaBinaryPath     = "/usr/local/bin/coraza-spoa"
	corazaVersion       = "0.6.1"
)

// CorazaSPOAManager handles Coraza SPOA daemon lifecycle and configuration.
type CorazaSPOAManager struct {
	startTime time.Time
	installed bool
}

// NewCorazaSPOAManager creates a new Coraza SPOA manager.
func NewCorazaSPOAManager() *CorazaSPOAManager {
	m := &CorazaSPOAManager{
		installed: false,
		startTime: time.Now(),
	}
	m.checkInstalled()
	return m
}

// checkInstalled checks if Coraza SPOA is installed.
func (m *CorazaSPOAManager) checkInstalled() {
	if _, err := os.Stat(corazaBinaryPath); err == nil {
		m.installed = true
	}
}

// IsInstalled checks if Coraza SPOA is installed.
func (m *CorazaSPOAManager) IsInstalled() bool {
	m.checkInstalled()
	return m.installed
}

// IsRunning checks if the Coraza SPOA daemon is running.
func (m *CorazaSPOAManager) IsRunning() bool {
	if !m.IsInstalled() {
		return false
	}
	cmd := exec.Command("pgrep", "-f", "coraza-spoa")
	err := cmd.Run()
	return err == nil
}

// GetVersion returns the installed Coraza SPOA version.
func (m *CorazaSPOAManager) GetVersion() string {
	if !m.IsInstalled() {
		return ""
	}
	cmd := exec.Command(corazaBinaryPath, "--version")
	out, err := cmd.Output()
	if err != nil {
		return corazaVersion
	}
	return strings.TrimSpace(string(out))
}

// GetUptime returns the uptime of the Coraza SPOA daemon in seconds.
func (m *CorazaSPOAManager) GetUptime() int64 {
	if !m.IsRunning() {
		return 0
	}
	cmd := exec.Command("ps", "-eo", "pid,lstart", "--no-headers")
	out, err := cmd.Output()
	if err != nil {
		return int64(time.Since(m.startTime).Seconds())
	}
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		if strings.Contains(line, "coraza-spoa") {
			parts := strings.Fields(line)
			if len(parts) >= 6 {
				timeStr := strings.Join(parts[1:], " ")
				t, err := time.Parse("Mon Jan 2 15:04:05 2006", timeStr)
				if err == nil {
					return int64(time.Since(t).Seconds())
				}
			}
		}
	}
	return int64(time.Since(m.startTime).Seconds())
}

// GetConfigPath returns the Coraza configuration path.
func (m *CorazaSPOAManager) GetConfigPath() string {
	return corazaConfigPath
}

// GetSPOAConfigPath returns the SPOE configuration path.
func (m *CorazaSPOAManager) GetSPOAConfigPath() string {
	return corazaSPOAConfigPath
}

// Install builds and installs Coraza SPOA from source.
func (m *CorazaSPOAManager) Install() error {
	if m.IsInstalled() {
		logger.Info().Msg("Coraza SPOA already installed")
		return nil
	}

	logger.Info().Msg("Installing Coraza SPOA...")

	buildDir := "/tmp/coraza-spoa-build"
	os.MkdirAll(buildDir, 0755)
	defer os.RemoveAll(buildDir)

	gitURL := "https://github.com/corazawaf/coraza-spoa.git"
	cloneCmd := exec.Command("git", "clone", "--depth", "1", "--branch", "v"+corazaVersion, gitURL, buildDir)
	if _, err := cloneCmd.CombinedOutput(); err != nil {
		logger.Warn().Err(err).Msg("Clone failed, trying main branch")
		cloneCmd = exec.Command("git", "clone", "--depth", "1", gitURL, buildDir)
		if out2, err2 := cloneCmd.CombinedOutput(); err2 != nil {
			return fmt.Errorf("failed to clone coraza-spoa: %s, %w", string(out2), err2)
		}
	}

	os.Chdir(buildDir)

	hasMage := exec.Command("which", "mage").Run() == nil
	if hasMage {
		buildCmd := exec.Command("mage", "build")
		if out, err := buildCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("mage build failed: %s, %w", string(out), err)
		}
	} else {
		downloadCmd := exec.Command("go", "mod", "download")
		downloadCmd.Dir = buildDir
		downloadCmd.Run()

		buildCmd := exec.Command("go", "build", "-o", filepath.Join(buildDir, "coraza-spoa"), ".")
		buildCmd.Dir = buildDir
		if out, err := buildCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("go build failed: %s, %w", string(out), err)
		}
	}

	binaryPath := filepath.Join(buildDir, "coraza-spoa")
	if _, err := os.Stat(binaryPath); os.IsNotExist(err) {
		files, _ := filepath.Glob(filepath.Join(buildDir, "*"))
		for _, f := range files {
			if !strings.HasPrefix(filepath.Base(f), ".") {
				info, _ := os.Stat(f)
				if info != nil && !info.IsDir() {
					binaryPath = f
					break
				}
			}
		}
	}

	os.MkdirAll(filepath.Dir(corazaBinaryPath), 0755)
	if err := copyFileTo(binaryPath, corazaBinaryPath); err != nil {
		return fmt.Errorf("failed to copy binary: %w", err)
	}
	os.Chmod(corazaBinaryPath, 0755)

	os.MkdirAll("/etc/coraza-spoa", 0755)
	os.MkdirAll("/var/log/coraza-spoa", 0755)

	m.createSystemdService()

	logger.Info().Msg("Coraza SPOA installed successfully")
	m.installed = true
	return nil
}

// createSystemdService creates a systemd service file for Coraza SPOA.
func (m *CorazaSPOAManager) createSystemdService() {
	serviceContent := `[Unit]
Description=Coraza WAF SPOA Agent
After=network.target

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/local/bin/coraza-spoa -config /etc/coraza-spoa/spoa.yaml
Restart=always
RestartSec=5
StandardOutput=append:/var/log/coraza-spoa/coraza-stdout.log
StandardError=append:/var/log/coraza-spoa/coraza-stderr.log

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/etc/coraza-spoa /var/log/coraza-spoa /tmp

[Install]
WantedBy=multi-user.target
`
	os.WriteFile("/etc/systemd/system/coraza-spoa.service", []byte(serviceContent), 0644)
	exec.Command("systemctl", "daemon-reload").Run()
}

// Start starts the Coraza SPOA daemon.
func (m *CorazaSPOAManager) Start() error {
	if !m.IsInstalled() {
		return fmt.Errorf("Coraza SPOA is not installed")
	}

	if m.IsRunning() {
		logger.Info().Msg("Coraza SPOA is already running")
		return nil
	}

	cmd := exec.Command("systemctl", "start", "coraza-spoa")
	if _, err := cmd.CombinedOutput(); err != nil {
		directCmd := exec.Command(corazaBinaryPath, "-config", "/etc/coraza-spoa/spoa.yaml")
		stdout, _ := os.Create("/var/log/coraza-spoa/coraza-stdout.log")
		stderr, _ := os.Create("/var/log/coraza-spoa/coraza-stderr.log")
		directCmd.Stdout = stdout
		directCmd.Stderr = stderr
		if err := directCmd.Start(); err != nil {
			return fmt.Errorf("failed to start coraza-spoa: %w", err)
		}
		m.startTime = time.Now()
		logger.Info().Msg("Coraza SPOA started directly")
		return nil
	}

	m.startTime = time.Now()
	logger.Info().Msg("Coraza SPOA started via systemd")
	return nil
}

// Stop stops the Coraza SPOA daemon.
func (m *CorazaSPOAManager) Stop() error {
	if !m.IsRunning() {
		return nil
	}
	exec.Command("systemctl", "stop", "coraza-spoa").Run()
	exec.Command("pkill", "-f", "coraza-spoa").Run()
	logger.Info().Msg("Coraza SPOA stopped")
	return nil
}

// Restart restarts the Coraza SPOA daemon.
func (m *CorazaSPOAManager) Restart() {
	m.Stop()
	time.Sleep(1 * time.Second)
	m.Start()
}

// Uninstall removes the Coraza SPOA installation.
func (m *CorazaSPOAManager) Uninstall() error {
	m.Stop()
	os.Remove(corazaBinaryPath)
	os.RemoveAll("/etc/coraza-spoa")
	os.RemoveAll("/var/log/coraza-spoa")
	os.Remove("/etc/systemd/system/coraza-spoa.service")
	exec.Command("systemctl", "daemon-reload").Run()
	m.installed = false
	logger.Info().Msg("Coraza SPOA uninstalled")
	return nil
}

// ReadConfig reads the Coraza configuration.
func (m *CorazaSPOAManager) ReadConfig() (string, error) {
	content, err := os.ReadFile(corazaConfigPath)
	if err != nil {
		return "", fmt.Errorf("config not found: %w", err)
	}
	return string(content), nil
}

// ReadSPOAConfig reads the SPOE configuration.
func (m *CorazaSPOAManager) ReadSPOAConfig() (string, error) {
	content, err := os.ReadFile(corazaSPOAConfigPath)
	if err != nil {
		return "", fmt.Errorf("SPOE config not found: %w", err)
	}
	return string(content), nil
}

// GenerateConfig generates the Coraza configuration from database rules.
func (m *CorazaSPOAManager) GenerateConfig(db *sql.DB) (string, error) {
	var buf strings.Builder

	buf.WriteString(`# Coraza WAF Configuration
# Auto-generated by ITDLUPanel
# Based on OWASP Core Rule Set v4

SecRuleEngine On
SecDebugLog /var/log/coraza-spoa/debug.log
SecDebugLogLevel 0
SecAuditEngine RelevantOnly
SecAuditLogRelevantStatus "^(?:5|4(?!04))"
SecAuditLogParts ABIJEFHZ
SecAuditLogType Serial
SecAuditLog /var/log/coraza-spoa/audit.log
SecArgumentSeparator &
SecCookieFormat 0
SecRequestBodyLimit 13107200
SecRequestBodyNoFilesLimit 131072
SecRequestBodyLimitAction Reject
SecPcreMatchLimit 1000
SecPcreMatchLimitRecursion 100
SecResponseBodyLimit 524288
SecResponseBodyLimitAction Reject
SecResponseBodyMimeType text/plain text/html text/xml application/octet-stream
SecTmpDir /tmp
SecUploadDir /var/www/uploads
SecUploadKeepFiles Off
SecCollectionTimeout 600
SecConnReadTimeout 120
SecConnWriteTimeout 120
SecIpResolutionWidth 255
SecStatusEngine On

Include /etc/coraza-spoa/crs/crs-setup.conf
`)

	owaspEnabled := m.getEnabledOWASPCategories(db)
	if len(owaspEnabled) > 0 {
		buf.WriteString("# Enabled OWASP CRS rules\n")
		for _, cat := range owaspEnabled {
			buf.WriteString(fmt.Sprintf("  # Category: %s\n", cat))
		}
	}

	rules, err := m.getEnabledRules(db)
	if err != nil {
		logger.Warn().Err(err).Msg("Failed to get enabled rules")
	} else {
		buf.WriteString(fmt.Sprintf("\n# Custom Rules (%d rules)\n", len(rules)))
		for i, rule := range rules {
			action := "deny"
			if rule.Action == "allow" {
				action = "pass"
			} else if rule.Action == "log" {
				action = "pass,log"
			}

			desc := rule.Description
			if desc == "" {
				desc = rule.RuleContent
			}
			if len(desc) > 100 {
				desc = desc[:100] + "..."
			}

			buf.WriteString(fmt.Sprintf("\n# Rule %d: %s\n", i+1, rule.Name))
			buf.WriteString(fmt.Sprintf("SecRule %s \"%s\" \\\n", rule.RuleContent, action))
			buf.WriteString(fmt.Sprintf("    \"id:%d,\\n\",\n", 100000+rule.ID))
			buf.WriteString(fmt.Sprintf("    \"phase:%d,\\n\",\n", rule.Phase))
			buf.WriteString("    \"t:none,\\n\",\n")
			buf.WriteString(fmt.Sprintf("    \"msg:'%s',\\n\",\n", escapeSecLang(rule.Name)))
			buf.WriteString("    \"logdata:'Matched Data: %{matched_var} found within %{var_name}',\\n\",\n")
			buf.WriteString(fmt.Sprintf("    \"severity:%s,\\n\",\n", m.severityToCoraza(rule.LogLevel)))
			if rule.RuleGroup != nil && *rule.RuleGroup != "" {
				buf.WriteString(fmt.Sprintf("    \"tag:'%s',\\n\",\n", escapeSecLang(*rule.RuleGroup)))
			}
			buf.WriteString("    \"chain\"\n")
			buf.WriteString("SecRule &TX:param \"^(?:[\\d.]+|\\d+)$\"\n")
			buf.WriteString("\n")
		}
	}

	if err := m.appendIPLists(&buf, db); err != nil {
		logger.Warn().Err(err).Msg("Failed to append IP lists")
	}

	return buf.String(), nil
}

// getEnabledOWASPCategories returns enabled OWASP categories.
func (m *CorazaSPOAManager) getEnabledOWASPCategories(db *sql.DB) []string {
	rows, err := db.Query("SELECT category_id FROM waf_owasp_categories WHERE enabled = 1")
	if err != nil {
		return nil
	}
	defer rows.Close()

	var cats []string
	for rows.Next() {
		var cat string
		rows.Scan(&cat)
		cats = append(cats, cat)
	}
	return cats
}

// getEnabledRules returns enabled rules from database.
func (m *CorazaSPOAManager) getEnabledRules(db *sql.DB) ([]struct {
	ID          int
	Name        string
	Phase       int
	Action      string
	RuleContent string
	LogLevel    string
	Description string
	RuleGroup   *string
}, error) {
	rows, err := db.Query(`
		SELECT id, name, phase, action, rule_content, log_level, description, rule_group
		FROM waf_rules WHERE enabled = 1 AND rule_type = 'custom'
		ORDER BY priority ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []struct {
		ID          int
		Name        string
		Phase       int
		Action      string
		RuleContent string
		LogLevel    string
		Description string
		RuleGroup   *string
	}
	for rows.Next() {
		var r struct {
			ID          int
			Name        string
			Phase       int
			Action      string
			RuleContent string
			LogLevel    string
			Description string
			RuleGroup   *string
		}
		rows.Scan(&r.ID, &r.Name, &r.Phase, &r.Action, &r.RuleContent,
			&r.LogLevel, &r.Description, &r.RuleGroup)
		rules = append(rules, r)
	}

	return rules, nil
}

// appendIPLists appends IP whitelist/blacklist rules.
func (m *CorazaSPOAManager) appendIPLists(buf *strings.Builder, db *sql.DB) error {
	rows, err := db.Query(`
		SELECT ip_address, list_type FROM waf_ip_list
		WHERE (expires_at IS NULL OR expires_at > datetime('now'))
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var whitelist, blacklist []string
	for rows.Next() {
		var ip, listType string
		rows.Scan(&ip, &listType)
		if listType == "whitelist" {
			whitelist = append(whitelist, ip)
		} else {
			blacklist = append(blacklist, ip)
		}
	}

	if len(whitelist) > 0 {
		buf.WriteString("\n# IP Whitelist\n")
		for i, ip := range whitelist {
			buf.WriteString(fmt.Sprintf("SecRule REMOTE_ADDR \"^%s$\" \\\n    \"id:900001%d,phase:1,nolog,pass,msg:'Whitelisted IP',ctl:ruleRemoveById=900001\"\n", escapeRegex(ip), i+1))
		}
	}

	if len(blacklist) > 0 {
		buf.WriteString("\n# IP Blacklist\n")
		for i, ip := range blacklist {
			buf.WriteString(fmt.Sprintf("SecRule REMOTE_ADDR \"^%s$\" \\\n    \"id:900002%d,phase:1,log,deny,msg:'Blocked IP',severity:CRITICAL\"\n", escapeRegex(ip), i+1))
		}
	}

	return nil
}

func (m *CorazaSPOAManager) severityToCoraza(level string) string {
	switch level {
	case "critical":
		return "CRITICAL"
	case "error":
		return "ERROR"
	case "warning":
		return "WARNING"
	case "alert":
		return "ALERT"
	default:
		return "NOTICE"
	}
}

func escapeSecLang(s string) string {
	s = strings.ReplaceAll(s, "'", "\\'")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	return s
}

func escapeRegex(s string) string {
	s = strings.ReplaceAll(s, ".", "\\.")
	s = strings.ReplaceAll(s, "*", ".*")
	return s
}

// copyFileTo copies a file from src to dst.
func copyFileTo(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	dstFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	buf := make([]byte, 32*1024)
	for {
		n, err := srcFile.Read(buf)
		if n > 0 {
			if _, writeErr := dstFile.Write(buf[:n]); writeErr != nil {
				return writeErr
			}
		}
		if err != nil {
			break
		}
	}
	return dstFile.Sync()
}

// GetGoarch returns the current system architecture.
func getGoarch() string {
	switch runtime.GOARCH {
	case "amd64":
		return "amd64"
	case "arm64":
		return "arm64"
	default:
		return runtime.GOARCH
	}
}
