package v1

import (
	"database/sql"
	"errors"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// WAFHandler handles WAF API endpoints.
type WAFHandler struct {
	wafService *service.WAFService
}

// NewWAFHandler creates a new WAF handler.
func NewWAFHandler(db *sql.DB) *WAFHandler {
	return &WAFHandler{
		wafService: service.NewWAFService(db),
	}
}

// RegisterRoutes registers all WAF routes.
func (h *WAFHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	waf := rg.Group("/waf")
	waf.Use(authMW)
	{
		// Status & Service Management
		waf.GET("/status", rbac("waf.read"), h.GetStatus)
		waf.POST("/install", rbac("waf.manage"), h.Install)
		waf.POST("/uninstall", rbac("waf.manage"), h.Uninstall)
		waf.POST("/restart", rbac("waf.manage"), h.Restart)
		waf.GET("/config", rbac("waf.read"), h.GetConfigPaths)
		waf.GET("/config/:type", rbac("waf.read"), h.GetConfigContent)

		// Sites Management
		waf.GET("/sites", rbac("waf.read"), h.ListSites)
		waf.POST("/sites", rbac("waf.manage"), h.CreateSite)
		waf.GET("/sites/:id", rbac("waf.read"), h.GetSite)
		waf.PUT("/sites/:id", rbac("waf.manage"), h.UpdateSite)
		waf.DELETE("/sites/:id", rbac("waf.manage"), h.DeleteSite)
		waf.PUT("/sites/:id/toggle", rbac("waf.manage"), h.ToggleSite)

		// Rules Management
		waf.GET("/rules", rbac("waf.read"), h.ListRules)
		waf.POST("/rules", rbac("waf.manage"), h.CreateRule)
		waf.GET("/rules/:id", rbac("waf.read"), h.GetRule)
		waf.PUT("/rules/:id", rbac("waf.manage"), h.UpdateRule)
		waf.DELETE("/rules/:id", rbac("waf.manage"), h.DeleteRule)
		waf.PUT("/rules/:id/toggle", rbac("waf.manage"), h.ToggleRule)

		// OWASP Categories
		waf.GET("/rules/owasp", rbac("waf.read"), h.ListOWASPCategories)
		waf.PUT("/rules/owasp/:category", rbac("waf.manage"), h.UpdateOWASPCategory)

		// Logs
		waf.GET("/logs", rbac("waf.read"), h.GetLogs)
		waf.DELETE("/logs", rbac("waf.manage"), h.ClearLogs)
		waf.GET("/logs/stats", rbac("waf.read"), h.GetOverviewStats)

		// Settings
		waf.GET("/settings", rbac("waf.read"), h.GetSettings)
		waf.PUT("/settings", rbac("waf.manage"), h.UpdateSettings)

		// IP Management
		waf.GET("/ip", rbac("waf.read"), h.ListIPEntries)
		waf.POST("/ip", rbac("waf.manage"), h.AddIPEntry)
		waf.PUT("/ip/:id", rbac("waf.manage"), h.UpdateIPEntry)
		waf.DELETE("/ip/:id", rbac("waf.manage"), h.RemoveIPEntry)
		waf.POST("/ip/:id/clear-hits", rbac("waf.manage"), h.ClearIPHits)

		// Statistics
		waf.GET("/stats", rbac("waf.read"), h.GetWAFStats)

		// Traffic Monitoring
		waf.GET("/traffic", rbac("waf.read"), h.GetTrafficStats)
		waf.GET("/slow-requests", rbac("waf.read"), h.GetSlowRequests)

		// URI Management
		waf.GET("/uri", rbac("waf.read"), h.ListURIEntries)
		waf.POST("/uri", rbac("waf.manage"), h.AddURIEntry)
		waf.DELETE("/uri/:id", rbac("waf.manage"), h.RemoveURIEntry)
		waf.PUT("/uri/:id/toggle", rbac("waf.manage"), h.ToggleURIEntry)

		// LUA Scripts
		waf.GET("/lua", rbac("waf.read"), h.ListLuaScripts)
		waf.POST("/lua", rbac("waf.manage"), h.CreateLuaScript)
		waf.PUT("/lua/:id", rbac("waf.manage"), h.UpdateLuaScript)
		waf.DELETE("/lua/:id", rbac("waf.manage"), h.DeleteLuaScript)
		waf.PUT("/lua/:id/toggle", rbac("waf.manage"), h.ToggleLuaScript)

		// User-Agent List
		waf.GET("/ua", rbac("waf.read"), h.ListUAEntries)
		waf.POST("/ua", rbac("waf.manage"), h.AddUAEntry)
		waf.DELETE("/ua/:id", rbac("waf.manage"), h.RemoveUAEntry)
		waf.PUT("/ua/:id/toggle", rbac("waf.manage"), h.ToggleUAEntry)

		// Geo Statistics
		waf.GET("/geo-stats", rbac("waf.read"), h.GetGeoStats)

		// Attack Feed (real-time)
		waf.GET("/attack-feed", rbac("waf.read"), h.GetAttackFeed)
	}
}

// GetStatus returns the WAF service status.
func (h *WAFHandler) GetStatus(c *gin.Context) {
	status, err := h.wafService.GetStatus()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, status)
}

