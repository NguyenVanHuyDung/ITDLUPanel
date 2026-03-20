package service

import (
	"database/sql"
	"fmt"

	"github.com/ITDLUPanel/panel/internal/database/models"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/pquerna/otp/totp"
)

// TOTPService handles two-factor authentication with TOTP.
type TOTPService struct {
	db       *sql.DB
	userRepo *models.UserRepository
}

// NewTOTPService creates a new TOTPService.
func NewTOTPService(db *sql.DB) *TOTPService {
	return &TOTPService{
		db:       db,
		userRepo: models.NewUserRepository(db),
	}
}

// GenerateSecret creates a new TOTP secret and returns the secret and QR code URL.
func (s *TOTPService) GenerateSecret(userID int64, username string) (secret string, qrCodeURL string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "ITDLUPanel",
		AccountName: username,
	})
	if err != nil {
		return "", "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate TOTP secret")
	}

	return key.Secret(), key.URL(), nil
}

// Enable2FA enables TOTP for a user after verifying a code.
func (s *TOTPService) Enable2FA(userID int64, secret, code string) error {
	valid := totp.Validate(code, secret)
	if !valid {
		return apperrors.New(apperrors.ErrValidation, "invalid TOTP code")
	}

	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to get user")
	}
	if user == nil {
		return apperrors.New(apperrors.ErrNotFound, "user not found")
	}

	user.TOTPSecret = secret
	user.TOTPEnabled = true

	if err := s.userRepo.Update(user); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to enable 2FA")
	}

	return nil
}

// Disable2FA disables TOTP for a user.
func (s *TOTPService) Disable2FA(userID int64) error {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to get user")
	}
	if user == nil {
		return apperrors.New(apperrors.ErrNotFound, "user not found")
	}

	user.TOTPSecret = ""
	user.TOTPEnabled = false

	if err := s.userRepo.Update(user); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to disable 2FA")
	}

	return nil
}

// Verify2FA validates a TOTP code for a user.
func (s *TOTPService) Verify2FA(userID int64, code string) error {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to get user")
	}
	if user == nil {
		return apperrors.New(apperrors.ErrNotFound, "user not found")
	}

	if !user.TOTPEnabled || user.TOTPSecret == "" {
		return apperrors.New(apperrors.ErrValidation, "2FA is not enabled for this user")
	}

	valid := totp.Validate(code, user.TOTPSecret)
	if !valid {
		return apperrors.New(apperrors.ErrUnauthorized, fmt.Sprintf("invalid TOTP code"))
	}

	return nil
}
