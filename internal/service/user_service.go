package service

import (
	"database/sql"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/database/models"
	"github.com/ITDLUPanel/panel/internal/pkg/crypto"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
)

// UserService handles user management operations.
type UserService struct {
	db       *sql.DB
	userRepo *models.UserRepository
}

// NewUserService creates a new UserService.
func NewUserService(db *sql.DB) *UserService {
	return &UserService{
		db:       db,
		userRepo: models.NewUserRepository(db),
	}
}

// CreateUser creates a new user (admin only operation).
func (s *UserService) CreateUser(username, password, email, role string) (*models.User, error) {
	existing, err := s.userRepo.GetByUsername(username)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to check username")
	}
	if existing != nil {
		return nil, apperrors.New(apperrors.ErrConflict, "username already exists")
	}

	cfg := config.Get()
	hashed, err := crypto.HashPassword(password, cfg.Auth.BcryptCost)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to hash password")
	}

	user := &models.User{
		Username: username,
		Password: hashed,
		Email:    email,
		Role:     role,
		Status:   1,
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create user")
	}

	return user, nil
}

// GetUser retrieves a user by ID.
func (s *UserService) GetUser(id int64) (*models.User, error) {
	user, err := s.userRepo.GetByID(id)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get user")
	}
	if user == nil {
		return nil, apperrors.New(apperrors.ErrNotFound, "user not found")
	}
	return user, nil
}

// UpdateUser updates user info (not password).
func (s *UserService) UpdateUser(id int64, email, role string, status int) (*models.User, error) {
	user, err := s.userRepo.GetByID(id)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get user")
	}
	if user == nil {
		return nil, apperrors.New(apperrors.ErrNotFound, "user not found")
	}

	if email != "" {
		user.Email = email
	}
	if role != "" {
		user.Role = role
	}
	user.Status = status

	if err := s.userRepo.Update(user); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to update user")
	}

	// Reload to get updated timestamps
	user, err = s.userRepo.GetByID(id)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload user")
	}

	return user, nil
}

// DeleteUser deletes a user (cannot delete self or last admin).
func (s *UserService) DeleteUser(id int64, currentUserID int64) error {
	if id == currentUserID {
		return apperrors.New(apperrors.ErrConflict, "cannot delete your own account")
	}

	user, err := s.userRepo.GetByID(id)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to get user")
	}
	if user == nil {
		return apperrors.New(apperrors.ErrNotFound, "user not found")
	}

	// Prevent deleting the last admin
	if user.Role == "admin" {
		var adminCount int64
		err := s.db.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 1").Scan(&adminCount)
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to count admins")
		}
		if adminCount <= 1 {
			return apperrors.New(apperrors.ErrConflict, "cannot delete the last admin user")
		}
	}

	if err := s.userRepo.Delete(id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete user")
	}

	return nil
}

// ResetPassword resets a user's password (admin operation).
func (s *UserService) ResetPassword(id int64, newPassword string) error {
	user, err := s.userRepo.GetByID(id)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to get user")
	}
	if user == nil {
		return apperrors.New(apperrors.ErrNotFound, "user not found")
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

// ListUsers returns a paginated list of users.
func (s *UserService) ListUsers(page, perPage int) ([]models.User, int64, error) {
	users, total, err := s.userRepo.List(page, perPage)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list users")
	}
	return users, total, nil
}
