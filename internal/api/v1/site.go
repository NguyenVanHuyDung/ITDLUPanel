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
func (h *SiteHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, sitesMW gin.HandlerFunc) {
	sites := rg.Group("/sites")
	sites.Use(authMW, sitesMW)
	{
		sites.GET("", h.ListSites)
		sites.POST("", h.CreateSite)
		sites.GET("/php-versions", h.ListPHPVersions)

		// Batch operations
		sites.POST("/batch/delete", h.BatchDeleteSites)
		sites.PUT("/batch/php", h.BatchSwitchPHP)
		sites.POST("/batch/ssl", h.BatchApplySSL)

		sites.GET("/:id", h.GetSite)
		sites.PUT("/:id", h.UpdateSite)
		sites.DELETE("/:id", h.DeleteSite)

		// Operations
		sites.POST("/:id/start", h.StartSite)
		sites.POST("/:id/stop", h.StopSite)
		sites.GET("/:id/config", h.GetConfig)
		sites.PUT("/:id/config", h.UpdateConfig)
		sites.PUT("/:id/php", h.SwitchPHP)

		// Domains
		sites.POST("/:id/domains", h.AddDomain)
		sites.DELETE("/:id/domains/:did", h.RemoveDomain)
		sites.GET("/:id/domains", h.ListDomains)

		// SSL
		sites.GET("/:id/ssl", h.GetSSLInfo)
		sites.POST("/:id/ssl/enable", h.EnableSSL)
		sites.POST("/:id/ssl/disable", h.DisableSSL)
		sites.POST("/:id/ssl/apply", h.ApplySSLFromHolder)

		// Directory management
		sites.PUT("/:id/directory", h.UpdateDirectory)
		sites.GET("/:id/subdirs", h.ListSubdirs)
		sites.PUT("/:id/running-directory", h.SetRunningDirectory)
		sites.GET("/:id/open-basedir", h.GetOpenBasedir)
		sites.PUT("/:id/open-basedir", h.SetOpenBasedir)
		sites.GET("/:id/access-log", h.GetAccessLog)
		sites.PUT("/:id/access-log", h.SetAccessLog)
		sites.GET("/:id/password-access", h.GetPasswordAccess)
		sites.PUT("/:id/password-access", h.SetPasswordAccess)
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
