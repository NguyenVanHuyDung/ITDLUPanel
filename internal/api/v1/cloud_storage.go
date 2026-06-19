package v1

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// CloudStorageHandler handles cloud storage management API endpoints.
type CloudStorageHandler struct {
	cloudStorageService *service.CloudStorageService
}

// NewCloudStorageHandler creates a new CloudStorageHandler.
func NewCloudStorageHandler(svc *service.CloudStorageService) *CloudStorageHandler {
	return &CloudStorageHandler{cloudStorageService: svc}
}

// RegisterRoutes registers cloud storage management routes.
func (h *CloudStorageHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	g := rg.Group("/cloud-storages")
	g.Use(authMW)
	{
		g.GET("", rbac("backup.read"), h.List)
		g.POST("", rbac("backup.create"), h.Create)
		g.GET("/:id", rbac("backup.read"), h.Get)
		g.PUT("/:id", rbac("backup.create"), h.Update)
		g.DELETE("/:id", rbac("backup.delete"), h.Delete)
		g.POST("/:id/test", rbac("backup.read"), h.TestByID)
		g.POST("/test", rbac("backup.read"), h.TestInline)
		g.GET("/:id/auth-url", rbac("backup.create"), h.GetAuthURL)
	}

	// OAuth callback — no auth middleware (browser redirect from provider)
	rg.GET("/cloud-storages/oauth/callback", h.OAuthCallback)
}

// List returns all cloud storage configurations.
func (h *CloudStorageHandler) List(c *gin.Context) {
	storageType := c.Query("type")
	var storages []*service.CloudStorage
	var err error

	if storageType != "" {
		storages, err = h.cloudStorageService.ListByType(storageType)
	} else {
		storages, err = h.cloudStorageService.List()
	}
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, storages)
}

// Get returns a single cloud storage by ID.
func (h *CloudStorageHandler) Get(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	storage, err := h.cloudStorageService.GetByID(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	// Mask sensitive fields in response
	maskedStorage := *storage
	maskedStorage.Config = maskConfigForResponse(storage.Config)
	response.Success(c, maskedStorage)
}

type createCloudStorageRequest struct {
	Name      string          `json:"name" binding:"required"`
	Type      string          `json:"type" binding:"required"`
	Config    json.RawMessage `json:"config" binding:"required"`
	IsDefault bool            `json:"is_default"`
}

// Create adds a new cloud storage configuration.
func (h *CloudStorageHandler) Create(c *gin.Context) {
	var req createCloudStorageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body: " + err.Error()},
		})
		return
	}

	if req.Type != "s3" && req.Type != "google_drive" && req.Type != "onedrive" {
		response.ValidationError(c, []response.FieldError{
			{Field: "type", Message: "type must be one of: s3, google_drive, onedrive"},
		})
		return
	}

	storage := &service.CloudStorage{
		Name:      req.Name,
		Type:      req.Type,
		Config:    string(req.Config),
		IsDefault: req.IsDefault,
	}

	result, err := h.cloudStorageService.Create(storage)
	if err != nil {
		response.Error(c, err)
		return
	}
	result.Config = maskConfigForResponse(result.Config)
	response.Created(c, result)
}

type updateCloudStorageRequest struct {
	Name      string          `json:"name"`
	Config    json.RawMessage `json:"config"`
	IsDefault bool            `json:"is_default"`
	IsActive  bool            `json:"is_active"`
}

// Update modifies an existing cloud storage configuration.
func (h *CloudStorageHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req updateCloudStorageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	storage := &service.CloudStorage{
		Name:      req.Name,
		Config:    string(req.Config),
		IsDefault: req.IsDefault,
		IsActive:  req.IsActive,
	}

	result, err := h.cloudStorageService.Update(id, storage)
	if err != nil {
		response.Error(c, err)
		return
	}
	result.Config = maskConfigForResponse(result.Config)
	response.Success(c, result)
}

// Delete removes a cloud storage configuration.
func (h *CloudStorageHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	if err := h.cloudStorageService.Delete(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "cloud storage deleted"})
}

