package service

import (
	"bufio"
	"context"
	"crypto/md5"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
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
	Port            int    `json:"port"`
	PermitRootLogin string `json:"permit_root_login"`
	PasswordAuth    bool   `json:"password_auth"`
	PubkeyAuth      bool   `json:"pubkey_auth"`
	MaxAuthTries    int    `json:"max_auth_tries"`
}

// UpdateSSHRequest is used to update SSH configuration.
type UpdateSSHRequest struct {
	Port            *int    `json:"port" validate:"omitempty,min=1,max=65535"`
	PermitRootLogin *string `json:"permit_root_login" validate:"omitempty,oneof=yes no without-password forced-commands-only"`
	PasswordAuth    *bool   `json:"password_auth"`
	PubkeyAuth      *bool   `json:"pubkey_auth"`
	MaxAuthTries    *int    `json:"max_auth_tries" validate:"omitempty,min=1,max=100"`
}

// ChangeRootPasswordRequest holds the new root password.
type ChangeRootPasswordRequest struct {
	Password string `json:"password" validate:"required,min=8,max=128"`
}

// SSHKeyEntry represents a single authorized key.
type SSHKeyEntry struct {
	Index       int    `json:"index"`
	Type        string `json:"type"`
	Fingerprint string `json:"fingerprint"`
	Comment     string `json:"comment"`
	PublicKey   string `json:"public_key"`
}

// SSHKeyPair holds generated key pair data.
type SSHKeyPair struct {
	PublicKey  string `json:"public_key"`
	PrivateKey string `json:"private_key"`
}

// SystemUser represents a user that can have SSH keys.
type SystemUser struct {
	Username string `json:"username"`
	UID      int    `json:"uid"`
	HomeDir  string `json:"home_dir"`
	Shell    string `json:"shell"`
	HasKeys  bool   `json:"has_keys"`
	KeyCount int    `json:"key_count"`
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
		PermitRootLogin: "yes",
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
			config.PermitRootLogin = normalizeRootLogin(value)
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
		content = setSSHDirective(content, "PermitRootLogin", *req.PermitRootLogin)
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

	return restartSSHD()
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
// Root password
// ---------------------------------------------------------------------------

// ChangeRootPassword changes the root password using chpasswd.
func (s *SecurityService) ChangeRootPassword(password string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	input := fmt.Sprintf("root:%s", password)
	if _, err := system.ExecWithStdin(ctx, input, "chpasswd"); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to change root password")
	}

	logger.Info().Msg("root password changed")
	return nil
}

// ---------------------------------------------------------------------------
// SSH key management
// ---------------------------------------------------------------------------

// ListSystemUsers returns users from /etc/passwd that have a login shell.
func (s *SecurityService) ListSystemUsers() ([]SystemUser, error) {
	f, err := os.Open("/etc/passwd")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read /etc/passwd")
	}
	defer f.Close()

	loginShells := map[string]bool{
		"/bin/bash": true, "/bin/sh": true, "/bin/zsh": true,
		"/usr/bin/bash": true, "/usr/bin/zsh": true, "/usr/bin/fish": true,
	}

	var users []SystemUser
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Split(scanner.Text(), ":")
		if len(fields) < 7 {
			continue
		}
		shell := fields[6]
		if !loginShells[shell] {
			continue
		}
		uid, _ := strconv.Atoi(fields[2])
		homeDir := fields[5]

		u := SystemUser{
			Username: fields[0],
			UID:      uid,
			HomeDir:  homeDir,
			Shell:    shell,
		}

		akPath := filepath.Join(homeDir, ".ssh", "authorized_keys")
		if data, err := os.ReadFile(akPath); err == nil {
			lines := nonEmptyLines(string(data))
			u.HasKeys = len(lines) > 0
			u.KeyCount = len(lines)
		}

		users = append(users, u)
	}

	return users, nil
}

