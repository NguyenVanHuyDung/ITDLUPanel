package v1

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// RoleHandler handles role management API endpoints.
type RoleHandler struct {
	roleService *service.RoleService
}

// NewRoleHandler creates a new RoleHandler.
func NewRoleHandler(roleService *service.RoleService) *RoleHandler {
	return &RoleHandler{roleService: roleService}
}

// RegisterRoutes registers role management routes (admin only).
func (h *RoleHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, adminMW gin.HandlerFunc) {
	roles := rg.Group("/roles")
	roles.Use(authMW, adminMW)
	{
		roles.GET("", h.ListRoles)
		roles.GET("/permissions", h.GetPermissionTree)
		roles.POST("", h.CreateRole)
		roles.PUT("/:id", h.UpdateRole)
		roles.DELETE("/:id", h.DeleteRole)
	}
}

// ListRoles returns all roles.
func (h *RoleHandler) ListRoles(c *gin.Context) {
	roles, err := h.roleService.ListRoles()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, roles)
}

// GetPermissionTree returns the full permission tree for the UI.
func (h *RoleHandler) GetPermissionTree(c *gin.Context) {
	tree := h.roleService.GetPermissionTree()
	response.Success(c, tree)
}

type createRoleRequest struct {
	Name        string   `json:"name" validate:"required,min=2,max=32"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions" validate:"required"`
}

// CreateRole creates a new custom role.
func (h *RoleHandler) CreateRole(c *gin.Context) {
	var req createRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "invalid request body"})
		return
	}
	if req.Name == "" || len(req.Permissions) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "name and permissions are required"})
		return
	}

	role, err := h.roleService.CreateRole(req.Name, req.Description, req.Permissions)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, role)
}

type updateRoleRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions" validate:"required"`
}

// UpdateRole updates a role's permissions.
func (h *RoleHandler) UpdateRole(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "invalid role ID"})
		return
	}

	var req updateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "invalid request body"})
		return
	}

	role, err := h.roleService.UpdateRole(id, req.Name, req.Description, req.Permissions)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, role)
}

// DeleteRole deletes a custom role.
func (h *RoleHandler) DeleteRole(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "invalid role ID"})
		return
	}

	if err := h.roleService.DeleteRole(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "role deleted successfully"})
}
