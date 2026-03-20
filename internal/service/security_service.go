package service

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// ---------------------------------------------------------------------------
// SSH types
// ---------------------------------------------------------------------------

// SSHConfig holds SSH server configuration values.
type SSHConfig struct {
	Port            int  `json:"port"`
	PermitRootLogin bool `json:"permit_root_login"`
	PasswordAuth    bool `json:"password_auth"`
	PubkeyAuth      bool `json:"pubkey_auth"`
	MaxAuthTries    int  `json:"max_auth_tries"`
}

// UpdateSSHRequest is used to update SSH configuration.
type UpdateSSHRequest struct {
	Port            *int  `json:"port" validate:"omitempty,min=1,max=65535"`
	PermitRootLogin *bool `json:"permit_root_login"`
	PasswordAuth    *bool `json:"password_auth"`
	PubkeyAuth      *bool `json:"pubkey_auth"`
	MaxAuthTries    *int  `json:"max_auth_tries" validate:"omitempty,min=1,max=100"`
}

// ---------------------------------------------------------------------------
// Fail2ban types
// ---------------------------------------------------------------------------

// Fail2banStatus holds the current fail2ban status.
type Fail2banStatus struct {
	Enabled bool       `json:"enabled"`
	Jails   []JailInfo `json:"jails"`
}

// JailInfo describes a single fail2ban jail.
type JailInfo struct {
	Name          string `json:"name"`
	Status        string `json:"status"`
	CurrentlyBan  int    `json:"currently_banned"`
	TotalBanned   int    `json:"total_banned"`
	CurrentlyFail int    `json:"currently_failed"`
	TotalFailed   int    `json:"total_failed"`
}

