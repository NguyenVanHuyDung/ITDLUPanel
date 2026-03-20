package v1

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/pkg/validator"
	"github.com/ITDLUPanel/panel/internal/service"
)

// SSLHandler handles SSL certificate management API endpoints.
type SSLHandler struct {
	sslService *service.SSLService
}

// NewSSLHandler creates a new SSLHandler.
func NewSSLHandler(sslService *service.SSLService) *SSLHandler {
	return &SSLHandler{sslService: sslService}
}

// RegisterRoutes registers SSL management routes on the given router group.
func (h *SSLHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, adminMW gin.HandlerFunc) {
	ssl := rg.Group("/ssl")
	ssl.Use(authMW, adminMW)
	{
		// Domain certificates
		ssl.GET("/certificates", h.ListCertificates)
		ssl.GET("/certificates/:domain", h.GetCertificate)
		ssl.DELETE("/certificates/:domain", h.DeleteCertificate)

		// Issuance & upload
		ssl.POST("/letsencrypt", h.IssueLetsEncrypt)
		ssl.POST("/upload", h.UploadCustomCert)

		// Renewal
		ssl.POST("/renew/:domain", h.RenewCertificate)

		// Panel SSL
		ssl.GET("/panel", h.GetPanelSSL)
		ssl.POST("/panel", h.ConfigurePanelSSL)
		ssl.POST("/panel/self-signed", h.GenerateSelfSigned)
	}
}

// ListCertificates returns all managed SSL certificates.
func (h *SSLHandler) ListCertificates(c *gin.Context) {
	certs, err := h.sslService.ListCertificates()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, certs)
}

// GetCertificate returns certificate info for a specific domain.
func (h *SSLHandler) GetCertificate(c *gin.Context) {
	domain := c.Param("domain")
	if domain == "" {
		c.JSON(http.StatusBadRequest, response.Response{
			Code:    http.StatusBadRequest,
			Message: "domain parameter is required",
		})
		return
	}

	info, err := h.sslService.GetCertInfo(domain)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, info)
}

// DeleteCertificate removes the certificate for a domain.
func (h *SSLHandler) DeleteCertificate(c *gin.Context) {
	domain := c.Param("domain")
	if domain == "" {
		c.JSON(http.StatusBadRequest, response.Response{
			Code:    http.StatusBadRequest,
			Message: "domain parameter is required",
		})
		return
	}

	if err := h.sslService.DeleteCertificate(domain); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "certificate deleted successfully"})
}

type letsEncryptRequest struct {
	Domain string `json:"domain" validate:"required,fqdn"`
	Email  string `json:"email" validate:"required,email"`
}

// IssueLetsEncrypt issues a Let's Encrypt certificate for a domain.
func (h *SSLHandler) IssueLetsEncrypt(c *gin.Context) {
	var req letsEncryptRequest
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

	if err := h.sslService.IssueLetsEncrypt(req.Domain, req.Email); err != nil {
		response.Error(c, err)
		return
	}

	info, err := h.sslService.GetCertInfo(req.Domain)
	if err != nil {
		// Certificate was issued but we couldn't read it back — still report success.
		response.Created(c, gin.H{"message": "certificate issued successfully", "domain": req.Domain})
		return
	}
	response.Created(c, info)
}

type uploadCertRequest struct {
	Domain string `json:"domain" validate:"required"`
}