// Install installs the WAF.
func (h *WAFHandler) Install(c *gin.Context) {
	if err := h.wafService.InstallWAF(); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "WAF installed successfully"})
}

// Uninstall uninstalls the WAF.
func (h *WAFHandler) Uninstall(c *gin.Context) {
	if err := h.wafService.UninstallWAF(); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "WAF uninstalled successfully"})
}

// Restart restarts the WAF service.
func (h *WAFHandler) Restart(c *gin.Context) {
	if err := h.wafService.RestartWAF(); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "WAF restarted successfully"})
}

// GetConfigPaths returns the paths to config files.
func (h *WAFHandler) GetConfigPaths(c *gin.Context) {
	haproxy, coraza, spoa := h.wafService.GetConfigPaths()
	response.Success(c, gin.H{
		"haproxy": haproxy,
		"coraza":  coraza,
		"spoa":    spoa,
	})
}

// GetConfigContent returns the content of a config file.
func (h *WAFHandler) GetConfigContent(c *gin.Context) {
	configType := c.Param("type")
	content, err := h.wafService.GetConfigContent(configType)
	if err != nil {
		response.Error(c, err)
		return
	}
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.String(200, content)
}

// ListSites returns all WAF-protected sites.
func (h *WAFHandler) ListSites(c *gin.Context) {
	sites, err := h.wafService.ListSites()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, sites)
}

// GetSite returns a single site.
func (h *WAFHandler) GetSite(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	site, err := h.wafService.GetSite(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, site)
}

// CreateSite creates a new site.
func (h *WAFHandler) CreateSite(c *gin.Context) {
	var req service.WAFSiteInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	site, err := h.wafService.CreateSite(req)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, site)
}

// UpdateSite updates a site.
func (h *WAFHandler) UpdateSite(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	var req service.WAFSiteInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	site, err := h.wafService.UpdateSite(id, req)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, site)
}

// DeleteSite deletes a site.
func (h *WAFHandler) DeleteSite(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.DeleteSite(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "Site deleted successfully"})
}

// ToggleSite enables or disables a site.
func (h *WAFHandler) ToggleSite(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.ToggleSite(id, req.Enabled); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "Site toggled successfully"})
}

// ListRules returns all WAF rules.
func (h *WAFHandler) ListRules(c *gin.Context) {
	ruleType := c.Query("type")
	category := c.Query("category")
	var enabled *bool
	if e := c.Query("enabled"); e != "" {
		b := e == "true" || e == "1"
		enabled = &b
	}
	rules, err := h.wafService.ListRules(ruleType, category, enabled)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, rules)
}

// GetRule returns a single rule.
func (h *WAFHandler) GetRule(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	rule, err := h.wafService.GetRule(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, rule)
}

// CreateRule creates a new rule.
func (h *WAFHandler) CreateRule(c *gin.Context) {
	var req service.WAFRuleInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	rule, err := h.wafService.CreateRule(req)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, rule)
}

// UpdateRule updates a rule.
func (h *WAFHandler) UpdateRule(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	var req service.WAFRuleInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	rule, err := h.wafService.UpdateRule(id, req)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, rule)
}

// DeleteRule deletes a rule.
func (h *WAFHandler) DeleteRule(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.DeleteRule(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "Rule deleted successfully"})
}

// ToggleRule enables or disables a rule.
func (h *WAFHandler) ToggleRule(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.ToggleRule(id, req.Enabled); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "Rule toggled successfully"})
}

