package v1

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/pkg/validator"
	"github.com/ITDLUPanel/panel/internal/service"
)

// SiteHandler handles website management API endpoints.
type SiteHandler struct {
	siteService *service.SiteService
}

// NewSiteHandler creates a new SiteHandler.
func NewSiteHandler(siteService *service.SiteService) *SiteHandler {
	return &SiteHandler{siteService: siteService}
}

// RegisterRoutes registers all site management routes.
func (h *SiteHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	sites := rg.Group("/sites")
	sites.Use(authMW)
	{
		sites.GET("", rbac("sites.read"), h.ListSites)
		sites.POST("", rbac("sites.create"), h.CreateSite)
		sites.GET("/php-versions", rbac("sites.read"), h.ListPHPVersions)
		sites.GET("/rewrite-templates", rbac("sites.read"), h.ListRewriteTemplates)
		sites.GET("/rewrite-templates/:name", rbac("sites.read"), h.GetRewriteTemplate)

		// Batch operations
		sites.POST("/batch/delete", rbac("sites.delete"), h.BatchDeleteSites)
		sites.PUT("/batch/php", rbac("sites.edit"), h.BatchSwitchPHP)
		sites.POST("/batch/ssl", rbac("sites.ssl"), h.BatchApplySSL)

		sites.GET("/:id", rbac("sites.read"), h.GetSite)
		sites.PUT("/:id", rbac("sites.edit"), h.UpdateSite)
		sites.DELETE("/:id", rbac("sites.delete"), h.DeleteSite)

		// Operations
		sites.POST("/:id/start", rbac("sites.edit"), h.StartSite)
		sites.POST("/:id/stop", rbac("sites.edit"), h.StopSite)
		sites.GET("/:id/config", rbac("sites.config"), h.GetConfig)
		sites.PUT("/:id/config", rbac("sites.config"), h.UpdateConfig)
		sites.PUT("/:id/php", rbac("sites.edit"), h.SwitchPHP)

		// Domains
		sites.POST("/:id/domains", rbac("sites.edit"), h.AddDomain)
		sites.DELETE("/:id/domains/:did", rbac("sites.edit"), h.RemoveDomain)
		sites.GET("/:id/domains", rbac("sites.read"), h.ListDomains)

		// SSL
		sites.GET("/:id/ssl", rbac("sites.ssl"), h.GetSSLInfo)
		sites.POST("/:id/ssl/enable", rbac("sites.ssl"), h.EnableSSL)
		sites.POST("/:id/ssl/disable", rbac("sites.ssl"), h.DisableSSL)
		sites.POST("/:id/ssl/apply", rbac("sites.ssl"), h.ApplySSLFromHolder)
		sites.GET("/:id/force-https", rbac("sites.ssl"), h.GetForceHTTPS)
		sites.PUT("/:id/force-https", rbac("sites.ssl"), h.SetForceHTTPS)

		// Directory management
		sites.PUT("/:id/directory", rbac("sites.config"), h.UpdateDirectory)
		sites.GET("/:id/subdirs", rbac("sites.config"), h.ListSubdirs)
		sites.PUT("/:id/running-directory", rbac("sites.config"), h.SetRunningDirectory)
		sites.GET("/:id/open-basedir", rbac("sites.config"), h.GetOpenBasedir)
		sites.PUT("/:id/open-basedir", rbac("sites.config"), h.SetOpenBasedir)
		sites.GET("/:id/access-log", rbac("sites.config"), h.GetAccessLog)
		sites.PUT("/:id/access-log", rbac("sites.config"), h.SetAccessLog)
		sites.GET("/:id/password-access", rbac("sites.config"), h.GetPasswordAccess)
		sites.PUT("/:id/password-access", rbac("sites.config"), h.SetPasswordAccess)

		// Sub Directory Binding
		sites.GET("/:id/subdir-bindings", rbac("sites.config"), h.GetSubdirBindings)
		sites.POST("/:id/subdir-bindings", rbac("sites.config"), h.AddSubdirBinding)
		sites.DELETE("/:id/subdir-bindings/:index", rbac("sites.config"), h.RemoveSubdirBinding)

		// Limit Access
		sites.GET("/:id/limit-access", rbac("sites.config"), h.GetLimitAccessRules)
		sites.POST("/:id/limit-access", rbac("sites.config"), h.AddLimitAccessRule)
		sites.DELETE("/:id/limit-access/:index", rbac("sites.config"), h.RemoveLimitAccessRule)

		// Deny Access
		sites.GET("/:id/deny-access", rbac("sites.config"), h.GetDenyAccessRules)
		sites.POST("/:id/deny-access", rbac("sites.config"), h.AddDenyAccessRule)
		sites.DELETE("/:id/deny-access/:index", rbac("sites.config"), h.RemoveDenyAccessRule)

		// Traffic Control
		sites.GET("/:id/traffic-control", rbac("sites.config"), h.GetTrafficControl)
		sites.PUT("/:id/traffic-control", rbac("sites.config"), h.SetTrafficControl)

		// Default Document
		sites.GET("/:id/default-doc", rbac("sites.config"), h.GetDefaultDoc)
		sites.PUT("/:id/default-doc", rbac("sites.config"), h.SetDefaultDoc)

		// Reverse Proxy
		sites.GET("/:id/reverse-proxy", rbac("sites.config"), h.GetReverseProxyRules)
		sites.POST("/:id/reverse-proxy", rbac("sites.config"), h.AddReverseProxyRule)
		sites.PUT("/:id/reverse-proxy/:index", rbac("sites.config"), h.UpdateReverseProxyRule)
		sites.DELETE("/:id/reverse-proxy/:index", rbac("sites.config"), h.RemoveReverseProxyRule)

		// Redirect Rules
		sites.GET("/:id/redirect-rules", rbac("sites.config"), h.GetRedirectRules)
		sites.POST("/:id/redirect-rules", rbac("sites.config"), h.AddRedirectRule)
		sites.PUT("/:id/redirect-rules/:index", rbac("sites.config"), h.UpdateRedirectRule)
		sites.DELETE("/:id/redirect-rules/:index", rbac("sites.config"), h.RemoveRedirectRule)

		// Hotlink Protection
		sites.GET("/:id/hotlink", rbac("sites.config"), h.GetHotlinkConfig)
		sites.PUT("/:id/hotlink", rbac("sites.config"), h.SetHotlinkConfig)

		// Maintenance Mode
		sites.GET("/:id/maintenance", rbac("sites.config"), h.GetMaintenanceConfig)
		sites.PUT("/:id/maintenance", rbac("sites.config"), h.SetMaintenanceConfig)
		sites.GET("/:id/maintenance/templates", rbac("sites.config"), h.GetMaintenanceTemplates)

		// Disk Quota
		sites.PUT("/:id/quota", rbac("sites.config"), h.SetQuota)
		sites.GET("/:id/disk-usage", rbac("sites.config"), h.GetDiskUsage)

		// URL Rewrite
		sites.GET("/:id/rewrite", rbac("sites.config"), h.GetURLRewrite)
		sites.PUT("/:id/rewrite", rbac("sites.config"), h.SetURLRewrite)

		// Composer
		sites.GET("/:id/composer", rbac("sites.config"), h.GetComposerStatus)
		sites.POST("/:id/composer/install", rbac("sites.config"), h.InstallComposer)
		sites.POST("/:id/composer/run", rbac("sites.config"), h.RunComposer)
		sites.GET("/:id/composer/json", rbac("sites.config"), h.GetComposerJSON)
		sites.PUT("/:id/composer/json", rbac("sites.config"), h.UpdateComposerJSON)
	}
}

