package service

import (
	"database/sql"
	"fmt"
	"strings"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
)

// UserResourceService manages per-user resource assignments (row-level security).
type UserResourceService struct {
	db *sql.DB
}

// NewUserResourceService creates a new UserResourceService.
func NewUserResourceService(db *sql.DB) *UserResourceService {
	return &UserResourceService{db: db}
}

// UserResource represents a user-to-resource mapping.
type UserResource struct {
	ID           int64  `json:"id"`
	UserID       int64  `json:"user_id"`
	ResourceType string `json:"resource_type"`
	ResourceID   int64  `json:"resource_id"`
	ResourceName string `json:"resource_name,omitempty"`
	CreatedAt    string `json:"created_at,omitempty"`
}

// validResourceTypes defines allowed resource types.
var validResourceTypes = map[string]bool{
	"site":             true,
	"database":         true,
	"ftp":              true,
	"docker_container": true,
}

// Assign grants a user access to a specific resource.
func (s *UserResourceService) Assign(userID int64, resourceType string, resourceID int64) error {
	if !validResourceTypes[resourceType] {
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("invalid resource type: %s", resourceType))
	}

	_, err := s.db.Exec(
		`INSERT OR IGNORE INTO user_resources (user_id, resource_type, resource_id) VALUES (?, ?, ?)`,
		userID, resourceType, resourceID,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to assign resource")
	}
	return nil
}

// BulkAssign assigns multiple resources of one type to a user, replacing existing assignments.
func (s *UserResourceService) BulkAssign(userID int64, resourceType string, resourceIDs []int64) error {
	if !validResourceTypes[resourceType] {
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("invalid resource type: %s", resourceType))
	}

	tx, err := s.db.Begin()
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to start transaction")
	}
	defer tx.Rollback()

	// Remove existing assignments for this user+type
	_, err = tx.Exec(
		`DELETE FROM user_resources WHERE user_id = ? AND resource_type = ?`,
		userID, resourceType,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to clear assignments")
	}

	// Insert new assignments
	if len(resourceIDs) > 0 {
		stmt, err := tx.Prepare(
			`INSERT INTO user_resources (user_id, resource_type, resource_id) VALUES (?, ?, ?)`,
		)
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to prepare statement")
		}
		defer stmt.Close()

		for _, rid := range resourceIDs {
			if _, err := stmt.Exec(userID, resourceType, rid); err != nil {
				return apperrors.Wrap(err, apperrors.ErrInternal, "failed to assign resource")
			}
		}
	}

	return tx.Commit()
}

// Remove revokes a user's access to a specific resource.
func (s *UserResourceService) Remove(userID int64, resourceType string, resourceID int64) error {
	_, err := s.db.Exec(
		`DELETE FROM user_resources WHERE user_id = ? AND resource_type = ? AND resource_id = ?`,
		userID, resourceType, resourceID,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to remove resource assignment")
	}
	return nil
}

// RemoveAllForUser removes all resource assignments for a user.
func (s *UserResourceService) RemoveAllForUser(userID int64) error {
	_, err := s.db.Exec(`DELETE FROM user_resources WHERE user_id = ?`, userID)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to remove all user resources")
	}
	return nil
}

// RemoveAllForResource removes all assignments for a specific resource (e.g. when deleting a site).
func (s *UserResourceService) RemoveAllForResource(resourceType string, resourceID int64) error {
	_, err := s.db.Exec(
		`DELETE FROM user_resources WHERE resource_type = ? AND resource_id = ?`,
		resourceType, resourceID,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to remove resource assignments")
	}
	return nil
}

// ListResourceIDs returns the resource IDs assigned to a user for a given type.
func (s *UserResourceService) ListResourceIDs(userID int64, resourceType string) ([]int64, error) {
	rows, err := s.db.Query(
		`SELECT resource_id FROM user_resources WHERE user_id = ? AND resource_type = ?`,
		userID, resourceType,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list user resources")
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			continue
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// ListUserResources returns all resource assignments for a user with resource names.
func (s *UserResourceService) ListUserResources(userID int64) ([]UserResource, error) {
	rows, err := s.db.Query(
		`SELECT ur.id, ur.user_id, ur.resource_type, ur.resource_id, ur.created_at
		 FROM user_resources ur WHERE ur.user_id = ? ORDER BY ur.resource_type, ur.resource_id`,
		userID,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list user resources")
	}
	defer rows.Close()

	var resources []UserResource
	for rows.Next() {
		var r UserResource
		if err := rows.Scan(&r.ID, &r.UserID, &r.ResourceType, &r.ResourceID, &r.CreatedAt); err != nil {
			continue
		}
		// Resolve resource name
		r.ResourceName = s.resolveResourceName(r.ResourceType, r.ResourceID)
		resources = append(resources, r)
	}
	return resources, nil
}

// HasAccess checks if a user has access to a specific resource.
func (s *UserResourceService) HasAccess(userID int64, resourceType string, resourceID int64) (bool, error) {
	var count int
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM user_resources WHERE user_id = ? AND resource_type = ? AND resource_id = ?`,
		userID, resourceType, resourceID,
	).Scan(&count)
	if err != nil {
		return false, apperrors.Wrap(err, apperrors.ErrInternal, "failed to check resource access")
	}
	return count > 0, nil
}

// IsAdmin checks if a user has admin role.
func (s *UserResourceService) IsAdmin(userID int64) (bool, error) {
	var role string
	err := s.db.QueryRow(`SELECT role FROM users WHERE id = ?`, userID).Scan(&role)
	if err != nil {
		return false, err
	}
	return role == "admin", nil
}

// BuildResourceFilter returns a SQL WHERE clause fragment for filtering resources.
// For admin users, returns empty string (no filter). For others, returns "AND id IN (1,2,3)".
func (s *UserResourceService) BuildResourceFilter(userID int64, role, resourceType, idColumn string) (string, error) {
	if role == "admin" {
		return "", nil
	}

	ids, err := s.ListResourceIDs(userID, resourceType)
	if err != nil {
		return "", err
	}

	if len(ids) == 0 {
		return fmt.Sprintf(" AND %s IN (-1)", idColumn), nil // No access → return nothing
	}

	parts := make([]string, len(ids))
	for i, id := range ids {
		parts[i] = fmt.Sprintf("%d", id)
	}
	return fmt.Sprintf(" AND %s IN (%s)", idColumn, strings.Join(parts, ",")), nil
}

func (s *UserResourceService) resolveResourceName(resourceType string, resourceID int64) string {
	var name string
	var err error

	switch resourceType {
	case "site":
		err = s.db.QueryRow(`SELECT domain FROM sites WHERE id = ?`, resourceID).Scan(&name)
	case "database":
		err = s.db.QueryRow(`SELECT name FROM databases WHERE id = ?`, resourceID).Scan(&name)
	case "ftp":
		err = s.db.QueryRow(`SELECT username FROM ftp_accounts WHERE id = ?`, resourceID).Scan(&name)
	}

	if err != nil {
		return fmt.Sprintf("#%d", resourceID)
	}
	return name
}
