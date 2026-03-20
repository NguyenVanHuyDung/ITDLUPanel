package service

import (
	"database/sql"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/database/models"
	"github.com/ITDLUPanel/panel/internal/pkg/crypto"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// AuthService handles authentication operations.
type AuthService struct {
	db       *sql.DB
	userRepo *models.UserRepository
}

// NewAuthService creates a new AuthService.
func NewAuthService(db *sql.DB) *AuthService {
	return &AuthService{
		db:       db,
		userRepo: models.NewUserRepository(db),
	}
}

// GetDB returns the underlying database connection.
func (s *AuthService) GetDB() *sql.DB {
	return s.db
}

// Login verifies credentials and returns tokens.
// Returns: accessToken, refreshToken, user, error.
func (s *AuthService) Login(username, password string) (string, string, *models.User, error) {
	user, err := s.userRepo.GetByUsername(username)
	if err != nil {
		return "", "", nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to query user")
	}
	if user == nil {
		return "", "", nil, apperrors.New(apperrors.ErrUnauthorized, "invalid username or password")
	}

	if user.Status != 1 {
		return "", "", nil, apperrors.New(apperrors.ErrForbidden, "account is disabled")
	}

	if !crypto.CheckPassword(password, user.Password) {
		return "", "", nil, apperrors.New(apperrors.ErrUnauthorized, "invalid username or password")
	}

	accessToken, err := GenerateAccessToken(user)
	if err != nil {
		return "", "", nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate access token")
	}

	refreshToken, err := GenerateRefreshToken(user.ID)
	if err != nil {
		return "", "", nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate refresh token")
	}

	return accessToken, refreshToken, user, nil
}

// RefreshToken validates a refresh token and issues a new access token.
func (s *AuthService) RefreshToken(refreshToken string) (string, error) {
	claims, err := ValidateRefreshToken(refreshToken)
	if err != nil {
		return "", apperrors.New(apperrors.ErrUnauthorized, "invalid or expired refresh token")
	}

	user, err := s.userRepo.GetByID(claims.UserID)
	if err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to query user")
	}
	if user == nil {
		return "", apperrors.New(apperrors.ErrUnauthorized, "user no longer exists")
	}
	if user.Status != 1 {
		return "", apperrors.New(apperrors.ErrForbidden, "account is disabled")
	}

	accessToken, err := GenerateAccessToken(user)
	if err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate access token")
	}

	return accessToken, nil
}

// ChangePassword changes a user's password after verifying the old password.
func (s *AuthService) ChangePassword(userID int64, oldPassword, newPassword string) error {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to query user")
	}
	if user == nil {
		return apperrors.New(apperrors.ErrNotFound, "user not found")
	}

	if !crypto.CheckPassword(oldPassword, user.Password) {
		return apperrors.New(apperrors.ErrUnauthorized, "current password is incorrect")
	}

	cfg := config.Get()
	hashed, err := crypto.HashPassword(newPassword, cfg.Auth.BcryptCost)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to hash password")
	}

	user.Password = hashed
	if err := s.userRepo.Update(user); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update password")
	}

	return nil
}

// CreateDefaultAdmin creates an admin user if no users exist.
// Returns the generated password.
func (s *AuthService) CreateDefaultAdmin() (string, error) {
	users, total, err := s.userRepo.List(1, 1)
	if err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to check existing users")
	}
	if total > 0 && len(users) > 0 {
		return "", nil
	}

	password, err := crypto.GenerateRandomString(12)
	if err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate password")
	}

	cfg := config.Get()
	hashed, err := crypto.HashPassword(password, cfg.Auth.BcryptCost)
	if err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to hash password")
	}

	user := &models.User{
		Username: "admin",
		Password: hashed,
		Email:    "admin@localhost",
		Role:     "admin",
		Status:   1,
	}

	if err := s.userRepo.Create(user); err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to create default admin")
	}

	logger.Info().Str("username", "admin").Msg("Default admin user created")
	return password, nil
}