// ---------------------------------------------------------------------------
// List & CRUD
// ---------------------------------------------------------------------------

type listSitesQuery struct {
	Page    int `form:"page"`
	PerPage int `form:"per_page"`
}

// ListSites returns a paginated list of websites.
func (h *SiteHandler) ListSites(c *gin.Context) {
	var q listSitesQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		q.Page = 1
		q.PerPage = 20
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PerPage < 1 || q.PerPage > 100 {
		q.PerPage = 20
	}

	sites, total, err := h.siteService.List(q.Page, q.PerPage)
	if err != nil {
		response.Error(c, err)
		return
	}

	totalPages := total / q.PerPage
	if total%q.PerPage > 0 {
		totalPages++
	}

	response.Paginated(c, sites, response.Pagination{
		Page:       q.Page,
		PerPage:    q.PerPage,
		Total:      int64(total),
		TotalPages: totalPages,
	})
}

// CreateSite provisions a new website.
func (h *SiteHandler) CreateSite(c *gin.Context) {
	var req service.CreateSiteRequest
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

	userID, _ := c.Get("user_id")
	uid, _ := userID.(int64)

	site, err := h.siteService.Create(req, uid)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, site)
}

// GetSite returns details for a single site.
func (h *SiteHandler) GetSite(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	site, err := h.siteService.GetByID(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, site)
}

