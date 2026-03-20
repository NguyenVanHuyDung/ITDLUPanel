package validator

import (
	"regexp"
	"strings"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/go-playground/validator/v10"
)

var validate *validator.Validate

// domainRegex matches valid domain names (labels separated by dots).
var domainRegex = regexp.MustCompile(`^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$`)

// cronRegex matches standard 5-field cron expressions.
var cronRegex = regexp.MustCompile(`^(\S+\s+){4}\S+$`)

// Init creates and configures the global validator with custom rules.
func Init() {
	validate = validator.New()

	validate.RegisterValidation("domain", func(fl validator.FieldLevel) bool {
		return ValidateDomain(fl.Field().String())
	})

	validate.RegisterValidation("filepath_safe", func(fl validator.FieldLevel) bool {
		return ValidateFilePath(fl.Field().String())
	})

	validate.RegisterValidation("cron_expr", func(fl validator.FieldLevel) bool {
		return validateCron(fl.Field().String())
	})
}

// Validate validates a struct and returns a slice of FieldError for any failures.
func Validate(s interface{}) []response.FieldError {
	if validate == nil {
		Init()
	}

	err := validate.Struct(s)
	if err == nil {
		return nil
	}

	var fieldErrors []response.FieldError
	for _, e := range err.(validator.ValidationErrors) {
		fieldErrors = append(fieldErrors, response.FieldError{
			Field:   e.Field(),
			Message: msgForTag(e),
		})
	}
	return fieldErrors
}

// ValidateDomain checks whether the given string is a valid domain name.
func ValidateDomain(domain string) bool {
	if domain == "" || len(domain) > 253 {
		return false
	}
	return domainRegex.MatchString(domain)
}

// ValidateFilePath checks a path for directory traversal and null bytes.
func ValidateFilePath(path string) bool {
	if path == "" {
		return false
	}
	if strings.Contains(path, "\x00") {
		return false
	}
	if strings.Contains(path, "..") {
		return false
	}
	if strings.HasPrefix(path, "/") {
		return false
	}
	return true
}

func validateCron(expr string) bool {
	if expr == "" {
		return false
	}
	return cronRegex.MatchString(strings.TrimSpace(expr))
}

func msgForTag(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return "this field is required"
	case "email":
		return "must be a valid email address"
	case "min":
		return "value is too short"
	case "max":
		return "value is too long"
	case "domain":
		return "must be a valid domain name"
	case "filepath_safe":
		return "contains unsafe path characters"
	case "cron_expr":
		return "must be a valid cron expression"
	default:
		return "failed validation: " + fe.Tag()
	}
}
