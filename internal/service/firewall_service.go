package service

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"strings"
	"time"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

// AddRuleRequest holds data for creating a new firewall rule.
type AddRuleRequest struct {
	Type        string `json:"type" validate:"required,oneof=port ip"`
	Protocol    string `json:"protocol" validate:"omitempty,oneof=tcp udp"`
	Port        string `json:"port" validate:"omitempty"`
	IP          string `json:"ip" validate:"omitempty"`
	Action      string `json:"action" validate:"required,oneof=allow deny"`
	Direction   string `json:"direction" validate:"omitempty,oneof=in out"`
	Description string `json:"description" validate:"omitempty,max=255"`
}

// FirewallRule represents a firewall rule.
type FirewallRule struct {
	ID          int64  `json:"id"`
	Type        string `json:"type"`
	Protocol    string `json:"protocol"`
	Port        string `json:"port"`
	IP          string `json:"ip"`
	Action      string `json:"action"`
	Direction   string `json:"direction"`
	Description string `json:"description"`
	Status      int    `json:"status"`
	SortOrder   int    `json:"sort_order"`
	IsDefault   int    `json:"is_default"`
	CreatedAt   string `json:"created_at"`
}

// FirewallSettings holds global firewall toggle states.
type FirewallSettings struct {
	Enabled   bool `json:"enabled"`
	ICMPBlock bool `json:"icmp_block"`
}