// UpdateSite modifies a site's mutable fields.
func (h *SiteHandler) UpdateSite(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req service.UpdateSiteRequest
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

	if err := h.siteService.Update(id, req); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "site updated successfully"})
}

// DeleteSite removes a site.
func (h *SiteHandler) DeleteSite(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if err := h.siteService.Delete(id); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "site deleted successfully"})
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

// StartSite enables and reloads a site.
func (h *SiteHandler) StartSite(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if err := h.siteService.Start(id); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "site started successfully"})
}

// StopSite disables a site.
func (h *SiteHandler) StopSite(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if err := h.siteService.Stop(id); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "site stopped successfully"})
}

// GetConfig returns the raw vhost configuration for a site.
func (h *SiteHandler) GetConfig(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	content, err := h.siteService.GetConfig(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"content": content})
}

type updateConfigRequest struct {
	Content string `json:"content" validate:"required"`
}

// UpdateConfig writes new vhost configuration for a site.
func (h *SiteHandler) UpdateConfig(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req updateConfigRequest
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

	if err := h.siteService.UpdateConfig(id, req.Content); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "config updated successfully"})
}

type switchPHPRequest struct {
	PHPVersion string `json:"php_version" validate:"required"`
}

// SwitchPHP changes the PHP version for a site.
func (h *SiteHandler) SwitchPHP(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req switchPHPRequest
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

	if err := h.siteService.SwitchPHP(id, req.PHPVersion); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "php version switched successfully"})
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

type addDomainRequest struct {
	Domain string `json:"domain" validate:"required,domain"`
}

// AddDomain adds a domain alias to a site.
func (h *SiteHandler) AddDomain(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req addDomainRequest
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

	if err := h.siteService.AddDomain(id, req.Domain); err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, gin.H{"message": "domain added successfully"})
}

// RemoveDomain removes a domain alias from a site.
func (h *SiteHandler) RemoveDomain(c *gin.Context) {
	siteID, err := parseID(c, "id")
	if err != nil {
		return
	}

	domainID, err := parseID(c, "did")
	if err != nil {
		return
	}

	if err := h.siteService.RemoveDomain(siteID, domainID); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "domain removed successfully"})
}

// ListDomains returns all domains for a site.
func (h *SiteHandler) ListDomains(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	domains, err := h.siteService.ListDomains(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, domains)
}

// ---------------------------------------------------------------------------
// PHP versions
// ---------------------------------------------------------------------------

// ListPHPVersions returns the PHP versions currently installed on the system.
func (h *SiteHandler) ListPHPVersions(c *gin.Context) {
	versions := service.DetectInstalledPHPVersions()
	response.Success(c, gin.H{"versions": versions})
}

// ---------------------------------------------------------------------------
// SSL
// ---------------------------------------------------------------------------

// GetSSLInfo returns SSL certificate information for a site.
func (h *SiteHandler) GetSSLInfo(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	info, err := h.siteService.GetSSLInfo(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, info)
}

