package response

import (
	"errors"
	"net/http"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/gin-gonic/gin"
)

// Response is the standard API response envelope.
type Response struct {
	Code    int          `json:"code"`
	Message string       `json:"message"`
	Data    any          `json:"data,omitempty"`
	Errors  []FieldError `json:"errors,omitempty"`
}

// FieldError describes a validation error on a specific field.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Pagination holds pagination metadata.
type Pagination struct {
	Page       int   `json:"page"`
	PerPage    int   `json:"per_page"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

// PaginatedResponse extends Response with pagination info.
type PaginatedResponse struct {
	Response
	Pagination *Pagination `json:"pagination,omitempty"`
}

// Success sends a 200 OK response with data.
func Success(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Response{
		Code:    http.StatusOK,
		Message: "success",
		Data:    data,
	})
}

// Created sends a 201 Created response.
func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, Response{
		Code:    http.StatusCreated,
		Message: "created",
		Data:    data,
	})
}

// Accepted sends a 202 Accepted response.
func Accepted(c *gin.Context, data any) {
	c.JSON(http.StatusAccepted, Response{
		Code:    http.StatusAccepted,
		Message: "accepted",
		Data:    data,
	})
}

// Error sends an error response. It inspects the error for *AppError to
// extract the status code and message; otherwise it falls back to 500.
func Error(c *gin.Context, err error) {
	var appErr *apperrors.AppError
	if errors.As(err, &appErr) {
		c.JSON(appErr.Code, Response{
			Code:    appErr.Code,
			Message: appErr.Message,
		})
		return
	}

	c.JSON(http.StatusInternalServerError, Response{
		Code:    http.StatusInternalServerError,
		Message: "internal server error",
	})
}

// ValidationError sends a 422 response with field-level errors.
func ValidationError(c *gin.Context, errs []FieldError) {
	c.JSON(http.StatusUnprocessableEntity, Response{
		Code:    http.StatusUnprocessableEntity,
		Message: "validation error",
		Errors:  errs,
	})
}

// Paginated sends a 200 OK response with pagination metadata.
func Paginated(c *gin.Context, data any, pagination Pagination) {
	c.JSON(http.StatusOK, PaginatedResponse{
		Response: Response{
			Code:    http.StatusOK,
			Message: "success",
			Data:    data,
		},
		Pagination: &pagination,
	})
}
