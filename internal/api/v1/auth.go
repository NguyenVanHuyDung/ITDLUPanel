package v1

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/pkg/validator"
	"github.com/ITDLUPanel/panel/internal/service"
)

// AuthHandler handles authentication API endpoints.
type AuthHandler struct {
	authService *service.AuthService
	totpService *service.TOTPService
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(authService *service.AuthService, totpService *service.TOTPService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		totpService: totpService,
	}
}

// RegisterRoutes registers auth routes on the router group.
func (h *AuthHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc) {
	auth := rg.Group("/auth")
	{
		auth.POST("/login", h.Login)
		auth.POST("/refresh", h.RefreshToken)
		auth.POST("/2fa/verify", h.Verify2FA)
	}

	authRequired := auth.Group("")
	authRequired.Use(authMW)
	{
		authRequired.POST("/logout", h.Logout)
		authRequired.GET("/me", h.Me)
		authRequired.PUT("/password", h.ChangePassword)
		authRequired.GET("/2fa/qrcode", h.GetQRCode)
		authRequired.POST("/2fa/enable", h.Enable2FA)
		authRequired.POST("/2fa/disable", h.Disable2FA)
	}
}

type loginRequest struct {
	Username string `json:"username" validate:"required,min=3"`
	Password string `json:"password" validate:"required,min=6"`
}

// Login handles user login.
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
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

	accessToken, refreshToken, user, err := h.authService.Login(req.Username, req.Password)
	if err != nil {
		response.Error(c, err)
		return
	}

	// If 2FA is enabled, return a temp token instead of the full access token
	if user.TOTPEnabled {
		tempToken, err := service.GenerateAccessToken(user)
		if err != nil {
			response.Error(c, err)
			return
		}
		response.Success(c, gin.H{
			"require_2fa": true,
			"temp_token":  tempToken,
		})
		return
	}

	// Update last login info
	_ = h.updateLastLogin(c, user.ID)

	// Set refresh token as httpOnly cookie
	h.setRefreshTokenCookie(c, refreshToken)

	cfg := config.Get()
	response.Success(c, gin.H{
		"access_token": accessToken,
		"expires_in":   cfg.Auth.AccessTokenTTL,
		"user":         user,
	})
}

// Logout clears the refresh token cookie.
func (h *AuthHandler) Logout(c *gin.Context) {
	c.SetCookie("refresh_token", "", -1, "/", "", false, true)
	response.Success(c, gin.H{"message": "logged out successfully"})
}

// RefreshToken reads the refresh_token from the cookie and returns a new access token.
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	refreshToken, err := c.Cookie("refresh_token")
	if err != nil || refreshToken == "" {
		c.JSON(http.StatusUnauthorized, response.Response{
			Code:    http.StatusUnauthorized,
			Message: "refresh token not found",
		})
		return
	}

	accessToken, err := h.authService.RefreshToken(refreshToken)
	if err != nil {
		response.Error(c, err)
		return
	}

	cfg := config.Get()
	response.Success(c, gin.H{
		"access_token": accessToken,
		"expires_in":   cfg.Auth.AccessTokenTTL,
	})
}

// Me returns the current user's info from JWT claims.
func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("user_id")
	username, _ := c.Get("username")
	role, _ := c.Get("role")

	response.Success(c, gin.H{
		"user_id":  userID,
		"username": username,
		"role":     role,
	})
}

type changePasswordRequest struct {
	OldPassword string `json:"old_password" validate:"required,min=6"`
	NewPassword string `json:"new_password" validate:"required,min=8"`
}

// ChangePassword handles password change.
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req changePasswordRequest
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
	uid, ok := userID.(int64)
	if !ok {
		c.JSON(http.StatusUnauthorized, response.Response{
			Code:    http.StatusUnauthorized,
			Message: "invalid user session",
		})
		return
	}

	if err := h.authService.ChangePassword(uid, req.OldPassword, req.NewPassword); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "password changed successfully"})
}

// GetQRCode generates a TOTP secret and returns the QR code URL.
func (h *AuthHandler) GetQRCode(c *gin.Context) {
	userID, _ := c.Get("user_id")
	username, _ := c.Get("username")

	uid, ok := userID.(int64)
	if !ok {
		c.JSON(http.StatusUnauthorized, response.Response{
			Code:    http.StatusUnauthorized,
			Message: "invalid user session",
		})
		return
	}
	usernameStr, _ := username.(string)

	secret, qrCodeURL, err := h.totpService.GenerateSecret(uid, usernameStr)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"secret":      secret,
		"qr_code_url": qrCodeURL,
	})
}