type enableSSLRequest struct {
	CertPath string `json:"cert_path" validate:"required"`
	KeyPath  string `json:"key_path" validate:"required"`
	SSLType  string `json:"ssl_type"`
}

// EnableSSL enables SSL for a site with specified certificate paths.
func (h *SiteHandler) EnableSSL(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req enableSSLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body: cert_path and key_path are required"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	sslType := req.SSLType
	if sslType == "" {
		sslType = "custom"
	}

	if err := h.siteService.EnableSSL(id, req.CertPath, req.KeyPath, sslType); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "SSL enabled successfully"})
}

// DisableSSL disables SSL for a site.
func (h *SiteHandler) DisableSSL(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if err := h.siteService.DisableSSL(id); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "SSL disabled successfully"})
}

type applySSLRequest struct {
	SourceDomain string `json:"source_domain" validate:"required"`
}

// ApplySSLFromHolder applies an existing certificate to a site.
func (h *SiteHandler) ApplySSLFromHolder(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req applySSLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "source_domain is required"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	if err := h.siteService.EnableSSLFromHolder(id, req.SourceDomain); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "certificate applied successfully"})
}

// GetForceHTTPS returns Force HTTPS status for a site.
func (h *SiteHandler) GetForceHTTPS(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	enabled, err := h.siteService.GetForceHTTPS(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"force_https": enabled})
}

// SetForceHTTPS toggles Force HTTPS redirect for a site.
func (h *SiteHandler) SetForceHTTPS(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "enabled", Message: "boolean expected"}})
		return
	}
	if err := h.siteService.SetForceHTTPS(id, req.Enabled); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"force_https": req.Enabled})
}

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

type batchIDsRequest struct {
	IDs []int64 `json:"ids" binding:"required,min=1"`
}

type batchPHPRequest struct {
	IDs        []int64 `json:"ids" binding:"required,min=1"`
	PHPVersion string  `json:"php_version" binding:"required"`
}

type batchSSLRequest struct {
	IDs          []int64 `json:"ids" binding:"required,min=1"`
	SourceDomain string  `json:"source_domain" binding:"required"`
}

// BatchDeleteSites deletes multiple sites.
func (h *SiteHandler) BatchDeleteSites(c *gin.Context) {
	var req batchIDsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "ids", Message: "ids array is required"},
		})
		return
	}

	errors := h.siteService.BatchDelete(req.IDs)
	total := len(req.IDs)
	failed := len(errors)

	c.JSON(http.StatusOK, response.Response{
		Code:    http.StatusOK,
		Message: fmt.Sprintf("%d of %d sites deleted", total-failed, total),
		Data: gin.H{
			"total":   total,
			"success": total - failed,
			"failed":  failed,
			"errors":  errors,
		},
	})
}

// BatchSwitchPHP changes PHP version for multiple sites.
func (h *SiteHandler) BatchSwitchPHP(c *gin.Context) {
	var req batchPHPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "ids and php_version are required"},
		})
		return
	}

	errors := h.siteService.BatchSwitchPHP(req.IDs, req.PHPVersion)
	total := len(req.IDs)
	failed := len(errors)

	c.JSON(http.StatusOK, response.Response{
		Code:    http.StatusOK,
		Message: fmt.Sprintf("%d of %d sites updated", total-failed, total),
		Data: gin.H{
			"total":   total,
			"success": total - failed,
			"failed":  failed,
			"errors":  errors,
		},
	})
}

// BatchApplySSL applies SSL certificate to multiple sites.
func (h *SiteHandler) BatchApplySSL(c *gin.Context) {
	var req batchSSLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "ids and source_domain are required"},
		})
		return
	}

	errors := h.siteService.BatchApplySSL(req.IDs, req.SourceDomain)
	total := len(req.IDs)
	failed := len(errors)

	c.JSON(http.StatusOK, response.Response{
		Code:    http.StatusOK,
		Message: fmt.Sprintf("%d of %d sites updated", total-failed, total),
		Data: gin.H{
			"total":   total,
			"success": total - failed,
			"failed":  failed,
			"errors":  errors,
		},
	})
}

