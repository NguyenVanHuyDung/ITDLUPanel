package service

import (
	"database/sql"

	"github.com/ITDLUPanel/panel/internal/database/models"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
)

// RoleService handles role management operations.
type RoleService struct {
	db       *sql.DB
	roleRepo *models.RoleRepository
}

// NewRoleService creates a new RoleService.
func NewRoleService(db *sql.DB) *RoleService {
	return &RoleService{
		db:       db,
		roleRepo: models.NewRoleRepository(db),
	}
}

// ListRoles returns all roles.
func (s *RoleService) ListRoles() ([]models.Role, error) {
	roles, err := s.roleRepo.List()
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list roles")
	}
	return roles, nil
}

// GetRole retrieves a role by ID.
func (s *RoleService) GetRole(id int64) (*models.Role, error) {
	role, err := s.roleRepo.GetByID(id)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get role")
	}
	if role == nil {
		return nil, apperrors.New(apperrors.ErrNotFound, "role not found")
	}
	return role, nil
}

// CreateRole creates a new custom role.
func (s *RoleService) CreateRole(name, description string, permissions []string) (*models.Role, error) {
	existing, err := s.roleRepo.GetByName(name)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to check role name")
	}
	if existing != nil {
		return nil, apperrors.New(apperrors.ErrConflict, "role name already exists")
	}

	role := &models.Role{
		Name:        name,
		Description: description,
		Permissions: permissions,
	}
	if err := s.roleRepo.Create(role); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create role")
	}
	return role, nil
}

// UpdateRole updates a role's permissions.
func (s *RoleService) UpdateRole(id int64, name, description string, permissions []string) (*models.Role, error) {
	role, err := s.roleRepo.GetByID(id)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get role")
	}
	if role == nil {
		return nil, apperrors.New(apperrors.ErrNotFound, "role not found")
	}

	// System roles: can update permissions but not name
	if role.IsSystem {
		role.Permissions = permissions
		if description != "" {
			role.Description = description
		}
	} else {
		if name != "" {
			// Check name uniqueness if changing
			if name != role.Name {
				existing, err := s.roleRepo.GetByName(name)
				if err != nil {
					return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to check role name")
				}
				if existing != nil {
					return nil, apperrors.New(apperrors.ErrConflict, "role name already exists")
				}
				// Update users that reference this role name
				_, err = s.db.Exec("UPDATE users SET role = ? WHERE role = ?", name, role.Name)
				if err != nil {
					return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to update user roles")
				}
			}
			role.Name = name
		}
		if description != "" {
			role.Description = description
		}
		role.Permissions = permissions
	}

	if err := s.roleRepo.Update(role); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to update role")
	}
	return role, nil
}

// DeleteRole deletes a custom role.
func (s *RoleService) DeleteRole(id int64) error {
	role, err := s.roleRepo.GetByID(id)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to get role")
	}
	if role == nil {
		return apperrors.New(apperrors.ErrNotFound, "role not found")
	}
	if role.IsSystem {
		return apperrors.New(apperrors.ErrConflict, "cannot delete system role")
	}

	// Check if any users still use this role
	count, err := s.roleRepo.CountUsersByRole(role.Name)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to count users")
	}
	if count > 0 {
		return apperrors.New(apperrors.ErrConflict, "cannot delete role that is still assigned to users")
	}

	if err := s.roleRepo.Delete(id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete role")
	}
	return nil
}

// GetPermissionTree returns the full permission tree structure for the frontend.
func (s *RoleService) GetPermissionTree() []PermissionGroup {
	return AllPermissions
}

// PermissionGroup represents a group of related permissions.
type PermissionGroup struct {
	Key         string       `json:"key"`
	Label       string       `json:"label"`
	Permissions []Permission `json:"permissions"`
}

// Permission represents a single permission.
type Permission struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

