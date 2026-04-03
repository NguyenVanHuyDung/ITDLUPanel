package v1

import (
	"fmt"
	"strconv"

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
func (h *SecurityHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	// Firewall routes
	firewall := rg.Group("/firewall")
	firewall.Use(authMW)
	{
		firewall.GET("/rules", rbac("firewall.read"), h.ListRules)
		firewall.POST("/rules", rbac("firewall.manage"), h.AddRule)
		firewall.DELETE("/rules/:id", rbac("firewall.manage"), h.DeleteRule)
		firewall.PUT("/rules/:id/status", rbac("firewall.manage"), h.ToggleRule)

		firewall.GET("/settings", rbac("firewall.read"), h.GetFirewallSettings)
		firewall.PUT("/settings", rbac("firewall.manage"), h.UpdateFirewallSettings)

		firewall.GET("/port-status", rbac("firewall.read"), h.GetPortStatuses)
		firewall.GET("/blocked-ips", rbac("firewall.read"), h.GetBlockedIPs)
		firewall.POST("/blocked-ips", rbac("firewall.manage"), h.BlockIP)
		firewall.DELETE("/blocked-ips", rbac("firewall.manage"), h.UnblockIP)

		firewall.GET("/status", rbac("firewall.read"), h.GetFirewallStatus)
		firewall.POST("/install", rbac("firewall.manage"), h.InstallUFW)
	}

	// Security routes
	security := rg.Group("/security")
	security.Use(authMW)
	{
		security.GET("/ssh", rbac("security.manage"), h.GetSSHConfig)
		security.PUT("/ssh", rbac("security.manage"), h.UpdateSSHConfig)
		security.PUT("/root-password", rbac("security.manage"), h.ChangeRootPassword)
		security.GET("/ssh/users", rbac("security.manage"), h.ListSSHUsers)
		security.GET("/ssh/keys/:username", rbac("security.manage"), h.GetAuthorizedKeys)
		security.POST("/ssh/keys/:username", rbac("security.manage"), h.AddAuthorizedKey)
		security.DELETE("/ssh/keys/:username/:fingerprint", rbac("security.manage"), h.RemoveAuthorizedKey)
		security.POST("/ssh/keys/:username/generate", rbac("security.manage"), h.GenerateSSHKeyPair)
		security.GET("/ssh/keys/:username/public", rbac("security.manage"), h.GetUserPublicKeys)
		security.GET("/ssh/keys/:username/download-private", rbac("security.manage"), h.DownloadPrivateKey)

		// Fail2ban routes
		security.GET("/fail2ban", rbac("security.manage"), h.GetFail2banStatus)
		security.PUT("/fail2ban", rbac("security.manage"), h.ConfigureFail2ban)
		security.POST("/fail2ban/install", rbac("security.manage"), h.InstallFail2ban)
		security.POST("/fail2ban/uninstall", rbac("security.manage"), h.UninstallFail2ban)
		security.GET("/fail2ban/config", rbac("security.manage"), h.GetFail2banGlobalConfig)
		security.PUT("/fail2ban/config", rbac("security.manage"), h.UpdateFail2banGlobalConfig)
		security.GET("/fail2ban/jails", rbac("security.manage"), h.GetJails)
		security.POST("/fail2ban/jails", rbac("security.manage"), h.AddOrUpdateJail)
		security.DELETE("/fail2ban/jails/:name", rbac("security.manage"), h.RemoveJail)
		security.POST("/fail2ban/ban", rbac("security.manage"), h.BanIP)
		security.POST("/fail2ban/unban", rbac("security.manage"), h.UnbanIP)
		security.GET("/fail2ban/log", rbac("security.manage"), h.GetFail2banLog)
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

// InstallFail2ban installs fail2ban on the system.
func (h *SecurityHandler) InstallFail2ban(c *gin.Context) {
	if err := h.securityService.InstallFail2ban(); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "fail2ban installed successfully"})
}

// UninstallFail2ban removes fail2ban from the system.
func (h *SecurityHandler) UninstallFail2ban(c *gin.Context) {
	if err := h.securityService.UninstallFail2ban(); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "fail2ban removed successfully"})
}

// GetFail2banGlobalConfig returns global fail2ban defaults and whitelist.
func (h *SecurityHandler) GetFail2banGlobalConfig(c *gin.Context) {
	cfg, err := h.securityService.GetGlobalConfig()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, cfg)
}

// UpdateFail2banGlobalConfig updates global fail2ban defaults and whitelist.
func (h *SecurityHandler) UpdateFail2banGlobalConfig(c *gin.Context) {
	var req service.Fail2banGlobalConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}
	if err := h.securityService.UpdateGlobalConfig(req); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "global config updated"})
}

// GetJails returns configured jails.
func (h *SecurityHandler) GetJails(c *gin.Context) {
	jails, err := h.securityService.GetJails()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, jails)
}