// ---------------------------------------------------------------------------
// Directory management handlers
// ---------------------------------------------------------------------------

func (h *SiteHandler) UpdateDirectory(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req struct {
		Path string `json:"path" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "path", Message: "path is required"}})
		return
	}
	if err := h.siteService.UpdateDirectory(id, req.Path); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "directory updated"})
}

func (h *SiteHandler) ListSubdirs(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	dirs, err := h.siteService.ListSubdirs(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, dirs)
}

func (h *SiteHandler) SetRunningDirectory(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req struct {
		Subdir string `json:"subdir"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "subdir", Message: "invalid request"}})
		return
	}
	if err := h.siteService.SetRunningDirectory(id, req.Subdir); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "running directory updated"})
}

func (h *SiteHandler) GetOpenBasedir(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	enabled, value, err := h.siteService.GetOpenBasedir(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"enabled": enabled, "value": value})
}

func (h *SiteHandler) SetOpenBasedir(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "enabled", Message: "invalid request"}})
		return
	}
	if err := h.siteService.SetOpenBasedir(id, req.Enabled); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "open_basedir updated"})
}

func (h *SiteHandler) GetAccessLog(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	enabled, err := h.siteService.GetAccessLogEnabled(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"enabled": enabled})
}

func (h *SiteHandler) SetAccessLog(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "enabled", Message: "invalid request"}})
		return
	}
	if err := h.siteService.SetAccessLog(id, req.Enabled); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "access log updated"})
}

func (h *SiteHandler) GetPasswordAccess(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	enabled, username, err := h.siteService.GetPasswordAccess(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"enabled": enabled, "username": username})
}

func (h *SiteHandler) SetPasswordAccess(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req struct {
		Enabled  bool   `json:"enabled"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "invalid request"}})
		return
	}
	if err := h.siteService.SetPasswordAccess(id, req.Enabled, req.Username, req.Password); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "password access updated"})
}

// ---------------------------------------------------------------------------
// Sub Directory Binding handlers
// ---------------------------------------------------------------------------

func (h *SiteHandler) GetSubdirBindings(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	bindings, err := h.siteService.GetSubdirBindings(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, bindings)
}

func (h *SiteHandler) AddSubdirBinding(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req struct {
		Domain string `json:"domain" binding:"required"`
		Subdir string `json:"subdir" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "domain and subdir are required"}})
		return
	}
	if err := h.siteService.AddSubdirBinding(id, req.Domain, req.Subdir); err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, gin.H{"message": "subdir binding added successfully"})
}

func (h *SiteHandler) RemoveSubdirBinding(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	index, err := parseID(c, "index")
	if err != nil {
		return
	}
	if err := h.siteService.RemoveSubdirBinding(id, int(index)); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "subdir binding removed successfully"})
}

// ---------------------------------------------------------------------------
// Limit Access handlers
// ---------------------------------------------------------------------------

func (h *SiteHandler) GetLimitAccessRules(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	rules, err := h.siteService.GetLimitAccessRules(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, rules)
}

func (h *SiteHandler) AddLimitAccessRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req service.LimitAccessRule
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "name, path, username, and password are required"}})
		return
	}
	if err := h.siteService.AddLimitAccessRule(id, req); err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, gin.H{"message": "limit access rule added successfully"})
}

func (h *SiteHandler) RemoveLimitAccessRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	index, err := parseID(c, "index")
	if err != nil {
		return
	}
	if err := h.siteService.RemoveLimitAccessRule(id, int(index)); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "limit access rule removed successfully"})
}

// ---------------------------------------------------------------------------
// Deny Access handlers
// ---------------------------------------------------------------------------

func (h *SiteHandler) GetDenyAccessRules(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	rules, err := h.siteService.GetDenyAccessRules(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, rules)
}

func (h *SiteHandler) AddDenyAccessRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req service.DenyAccessRule
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "name, suffix, and path are required"}})
		return
	}
	if err := h.siteService.AddDenyAccessRule(id, req); err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, gin.H{"message": "deny access rule added successfully"})
}