// softwarePortMap maps software names to their default ports.
var softwarePortMap = map[string][]struct {
	Port     string
	Protocol string
	Desc     string
}{
	"nginx":          {{Port: "80", Protocol: "tcp", Desc: "HTTP (Nginx)"}, {Port: "443", Protocol: "tcp", Desc: "HTTPS (Nginx)"}},
	"apache":         {{Port: "80", Protocol: "tcp", Desc: "HTTP (Apache)"}, {Port: "443", Protocol: "tcp", Desc: "HTTPS (Apache)"}},
	"openlitespeed":  {{Port: "80", Protocol: "tcp", Desc: "HTTP (OLS)"}, {Port: "443", Protocol: "tcp", Desc: "HTTPS (OLS)"}, {Port: "7080", Protocol: "tcp", Desc: "OLS Admin"}},
	"mysql":          {{Port: "3306", Protocol: "tcp", Desc: "MySQL"}},
	"mariadb":        {{Port: "3306", Protocol: "tcp", Desc: "MariaDB"}},
	"postgresql":     {{Port: "5432", Protocol: "tcp", Desc: "PostgreSQL"}},
	"redis":          {{Port: "6379", Protocol: "tcp", Desc: "Redis"}},
	"pureftpd":       {{Port: "21", Protocol: "tcp", Desc: "FTP Control"}, {Port: "20", Protocol: "tcp", Desc: "FTP Data"}, {Port: "39000:40000", Protocol: "tcp", Desc: "FTP Passive"}},
	"memcached":      {{Port: "11211", Protocol: "tcp", Desc: "Memcached"}},
	"phpmyadmin":     {{Port: "888", Protocol: "tcp", Desc: "phpMyAdmin"}},
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// FirewallService manages firewall rules.
type FirewallService struct {
	db *sql.DB
}

// NewFirewallService creates a new FirewallService.
func NewFirewallService(db *sql.DB) *FirewallService {
	return &FirewallService{db: db}
}

// ListRules returns all firewall rules.
func (s *FirewallService) ListRules() ([]*FirewallRule, error) {
	rows, err := s.db.Query(
		`SELECT id, type, protocol, port, ip, action, direction, description, status, sort_order, COALESCE(is_default, 0), created_at
		 FROM firewall_rules ORDER BY sort_order ASC, id ASC`,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list firewall rules")
	}
	defer rows.Close()

	var rules []*FirewallRule
	for rows.Next() {
		r := &FirewallRule{}
		var port, ip, description sql.NullString
		if err := rows.Scan(&r.ID, &r.Type, &r.Protocol, &port, &ip, &r.Action,
			&r.Direction, &description, &r.Status, &r.SortOrder, &r.IsDefault, &r.CreatedAt); err != nil {
			return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to scan firewall rule")
		}
		r.Port = port.String
		r.IP = ip.String
		r.Description = description.String
		rules = append(rules, r)
	}

	return rules, nil
}

// AddRule creates a new firewall rule and applies it.
func (s *FirewallService) AddRule(req AddRuleRequest) (*FirewallRule, error) {
	if req.Protocol == "" {
		req.Protocol = "tcp"
	}
	if req.Direction == "" {
		req.Direction = "in"
	}

	if req.Type == "port" && req.Port == "" {
		return nil, apperrors.New(apperrors.ErrValidation, "port is required for port rules")
	}
	if req.Type == "ip" && req.IP == "" {
		return nil, apperrors.New(apperrors.ErrValidation, "IP address is required for IP rules")
	}
	if req.IP != "" && net.ParseIP(req.IP) == nil {
		// Also allow CIDR notation.
		if _, _, err := net.ParseCIDR(req.IP); err != nil {
			return nil, apperrors.New(apperrors.ErrValidation, "invalid IP address or CIDR")
		}
	}

	result, err := s.db.Exec(
		`INSERT INTO firewall_rules (type, protocol, port, ip, action, direction, description, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
		req.Type, req.Protocol, req.Port, req.IP, req.Action, req.Direction, req.Description,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create firewall rule")
	}

	id, _ := result.LastInsertId()

	rule, err := s.getRuleByID(id)
	if err != nil {
		return nil, err
	}

	if err := s.applyRule(rule); err != nil {
		logger.Error().Err(err).Int64("id", id).Msg("failed to apply firewall rule")
	}

	logger.Info().Int64("id", id).Str("type", req.Type).Str("action", req.Action).Msg("firewall rule added")
	return rule, nil
}

// DeleteRule removes a firewall rule and un-applies it.
func (s *FirewallService) DeleteRule(id int64) error {
	rule, err := s.getRuleByID(id)
	if err != nil {
		return err
	}

	if rule.IsDefault == 1 {
		return apperrors.New(apperrors.ErrValidation, "default rule cannot be deleted")
	}

	if rule.Status == 1 {
		if err := s.removeRule(rule); err != nil {
			logger.Error().Err(err).Int64("id", id).Msg("failed to remove firewall rule from system")
		}
	}

	if _, err := s.db.Exec("DELETE FROM firewall_rules WHERE id = ?", id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete firewall rule")
	}

	logger.Info().Int64("id", id).Msg("firewall rule deleted")
	return nil
}

// ToggleRule enables or disables a firewall rule.
func (s *FirewallService) ToggleRule(id int64, enabled bool) error {
	rule, err := s.getRuleByID(id)
	if err != nil {
		return err
	}

	status := 0
	if enabled {
		status = 1
	}

	_, err = s.db.Exec("UPDATE firewall_rules SET status = ? WHERE id = ?", status, id)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update firewall rule status")
	}

	if enabled {
		if err := s.applyRule(rule); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to apply firewall rule")
		}
	} else {
		if err := s.removeRule(rule); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to remove firewall rule")
		}
	}

	logger.Info().Int64("id", id).Bool("enabled", enabled).Msg("firewall rule toggled")
	return nil
}

// GetBlockedIPs returns a list of IPs blocked via iptables.
func (s *FirewallService) GetBlockedIPs() ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := system.Exec(ctx, "iptables", "-L", "INPUT", "-n", "--line-numbers")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list iptables rules")
	}

	var blocked []string
	for _, line := range strings.Split(result.Stdout, "\n") {
		line = strings.TrimSpace(line)
		if strings.Contains(line, "DROP") && !strings.Contains(line, "dpt:") {
			fields := strings.Fields(line)
			for _, f := range fields {
				if net.ParseIP(f) != nil {
					blocked = append(blocked, f)
					break
				}
				if _, _, err := net.ParseCIDR(f); err == nil {
					blocked = append(blocked, f)
					break
				}
			}
		}
	}

	return blocked, nil
}

// BlockIP blocks an IP address via iptables.
func (s *FirewallService) BlockIP(ip string) error {
	if net.ParseIP(ip) == nil {
		if _, _, err := net.ParseCIDR(ip); err != nil {
			return apperrors.New(apperrors.ErrValidation, "invalid IP address or CIDR")
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if s.useFirewalld() {
		_, err := system.Exec(ctx, "firewall-cmd", "--permanent", "--add-rich-rule",
			fmt.Sprintf("rule family='ipv4' source address='%s' drop", ip))
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to block IP via firewalld")
		}
		_, _ = system.Exec(ctx, "firewall-cmd", "--reload")
	} else {
		_, err := system.Exec(ctx, "iptables", "-A", "INPUT", "-s", ip, "-j", "DROP")
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to block IP via iptables")
		}
		s.saveIptables(ctx)
	}

	logger.Info().Str("ip", ip).Msg("IP blocked")
	return nil
}

// UnblockIP removes an IP block via iptables.
func (s *FirewallService) UnblockIP(ip string) error {
	if net.ParseIP(ip) == nil {
		if _, _, err := net.ParseCIDR(ip); err != nil {
			return apperrors.New(apperrors.ErrValidation, "invalid IP address or CIDR")
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if s.useFirewalld() {
		_, err := system.Exec(ctx, "firewall-cmd", "--permanent", "--remove-rich-rule",
			fmt.Sprintf("rule family='ipv4' source address='%s' drop", ip))
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to unblock IP via firewalld")
		}
		_, _ = system.Exec(ctx, "firewall-cmd", "--reload")
	} else {
		_, err := system.Exec(ctx, "iptables", "-D", "INPUT", "-s", ip, "-j", "DROP")
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to unblock IP via iptables")
		}
		s.saveIptables(ctx)
	}

	logger.Info().Str("ip", ip).Msg("IP unblocked")
	return nil
}

// ---------------------------------------------------------------------------
// Global settings
// ---------------------------------------------------------------------------

// GetSettings returns the global firewall settings.
func (s *FirewallService) GetSettings() (*FirewallSettings, error) {
	settings := &FirewallSettings{}
	rows, err := s.db.Query("SELECT key, value FROM firewall_settings")
	if err != nil {
		return settings, nil // table may not exist yet
	}
	defer rows.Close()

	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			continue
		}
		switch k {
		case "enabled":
			settings.Enabled = v == "true"
		case "icmp_block":
			settings.ICMPBlock = v == "true"
		}
	}
	return settings, nil
}

// UpdateSettings updates a firewall setting and applies the change.
func (s *FirewallService) UpdateSettings(key string, value bool) error {
	val := "false"
	if value {
		val = "true"
	}

	_, err := s.db.Exec(
		"INSERT OR REPLACE INTO firewall_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
		key, val,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update firewall setting")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	switch key {
	case "enabled":
		if value {
			return s.enableFirewall(ctx)
		}
		return s.disableFirewall(ctx)
	case "icmp_block":
		if value {
			return s.blockICMP(ctx)
		}
		return s.unblockICMP(ctx)
	}

	return nil
}

// enableFirewall applies all enabled rules and saves.
func (s *FirewallService) enableFirewall(ctx context.Context) error {
	rules, err := s.ListRules()
	if err != nil {
		return err
	}

	for _, r := range rules {
		if r.Status == 1 {
			if err := s.applyRule(r); err != nil {
				logger.Error().Err(err).Int64("id", r.ID).Msg("failed to apply rule during enable")
			}
		}
	}

	// Check ICMP setting — re-apply if needed
	settings, _ := s.GetSettings()
	if settings.ICMPBlock {
		_ = s.blockICMP(ctx)
	}

	s.saveIptables(ctx)
	logger.Info().Msg("firewall enabled")
	return nil
}

// disableFirewall flushes panel-managed iptables rules.
func (s *FirewallService) disableFirewall(ctx context.Context) error {
	rules, err := s.ListRules()
	if err != nil {
		return err
	}

	// Remove each managed rule from iptables
	for _, r := range rules {
		if r.Status == 1 {
			_ = s.removeRule(r)
		}
	}

	// Remove ICMP block if active
	_ = s.unblockICMP(ctx)

	s.saveIptables(ctx)
	logger.Info().Msg("firewall disabled")
	return nil
}

// blockICMP adds iptables rule to drop ICMP echo-request.
func (s *FirewallService) blockICMP(ctx context.Context) error {
	// Remove first to avoid duplicates
	_, _ = system.Exec(ctx, "iptables", "-D", "INPUT", "-p", "icmp", "--icmp-type", "echo-request", "-j", "DROP")
	_, err := system.Exec(ctx, "iptables", "-A", "INPUT", "-p", "icmp", "--icmp-type", "echo-request", "-j", "DROP")
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to block ICMP")
	}
	s.saveIptables(ctx)
	logger.Info().Msg("ICMP echo-request blocked")
	return nil
}

// unblockICMP removes iptables ICMP drop rule.
func (s *FirewallService) unblockICMP(ctx context.Context) error {
	_, _ = system.Exec(ctx, "iptables", "-D", "INPUT", "-p", "icmp", "--icmp-type", "echo-request", "-j", "DROP")
	s.saveIptables(ctx)
	logger.Info().Msg("ICMP echo-request unblocked")
	return nil
}

// OpenPortsForSoftware automatically adds firewall rules for a software package.
func (s *FirewallService) OpenPortsForSoftware(softwareName string) {
	ports, ok := softwarePortMap[softwareName]
	if !ok {
		return
	}

	settings, _ := s.GetSettings()

	for _, p := range ports {
		// Check if rule already exists
		var count int
		err := s.db.QueryRow(
			"SELECT COUNT(*) FROM firewall_rules WHERE port = ? AND protocol = ? AND direction = 'in' AND type = 'port'",
			p.Port, p.Protocol,
		).Scan(&count)
		if err != nil || count > 0 {
			continue
		}

		rule, err := s.AddRule(AddRuleRequest{
			Type:        "port",
			Port:        p.Port,
			Protocol:    p.Protocol,
			Action:      "allow",
			Direction:   "in",
			Description: p.Desc,
		})
		if err != nil {
			logger.Warn().Err(err).Str("port", p.Port).Str("software", softwareName).Msg("failed to auto-open port")
			continue
		}

		// If firewall is disabled, don't apply to iptables (rule saved in DB only)
		if !settings.Enabled {
			// Remove from iptables since AddRule already applied it
			_ = s.removeRule(rule)
		}

		logger.Info().Str("port", p.Port).Str("software", softwareName).Msg("auto-opened port for software")
	}
}

// ClosePortsForSoftware removes auto-added firewall rules for a software package.
func (s *FirewallService) ClosePortsForSoftware(softwareName string) {
	ports, ok := softwarePortMap[softwareName]
	if !ok {
		return
	}

	for _, p := range ports {
		// Find and delete matching non-default rules
		var id int64
		var isDefault int
		err := s.db.QueryRow(
			"SELECT id, COALESCE(is_default, 0) FROM firewall_rules WHERE port = ? AND protocol = ? AND direction = 'in' AND type = 'port' LIMIT 1",
			p.Port, p.Protocol,
		).Scan(&id, &isDefault)
		if err != nil || isDefault == 1 {
			continue // Don't delete default rules
		}

		if err := s.DeleteRule(id); err != nil {
			logger.Warn().Err(err).Str("port", p.Port).Str("software", softwareName).Msg("failed to auto-close port")
		}
	}
}

// UpdateDefaultPort updates the port of a default firewall rule identified by
// its current description. It removes the old UFW rule and applies the new one.
func (s *FirewallService) UpdateDefaultPort(description, newPort string) error {
	var id int64
	var oldPort string
	err := s.db.QueryRow(
		"SELECT id, port FROM firewall_rules WHERE description = ? AND is_default = 1 AND type = 'port' LIMIT 1",
		description,
	).Scan(&id, &oldPort)
	if err != nil {
		return fmt.Errorf("default rule for %s not found: %w", description, err)
	}

	if oldPort == newPort {
		return nil // no change
	}

	// Remove old UFW rule
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	system.Exec(ctx, "ufw", "delete", "allow", oldPort+"/tcp")

	// Update database
	if _, err := s.db.Exec("UPDATE firewall_rules SET port = ? WHERE id = ?", newPort, id); err != nil {
		return fmt.Errorf("failed to update default port: %w", err)
	}

	// Apply new UFW rule
	system.Exec(ctx, "ufw", "allow", newPort+"/tcp")

	logger.Info().Str("old", oldPort).Str("new", newPort).Str("desc", description).Msg("updated default firewall port")
	return nil
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func (s *FirewallService) getRuleByID(id int64) (*FirewallRule, error) {
	r := &FirewallRule{}
	var port, ip, description sql.NullString
	err := s.db.QueryRow(
		`SELECT id, type, protocol, port, ip, action, direction, description, status, sort_order, COALESCE(is_default, 0), created_at
		 FROM firewall_rules WHERE id = ?`, id,
	).Scan(&r.ID, &r.Type, &r.Protocol, &port, &ip, &r.Action,
		&r.Direction, &description, &r.Status, &r.SortOrder, &r.IsDefault, &r.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, apperrors.New(apperrors.ErrNotFound, "firewall rule not found")
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get firewall rule")
	}
	r.Port = port.String
	r.IP = ip.String
	r.Description = description.String
	return r, nil
}

// useFirewalld checks if firewalld is available and active.
func (s *FirewallService) useFirewalld() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := system.Exec(ctx, "systemctl", "is-active", "firewalld")
	if err != nil {
		return false
	}
	return strings.TrimSpace(result.Stdout) == "active"
}

// applyRule applies a firewall rule using iptables or firewalld.
func (s *FirewallService) applyRule(rule *FirewallRule) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if s.useFirewalld() {
		return s.applyRuleFirewalld(ctx, rule)
	}
	return s.applyRuleIptables(ctx, rule)
}

// removeRule removes a firewall rule using iptables or firewalld.
func (s *FirewallService) removeRule(rule *FirewallRule) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if s.useFirewalld() {
		return s.removeRuleFirewalld(ctx, rule)
	}
	return s.removeRuleIptables(ctx, rule)
}

func (s *FirewallService) applyRuleIptables(ctx context.Context, rule *FirewallRule) error {
	args := s.buildIptablesArgs("-A", rule)
	_, err := system.Exec(ctx, "iptables", args...)
	if err != nil {
		return fmt.Errorf("iptables apply failed: %w", err)
	}
	s.saveIptables(ctx)
	return nil
}

func (s *FirewallService) removeRuleIptables(ctx context.Context, rule *FirewallRule) error {
	args := s.buildIptablesArgs("-D", rule)
	_, err := system.Exec(ctx, "iptables", args...)
	if err != nil {
		return fmt.Errorf("iptables remove failed: %w", err)
	}
	s.saveIptables(ctx)
	return nil
}

func (s *FirewallService) buildIptablesArgs(action string, rule *FirewallRule) []string {
	chain := "INPUT"
	if rule.Direction == "out" {
		chain = "OUTPUT"
	}

	target := "ACCEPT"
	if rule.Action == "deny" {
		target = "DROP"
	}

	args := []string{action, chain}

	if rule.IP != "" {
		if rule.Direction == "out" {
			args = append(args, "-d", rule.IP)
		} else {
			args = append(args, "-s", rule.IP)
		}
	}

	if rule.Protocol != "" {
		args = append(args, "-p", rule.Protocol)
	}

	if rule.Port != "" {
		args = append(args, "--dport", rule.Port)
	}

	args = append(args, "-j", target)
	return args
}

func (s *FirewallService) applyRuleFirewalld(ctx context.Context, rule *FirewallRule) error {
	if rule.Type == "port" && rule.Port != "" {
		portProto := fmt.Sprintf("%s/%s", rule.Port, rule.Protocol)
		if rule.Action == "allow" {
			_, err := system.Exec(ctx, "firewall-cmd", "--permanent", "--add-port", portProto)
			if err != nil {
				return fmt.Errorf("firewalld add-port failed: %w", err)
			}
		} else {
			_, err := system.Exec(ctx, "firewall-cmd", "--permanent", "--add-rich-rule",
				fmt.Sprintf("rule family='ipv4' port port='%s' protocol='%s' drop", rule.Port, rule.Protocol))
			if err != nil {
				return fmt.Errorf("firewalld deny port failed: %w", err)
			}
		}
	} else if rule.Type == "ip" && rule.IP != "" {
		richRule := fmt.Sprintf("rule family='ipv4' source address='%s'", rule.IP)
		if rule.Action == "allow" {
			richRule += " accept"
		} else {
			richRule += " drop"
		}
		_, err := system.Exec(ctx, "firewall-cmd", "--permanent", "--add-rich-rule", richRule)
		if err != nil {
			return fmt.Errorf("firewalld add rich rule failed: %w", err)
		}
	}

	_, _ = system.Exec(ctx, "firewall-cmd", "--reload")
	return nil
}

func (s *FirewallService) removeRuleFirewalld(ctx context.Context, rule *FirewallRule) error {
	if rule.Type == "port" && rule.Port != "" {
		portProto := fmt.Sprintf("%s/%s", rule.Port, rule.Protocol)
		if rule.Action == "allow" {
			_, err := system.Exec(ctx, "firewall-cmd", "--permanent", "--remove-port", portProto)
			if err != nil {
				return fmt.Errorf("firewalld remove-port failed: %w", err)
			}
		} else {
			_, err := system.Exec(ctx, "firewall-cmd", "--permanent", "--remove-rich-rule",
				fmt.Sprintf("rule family='ipv4' port port='%s' protocol='%s' drop", rule.Port, rule.Protocol))
			if err != nil {
				return fmt.Errorf("firewalld remove deny port failed: %w", err)
			}
		}
	} else if rule.Type == "ip" && rule.IP != "" {
		richRule := fmt.Sprintf("rule family='ipv4' source address='%s'", rule.IP)
		if rule.Action == "allow" {
			richRule += " accept"
		} else {
			richRule += " drop"
		}
		_, err := system.Exec(ctx, "firewall-cmd", "--permanent", "--remove-rich-rule", richRule)
		if err != nil {
			return fmt.Errorf("firewalld remove rich rule failed: %w", err)
		}
	}

	_, _ = system.Exec(ctx, "firewall-cmd", "--reload")
	return nil
}

// saveIptables persists iptables rules to disk.
func (s *FirewallService) saveIptables(ctx context.Context) {
	// Try iptables-save to the standard location.
	result, err := system.Exec(ctx, "iptables-save")
	if err != nil {
		logger.Error().Err(err).Msg("failed to run iptables-save")
		return
	}

	if err := writeFileAtomic("/etc/iptables/rules.v4", result.Stdout); err != nil {
		// Fallback: try /etc/sysconfig/iptables for RHEL-based systems.
		if err2 := writeFileAtomic("/etc/sysconfig/iptables", result.Stdout); err2 != nil {
			logger.Error().Err(err).Msg("failed to save iptables rules")
		}
	}
}

// PortStatus represents whether a port is listening.
type PortStatus struct {
	Port      string `json:"port"`
	Listening bool   `json:"listening"`
	Protocol  string `json:"protocol"`
	Process   string `json:"process"`
}

// GetPortStatuses returns listening status for all ports.
func (s *FirewallService) GetPortStatuses() ([]PortStatus, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var statuses []PortStatus

	// Check TCP ports
	result, err := system.Exec(ctx, "ss", "-tlnp")
	if err == nil {
		for _, line := range strings.Split(result.Stdout, "\n") {
			fields := strings.Fields(line)
			if len(fields) < 5 || fields[0] == "State" {
				continue
			}
			addr := fields[3]
			port := ""
			if idx := strings.LastIndex(addr, ":"); idx >= 0 {
				port = addr[idx+1:]
			}
			proc := ""
			if len(fields) >= 6 {
				proc = fields[5]
			}
			if port != "" {
				statuses = append(statuses, PortStatus{Port: port, Listening: true, Protocol: "tcp", Process: proc})
			}
		}
	}

	// Check UDP ports
	result, err = system.Exec(ctx, "ss", "-ulnp")
	if err == nil {
		for _, line := range strings.Split(result.Stdout, "\n") {
			fields := strings.Fields(line)
			if len(fields) < 5 || fields[0] == "State" {
				continue
			}
			addr := fields[4]
			port := ""
			if idx := strings.LastIndex(addr, ":"); idx >= 0 {
				port = addr[idx+1:]
			}
			proc := ""
			if len(fields) >= 6 {
				proc = fields[5]
			}
			if port != "" {
				statuses = append(statuses, PortStatus{Port: port, Listening: true, Protocol: "udp", Process: proc})
			}
		}
	}

	return statuses, nil
}

// writeFileAtomic writes content to a file, creating parent dirs if needed.
func writeFileAtomic(path, content string) error {
	// Ensure parent directory exists.
	dir := path[:strings.LastIndex(path, "/")]
	if err := mkdirAll(dir); err != nil {
		return err
	}
	return writeFile(path, content)
}

func mkdirAll(dir string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := system.Exec(ctx, "mkdir", "-p", dir)
	return err
}

func writeFile(path, content string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := system.Exec(ctx, "/bin/bash", "-c",
		fmt.Sprintf("cat > %s << 'IPTABLES_EOF'\n%s\nIPTABLES_EOF", path, content))
	return err
}

// ---------------------------------------------------------------------------
// UFW install
// ---------------------------------------------------------------------------

// IsUFWInstalled checks whether UFW is installed on the system.
func (s *FirewallService) IsUFWInstalled() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := system.Exec(ctx, "which", "ufw")
	return err == nil
}

// InstallUFW installs UFW, enables it, and adds default allow rules
// for the panel port (8888), phpMyAdmin port (888), and SSH (22).
func (s *FirewallService) InstallUFW() error {
	osInfo := system.GetOSInfo()
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	logger.Info().Msg("installing UFW")

	// 1. Update package index
	if _, err := system.Exec(ctx, osInfo.PkgManager, "update", "-y"); err != nil {
		logger.Warn().Err(err).Msg("package index update had warnings")
	}

	// 2. Install UFW
	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", "ufw"); err != nil {
		return fmt.Errorf("failed to install ufw: %w", err)
	}

	// 3. Allow essential ports BEFORE enabling UFW (to avoid lockout)
	defaultPorts := []struct {
		Port string
		Desc string
	}{
		{"22", "SSH"},
		{"8888", "ITDLUPanel"},
		{"888", "phpMyAdmin"},
	}

	for _, p := range defaultPorts {
		if _, err := system.Exec(ctx, "ufw", "allow", p.Port+"/tcp"); err != nil {
			logger.Warn().Err(err).Str("port", p.Port).Msg("failed to pre-allow port in UFW")
		}
	}

	// 4. Enable UFW (non-interactive)
	if _, err := system.Exec(ctx, "ufw", "--force", "enable"); err != nil {
		return fmt.Errorf("failed to enable ufw: %w", err)
	}

	// 5. Add rules to the panel database
	for _, p := range defaultPorts {
		_, _ = s.AddRule(AddRuleRequest{
			Type:        "port",
			Port:        p.Port,
			Protocol:    "tcp",
			Action:      "allow",
			Direction:   "in",
			Description: p.Desc,
		})
	}

	// 6. Mark firewall as enabled in settings
	_, _ = s.db.Exec(
		"INSERT OR REPLACE INTO firewall_settings (key, value, updated_at) VALUES ('enabled', 'true', CURRENT_TIMESTAMP)",
	)

	logger.Info().Msg("UFW installed and enabled with default rules (22, 888, 8888)")
	return nil
}