// AllPermissions defines the complete permission tree.
var AllPermissions = []PermissionGroup{
	{
		Key:   "dashboard",
		Label: "Dashboard",
		Permissions: []Permission{
			{Key: "dashboard.read", Label: "View Dashboard"},
		},
	},
	{
		Key:   "sites",
		Label: "Sites",
		Permissions: []Permission{
			{Key: "sites.read", Label: "View Sites"},
			{Key: "sites.create", Label: "Create Sites"},
			{Key: "sites.edit", Label: "Edit Sites"},
			{Key: "sites.delete", Label: "Delete Sites"},
			{Key: "sites.ssl", Label: "Manage SSL"},
			{Key: "sites.config", Label: "Edit Site Config"},
		},
	},
	{
		Key:   "databases",
		Label: "Databases",
		Permissions: []Permission{
			{Key: "databases.read", Label: "View Databases"},
			{Key: "databases.create", Label: "Create Databases"},
			{Key: "databases.edit", Label: "Edit Databases"},
			{Key: "databases.delete", Label: "Delete Databases"},
			{Key: "databases.backup", Label: "Backup/Restore"},
		},
	},
	{
		Key:   "ftp",
		Label: "FTP",
		Permissions: []Permission{
			{Key: "ftp.read", Label: "View FTP Accounts"},
			{Key: "ftp.create", Label: "Create FTP Accounts"},
			{Key: "ftp.edit", Label: "Edit FTP Accounts"},
			{Key: "ftp.delete", Label: "Delete FTP Accounts"},
		},
	},
	{
		Key:   "files",
		Label: "Files",
		Permissions: []Permission{
			{Key: "files.read", Label: "Browse Files"},
			{Key: "files.write", Label: "Upload/Edit Files"},
			{Key: "files.delete", Label: "Delete Files"},
		},
	},
	{
		Key:   "cron",
		Label: "Cron Jobs",
		Permissions: []Permission{
			{Key: "cron.read", Label: "View Cron Jobs"},
			{Key: "cron.create", Label: "Create Cron Jobs"},
			{Key: "cron.edit", Label: "Edit Cron Jobs"},
			{Key: "cron.delete", Label: "Delete Cron Jobs"},
		},
	},
	{
		Key:   "backup",
		Label: "Backups",
		Permissions: []Permission{
			{Key: "backup.read", Label: "View Backups"},
			{Key: "backup.create", Label: "Create Backups"},
			{Key: "backup.restore", Label: "Restore Backups"},
			{Key: "backup.delete", Label: "Delete Backups"},
		},
	},
	{
		Key:   "docker",
		Label: "Docker",
		Permissions: []Permission{
			{Key: "docker.read", Label: "View Containers"},
			{Key: "docker.manage", Label: "Start/Stop Containers"},
			{Key: "docker.create", Label: "Create/Delete Containers"},
			{Key: "docker.cleanup", Label: "Docker Auto-Cleanup"},
		},
	},
	{
		Key:   "firewall",
		Label: "Firewall",
		Permissions: []Permission{
			{Key: "firewall.read", Label: "View Firewall Rules"},
			{Key: "firewall.manage", Label: "Manage Firewall"},
		},
	},
	{
		Key:   "terminal",
		Label: "Terminal",
		Permissions: []Permission{
			{Key: "terminal.access", Label: "SSH Terminal Access"},
		},
	},
	{
		Key:   "monitor",
		Label: "Monitoring",
		Permissions: []Permission{
			{Key: "monitor.read", Label: "View System Stats"},
			{Key: "monitor.processes", Label: "Manage Processes"},
		},
	},
	{
		Key:   "logs",
		Label: "Logs",
		Permissions: []Permission{
			{Key: "logs.read", Label: "View Logs"},
			{Key: "logs.manage", Label: "Clear Logs"},
		},
	},
	{
		Key:   "system",
		Label: "System (Admin)",
		Permissions: []Permission{
			{Key: "software.manage", Label: "Manage Software"},
			{Key: "users.manage", Label: "Manage Users & Roles"},
			{Key: "settings.manage", Label: "Panel Settings"},
			{Key: "security.manage", Label: "Security Settings"},
		},
	},
}
