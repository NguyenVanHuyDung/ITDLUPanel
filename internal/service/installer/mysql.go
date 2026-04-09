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

// mysqlVersionMeta describes a MySQL/MariaDB version entry.
type mysqlVersionMeta struct {
	key         string // e.g. "mariadb-11.4"
	isMariaDB   bool
	majorMinor  string // e.g. "11.4", "8.0"
	serviceName string // primary systemd service name
}

// parseMySQLVersion extracts metadata from a version key like "mysql-8.4" or "mariadb-11.4".
func parseMySQLVersion(version string) mysqlVersionMeta {
	m := mysqlVersionMeta{key: version}
	if strings.HasPrefix(version, "mariadb-") {
		m.isMariaDB = true
		m.majorMinor = strings.TrimPrefix(version, "mariadb-")
		m.serviceName = "mariadb"
	} else {
		m.isMariaDB = false
		m.majorMinor = strings.TrimPrefix(version, "mysql-")
		m.serviceName = "mysql"
		if system.GetOSInfo().PkgManager == "dnf" {
			m.serviceName = "mysqld"
		}
	}
	return m
}

func (i *MySQLInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()
	meta := parseMySQLVersion(version)

	progress(5)
	logger.Info().Str("version", version).Bool("mariadb", meta.isMariaDB).Msg("installing mysql/mariadb")

	// Refresh package index
	progress(10)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	// Set up official repo for version pinning (if not using distro default)
	progress(15)
	if meta.isMariaDB {
		if err := setupMariaDBRepo(ctx, osInfo, meta.majorMinor); err != nil {
			logger.Warn().Err(err).Str("ver", meta.majorMinor).Msg("failed to setup MariaDB repo, falling back to distro packages")
		}
	} else {
		if err := setupMySQLRepo(ctx, osInfo, meta.majorMinor); err != nil {
			logger.Warn().Err(err).Str("ver", meta.majorMinor).Msg("failed to setup MySQL repo, falling back to distro packages")
		}
	}

	// Refresh again after adding repo
	progress(25)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings (post-repo)")
	}

	progress(30)

	var pkg string
	if meta.isMariaDB {
		pkg = "mariadb-server"
	} else {
		pkg = "mysql-server"
		if osInfo.PkgManager == "dnf" {
			pkg = "mysql-community-server"
		}
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", pkg); err != nil {
		return fmt.Errorf("failed to install %s: %w", pkg, err)
	}

	progress(70)

	// Enable and start — try multiple service name aliases
	svcNames := []string{meta.serviceName}
	if meta.isMariaDB {
		svcNames = append(svcNames, "mysql", "mysqld")
	} else {
		svcNames = append(svcNames, "mysqld", "mysql")
	}
	for _, svc := range svcNames {
		if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", svc); err == nil {
			meta.serviceName = svc
			break
		}
	}
	for _, svc := range svcNames {
		if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", svc); err == nil {
			meta.serviceName = svc
			break
		}
	}

	progress(90)

	// Run mysql_secure_installation equivalent (best-effort)
	secureCommands := [][]string{
		{"mysql", "-e", "DELETE FROM mysql.user WHERE User=''"},
		{"mysql", "-e", "DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1')"},
		{"mysql", "-e", "DROP DATABASE IF EXISTS test"},
		{"mysql", "-e", "FLUSH PRIVILEGES"},
	}
	for _, cmd := range secureCommands {
		if _, err := system.Exec(ctx, cmd[0], cmd[1:]...); err != nil {
			logger.Warn().Strs("cmd", cmd).Err(err).Msg("secure installation step failed (non-fatal)")
		}
	}

	// Write performance tuning config and restart
	writeDefaultMySQLTuning(ctx, meta, osInfo)

	// Setup server directory and log links (OS-aware paths)
	setupMySQLServerDir(osInfo, meta.isMariaDB)

	progress(100)
	logger.Info().Str("package", pkg).Str("version", version).Msg("mysql/mariadb installed successfully")
	return nil
}

