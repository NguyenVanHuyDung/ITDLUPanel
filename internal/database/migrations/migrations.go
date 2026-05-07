package migrations

import "database/sql"

// Migration defines the interface for database migrations.
type Migration interface {
	Up(db *sql.DB) error
	Version() int
}

// All returns all migrations in order.
func All() []Migration {
	return []Migration{
		&Migration001Init{},
		&Migration002MonitorMetrics{},
		&Migration003FirewallSettings{},
		&Migration004PhpMyAdminDefaultPort{},
		&Migration005DiskQuota{},
		&Migration006SiteDescription{},
		&Migration007Permissions{},
		&Migration008PanelSettings{},
		&Migration009FTPStorage{},
		&Migration010CloudStorages{},
		&Migration011UserResources{},
		&Migration012Notifications{},
		&Migration013NotificationTemplates{},
		&Migration014SiteType{},
		&Migration015DockerCleanup{},
		&Migration016WAF{},
	}
}
