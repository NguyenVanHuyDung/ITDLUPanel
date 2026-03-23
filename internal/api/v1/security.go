package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/pkg/validator"
	"github.com/ITDLUPanel/panel/internal/service"
)

// SecurityHandler handles firewall and security API endpoints.
type SecurityHandler struct {
	firewallService *service.FirewallService
	securityService *service.SecurityService
}

// NewSecurityHandler creates a new SecurityHandler.
func NewSecurityHandler(firewallService *service.FirewallService, securityService *service.SecurityService) *SecurityHandler {
	return &SecurityHandler{
		firewallService: firewallService,
		securityService: securityService,
	}
}

// RegisterRoutes registers all firewall and security routes.
func (h *SecurityHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, securityMW gin.HandlerFunc) {
	// Firewall routes
	firewall := rg.Group("/firewall")
	firewall.Use(authMW, securityMW)
	{
		firewall.GET("/rules", h.ListRules)
		firewall.POST("/rules", h.AddRule)
		firewall.DELETE("/rules/:id", h.DeleteRule)
		firewall.PUT("/rules/:id/status", h.ToggleRule)

		firewall.GET("/settings", h.GetFirewallSettings)
		firewall.PUT("/settings", h.UpdateFirewallSettings)

		firewall.GET("/port-status", h.GetPortStatuses)
		firewall.GET("/blocked-ips", h.GetBlockedIPs)
		firewall.POST("/blocked-ips", h.BlockIP)
		firewall.DELETE("/blocked-ips", h.UnblockIP)
	}

	// Security routes
	security := rg.Group("/security")
	security.Use(authMW, securityMW)
	{
		security.GET("/ssh", h.GetSSHConfig)
		security.PUT("/ssh", h.UpdateSSHConfig)
		security.GET("/fail2ban", h.GetFail2banStatus)
		security.PUT("/fail2ban", h.ConfigureFail2ban)
	}
}

// ---------------------------------------------------------------------------
// Firewall settings
// ---------------------------------------------------------------------------

// GetFirewallSettings returns global firewall settings.
func (h *SecurityHandler) GetFirewallSettings(c *gin.Context) {
	settings, err := h.firewallService.GetSettings()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, settings)
}

type updateFirewallSettingsRequest struct {
	Key   string `json:"key" validate:"required,oneof=enabled icmp_block"`
	Value bool   `json:"value"`
}

// UpdateFirewallSettings updates a global firewall setting.
func (h *SecurityHandler) UpdateFirewallSettings(c *gin.Context) {
	var req updateFirewallSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	if err := h.firewallService.UpdateSettings(req.Key, req.Value); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "firewall setting updated successfully"})
}

// ---------------------------------------------------------------------------
// Firewall rules
// ---------------------------------------------------------------------------

// ListRules returns all firewall rules.
func (h *SecurityHandler) ListRules(c *gin.Context) {
	rules, err := h.firewallService.ListRules()
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, rules)
}

// AddRule creates a new firewall rule.
func (h *SecurityHandler) AddRule(c *gin.Context) {
	var req service.AddRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	rule, err := h.firewallService.AddRule(req)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, rule)
}

// DeleteRule removes a firewall rule.
func (h *SecurityHandler) DeleteRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if err := h.firewallService.DeleteRule(id); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "firewall rule deleted successfully"})
}

type toggleRuleRequest struct {
	Enabled bool `json:"enabled"`
}

// ToggleRule enables or disables a firewall rule.
func (h *SecurityHandler) ToggleRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req toggleRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if err := h.firewallService.ToggleRule(id, req.Enabled); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "firewall rule status updated successfully"})
}

// ---------------------------------------------------------------------------
// Port status
// ---------------------------------------------------------------------------

// GetPortStatuses returns listening status for all ports.
func (h *SecurityHandler) GetPortStatuses(c *gin.Context) {
	statuses, err := h.firewallService.GetPortStatuses()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, statuses)
}

// ---------------------------------------------------------------------------
// IP blocking
// ---------------------------------------------------------------------------

// GetBlockedIPs returns all blocked IP addresses.
func (h *SecurityHandler) GetBlockedIPs(c *gin.Context) {
	ips, err := h.firewallService.GetBlockedIPs()
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, ips)
}

type blockIPRequest struct {
	IP string `json:"ip" validate:"required"`
}

// BlockIP blocks an IP address.
func (h *SecurityHandler) BlockIP(c *gin.Context) {
	var req blockIPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	if err := h.firewallService.BlockIP(req.IP); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "IP blocked successfully"})
}

type unblockIPRequest struct {
	IP string `json:"ip" validate:"required"`
}

// UnblockIP unblocks an IP address.
func (h *SecurityHandler) UnblockIP(c *gin.Context) {
	var req unblockIPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	if err := h.firewallService.UnblockIP(req.IP); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "IP unblocked successfully"})
}

// ---------------------------------------------------------------------------
// SSH config
// ---------------------------------------------------------------------------

// GetSSHConfig returns the current SSH configuration.
func (h *SecurityHandler) GetSSHConfig(c *gin.Context) {
	config, err := h.securityService.GetSSHConfig()
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, config)
}

// UpdateSSHConfig updates the SSH daemon configuration.
func (h *SecurityHandler) UpdateSSHConfig(c *gin.Context) {
	var req service.UpdateSSHRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	if err := h.securityService.UpdateSSHConfig(req); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "SSH configuration updated successfully"})
}

// ---------------------------------------------------------------------------
// Fail2ban
// ---------------------------------------------------------------------------

// GetFail2banStatus returns the current fail2ban status.
func (h *SecurityHandler) GetFail2banStatus(c *gin.Context) {
	status, err := h.securityService.GetFail2banStatus()
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, status)
}

// ConfigureFail2ban updates fail2ban configuration.
func (h *SecurityHandler) ConfigureFail2ban(c *gin.Context) {
	var req service.Fail2banConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	if err := h.securityService.ConfigureFail2ban(req); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "fail2ban configuration updated successfully"})
}