func (i *MySQLInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()
	confTarget := "/etc/mysql"
	if osInfo.PkgManager == "dnf" {
		confTarget = "/etc/my.cnf.d"
	}
	logDir := "/var/log/mysql"
	if osInfo.PkgManager == "dnf" {
		if _, err := os.Stat("/var/log/mariadb"); err == nil {
			logDir = "/var/log/mariadb"
		}
	}
	CleanupServerDir("mysql",
		SymlinkDef{Name: "conf", Target: confTarget},
		SymlinkDef{Name: "data", Target: "/var/lib/mysql"},
		SymlinkDef{Name: "logs", Target: logDir},
	)
	CleanupLogLinks("mysql")

	// Stop all possible service names
	for _, svc := range []string{"mysql", "mysqld", "mariadb"} {
		_, _ = system.Exec(ctx, "systemctl", "stop", svc)
		_, _ = system.Exec(ctx, "systemctl", "disable", svc)
	}

	if osInfo.PkgManager == "apt" {
		FixDpkg(ctx)
	}

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	// Try removing both mysql and mariadb packages
	for _, pkg := range []string{
		"mysql-server", "mysql-community-server", "mysql-common",
		"mariadb-server", "mariadb-common",
	} {
		_, _ = system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", pkg)
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	}

	// Clean up repo files we may have added
	cleanupMySQLRepos(osInfo)

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
	// Ordered: recommended first.
	// MariaDB LTS versions are preferred for stability.
	return []string{
		"mariadb-11.4", // LTS (recommended, GA 2024, supported until 2029)
		"mariadb-10.11", // LTS (GA 2023, supported until 2028)
		"mariadb-10.6", // LTS (GA 2021, supported until 2026)
		"mysql-8.4",    // LTS (GA 2024, supported until 2032)
		"mysql-8.0",    // LTS (GA 2018, supported until 2026)
		"mysql-9.0",    // Innovation release (short-term support)
		"mariadb-11.6", // latest stable (short-term)
	}
}

// ─── Official Repository Setup ──────────────────────────────────────────────

// setupMariaDBRepo adds the official MariaDB repo for the requested version.
func setupMariaDBRepo(ctx context.Context, osInfo *system.OSInfo, majorMinor string) error {
	if osInfo.PkgManager == "apt" {
		return setupMariaDBRepoAPT(ctx, osInfo, majorMinor)
	}
	return setupMariaDBRepoDNF(ctx, osInfo, majorMinor)
}

// setupMariaDBRepoAPT configures MariaDB apt repo for Ubuntu/Debian.
// Uses the official https://mariadb.org/download/ repo structure.
func setupMariaDBRepoAPT(ctx context.Context, osInfo *system.OSInfo, majorMinor string) error {
	// Import MariaDB signing key
	_, _ = system.Exec(ctx, "bash", "-c",
		"curl -fsSL https://mariadb.org/mariadb_release_signing_key.pgp | gpg --dearmor -o /usr/share/keyrings/mariadb-keyring.gpg")

	// Determine codename
	codename := getDistroCodename()
	if codename == "" {
		return fmt.Errorf("could not detect distro codename for MariaDB repo")
	}

	distroID := osInfo.ID
	if distroID != "ubuntu" && distroID != "debian" {
		distroID = "ubuntu"
	}

	// Write repo file
	repoLine := fmt.Sprintf(
		"deb [signed-by=/usr/share/keyrings/mariadb-keyring.gpg] https://dlm.mariadb.com/repo/mariadb-server/%s/repo/%s %s main\n",
		majorMinor, distroID, codename,
	)
	if err := os.WriteFile("/etc/apt/sources.list.d/mariadb.list", []byte(repoLine), 0644); err != nil {
		return fmt.Errorf("failed to write MariaDB repo: %w", err)
	}

	// Pin MariaDB packages from this repo to prevent distro packages from overriding
	pinContent := fmt.Sprintf(`Package: mariadb-*
Pin: origin dlm.mariadb.com
Pin-Priority: 1000

Package: libmariadb*
Pin: origin dlm.mariadb.com
Pin-Priority: 1000
`)
	_ = os.WriteFile("/etc/apt/preferences.d/99mariadb", []byte(pinContent), 0644)

	logger.Info().Str("version", majorMinor).Str("codename", codename).Msg("configured MariaDB APT repo")
	return nil
}

