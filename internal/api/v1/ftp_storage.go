package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// FTPStorageHandler handles FTP storage management API endpoints.
type FTPStorageHandler struct {
	ftpStorageService *service.FTPStorageService
}

// NewFTPStorageHandler creates a new FTPStorageHandler.
func NewFTPStorageHandler(ftpStorageService *service.FTPStorageService) *FTPStorageHandler {
	return &FTPStorageHandler{ftpStorageService: ftpStorageService}
}

// RegisterRoutes registers FTP storage management routes.
func (h *FTPStorageHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	g := rg.Group("/ftp-storages")
	g.Use(authMW)
	{
		g.GET("", rbac("backup.read"), h.List)
		g.POST("", rbac("backup.create"), h.Create)
		g.GET("/:id", rbac("backup.read"), h.Get)
		g.PUT("/:id", rbac("backup.create"), h.Update)
		g.DELETE("/:id", rbac("backup.delete"), h.Delete)
		g.POST("/:id/test", rbac("backup.read"), h.TestByID)
		g.POST("/test", rbac("backup.read"), h.Test)
		g.GET("/:id/files", rbac("backup.read"), h.ListFiles)
	}
}

// List returns all FTP storage configurations.
func (h *FTPStorageHandler) List(c *gin.Context) {
	storages, err := h.ftpStorageService.List()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, storages)
}

// Get returns a single FTP storage by ID.
func (h *FTPStorageHandler) Get(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	storage, err := h.ftpStorageService.GetByID(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	storage.Password = "***"
	response.Success(c, storage)
}

type createFTPStorageRequest struct {
	Name       string `json:"name" binding:"required"`
	Host       string `json:"host" binding:"required"`
	Port       int    `json:"port"`
	Username   string `json:"username" binding:"required"`
	Password   string `json:"password" binding:"required"`
	RemotePath string `json:"remote_path"`
	IsDefault  bool   `json:"is_default"`
}

// Create adds a new FTP storage configuration.
func (h *FTPStorageHandler) Create(c *gin.Context) {
	var req createFTPStorageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body: " + err.Error()},
		})
		return
	}

	storage := &service.FTPStorage{
		Name:       req.Name,
		Host:       req.Host,
		Port:       req.Port,
		Username:   req.Username,
		Password:   req.Password,
		RemotePath: req.RemotePath,
		IsDefault:  req.IsDefault,
	}

	result, err := h.ftpStorageService.Create(storage)
	if err != nil {
		response.Error(c, err)
		return
	}
	result.Password = "***"
	response.Created(c, result)
}

type updateFTPStorageRequest struct {
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	RemotePath string `json:"remote_path"`
	IsDefault  bool   `json:"is_default"`
	IsActive   bool   `json:"is_active"`
}

// Update modifies an existing FTP storage configuration.
func (h *FTPStorageHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req updateFTPStorageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	storage := &service.FTPStorage{
		Name:       req.Name,
		Host:       req.Host,
		Port:       req.Port,
		Username:   req.Username,
		Password:   req.Password,
		RemotePath: req.RemotePath,
		IsDefault:  req.IsDefault,
		IsActive:   req.IsActive,
	}

	result, err := h.ftpStorageService.Update(id, storage)
	if err != nil {
		response.Error(c, err)
		return
	}
	result.Password = "***"
	response.Success(c, result)
}

// Delete removes an FTP storage configuration.
func (h *FTPStorageHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	if err := h.ftpStorageService.Delete(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "FTP storage deleted"})
}

type testFTPRequest struct {
	Host       string `json:"host" binding:"required"`
	Port       int    `json:"port"`
	Username   string `json:"username" binding:"required"`
	Password   string `json:"password" binding:"required"`
	RemotePath string `json:"remote_path"`
}

// Test tests an FTP connection with the given parameters.
func (h *FTPStorageHandler) Test(c *gin.Context) {
	var req testFTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}
	port := req.Port
	if port == 0 {
		port = 21
	}
	if err := h.ftpStorageService.TestConnection(req.Host, port, req.Username, req.Password, req.RemotePath); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "FTP connection successful"})
}

// TestByID tests connection using stored credentials.
func (h *FTPStorageHandler) TestByID(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	if err := h.ftpStorageService.TestConnectionByID(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "FTP connection successful"})
}

type listFilesQuery struct {
	SubDir string `form:"sub_dir"`
}

// ListFiles lists files in the remote FTP storage directory.
func (h *FTPStorageHandler) ListFiles(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var q listFilesQuery
	c.ShouldBindQuery(&q) //nolint:errcheck

	files, err := h.ftpStorageService.ListFiles(id, q.SubDir)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, files)
}