// GetAuthorizedKeys returns parsed authorized_keys for a user.
func (s *SecurityService) GetAuthorizedKeys(username string) ([]SSHKeyEntry, error) {
	homeDir, err := userHomeDir(username)
	if err != nil {
		return nil, err
	}

	akPath := filepath.Join(homeDir, ".ssh", "authorized_keys")
	data, err := os.ReadFile(akPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []SSHKeyEntry{}, nil
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read authorized_keys")
	}

	var keys []SSHKeyEntry
	for i, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		entry := parseAuthorizedKeyLine(line, i)
		keys = append(keys, entry)
	}

	return keys, nil
}

// AddAuthorizedKey appends a public key to the user's authorized_keys.
func (s *SecurityService) AddAuthorizedKey(username, publicKey string) error {
	homeDir, err := userHomeDir(username)
	if err != nil {
		return err
	}

	sshDir := filepath.Join(homeDir, ".ssh")
	if err := os.MkdirAll(sshDir, 0700); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create .ssh directory")
	}

	akPath := filepath.Join(sshDir, "authorized_keys")

	// Ensure newline before appending
	existing, _ := os.ReadFile(akPath)
	content := string(existing)
	if len(content) > 0 && !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	content += strings.TrimSpace(publicKey) + "\n"

	if err := os.WriteFile(akPath, []byte(content), 0600); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write authorized_keys")
	}

	// Fix ownership
	fixSSHOwnership(username, sshDir)

	logger.Info().Str("user", username).Msg("authorized key added")
	return nil
}

// RemoveAuthorizedKey removes a key by its fingerprint from authorized_keys.
func (s *SecurityService) RemoveAuthorizedKey(username, fingerprint string) error {
	homeDir, err := userHomeDir(username)
	if err != nil {
		return err
	}

	akPath := filepath.Join(homeDir, ".ssh", "authorized_keys")
	data, err := os.ReadFile(akPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read authorized_keys")
	}

	var kept []string
	removed := false
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			kept = append(kept, line)
			continue
		}
		entry := parseAuthorizedKeyLine(trimmed, 0)
		if entry.Fingerprint == fingerprint {
			removed = true
			continue
		}
		kept = append(kept, line)
	}

	if !removed {
		return apperrors.New(apperrors.ErrNotFound, "key not found")
	}

	result := strings.Join(kept, "\n")
	if !strings.HasSuffix(result, "\n") {
		result += "\n"
	}

	if err := os.WriteFile(akPath, []byte(result), 0600); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write authorized_keys")
	}

	logger.Info().Str("user", username).Str("fingerprint", fingerprint).Msg("authorized key removed")
	return nil
}

// GenerateSSHKeyPair generates a new ed25519 key pair for a user.
func (s *SecurityService) GenerateSSHKeyPair(username, keyType string) (*SSHKeyPair, error) {
	if keyType == "" {
		keyType = "ed25519"
	}
	if keyType != "ed25519" && keyType != "rsa" {
		return nil, apperrors.New(apperrors.ErrValidation, "key type must be ed25519 or rsa")
	}

	homeDir, err := userHomeDir(username)
	if err != nil {
		return nil, err
	}

	sshDir := filepath.Join(homeDir, ".ssh")
	if err := os.MkdirAll(sshDir, 0700); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create .ssh directory")
	}

	keyFile := filepath.Join(sshDir, "id_"+keyType)

	// Remove old key if exists
	os.Remove(keyFile)
	os.Remove(keyFile + ".pub")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	args := []string{"-t", keyType, "-f", keyFile, "-N", "", "-C", fmt.Sprintf("%s@panel-generated", username)}
	if keyType == "rsa" {
		args = append(args, "-b", "4096")
	}

	if _, err := system.Exec(ctx, "ssh-keygen", args...); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate SSH key")
	}

	pubData, err := os.ReadFile(keyFile + ".pub")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read public key")
	}

	privData, err := os.ReadFile(keyFile)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read private key")
	}

	fixSSHOwnership(username, sshDir)

	logger.Info().Str("user", username).Str("type", keyType).Msg("SSH key pair generated")

	return &SSHKeyPair{
		PublicKey:  strings.TrimSpace(string(pubData)),
		PrivateKey: string(privData),
	}, nil
}