// Fail2banConfig is used to configure fail2ban settings.
type Fail2banConfig struct {
	Enabled  *bool `json:"enabled"`
	MaxRetry *int  `json:"max_retry" validate:"omitempty,min=1,max=100"`
	BanTime  *int  `json:"ban_time" validate:"omitempty,min=60"`
	FindTime *int  `json:"find_time" validate:"omitempty,min=60"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// SecurityService manages SSH and fail2ban security settings.
type SecurityService struct{}

// NewSecurityService creates a new SecurityService.
func NewSecurityService() *SecurityService {
	return &SecurityService{}
}

// ---------------------------------------------------------------------------
// SSH configuration
// ---------------------------------------------------------------------------

const sshdConfigPath = "/etc/ssh/sshd_config"

// GetSSHConfig reads and parses the SSH daemon configuration.
func (s *SecurityService) GetSSHConfig() (*SSHConfig, error) {
	data, err := os.ReadFile(sshdConfigPath)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read sshd_config")
	}

	config := &SSHConfig{
		Port:            22,
		PermitRootLogin: true,
		PasswordAuth:    true,
		PubkeyAuth:      true,
		MaxAuthTries:    6,
	}

	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}

		key := strings.ToLower(parts[0])
		value := parts[1]

		switch key {
		case "port":
			if p, err := strconv.Atoi(value); err == nil {
				config.Port = p
			}
		case "permitrootlogin":
			config.PermitRootLogin = sshBoolValue(value)
		case "passwordauthentication":
			config.PasswordAuth = sshBoolValue(value)
		case "pubkeyauthentication":
			config.PubkeyAuth = sshBoolValue(value)
		case "maxauthtries":
			if m, err := strconv.Atoi(value); err == nil {
				config.MaxAuthTries = m
			}
		}
	}

	return config, nil
}

// UpdateSSHConfig modifies the SSH daemon configuration and restarts sshd.
func (s *SecurityService) UpdateSSHConfig(req UpdateSSHRequest) error {
	data, err := os.ReadFile(sshdConfigPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read sshd_config")
	}

	content := string(data)

	if req.Port != nil {
		content = setSSHDirective(content, "Port", strconv.Itoa(*req.Port))
	}
	if req.PermitRootLogin != nil {
		content = setSSHDirective(content, "PermitRootLogin", sshBoolString(*req.PermitRootLogin))
	}
	if req.PasswordAuth != nil {
		content = setSSHDirective(content, "PasswordAuthentication", sshBoolString(*req.PasswordAuth))
	}
	if req.PubkeyAuth != nil {
		content = setSSHDirective(content, "PubkeyAuthentication", sshBoolString(*req.PubkeyAuth))
	}
	if req.MaxAuthTries != nil {
		content = setSSHDirective(content, "MaxAuthTries", strconv.Itoa(*req.MaxAuthTries))
	}

	if err := os.WriteFile(sshdConfigPath, []byte(content), 0644); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write sshd_config")
	}

	// Restart sshd to apply changes.
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if _, err := system.Exec(ctx, "systemctl", "restart", "sshd"); err != nil {
		// Try alternative service name.
		if _, err2 := system.Exec(ctx, "systemctl", "restart", "ssh"); err2 != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to restart SSH service")
		}
	}

	logger.Info().Msg("SSH configuration updated")
	return nil
}

// ---------------------------------------------------------------------------
// Fail2ban
// ---------------------------------------------------------------------------

const fail2banJailPath = "/etc/fail2ban/jail.local"

// GetFail2banStatus returns the current fail2ban status.
func (s *SecurityService) GetFail2banStatus() (*Fail2banStatus, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	status := &Fail2banStatus{
		Enabled: false,
		Jails:   []JailInfo{},
	}

	// Check if fail2ban is running.
	result, err := system.Exec(ctx, "systemctl", "is-active", "fail2ban")
	if err != nil {
		return status, nil
	}
	if strings.TrimSpace(result.Stdout) != "active" {
		return status, nil
	}
	status.Enabled = true

	// Get jail list.
	result, err = system.Exec(ctx, "fail2ban-client", "status")
	if err != nil {
		return status, nil
	}

	// Parse jail names from output.
	jailNames := parseJailNames(result.Stdout)
	for _, name := range jailNames {
		jail := JailInfo{Name: name, Status: "active"}

		jailResult, err := system.Exec(ctx, "fail2ban-client", "status", name)
		if err != nil {
			status.Jails = append(status.Jails, jail)
			continue
		}

		jail.CurrentlyBan = parseF2bInt(jailResult.Stdout, "Currently banned")
		jail.TotalBanned = parseF2bInt(jailResult.Stdout, "Total banned")
		jail.CurrentlyFail = parseF2bInt(jailResult.Stdout, "Currently failed")
		jail.TotalFailed = parseF2bInt(jailResult.Stdout, "Total failed")
		status.Jails = append(status.Jails, jail)
	}

	return status, nil
}

// ConfigureFail2ban updates the fail2ban configuration.
func (s *SecurityService) ConfigureFail2ban(req Fail2banConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if req.Enabled != nil {
		if *req.Enabled {
			if _, err := system.Exec(ctx, "systemctl", "enable", "--now", "fail2ban"); err != nil {
				return apperrors.Wrap(err, apperrors.ErrInternal, "failed to enable fail2ban")
			}
		} else {
			if _, err := system.Exec(ctx, "systemctl", "disable", "--now", "fail2ban"); err != nil {
				return apperrors.Wrap(err, apperrors.ErrInternal, "failed to disable fail2ban")
			}
			return nil
		}
	}

	// Build jail.local content.
	maxRetry := 5
	banTime := 3600
	findTime := 600

	// Try to read existing values first.
	if existing, err := os.ReadFile(fail2banJailPath); err == nil {
		existingContent := string(existing)
		if v := parseF2bConfigInt(existingContent, "maxretry"); v > 0 {
			maxRetry = v
		}
		if v := parseF2bConfigInt(existingContent, "bantime"); v > 0 {
			banTime = v
		}
		if v := parseF2bConfigInt(existingContent, "findtime"); v > 0 {
			findTime = v
		}
	}

	if req.MaxRetry != nil {
		maxRetry = *req.MaxRetry
	}
	if req.BanTime != nil {
		banTime = *req.BanTime
	}
	if req.FindTime != nil {
		findTime = *req.FindTime
	}

	jailConfig := fmt.Sprintf(`[DEFAULT]
bantime = %d
findtime = %d
maxretry = %d

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = %d
bantime = %d
findtime = %d
`, banTime, findTime, maxRetry, maxRetry, banTime, findTime)

	if err := os.WriteFile(fail2banJailPath, []byte(jailConfig), 0644); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write fail2ban config")
	}

	// Restart fail2ban to apply changes.
	if _, err := system.Exec(ctx, "systemctl", "restart", "fail2ban"); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to restart fail2ban")
	}

	logger.Info().Int("maxretry", maxRetry).Int("bantime", banTime).Int("findtime", findTime).
		Msg("fail2ban configuration updated")
	return nil
}

// ---------------------------------------------------------------------------
// SSH helpers
// ---------------------------------------------------------------------------

// sshBoolValue parses SSH boolean values (yes/no).
func sshBoolValue(val string) bool {
	v := strings.ToLower(val)
	return v == "yes" || v == "true"
}

// sshBoolString converts a bool to SSH yes/no format.
func sshBoolString(val bool) string {
	if val {
		return "yes"
	}
	return "no"
}

// setSSHDirective sets or adds a directive in sshd_config content.
func setSSHDirective(content, directive, value string) string {
	lines := strings.Split(content, "\n")
	directiveLower := strings.ToLower(directive)
	found := false

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Match active directive.
		if len(trimmed) > 0 && !strings.HasPrefix(trimmed, "#") {
			parts := strings.Fields(trimmed)
			if len(parts) >= 1 && strings.ToLower(parts[0]) == directiveLower {
				lines[i] = directive + " " + value
				found = true
				break
			}
		}

		// Match commented-out directive — uncomment and set it.
		if strings.HasPrefix(trimmed, "#") {
			uncommented := strings.TrimLeft(trimmed[1:], " \t")
			parts := strings.Fields(uncommented)
			if len(parts) >= 1 && strings.ToLower(parts[0]) == directiveLower {
				lines[i] = directive + " " + value
				found = true
				break
			}
		}
	}

	if !found {
		lines = append(lines, directive+" "+value)
	}

	return strings.Join(lines, "\n")
}

// ---------------------------------------------------------------------------
// Fail2ban helpers
// ---------------------------------------------------------------------------

// parseJailNames extracts jail names from fail2ban-client status output.
func parseJailNames(output string) []string {
	for _, line := range strings.Split(output, "\n") {
		if strings.Contains(line, "Jail list:") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) < 2 {
				return nil
			}
			jailStr := strings.TrimSpace(parts[1])
			if jailStr == "" {
				return nil
			}
			var names []string
			for _, name := range strings.Split(jailStr, ",") {
				name = strings.TrimSpace(name)
				if name != "" {
					names = append(names, name)
				}
			}
			return names
		}
	}
	return nil
}

// parseF2bInt extracts an integer value from fail2ban-client status output.
func parseF2bInt(output, key string) int {
	for _, line := range strings.Split(output, "\n") {
		if strings.Contains(line, key) {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) < 2 {
				continue
			}
			val := strings.TrimSpace(parts[1])
			if n, err := strconv.Atoi(val); err == nil {
				return n
			}
		}
	}
	return 0
}

// parseF2bConfigInt extracts an integer value from a fail2ban config file.
func parseF2bConfigInt(content, key string) int {
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "#") || line == "" {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		if strings.TrimSpace(parts[0]) == key {
			if n, err := strconv.Atoi(strings.TrimSpace(parts[1])); err == nil {
				return n
			}
		}
	}
	return 0
}