func (h *SiteHandler) RemoveDenyAccessRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	index, err := parseID(c, "index")
	if err != nil {
		return
	}
	if err := h.siteService.RemoveDenyAccessRule(id, int(index)); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "deny access rule removed successfully"})
}

// ---------------------------------------------------------------------------
// Traffic Control handlers
// ---------------------------------------------------------------------------

func (h *SiteHandler) GetTrafficControl(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	config, err := h.siteService.GetTrafficControl(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, config)
}

func (h *SiteHandler) SetTrafficControl(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req service.TrafficConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "invalid request body"}})
		return
	}
	if err := h.siteService.SetTrafficControl(id, req); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "traffic control updated successfully"})
}

// ---------------------------------------------------------------------------
// Default Document handlers
// ---------------------------------------------------------------------------

func (h *SiteHandler) GetDefaultDoc(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	config, err := h.siteService.GetDefaultDoc(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, config)
}

func (h *SiteHandler) SetDefaultDoc(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req service.DefaultDocConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "invalid request body"}})
		return
	}
	if err := h.siteService.SetDefaultDoc(id, req); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "default document updated successfully"})
}

// ---------------------------------------------------------------------------
// Reverse Proxy handlers
// ---------------------------------------------------------------------------

func (h *SiteHandler) GetReverseProxyRules(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	rules, err := h.siteService.GetReverseProxyRules(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, rules)
}

func (h *SiteHandler) AddReverseProxyRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req service.ReverseProxyRule
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "name, directory, and target_url are required"}})
		return
	}
	if err := h.siteService.AddReverseProxyRule(id, req); err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, gin.H{"message": "reverse proxy rule added successfully"})
}

func (h *SiteHandler) UpdateReverseProxyRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	index, err := parseID(c, "index")
	if err != nil {
		return
	}
	var req service.ReverseProxyRule
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "invalid request body"}})
		return
	}
	if err := h.siteService.UpdateReverseProxyRule(id, int(index), req); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "reverse proxy rule updated successfully"})
}

func (h *SiteHandler) RemoveReverseProxyRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	index, err := parseID(c, "index")
	if err != nil {
		return
	}
	if err := h.siteService.RemoveReverseProxyRule(id, int(index)); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "reverse proxy rule removed successfully"})
}

// ---------------------------------------------------------------------------
// Redirect Rules handlers
// ---------------------------------------------------------------------------

func (h *SiteHandler) GetRedirectRules(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	rules, err := h.siteService.GetRedirectRules(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, rules)
}

func (h *SiteHandler) AddRedirectRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req service.RedirectRule
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "invalid request body"}})
		return
	}
	if err := h.siteService.AddRedirectRule(id, req); err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, gin.H{"message": "redirect rule added successfully"})
}

func (h *SiteHandler) UpdateRedirectRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	index, err := parseID(c, "index")
	if err != nil {
		return
	}
	var req service.RedirectRule
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "invalid request body"}})
		return
	}
	if err := h.siteService.UpdateRedirectRule(id, int(index), req); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "redirect rule updated successfully"})
}

func (h *SiteHandler) RemoveRedirectRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	index, err := parseID(c, "index")
	if err != nil {
		return
	}
	if err := h.siteService.RemoveRedirectRule(id, int(index)); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "redirect rule removed successfully"})
}

// ---------------------------------------------------------------------------
// Hotlink Protection
// ---------------------------------------------------------------------------

func (h *SiteHandler) GetHotlinkConfig(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	config, err := h.siteService.GetHotlinkConfig(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, config)
}

func (h *SiteHandler) SetHotlinkConfig(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req service.HotlinkConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "invalid request body"}})
		return
	}
	if err := h.siteService.SetHotlinkConfig(id, req); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "hotlink protection updated successfully"})
}

// ---------------------------------------------------------------------------
// Maintenance Mode
// ---------------------------------------------------------------------------

func (h *SiteHandler) GetMaintenanceConfig(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	config, err := h.siteService.GetMaintenanceConfig(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, config)
}

