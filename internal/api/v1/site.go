package v1

import (
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