// UploadCustomCert handles custom certificate upload.
func (h *SSLHandler) UploadCustomCert(c *gin.Context) {
	contentType := c.GetHeader("Content-Type")

	var domain string
	var certData, keyData []byte

	if isMultipart(contentType) {
		// Multipart form upload.
		domain = c.PostForm("domain")
		if domain == "" {
			response.ValidationError(c, []response.FieldError{
				{Field: "domain", Message: "domain is required"},
			})
			return
		}

		certFile, err := c.FormFile("cert")
		if err != nil {
			response.ValidationError(c, []response.FieldError{
				{Field: "cert", Message: "certificate file is required"},
			})
			return
		}

		keyFile, err := c.FormFile("key")
		if err != nil {
			response.ValidationError(c, []response.FieldError{
				{Field: "key", Message: "key file is required"},
			})
			return
		}

		f, err := certFile.Open()
		if err != nil {
			response.Error(c, err)
			return
		}
		certData, err = io.ReadAll(f)
		f.Close()
		if err != nil {
			response.Error(c, err)
			return
		}

		f, err = keyFile.Open()
		if err != nil {
			response.Error(c, err)
			return
		}
		keyData, err = io.ReadAll(f)
		f.Close()
		if err != nil {
			response.Error(c, err)
			return
		}
	} else {
		// JSON body with base64 or PEM strings.
		var req struct {
			Domain string `json:"domain" validate:"required"`
			Cert   string `json:"cert" validate:"required"`
			Key    string `json:"key" validate:"required"`
		}
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

		domain = req.Domain
		certData = []byte(req.Cert)
		keyData = []byte(req.Key)
	}

	if err := h.sslService.UploadCustomCert(domain, certData, keyData); err != nil {
		response.Error(c, err)
		return
	}

	info, err := h.sslService.GetCertInfo(domain)
	if err != nil {
		response.Created(c, gin.H{"message": "certificate uploaded successfully", "domain": domain})
		return
	}
	response.Created(c, info)
}

// RenewCertificate forces renewal for a domain.
func (h *SSLHandler) RenewCertificate(c *gin.Context) {
	domain := c.Param("domain")
	if domain == "" {
		c.JSON(http.StatusBadRequest, response.Response{
			Code:    http.StatusBadRequest,
			Message: "domain parameter is required",
		})
		return
	}

	if err := h.sslService.RenewCertificate(domain); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "certificate renewed successfully", "domain": domain})
}

// GetPanelSSL returns the panel's SSL certificate info.
func (h *SSLHandler) GetPanelSSL(c *gin.Context) {
	info, err := h.sslService.GetPanelSSLInfo()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, info)
}

// ConfigurePanelSSL uploads an SSL certificate for the panel.
func (h *SSLHandler) ConfigurePanelSSL(c *gin.Context) {
	contentType := c.GetHeader("Content-Type")

	var certData, keyData []byte

	if isMultipart(contentType) {
		certFile, err := c.FormFile("cert")
		if err != nil {
			response.ValidationError(c, []response.FieldError{
				{Field: "cert", Message: "certificate file is required"},
			})
			return
		}

		keyFile, err := c.FormFile("key")
		if err != nil {
			response.ValidationError(c, []response.FieldError{
				{Field: "key", Message: "key file is required"},
			})
			return
		}

		f, err := certFile.Open()
		if err != nil {
			response.Error(c, err)
			return
		}
		certData, err = io.ReadAll(f)
		f.Close()
		if err != nil {
			response.Error(c, err)
			return
		}

		f, err = keyFile.Open()
		if err != nil {
			response.Error(c, err)
			return
		}
		keyData, err = io.ReadAll(f)
		f.Close()
		if err != nil {
			response.Error(c, err)
			return
		}
	} else {
		var req struct {
			Cert string `json:"cert" validate:"required"`
			Key  string `json:"key" validate:"required"`
		}
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

		certData = []byte(req.Cert)
		keyData = []byte(req.Key)
	}

	if err := h.sslService.EnablePanelSSL(certData, keyData); err != nil {
		response.Error(c, err)
		return
	}

	info, err := h.sslService.GetPanelSSLInfo()
	if err != nil {
		response.Success(c, gin.H{"message": "panel SSL configured successfully"})
		return
	}
	response.Success(c, info)
}

// GenerateSelfSigned generates a self-signed certificate for the panel.
func (h *SSLHandler) GenerateSelfSigned(c *gin.Context) {
	if err := h.sslService.GenerateSelfSignedCert(); err != nil {
		response.Error(c, err)
		return
	}

	info, err := h.sslService.GetPanelSSLInfo()
	if err != nil {
		response.Created(c, gin.H{"message": "self-signed certificate generated"})
		return
	}
	response.Created(c, info)
}

func isMultipart(contentType string) bool {
	return len(contentType) >= 19 && contentType[:19] == "multipart/form-data"
}
