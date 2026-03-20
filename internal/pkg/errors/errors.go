package errors

import (
	"errors"
	"fmt"
)

const (
	ErrUnauthorized = 401
	ErrForbidden    = 403
	ErrNotFound     = 404
	ErrConflict     = 409
	ErrValidation   = 422
	ErrRateLimit    = 429
	ErrInternal     = 500
)

// AppError represents an application-level error with an HTTP status code.
type AppError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Err     error  `json:"-"`
	Details any    `json:"details,omitempty"`
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("[%d] %s: %v", e.Code, e.Message, e.Err)
	}
	return fmt.Sprintf("[%d] %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error {
	return e.Err
}

// New creates a new AppError with the given code and message.
func New(code int, message string) *AppError {
	return &AppError{
		Code:    code,
		Message: message,
	}
}

// Wrap wraps an existing error into an AppError.
func Wrap(err error, code int, message string) *AppError {
	return &AppError{
		Code:    code,
		Message: message,
		Err:     err,
	}
}

// Is checks whether the given error is an AppError with the specified code.
func Is(err error, code int) bool {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr.Code == code
	}
	return false
}
