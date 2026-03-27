package service

import (
	"database/sql"
	"sync"
	"time"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/database/models"
	"github.com/ITDLUPanel/panel/internal/pkg/crypto"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// ---------------------------------------------------------------------------
// Login brute-force protection
// ---------------------------------------------------------------------------

var (
	loginAttempts   = make(map[string]*loginTracker)
	loginAttemptsMu sync.Mutex
)

type loginTracker struct {
	failures    int
	lockedUntil time.Time
	lastAttempt time.Time
}

func init() {
	// Cleanup goroutine: remove stale entries every 10 minutes.
	go func() {
		for {
			time.Sleep(10 * time.Minute)
			loginAttemptsMu.Lock()
			cutoff := time.Now().Add(-30 * time.Minute)
			for k, v := range loginAttempts {
				if v.lastAttempt.Before(cutoff) {
					delete(loginAttempts, k)
				}
			}
			loginAttemptsMu.Unlock()
		}
	}()
}

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
	// Brute-force lockout check
	loginAttemptsMu.Lock()
	tracker := loginAttempts[username]
	if tracker != nil && time.Now().Before(tracker.lockedUntil) {
		loginAttemptsMu.Unlock()
		return "", "", nil, apperrors.New(apperrors.ErrUnauthorized, "account temporarily locked, try again later")
	}
	loginAttemptsMu.Unlock()

	user, err := s.userRepo.GetByUsername(username)
	if err != nil {
		return "", "", nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to query user")
	}
	if user == nil {
		s.recordLoginFailure(username)
		return "", "", nil, apperrors.New(apperrors.ErrUnauthorized, "invalid username or password")
	}

	if user.Status != 1 {
		return "", "", nil, apperrors.New(apperrors.ErrForbidden, "account is disabled")
	}

	if !crypto.CheckPassword(password, user.Password) {
		s.recordLoginFailure(username)
		return "", "", nil, apperrors.New(apperrors.ErrUnauthorized, "invalid username or password")
	}

	// Successful login — reset failure counter
	loginAttemptsMu.Lock()
	delete(loginAttempts, username)
	loginAttemptsMu.Unlock()

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

func (s *AuthService) recordLoginFailure(username string) {
	loginAttemptsMu.Lock()
	defer loginAttemptsMu.Unlock()

	t := loginAttempts[username]
	if t == nil {
		t = &loginTracker{}
		loginAttempts[username] = t
	}
	t.failures++
	t.lastAttempt = time.Now()

	if t.failures >= 10 {
		t.lockedUntil = time.Now().Add(15 * time.Minute)
		logger.Warn().Str("username", username).Msg("login locked for 15 minutes after 10 failures")
	} else if t.failures >= 5 {
		t.lockedUntil = time.Now().Add(30 * time.Second)
		logger.Warn().Str("username", username).Msg("login locked for 30 seconds after 5 failures")
	}
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

	// Use fixed default password for development
	password := "admin@123456"

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