// GetUserPublicKeys returns the user's own public keys (id_*.pub).
func (s *SecurityService) GetUserPublicKeys(username string) ([]SSHKeyEntry, error) {
	homeDir, err := userHomeDir(username)
	if err != nil {
		return nil, err
	}

	sshDir := filepath.Join(homeDir, ".ssh")
	entries, err := os.ReadDir(sshDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []SSHKeyEntry{}, nil
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read .ssh directory")
	}

	var keys []SSHKeyEntry
	for i, e := range entries {
		if !strings.HasPrefix(e.Name(), "id_") || !strings.HasSuffix(e.Name(), ".pub") {
			continue
		}

		data, err := os.ReadFile(filepath.Join(sshDir, e.Name()))
		if err != nil {
			continue
		}

		entry := parseAuthorizedKeyLine(strings.TrimSpace(string(data)), i)
		keys = append(keys, entry)
	}

	return keys, nil
}

// GetPrivateKey returns the private key content for download.
func (s *SecurityService) GetPrivateKey(username, keyType string) (string, error) {
	if keyType == "" {
		keyType = "ed25519"
	}

	homeDir, err := userHomeDir(username)
	if err != nil {
		return "", err
	}

	keyFile := filepath.Join(homeDir, ".ssh", "id_"+keyType)
	data, err := os.ReadFile(keyFile)
	if err != nil {
		if os.IsNotExist(err) {
			return "", apperrors.New(apperrors.ErrNotFound, "private key not found")
		}
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to read private key")
	}

	return string(data), nil
}

// ---------------------------------------------------------------------------
// SSH helpers
// ---------------------------------------------------------------------------

// restartSSHD restarts the SSH daemon.
func restartSSHD() error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if _, err := system.Exec(ctx, "systemctl", "restart", "sshd"); err != nil {
		if _, err2 := system.Exec(ctx, "systemctl", "restart", "ssh"); err2 != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to restart SSH service")
		}
	}

	logger.Info().Msg("SSH configuration updated")
	return nil
}

// normalizeRootLogin normalizes PermitRootLogin values.
func normalizeRootLogin(val string) string {
	v := strings.ToLower(strings.TrimSpace(val))
	switch v {
	case "yes":
		return "yes"
	case "no":
		return "no"
	case "without-password", "prohibit-password":
		return "without-password"
	case "forced-commands-only":
		return "forced-commands-only"
	default:
		if sshBoolValue(val) {
			return "yes"
		}
		return "no"
	}
}

// userHomeDir resolves the home directory for a system user.
func userHomeDir(username string) (string, error) {
	data, err := os.ReadFile("/etc/passwd")
	if err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to read /etc/passwd")
	}

	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Split(line, ":")
		if len(fields) >= 6 && fields[0] == username {
			return fields[5], nil
		}
	}

	return "", apperrors.New(apperrors.ErrNotFound, fmt.Sprintf("user %s not found", username))
}

// parseAuthorizedKeyLine parses a single authorized_keys line.
func parseAuthorizedKeyLine(line string, index int) SSHKeyEntry {
	parts := strings.Fields(line)
	entry := SSHKeyEntry{Index: index, PublicKey: line}

	if len(parts) >= 2 {
		entry.Type = parts[0]

		// Compute MD5 fingerprint from base64 key data
		keyData, err := base64.StdEncoding.DecodeString(parts[1])
		if err == nil {
			hash := md5.Sum(keyData)
			fp := make([]string, len(hash))
			for i, b := range hash {
				fp[i] = fmt.Sprintf("%02x", b)
			}
			entry.Fingerprint = strings.Join(fp, ":")
		}
	}
	if len(parts) >= 3 {
		entry.Comment = strings.Join(parts[2:], " ")
	}

	return entry
}

// nonEmptyLines returns non-empty, non-comment lines.
func nonEmptyLines(s string) []string {
	var result []string
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			result = append(result, line)
		}
	}
	return result
}

// fixSSHOwnership sets proper ownership for .ssh directory.
func fixSSHOwnership(username, sshDir string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	system.Exec(ctx, "chown", "-R", username+":"+username, sshDir)
}

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
