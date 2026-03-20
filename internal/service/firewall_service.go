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
	CreatedAt   string `json:"created_at"`
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
		`SELECT id, type, protocol, port, ip, action, direction, description, status, sort_order, created_at
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
			&r.Direction, &description, &r.Status, &r.SortOrder, &r.CreatedAt); err != nil {
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
// Internal helpers
// ---------------------------------------------------------------------------

func (s *FirewallService) getRuleByID(id int64) (*FirewallRule, error) {
	r := &FirewallRule{}
	var port, ip, description sql.NullString
	err := s.db.QueryRow(
		`SELECT id, type, protocol, port, ip, action, direction, description, status, sort_order, created_at
		 FROM firewall_rules WHERE id = ?`, id,
	).Scan(&r.ID, &r.Type, &r.Protocol, &port, &ip, &r.Action,
		&r.Direction, &description, &r.Status, &r.SortOrder, &r.CreatedAt)
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
