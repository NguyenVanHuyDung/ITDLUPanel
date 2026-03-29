package installer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// MySQLInstaller handles MySQL / MariaDB installation and removal.
type MySQLInstaller struct{}

// NewMySQLInstaller creates a new MySQLInstaller.
func NewMySQLInstaller() *MySQLInstaller {
	return &MySQLInstaller{}
}

func (i *MySQLInstaller) Name() string { return "mysql" }

func (i *MySQLInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing mysql/mariadb")

	isMariaDB := strings.HasPrefix(version, "mariadb")

	// Update package index
	progress(10)
	if _, err := system.Exec(ctx, osInfo.PkgManager, "update", "-y"); err != nil {
		logger.Warn().Err(err).Msg("package index update had warnings")
	}

	progress(30)

	var pkg, serviceName string
	if isMariaDB {
		if osInfo.PkgManager == "apt" {
			pkg = "mariadb-server"
		} else {
			pkg = "mariadb-server"
		}
		serviceName = "mariadb"
	} else {
		if osInfo.PkgManager == "apt" {
			pkg = "mysql-server"
		} else {
			pkg = "mysql-server"
		}
		serviceName = "mysql"
		// On RHEL-based the service is mysqld
		if osInfo.PkgManager == "dnf" {
			serviceName = "mysqld"
		}
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", pkg); err != nil {
		return fmt.Errorf("failed to install %s: %w", pkg, err)
	}

	progress(70)

	// Enable and start
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Str("service", serviceName).Msg("failed to enable service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err != nil {
		logger.Warn().Err(err).Str("service", serviceName).Msg("failed to start service")
	}

	progress(90)

	// Run mysql_secure_installation equivalent: set root auth to native password
	// This is best-effort – the server may not be ready yet
	secureCommands := []struct {
		args []string
	}{
		{[]string{"mysql", "-e", "DELETE FROM mysql.user WHERE User=''"}},
		{[]string{"mysql", "-e", "DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1')"}},
		{[]string{"mysql", "-e", "DROP DATABASE IF EXISTS test"}},
		{[]string{"mysql", "-e", "FLUSH PRIVILEGES"}},
	}
	for _, cmd := range secureCommands {
		if _, err := system.Exec(ctx, cmd.args[0], cmd.args[1:]...); err != nil {
			logger.Warn().Strs("cmd", cmd.args).Err(err).Msg("secure installation step failed (non-fatal)")
		}
	}

	// Write performance tuning config and restart
	writeDefaultMySQLTuning(ctx, isMariaDB, serviceName)

	SetupServerDir("mysql", []SymlinkDef{
		{Name: "conf", Target: "/etc/mysql"},
		{Name: "data", Target: "/var/lib/mysql"},
		{Name: "logs", Target: "/var/log/mysql"},
	})

	progress(100)
	logger.Info().Str("package", pkg).Msg("mysql/mariadb installed successfully")
	return nil
}

func (i *MySQLInstaller) Uninstall(ctx context.Context) error {
	CleanupServerDir("mysql")

	osInfo := system.GetOSInfo()

	// Stop all possible service names
	for _, svc := range []string{"mysql", "mysqld", "mariadb"} {
		_, _ = system.Exec(ctx, "systemctl", "stop", svc)
		_, _ = system.Exec(ctx, "systemctl", "disable", svc)
	}

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	// Try removing both mysql and mariadb packages
	for _, pkg := range []string{"mysql-server", "mariadb-server"} {
		_, _ = system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", pkg)
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	}

	logger.Info().Msg("mysql/mariadb uninstalled successfully")
	return nil
}

func (i *MySQLInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/bin/mysql", "/usr/bin/mariadb", "/usr/sbin/mysqld", "/usr/sbin/mariadbd"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *MySQLInstaller) GetVersions() []string {
	return []string{"mysql-8.0", "mariadb-10.6", "mariadb-10.11"}
}

// writeDefaultMySQLTuning writes a performance tuning config scaled by server RAM.
func writeDefaultMySQLTuning(ctx context.Context, isMariaDB bool, serviceName string) {
	res, err := system.Exec(ctx, "free", "-b")
	if err != nil {
		logger.Warn().Err(err).Msg("failed to detect RAM for mysql tuning")
		return
	}

	var totalRAM int64
	for _, line := range strings.Split(res.Stdout, "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && fields[0] == "Mem:" {
			totalRAM, _ = strconv.ParseInt(fields[1], 10, 64)
			break
		}
	}
	if totalRAM <= 0 {
		logger.Warn().Msg("could not parse total RAM, skipping mysql tuning")
		return
	}

	bufferPoolSize := totalRAM / 8
	const maxBufferPool = 4 * 1024 * 1024 * 1024 // 4GB
	if bufferPoolSize > maxBufferPool {
		bufferPoolSize = maxBufferPool
	}

	cnf := fmt.Sprintf(`[mysqld]
innodb_buffer_pool_size = %d
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
innodb_io_capacity = 2000
innodb_io_capacity_max = 4000
query_cache_type = 1
query_cache_size = 64M
query_cache_limit = 2M
max_connections = 200
thread_cache_size = 16
tmp_table_size = 64M
max_heap_table_size = 64M
join_buffer_size = 2M
sort_buffer_size = 2M
read_buffer_size = 2M
read_rnd_buffer_size = 2M
table_open_cache = 4000
table_definition_cache = 2000
`, bufferPoolSize)

	var confPath string
	if isMariaDB {
		confPath = "/etc/mysql/mariadb.conf.d/99-itdlu-tuning.cnf"
	} else {
		confPath = "/etc/mysql/mysql.conf.d/99-itdlu-tuning.cnf"
	}

	if err := os.MkdirAll(filepath.Dir(confPath), 0755); err != nil {
		logger.Warn().Err(err).Msg("failed to create mysql conf directory")
		return
	}

	if err := os.WriteFile(confPath, []byte(cnf), 0644); err != nil {
		logger.Warn().Err(err).Str("path", confPath).Msg("failed to write mysql tuning config")
		return
	}

	logger.Info().Str("path", confPath).Int64("buffer_pool", bufferPoolSize).Msg("wrote mysql tuning config")

	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", serviceName); err != nil {
		logger.Warn().Err(err).Str("service", serviceName).Msg("failed to restart mysql after tuning")
	}
}