func (h *SiteHandler) SetMaintenanceConfig(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req service.MaintenanceConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "invalid request body"}})
		return
	}
	if err := h.siteService.SetMaintenanceConfig(id, req); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "maintenance mode updated successfully"})
}

func (h *SiteHandler) GetMaintenanceTemplates(c *gin.Context) {
	templates := h.siteService.GetMaintenanceTemplates()
	response.Success(c, templates)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// parseID extracts an int64 path parameter or writes a 400 error.
func parseID(c *gin.Context, param string) (int64, error) {
	idStr := c.Param(param)
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, response.Response{
			Code:    http.StatusBadRequest,
			Message: "invalid " + param + " parameter",
		})
		return 0, err
	}
	return id, nil
}

// ---------------------------------------------------------------------------
// Disk Quota
// ---------------------------------------------------------------------------

type setQuotaRequest struct {
	DiskQuota int64 `json:"disk_quota" validate:"min=0"`
}

// SetQuota sets the disk quota for a site.
func (h *SiteHandler) SetQuota(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req setQuotaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "invalid request body"}})
		return
	}

	if err := h.siteService.SetDiskQuota(id, req.DiskQuota); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "disk quota updated"})
}

// GetDiskUsage returns the current disk usage for a site.
func (h *SiteHandler) GetDiskUsage(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	usage, err := h.siteService.GetDiskUsage(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"disk_usage": usage})
}

// ---------------------------------------------------------------------------
// URL Rewrite
// ---------------------------------------------------------------------------

// GetURLRewrite returns the current URL rewrite content for a site.
func (h *SiteHandler) GetURLRewrite(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	content, err := h.siteService.GetURLRewrite(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"content": content})
}

type setURLRewriteRequest struct {
	Content string `json:"content"`
}

// SetURLRewrite writes the URL rewrite content for a site and reloads.
func (h *SiteHandler) SetURLRewrite(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req setURLRewriteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}

	if err := h.siteService.SetURLRewrite(id, req.Content); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "URL rewrite rules updated"})
}

// ListRewriteTemplates returns all available rewrite template names.
func (h *SiteHandler) ListRewriteTemplates(c *gin.Context) {
	webserver := c.Query("webserver")
	if webserver == "" {
		webserver = "nginx"
	}
	names := h.siteService.ListRewriteTemplates(webserver)
	response.Success(c, gin.H{"templates": names})
}

// GetRewriteTemplate returns the content of a specific rewrite template.
func (h *SiteHandler) GetRewriteTemplate(c *gin.Context) {
	name := c.Param("name")
	webserver := c.Query("webserver")
	if webserver == "" {
		webserver = "nginx"
	}

	content, err := h.siteService.GetRewriteTemplate(webserver, name)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"content": content})
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

// GetComposerStatus returns Composer install status and composer.json info for a site.
func (h *SiteHandler) GetComposerStatus(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	status, err := h.siteService.GetComposerStatus(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, status)
}

// InstallComposer downloads and installs Composer on the server.
func (h *SiteHandler) InstallComposer(c *gin.Context) {
	if err := h.siteService.InstallComposer(); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "Composer installed successfully"})
}

type composerRunRequest struct {
	Command string   `json:"command" validate:"required,oneof=install update require remove dump-autoload"`
	Args    []string `json:"args"`
}

// RunComposer executes a Composer command in the site directory.
func (h *SiteHandler) RunComposer(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req composerRunRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}

	output, err := h.siteService.RunComposer(id, req.Command, req.Args)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"output": output})
}

// GetComposerJSON returns the composer.json content for a site.
func (h *SiteHandler) GetComposerJSON(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	content, err := h.siteService.GetComposerJSON(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"content": content})
}

type updateComposerJSONRequest struct {
	Content string `json:"content" validate:"required"`
}

// UpdateComposerJSON writes the composer.json content for a site.
func (h *SiteHandler) UpdateComposerJSON(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req updateComposerJSONRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, err)
		return
	}

	if err := h.siteService.UpdateComposerJSON(id, req.Content); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "composer.json updated"})
}