// setupMariaDBRepoDNF configures MariaDB yum/dnf repo for RHEL-family.
func setupMariaDBRepoDNF(ctx context.Context, osInfo *system.OSInfo, majorMinor string) error {
	// Determine RHEL major version
	rhelVer := "9"
	if strings.HasPrefix(osInfo.VersionID, "8") {
		rhelVer = "8"
	}

	repoContent := fmt.Sprintf(`[mariadb]
name = MariaDB %s
baseurl = https://dlm.mariadb.com/repo/mariadb-server/%s/yum/rhel/$releasever/$basearch
gpgkey = https://mariadb.org/mariadb_release_signing_key.pgp
gpgcheck = 1
enabled = 1
module_hotfixes = 1
`, majorMinor, majorMinor)
	_ = rhelVer // used for logging context

	if err := os.WriteFile("/etc/yum.repos.d/mariadb.repo", []byte(repoContent), 0644); err != nil {
		return fmt.Errorf("failed to write MariaDB repo: %w", err)
	}

	logger.Info().Str("version", majorMinor).Str("rhel", rhelVer).Msg("configured MariaDB DNF repo")
	return nil
}

// setupMySQLRepo adds the official MySQL repo for the requested version.
func setupMySQLRepo(ctx context.Context, osInfo *system.OSInfo, majorMinor string) error {
	if osInfo.PkgManager == "apt" {
		return setupMySQLRepoAPT(ctx, osInfo, majorMinor)
	}
	return setupMySQLRepoDNF(ctx, osInfo, majorMinor)
}

// setupMySQLRepoAPT configures the Oracle MySQL APT repo.
func setupMySQLRepoAPT(ctx context.Context, osInfo *system.OSInfo, majorMinor string) error {
	// Import MySQL signing key
	_, _ = system.Exec(ctx, "bash", "-c",
		"curl -fsSL https://repo.mysql.com/RPM-GPG-KEY-mysql-2023 | gpg --dearmor -o /usr/share/keyrings/mysql-keyring.gpg 2>/dev/null || true")

	codename := getDistroCodename()
	if codename == "" {
		return fmt.Errorf("could not detect distro codename for MySQL repo")
	}

	distroID := osInfo.ID
	if distroID != "ubuntu" && distroID != "debian" {
		distroID = "ubuntu"
	}

	// MySQL APT repo — the version selection is done via apt preferences
	// The repo contains all versions; we pin the desired one
	repoLine := fmt.Sprintf(
		"deb [signed-by=/usr/share/keyrings/mysql-keyring.gpg] https://repo.mysql.com/apt/%s %s mysql-%s\n",
		distroID, codename, majorMinor,
	)
	if err := os.WriteFile("/etc/apt/sources.list.d/mysql.list", []byte(repoLine), 0644); err != nil {
		return fmt.Errorf("failed to write MySQL repo: %w", err)
	}

	logger.Info().Str("version", majorMinor).Str("codename", codename).Msg("configured MySQL APT repo")
	return nil
}

// setupMySQLRepoDNF configures the Oracle MySQL yum/dnf repo.
func setupMySQLRepoDNF(ctx context.Context, osInfo *system.OSInfo, majorMinor string) error {
	// Determine RHEL major version for RPM download
	rhelVer := "9"
	if strings.HasPrefix(osInfo.VersionID, "8") {
		rhelVer = "8"
	}

	// Try to install official MySQL repo RPM
	rpmURL := fmt.Sprintf("https://repo.mysql.com/mysql84-community-release-el%s.rpm", rhelVer)
	if _, err := system.Exec(ctx, "dnf", "install", "-y", rpmURL); err != nil {
		logger.Warn().Err(err).Msg("failed to install MySQL repo RPM, trying manual config")
		// Fallback: write repo file manually
		repoContent := fmt.Sprintf(`[mysql-%s-community]
name = MySQL %s Community Server
baseurl = https://repo.mysql.com/yum/mysql-%s-community/el/%s/$basearch/
gpgcheck = 1
gpgkey = https://repo.mysql.com/RPM-GPG-KEY-mysql-2023
enabled = 1
`, majorMinor, majorMinor, majorMinor, rhelVer)
		if err := os.WriteFile("/etc/yum.repos.d/mysql-community.repo", []byte(repoContent), 0644); err != nil {
			return fmt.Errorf("failed to write MySQL repo: %w", err)
		}
	}

	// Disable conflicting mysql module on RHEL 8+
	_, _ = system.Exec(ctx, "dnf", "module", "disable", "-y", "mysql")

	logger.Info().Str("version", majorMinor).Str("rhel", rhelVer).Msg("configured MySQL DNF repo")
	return nil
}

