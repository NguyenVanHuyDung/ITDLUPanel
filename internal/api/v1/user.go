package v1

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/pkg/validator"
	"github.com/ITDLUPanel/panel/internal/service"
)

// UserHandler handles user management API endpoints.
type UserHandler struct {
	userService *service.UserService
}

// NewUserHandler creates a new UserHandler.
func NewUserHandler(userService *service.UserService) *UserHandler {
	return &UserHandler{
		userService: userService,
	}
}

// RegisterRoutes registers user management routes (all require admin role).
func (h *UserHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, adminMW gin.HandlerFunc) {
	users := rg.Group("/users")
	users.Use(authMW, adminMW)
	{
		users.GET("", h.ListUsers)
		users.POST("", h.CreateUser)
		users.PUT("/:id", h.UpdateUser)
		users.DELETE("/:id", h.DeleteUser)
	}
}

type createUserRequest struct {
	Username string `json:"username" validate:"required,min=3,max=32"`
	Password string `json:"password" validate:"required,min=8"`
	Email    string `json:"email" validate:"omitempty,email"`
	Role     string `json:"role" validate:"required,oneof=admin operator viewer"`
}

// CreateUser creates a new user.
func (h *UserHandler) CreateUser(c *gin.Context) {
	var req createUserRequest
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

	user, err := h.userService.CreateUser(req.Username, req.Password, req.Email, req.Role)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, user)
}

type listUsersQuery struct {
	Page    int `form:"page"`
	PerPage int `form:"per_page"`
}

// ListUsers returns a paginated list of users.
func (h *UserHandler) ListUsers(c *gin.Context) {
	var query listUsersQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		query.Page = 1
		query.PerPage = 20
	}

	if query.Page < 1 {
		query.Page = 1
	}
	if query.PerPage < 1 || query.PerPage > 100 {
		query.PerPage = 20
	}

	users, total, err := h.userService.ListUsers(query.Page, query.PerPage)
	if err != nil {
		response.Error(c, err)
		return
	}

	totalPages := int(total) / query.PerPage
	if int(total)%query.PerPage > 0 {
		totalPages++
	}

	response.Paginated(c, users, response.Pagination{
		Page:       query.Page,
		PerPage:    query.PerPage,
		Total:      total,
		TotalPages: totalPages,
	})
}

type updateUserRequest struct {
	Email  string `json:"email" validate:"omitempty,email"`
	Role   string `json:"role" validate:"omitempty,oneof=admin operator viewer"`
	Status *int   `json:"status" validate:"omitempty,oneof=0 1"`
}

// UpdateUser updates a user's info.
func (h *UserHandler) UpdateUser(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, response.Response{
			Code:    http.StatusBadRequest,
			Message: "invalid user ID",
		})
		return
	}

	var req updateUserRequest
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

	status := 1
	if req.Status != nil {
		status = *req.Status
	}

	user, err := h.userService.UpdateUser(id, req.Email, req.Role, status)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, user)
}

// DeleteUser deletes a user.
func (h *UserHandler) DeleteUser(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, response.Response{
			Code:    http.StatusBadRequest,
			Message: "invalid user ID",
		})
		return
	}

	currentUserID, _ := c.Get("user_id")
	currentUID, ok := currentUserID.(int64)
	if !ok {
		c.JSON(http.StatusUnauthorized, response.Response{
			Code:    http.StatusUnauthorized,
			Message: "invalid user session",
		})
		return
	}

	if err := h.userService.DeleteUser(id, currentUID); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "user deleted successfully"})
}
