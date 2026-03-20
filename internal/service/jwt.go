package service

import (
	"fmt"
	"time"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/database/models"
	"github.com/golang-jwt/jwt/v5"
)

// Claims holds the JWT claims for access tokens.
type Claims struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// RefreshClaims holds the JWT claims for refresh tokens.
type RefreshClaims struct {
	UserID int64 `json:"user_id"`
	jwt.RegisteredClaims
}

// GenerateAccessToken creates a short-lived access token.
func GenerateAccessToken(user *models.User) (string, error) {
	cfg := config.Get()
	ttl := time.Duration(cfg.Auth.AccessTokenTTL) * time.Second
	if ttl == 0 {
		ttl = 15 * time.Minute
	}

	now := time.Now()
	claims := Claims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			Issuer:    "itdlupanel",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.Auth.JWTSecret))
}

// GenerateRefreshToken creates a long-lived refresh token.
func GenerateRefreshToken(userID int64) (string, error) {
	cfg := config.Get()
	ttl := time.Duration(cfg.Auth.RefreshTokenTTL) * time.Second
	if ttl == 0 {
		ttl = 7 * 24 * time.Hour
	}

	now := time.Now()
	claims := RefreshClaims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			Issuer:    "itdlupanel",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.Auth.JWTSecret))
}

// ValidateAccessToken parses and validates an access token, returning claims.
func ValidateAccessToken(tokenString string) (*Claims, error) {
	cfg := config.Get()

	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(cfg.Auth.JWTSecret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid access token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid access token claims")
	}

	return claims, nil
}

// ValidateRefreshToken parses and validates a refresh token, returning claims.
func ValidateRefreshToken(tokenString string) (*RefreshClaims, error) {
	cfg := config.Get()

	token, err := jwt.ParseWithClaims(tokenString, &RefreshClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(cfg.Auth.JWTSecret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid refresh token: %w", err)
	}

	claims, ok := token.Claims.(*RefreshClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid refresh token claims")
	}

	return claims, nil
}