// cleanupMySQLRepos removes repo files we may have created.
func cleanupMySQLRepos(osInfo *system.OSInfo) {
	files := []string{
		"/etc/apt/sources.list.d/mariadb.list",
		"/etc/apt/sources.list.d/mysql.list",
		"/etc/apt/preferences.d/99mariadb",
		"/etc/yum.repos.d/mariadb.repo",
		"/etc/yum.repos.d/mysql-community.repo",
	}
	for _, f := range files {
		if err := os.Remove(f); err != nil && !os.IsNotExist(err) {
			logger.Warn().Str("file", f).Err(err).Msg("failed to remove repo file")
		}
	}
}

// setupMySQLServerDir creates the standard server directory and log links.
func setupMySQLServerDir(osInfo *system.OSInfo, isMariaDB bool) {
	if osInfo.PkgManager == "apt" {
		SetupServerDir("mysql", []SymlinkDef{
			{Name: "conf", Target: "/etc/mysql"},
			{Name: "data", Target: "/var/lib/mysql"},
			{Name: "logs", Target: "/var/log/mysql"},
		})
		SetupLogLinks([]LogSymlink{
			{Name: "mysql.error.log", Target: "/var/log/mysql/error.log"},
			{Name: "mysql.slow.log", Target: "/var/log/mysql/mariadb-slow.log"},
		})
	} else {
		_ = os.MkdirAll("/var/log/mysql", 0755)
		SetupServerDir("mysql", []SymlinkDef{
			{Name: "conf", Target: "/etc/my.cnf.d"},
			{Name: "data", Target: "/var/lib/mysql"},
			{Name: "logs", Target: "/var/log/mysql"},
		})
		logDir := "/var/log/mysql"
		if isMariaDB {
			logDir = "/var/log/mariadb"
			_ = os.MkdirAll(logDir, 0755)
		}
		SetupLogLinks([]LogSymlink{
			{Name: "mysql.error.log", Target: logDir + "/error.log"},
			{Name: "mysql.slow.log", Target: logDir + "/slow.log"},
		})
	}
}

// ─── Performance Tuning ─────────────────────────────────────────────────────

// writeDefaultMySQLTuning writes a performance tuning config scaled by server RAM.
func writeDefaultMySQLTuning(ctx context.Context, meta mysqlVersionMeta, osInfo *system.OSInfo) {
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
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
innodb_io_capacity = 2000
innodb_io_capacity_max = 4000
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

	// innodb_log_file_size: deprecated in MySQL 8.0.30+, removed in 9.0
	if meta.isMariaDB || meta.majorMinor == "8.0" {
		cnf += "innodb_log_file_size = 256M\n"
	}
	// innodb_redo_log_capacity replaces innodb_log_file_size in MySQL 8.0.30+
	if !meta.isMariaDB && meta.majorMinor != "8.0" {
		cnf += "innodb_redo_log_capacity = 512M\n"
	}

	// query_cache: removed in MySQL 8.0, deprecated in MariaDB 11.x
	if meta.isMariaDB {
		parts := strings.Split(meta.majorMinor, ".")
		major, _ := strconv.Atoi(parts[0])
		if major < 11 {
			cnf += `query_cache_type = 1
query_cache_size = 64M
query_cache_limit = 2M
`
		}
	}

	var confPath string
	if osInfo.PkgManager == "dnf" {
		confPath = "/etc/my.cnf.d/99-itdlu-tuning.cnf"
	} else if meta.isMariaDB {
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

	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", meta.serviceName); err != nil {
		logger.Warn().Err(err).Str("service", meta.serviceName).Msg("failed to restart mysql after tuning")
	}
}