// TestByID tests a cloud storage connection by ID.
func (h *CloudStorageHandler) TestByID(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	redirectURL := oauthCallbackURL(c)
	if err := h.cloudStorageService.TestConnection(id, redirectURL); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "cloud storage connection successful"})
}

type testCloudStorageRequest struct {
	Type   string          `json:"type" binding:"required"`
	Config json.RawMessage `json:"config" binding:"required"`
}

// TestInline tests a cloud storage connection with inline config.
func (h *CloudStorageHandler) TestInline(c *gin.Context) {
	var req testCloudStorageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if err := h.cloudStorageService.TestInline(req.Type, string(req.Config)); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "cloud storage connection successful"})
}

// GetAuthURL returns an OAuth URL for Google Drive or OneDrive.
func (h *CloudStorageHandler) GetAuthURL(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	redirectURL := oauthCallbackURL(c)
	url, provider, err := h.cloudStorageService.GetAuthURL(id, redirectURL)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{
		"auth_url": url,
		"provider": provider,
	})
}

// OAuthCallback handles the OAuth redirect callback from Google/Microsoft.
func (h *CloudStorageHandler) OAuthCallback(c *gin.Context) {
	provider := c.Query("provider")
	state := c.Query("state")
	code := c.Query("code")

	if state == "" || code == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "oauth", Message: "missing state or code parameter"},
		})
		return
	}

	storageID, err := strconv.ParseInt(state, 10, 64)
	if err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "state", Message: "invalid state parameter"},
		})
		return
	}

	// If provider not specified in query, detect from storage record
	if provider == "" {
		cs, err := h.cloudStorageService.GetByID(storageID)
		if err != nil {
			response.ValidationError(c, []response.FieldError{
				{Field: "storage", Message: "storage not found"},
			})
			return
		}
		provider = cs.Type
	}

	redirectURL := oauthCallbackURL(c)
	if err := h.cloudStorageService.HandleOAuthCallback(provider, storageID, code, redirectURL); err != nil {
		response.Error(c, fmt.Errorf("OAuth callback failed: %w", err))
		return
	}

	// Token saved — return HTML that closes the popup and signals the parent.
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Header("X-Panel-Origin", oauthCallbackURL(c))
	c.String(http.StatusOK, `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Authorization</title></head>
<body>
<script>
(function() {
  try {
    var origin = window.location.protocol + '//' + window.location.host;
    if (window.opener && window.opener.postMessage) {
      window.opener.postMessage({ type: 'oauth_callback_done' }, origin);
    }
    document.body.innerHTML = '<h2 style="font-family:sans-serif;text-align:center;margin-top:40px;color:#2e7d32">Authorization successful!</h2><p style="font-family:sans-serif;text-align:center">This window will close automatically.</p>';
    setTimeout(function() { window.close(); }, 1500);
  } catch(e) {
    document.body.innerHTML = '<h2 style="font-family:sans-serif;text-align:center;margin-top:40px">Done. You may close this window.</h2>';
  }
})();
</script>
</body>
</html>`)
}

// oauthCallbackURL constructs the OAuth callback URL from the request.
// It uses the panel's configured PublicURL (or inferred bind address)
// so the redirect_uri matches what was registered with the OAuth provider.
// Using the request Host header directly would produce localhost in
// browser-side requests when the server is behind a reverse proxy,
// causing a redirect_uri_mismatch error from Google.
func oauthCallbackURL(c *gin.Context) string {
	cfg := config.Get()
	base := cfg.Server.PublicAddress()
	return base + "/api/v1/cloud-storages/oauth/callback"
}

// maskConfigForResponse masks sensitive fields in config JSON for API responses.
func maskConfigForResponse(configJSON string) string {
	sensitiveKeys := []string{"secret_key", "client_secret", "access_token", "refresh_token"}
	var raw map[string]any
	if err := json.Unmarshal([]byte(configJSON), &raw); err != nil {
		return configJSON
	}
	for _, key := range sensitiveKeys {
		if _, ok := raw[key]; ok {
			raw[key] = "***"
		}
	}
	masked, err := json.Marshal(raw)
	if err != nil {
		return configJSON
	}
	return string(masked)
}