// AddOrUpdateJail adds or updates a jail.
func (h *SecurityHandler) AddOrUpdateJail(c *gin.Context) {
	var req service.JailConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}
	if req.Name == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "name", Message: "jail name is required"},
		})
		return
	}
	if err := h.securityService.AddOrUpdateJail(req); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "jail configured"})
}

// RemoveJail removes a jail by name.
func (h *SecurityHandler) RemoveJail(c *gin.Context) {
	name := c.Param("name")
	if err := h.securityService.RemoveJail(name); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "jail removed"})
}

type banIPRequest struct {
	Jail string `json:"jail" validate:"required"`
	IP   string `json:"ip" validate:"required"`
}

// BanIP manually bans an IP.
func (h *SecurityHandler) BanIP(c *gin.Context) {
	var req banIPRequest
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
	if err := h.securityService.BanIP(req.Jail, req.IP); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "IP banned"})
}

// UnbanIP unbans an IP.
func (h *SecurityHandler) UnbanIP(c *gin.Context) {
	var req banIPRequest
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
	if err := h.securityService.UnbanIP(req.Jail, req.IP); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "IP unbanned"})
}

// GetFail2banLog returns the fail2ban log.
func (h *SecurityHandler) GetFail2banLog(c *gin.Context) {
	lines := 200
	if v := c.Query("lines"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			lines = n
		}
	}
	log, err := h.securityService.GetFail2banLog(lines)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, log)
}

// ---------------------------------------------------------------------------
// Root password
// ---------------------------------------------------------------------------

// ChangeRootPassword changes the system root password.
func (h *SecurityHandler) ChangeRootPassword(c *gin.Context) {
	var req service.ChangeRootPasswordRequest
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

	if err := h.securityService.ChangeRootPassword(req.Password); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "root password changed successfully"})
}

// ---------------------------------------------------------------------------
// SSH key management
// ---------------------------------------------------------------------------

// ListSSHUsers returns system users that can have SSH keys.
func (h *SecurityHandler) ListSSHUsers(c *gin.Context) {
	users, err := h.securityService.ListSystemUsers()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, users)
}

// GetAuthorizedKeys returns authorized_keys for a user.
func (h *SecurityHandler) GetAuthorizedKeys(c *gin.Context) {
	username := c.Param("username")
	keys, err := h.securityService.GetAuthorizedKeys(username)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, keys)
}

type addKeyRequest struct {
	PublicKey string `json:"public_key" validate:"required"`
}

// AddAuthorizedKey adds a public key for a user.
func (h *SecurityHandler) AddAuthorizedKey(c *gin.Context) {
	username := c.Param("username")
	var req addKeyRequest
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

	if err := h.securityService.AddAuthorizedKey(username, req.PublicKey); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "key added successfully"})
}

// RemoveAuthorizedKey removes a key by fingerprint.
func (h *SecurityHandler) RemoveAuthorizedKey(c *gin.Context) {
	username := c.Param("username")
	fingerprint := c.Param("fingerprint")
	if err := h.securityService.RemoveAuthorizedKey(username, fingerprint); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "key removed successfully"})
}

type generateKeyRequest struct {
	KeyType string `json:"key_type"`
}

// GenerateSSHKeyPair generates a new key pair for a user.
func (h *SecurityHandler) GenerateSSHKeyPair(c *gin.Context) {
	username := c.Param("username")
	var req generateKeyRequest
	c.ShouldBindJSON(&req)

	pair, err := h.securityService.GenerateSSHKeyPair(username, req.KeyType)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, pair)
}

// GetUserPublicKeys returns the user's own public key files.
func (h *SecurityHandler) GetUserPublicKeys(c *gin.Context) {
	username := c.Param("username")
	keys, err := h.securityService.GetUserPublicKeys(username)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, keys)
}

// DownloadPrivateKey returns the private key content for download.
func (h *SecurityHandler) DownloadPrivateKey(c *gin.Context) {
	username := c.Param("username")
	keyType := c.DefaultQuery("type", "ed25519")

	content, err := h.securityService.GetPrivateKey(username, keyType)
	if err != nil {
		response.Error(c, err)
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=id_%s_%s", keyType, username))
	c.Header("Content-Type", "application/x-pem-file")
	c.String(200, content)
}

// GetFirewallStatus returns whether UFW is installed and active.
func (h *SecurityHandler) GetFirewallStatus(c *gin.Context) {
	installed := h.firewallService.IsUFWInstalled()
	response.Success(c, gin.H{
		"ufw_installed": installed,
	})
}

// InstallUFW installs UFW and adds default rules.
func (h *SecurityHandler) InstallUFW(c *gin.Context) {
	if h.firewallService.IsUFWInstalled() {
		response.Success(c, gin.H{"message": "UFW is already installed"})
		return
	}

	if err := h.firewallService.InstallUFW(); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "UFW installed and enabled with default rules (ports 22, 888, 8888)"})
}