// ListOWASPCategories returns OWASP rule categories.
func (h *WAFHandler) ListOWASPCategories(c *gin.Context) {
	cats, err := h.wafService.ListOWASPCategories()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, cats)
}

// UpdateOWASPCategory toggles an OWASP category.
func (h *WAFHandler) UpdateOWASPCategory(c *gin.Context) {
	category := c.Param("category")
	if category == "" {
		response.Error(c, errors.New("category parameter is required"))
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.UpdateOWASPCategory(category, req.Enabled); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "Category updated successfully"})
}

// GetLogs returns WAF logs with filtering.
func (h *WAFHandler) GetLogs(c *gin.Context) {
	var query service.WAFLogQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Error(c, err)
		return
	}
	logs, total, err := h.wafService.GetLogs(query)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Paginated(c, logs, response.Pagination{Page: query.Page, PerPage: query.PageSize, Total: int64(total)})
}

// ClearLogs clears WAF logs.
func (h *WAFHandler) ClearLogs(c *gin.Context) {
	var req struct {
		BeforeDate string `json:"before_date"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.BeforeDate = time.Now().AddDate(0, 0, -30).Format("2006-01-02")
	}
	if err := h.wafService.ClearLogs(req.BeforeDate); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "Logs cleared successfully"})
}

// GetOverviewStats returns overview statistics for the dashboard.
func (h *WAFHandler) GetOverviewStats(c *gin.Context) {
	stats, err := h.wafService.GetOverviewStats()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, stats)
}

// GetSettings returns global WAF settings.
func (h *WAFHandler) GetSettings(c *gin.Context) {
	settings, err := h.wafService.GetSettings()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, settings)
}

// UpdateSettings updates global WAF settings.
func (h *WAFHandler) UpdateSettings(c *gin.Context) {
	var settings service.WAFSettings
	if err := c.ShouldBindJSON(&settings); err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.UpdateSettings(settings); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "Settings updated successfully"})
}

// ListIPEntries returns IP whitelist/blacklist entries.
func (h *WAFHandler) ListIPEntries(c *gin.Context) {
	listType := c.Query("type")
	entries, err := h.wafService.ListIPEntries(listType)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, entries)
}

// AddIPEntry adds an IP to whitelist/blacklist.
func (h *WAFHandler) AddIPEntry(c *gin.Context) {
	var req struct {
		IPAddress  string  `json:"ip_address" binding:"required"`
		ListType  string  `json:"list_type" binding:"required"`
		Description *string `json:"description"`
		ExpiresAt *string `json:"expires_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	var expiresAt *time.Time
	if req.ExpiresAt != nil {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err == nil {
			expiresAt = &t
		}
	}
	entry, err := h.wafService.AddIPEntry(req.IPAddress, req.ListType, req.Description, expiresAt)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, entry)
}

// UpdateIPEntry updates an IP entry.
func (h *WAFHandler) UpdateIPEntry(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	var req struct {
		Description *string `json:"description"`
		ExpiresAt  *string `json:"expires_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	var expiresAt *time.Time
	if req.ExpiresAt != nil {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err == nil {
			expiresAt = &t
		}
	}
	entry, err := h.wafService.UpdateIPEntry(id, req.Description, expiresAt)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, entry)
}

// RemoveIPEntry removes an IP from the list.
func (h *WAFHandler) RemoveIPEntry(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.RemoveIPEntry(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "IP entry removed successfully"})
}

// ClearIPHits clears hit count for an IP entry.
func (h *WAFHandler) ClearIPHits(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.ClearIPHits(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "IP hits cleared successfully"})
}

// GetWAFStats returns WAF statistics.
func (h *WAFHandler) GetWAFStats(c *gin.Context) {
	period := c.DefaultQuery("period", "daily")
	periodKey := c.DefaultQuery("period_key", time.Now().Format("2006-01-02"))
	var siteID *int
	if s := c.Query("site_id"); s != "" {
		if id, err := strconv.Atoi(s); err == nil {
			siteID = &id
		}
	}
	stats, err := h.wafService.GetStats(siteID, period, periodKey)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, stats)
}

// GetTrafficStats returns traffic statistics.
func (h *WAFHandler) GetTrafficStats(c *gin.Context) {
	period := c.DefaultQuery("period", "hourly")
	var siteID *int
	if s := c.Query("site_id"); s != "" {
		if id, err := strconv.Atoi(s); err == nil {
			siteID = &id
		}
	}
	stats, err := h.wafService.GetTrafficStats(siteID, period)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, stats)
}

// GetSlowRequests returns slow requests.
func (h *WAFHandler) GetSlowRequests(c *gin.Context) {
	var siteID *int
	if s := c.Query("site_id"); s != "" {
		if id, err := strconv.Atoi(s); err == nil {
			siteID = &id
		}
	}
	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}
	requests, err := h.wafService.GetSlowRequests(siteID, limit)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, requests)
}

// ListURIEntries returns URI whitelist/blacklist entries.
func (h *WAFHandler) ListURIEntries(c *gin.Context) {
	listType := c.Query("type")
	entries, err := h.wafService.ListURIEntries(listType)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, entries)
}

// AddURIEntry adds a URI to whitelist/blacklist.
func (h *WAFHandler) AddURIEntry(c *gin.Context) {
	var req struct {
		URIPattern  string  `json:"uri_pattern" binding:"required"`
		ListType    string  `json:"list_type" binding:"required"`
		Action      string  `json:"action"`
		Description *string `json:"description"`
		Priority    *int    `json:"priority"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	entry, err := h.wafService.AddURIEntry(req.URIPattern, req.ListType, req.Action, req.Description, req.Priority)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, entry)
}

