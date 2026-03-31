package models

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// Role represents a panel role with permissions.
type Role struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Permissions []string  `json:"permissions"`
	IsSystem    bool      `json:"is_system"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// RoleRepository provides CRUD operations for roles.
type RoleRepository struct {
	db *sql.DB
}

// NewRoleRepository creates a new RoleRepository.
func NewRoleRepository(db *sql.DB) *RoleRepository {
	return &RoleRepository{db: db}
}

// parseTime parses a datetime string from SQLite.
func parseTime(s string) time.Time {
	for _, layout := range []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02T15:04:05Z"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t
		}
	}
	return time.Time{}
}

// List returns all roles.
func (r *RoleRepository) List() ([]Role, error) {
	rows, err := r.db.Query("SELECT id, name, COALESCE(description,''), permissions, COALESCE(is_system, 0), COALESCE(created_at,''), COALESCE(updated_at,'') FROM roles ORDER BY is_system DESC, id ASC")
	if err != nil {
		return nil, fmt.Errorf("failed to list roles: %w", err)
	}
	defer rows.Close()

	var roles []Role
	for rows.Next() {
		var role Role
		var permsJSON string
		var isSystem int
		var createdStr, updatedStr string
		if err := rows.Scan(&role.ID, &role.Name, &role.Description, &permsJSON, &isSystem, &createdStr, &updatedStr); err != nil {
			return nil, fmt.Errorf("failed to scan role: %w", err)
		}
		if err := json.Unmarshal([]byte(permsJSON), &role.Permissions); err != nil {
			role.Permissions = []string{}
		}
		role.IsSystem = isSystem == 1
		role.CreatedAt = parseTime(createdStr)
		role.UpdatedAt = parseTime(updatedStr)
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

// GetByID retrieves a role by ID.
func (r *RoleRepository) GetByID(id int64) (*Role, error) {
	var role Role
	var permsJSON string
	var isSystem int
	var createdStr, updatedStr string
	err := r.db.QueryRow(
		"SELECT id, name, COALESCE(description,''), permissions, COALESCE(is_system, 0), COALESCE(created_at,''), COALESCE(updated_at,'') FROM roles WHERE id = ?", id,
	).Scan(&role.ID, &role.Name, &role.Description, &permsJSON, &isSystem, &createdStr, &updatedStr)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get role: %w", err)
	}
	if err := json.Unmarshal([]byte(permsJSON), &role.Permissions); err != nil {
		role.Permissions = []string{}
	}
	role.IsSystem = isSystem == 1
	role.CreatedAt = parseTime(createdStr)
	role.UpdatedAt = parseTime(updatedStr)
	return &role, nil
}

// GetByName retrieves a role by name.
func (r *RoleRepository) GetByName(name string) (*Role, error) {
	var role Role
	var permsJSON string
	var isSystem int
	var createdStr, updatedStr string
	err := r.db.QueryRow(
		"SELECT id, name, COALESCE(description,''), permissions, COALESCE(is_system, 0), COALESCE(created_at,''), COALESCE(updated_at,'') FROM roles WHERE name = ?", name,
	).Scan(&role.ID, &role.Name, &role.Description, &permsJSON, &isSystem, &createdStr, &updatedStr)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get role: %w", err)
	}
	if err := json.Unmarshal([]byte(permsJSON), &role.Permissions); err != nil {
		role.Permissions = []string{}
	}
	role.IsSystem = isSystem == 1
	role.CreatedAt = parseTime(createdStr)
	role.UpdatedAt = parseTime(updatedStr)
	return &role, nil
}

// Create inserts a new role.
func (r *RoleRepository) Create(role *Role) error {
	permsJSON, err := json.Marshal(role.Permissions)
	if err != nil {
		return fmt.Errorf("failed to marshal permissions: %w", err)
	}
	result, err := r.db.Exec(
		"INSERT INTO roles (name, description, permissions, is_system, created_at, updated_at) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
		role.Name, role.Description, string(permsJSON),
	)
	if err != nil {
		return fmt.Errorf("failed to create role: %w", err)
	}
	role.ID, _ = result.LastInsertId()
	role.IsSystem = false
	return nil
}

// Update modifies an existing role.
func (r *RoleRepository) Update(role *Role) error {
	permsJSON, err := json.Marshal(role.Permissions)
	if err != nil {
		return fmt.Errorf("failed to marshal permissions: %w", err)
	}
	_, err = r.db.Exec(
		"UPDATE roles SET name = ?, description = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		role.Name, role.Description, string(permsJSON), role.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update role: %w", err)
	}
	return nil
}

// Delete removes a role by ID.
func (r *RoleRepository) Delete(id int64) error {
	result, err := r.db.Exec("DELETE FROM roles WHERE id = ? AND COALESCE(is_system, 0) = 0", id)
	if err != nil {
		return fmt.Errorf("failed to delete role: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("role not found or is a system role")
	}
	return nil
}

// CountUsersByRole counts how many users have a specific role name.
func (r *RoleRepository) CountUsersByRole(roleName string) (int64, error) {
	var count int64
	err := r.db.QueryRow("SELECT COUNT(*) FROM users WHERE role = ?", roleName).Scan(&count)
	return count, err
}