type enable2FARequest struct {
	Secret string `json:"secret" validate:"required"`
	Code   string `json:"code" validate:"required,len=6"`
}

// Enable2FA enables TOTP 2FA for the current user.
func (h *AuthHandler) Enable2FA(c *gin.Context) {
	var req enable2FARequest
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
	uid, ok := userID.(int64)
	if !ok {
		c.JSON(http.StatusUnauthorized, response.Response{
			Code:    http.StatusUnauthorized,
			Message: "invalid user session",
		})
		return
	}

	if err := h.totpService.Enable2FA(uid, req.Secret, req.Code); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "2FA enabled successfully"})
}

type disable2FARequest struct {
	Code string `json:"code" validate:"required,len=6"`
}

// Disable2FA disables TOTP 2FA for the current user.
func (h *AuthHandler) Disable2FA(c *gin.Context) {
	var req disable2FARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	userID, _ := c.Get("user_id")
	uid, ok := userID.(int64)
	if !ok {
		c.JSON(http.StatusUnauthorized, response.Response{
			Code:    http.StatusUnauthorized,
			Message: "invalid user session",
		})
		return
	}

	// Verify the code before disabling
	if err := h.totpService.Verify2FA(uid, req.Code); err != nil {
		response.Error(c, err)
		return
	}

	if err := h.totpService.Disable2FA(uid); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "2FA disabled successfully"})
}

type verify2FARequest struct {
	TempToken string `json:"temp_token" validate:"required"`
	Code      string `json:"code" validate:"required,len=6"`
}

// Verify2FA validates a TOTP code during login and returns the full access token.
func (h *AuthHandler) Verify2FA(c *gin.Context) {
	var req verify2FARequest
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

	// Validate the temp token to get user info
	claims, err := service.ValidateAccessToken(req.TempToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, response.Response{
			Code:    http.StatusUnauthorized,
			Message: "invalid or expired temporary token",
		})
		return
	}

	// Verify the TOTP code
	if err := h.totpService.Verify2FA(claims.UserID, req.Code); err != nil {
		response.Error(c, err)
		return
	}

	// Generate fresh tokens after successful 2FA verification
	refreshToken, err := service.GenerateRefreshToken(claims.UserID)
	if err != nil {
		response.Error(c, err)
		return
	}

	// Update last login info
	_ = h.updateLastLogin(c, claims.UserID)

	h.setRefreshTokenCookie(c, refreshToken)

	cfg := config.Get()
	response.Success(c, gin.H{
		"access_token": req.TempToken,
		"expires_in":   cfg.Auth.AccessTokenTTL,
	})
}

func (h *AuthHandler) setRefreshTokenCookie(c *gin.Context, token string) {
	cfg := config.Get()
	ttl := cfg.Auth.RefreshTokenTTL
	if ttl == 0 {
		ttl = 604800
	}
	secure := c.Request.TLS != nil
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("refresh_token", token, ttl, "/", "", secure, true)
}

func (h *AuthHandler) updateLastLogin(c *gin.Context, userID int64) error {
	ip := c.ClientIP()
	// Use a lightweight direct DB update via the auth service's underlying repo
	db := h.authService.GetDB()
	_, err := db.Exec(
		"UPDATE users SET last_login = CURRENT_TIMESTAMP, last_ip = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		ip, userID,
	)
	if err != nil {
		logger.Error().Err(err).Int64("user_id", userID).Msg("Failed to update last login")
	}
	return err
}

// setRefreshTokenCookieSecure sets the cookie with secure flag for production.
func (h *AuthHandler) setRefreshTokenCookieSecure(c *gin.Context, token string, secure bool) {
	cfg := config.Get()
	ttl := cfg.Auth.RefreshTokenTTL
	if ttl == 0 {
		ttl = 604800
	}
	sameSite := http.SameSiteLaxMode
	c.SetSameSite(sameSite)
	c.SetCookie("refresh_token", token, ttl, "/", "", secure, true)
}

// Temp token TTL for 2FA flow (5 minutes)
var tempTokenTTL = 5 * time.Minute