// RemoveURIEntry removes a URI from the list.
func (h *WAFHandler) RemoveURIEntry(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.RemoveURIEntry(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "URI entry removed successfully"})
}

// ToggleURIEntry enables or disables a URI entry.
func (h *WAFHandler) ToggleURIEntry(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.ToggleURIEntry(id, req.Enabled); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "URI entry toggled successfully"})
}

// ListLuaScripts returns Lua scripts.
func (h *WAFHandler) ListLuaScripts(c *gin.Context) {
	scripts, err := h.wafService.ListLuaScripts()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, scripts)
}

// CreateLuaScript creates a new Lua script.
func (h *WAFHandler) CreateLuaScript(c *gin.Context) {
	var req service.WAFLuaScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	script, err := h.wafService.CreateLuaScript(req)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, script)
}

// UpdateLuaScript updates a Lua script.
func (h *WAFHandler) UpdateLuaScript(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	var req service.WAFLuaScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	script, err := h.wafService.UpdateLuaScript(id, req)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, script)
}

// DeleteLuaScript deletes a Lua script.
func (h *WAFHandler) DeleteLuaScript(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.DeleteLuaScript(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "Lua script deleted successfully"})
}

// ToggleLuaScript enables or disables a Lua script.
func (h *WAFHandler) ToggleLuaScript(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.ToggleLuaScript(id, req.Enabled); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "Lua script toggled successfully"})
}

// ListUAEntries returns User-Agent whitelist/blacklist entries.
func (h *WAFHandler) ListUAEntries(c *gin.Context) {
	listType := c.Query("type")
	entries, err := h.wafService.ListUAEntries(listType)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, entries)
}

// AddUAEntry adds a User-Agent to whitelist/blacklist.
func (h *WAFHandler) AddUAEntry(c *gin.Context) {
	var req struct {
		UAPattern   string  `json:"ua_pattern" binding:"required"`
		ListType    string  `json:"list_type" binding:"required"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	entry, err := h.wafService.AddUAEntry(req.UAPattern, req.ListType, req.Description)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, entry)
}

// RemoveUAEntry removes a User-Agent entry.
func (h *WAFHandler) RemoveUAEntry(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.RemoveUAEntry(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "User-Agent entry removed successfully"})
}

// ToggleUAEntry enables or disables a User-Agent entry.
func (h *WAFHandler) ToggleUAEntry(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}
	if err := h.wafService.ToggleUAEntry(id, req.Enabled); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "User-Agent entry toggled successfully"})
}

// GetGeoStats returns geographic attack statistics.
func (h *WAFHandler) GetGeoStats(c *gin.Context) {
	period := c.DefaultQuery("period", "daily")
	var siteID *int
	if s := c.Query("site_id"); s != "" {
		if id, err := strconv.Atoi(s); err == nil {
			siteID = &id
		}
	}
	stats, err := h.wafService.GetGeoStats(siteID, period)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, stats)
}

// GetAttackFeed returns the latest attack events for real-time feed.
func (h *WAFHandler) GetAttackFeed(c *gin.Context) {
	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 200 {
			limit = parsed
		}
	}
	feed, err := h.wafService.GetAttackFeed(limit)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, feed)
}
