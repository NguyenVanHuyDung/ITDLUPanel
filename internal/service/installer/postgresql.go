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

// PostgreSQLInstaller handles PostgreSQL installation and removal.
type PostgreSQLInstaller struct{}

// NewPostgreSQLInstaller creates a new PostgreSQLInstaller.
func NewPostgreSQLInstaller() *PostgreSQLInstaller {
	return &PostgreSQLInstaller{}
}

func (i *PostgreSQLInstaller) Name() string { return "postgresql" }

func (i *PostgreSQLInstaller) GetVersions() []string {
	return []string{
		"17", // Latest (GA 2024)
		"16", // Current (GA 2023)
		"15", // Stable (GA 2022)
		"14", // Stable (GA 2021, EOL Nov 2026)
	}
}

func (i *PostgreSQLInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/bin/psql", "/usr/bin/pg_isready", "/usr/lib/postgresql"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *PostgreSQLInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing postgresql")

	// Refresh package index
	progress(10)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	// Setup official PGDG repo
	progress(15)
	if err := setupPostgresRepo(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("failed to setup PostgreSQL repo, falling back to distro packages")
	}

	// Refresh again after adding repo
	progress(25)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings (post-repo)")
	}

	progress(30)

	// Install PostgreSQL
	pkg := fmt.Sprintf("postgresql-%s", version)
	if osInfo.PkgManager == "apt" {
		if _, err := system.Exec(ctx, "apt", "install", "-y", pkg); err != nil {
			return fmt.Errorf("failed to install %s: %w", pkg, err)
		}
	} else {
		serverPkg := fmt.Sprintf("postgresql%s-server", version)
		if _, err := system.Exec(ctx, "dnf", "install", "-y", serverPkg); err != nil {
			return fmt.Errorf("failed to install %s: %w", serverPkg, err)
		}
	}

	progress(70)

	// Initialize database cluster if needed (DNF-based systems require explicit initdb)
	svcName := fmt.Sprintf("postgresql-%s", version)
	if osInfo.PkgManager == "dnf" {
		svcName = fmt.Sprintf("postgresql-%s", version)
		initScript := fmt.Sprintf("/usr/pgsql-%s/bin/postgresql-%s-setup", version, version)
		if _, err := os.Stat(initScript); err == nil {
			if _, err := system.Exec(ctx, initScript, "initdb"); err != nil {
				logger.Warn().Err(err).Msg("initdb may have already been run or failed")
			}
		}
	}

	// Enable and start service
	// On Debian/Ubuntu the service name is postgresql (manages all versions) or postgresql@<version>-main
	aptSvcNames := []string{"postgresql", svcName}
	dnfSvcNames := []string{svcName, "postgresql"}
	var svcNames []string
	if osInfo.PkgManager == "apt" {
		svcNames = aptSvcNames
	} else {
		svcNames = dnfSvcNames
	}

	var activeSvc string
	for _, svc := range svcNames {
		if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", svc); err == nil {
			activeSvc = svc
			break
		}
	}
	for _, svc := range svcNames {
		if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", svc); err == nil {
			if activeSvc == "" {
				activeSvc = svc
			}
			break
		}
	}

	progress(85)

	// Configure pg_hba.conf for local peer + md5 authentication
	configurePgHBA(version, osInfo)

	// Reload after hba changes
	if activeSvc != "" {
		_, _ = system.ExecWithTimeout(15*time.Second, "systemctl", "reload", activeSvc)
	}

	// Write performance tuning config
	writeDefaultPGTuning(ctx, version, osInfo)

	// Setup server directory and log links
	setupPostgresServerDir(version, osInfo)

	progress(100)
	logger.Info().Str("version", version).Msg("postgresql installed successfully")
	return nil
}

func (i *PostgreSQLInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	// Determine which versions might be installed
	for _, ver := range i.GetVersions() {
		svc := fmt.Sprintf("postgresql-%s", ver)
		_, _ = system.Exec(ctx, "systemctl", "stop", svc)
		_, _ = system.Exec(ctx, "systemctl", "disable", svc)
	}
	_, _ = system.Exec(ctx, "systemctl", "stop", "postgresql")
	_, _ = system.Exec(ctx, "systemctl", "disable", "postgresql")

	// Cleanup server dir
	confTarget := pgConfDir("", osInfo)
	dataTarget := pgDataDir("", osInfo)
	logTarget := "/var/log/postgresql"
	CleanupServerDir("postgresql",
		SymlinkDef{Name: "conf", Target: confTarget},
		SymlinkDef{Name: "data", Target: dataTarget},
		SymlinkDef{Name: "logs", Target: logTarget},
	)
	CleanupLogLinks("postgresql")

	if osInfo.PkgManager == "apt" {
		FixDpkg(ctx)
		for _, ver := range i.GetVersions() {
			_, _ = system.Exec(ctx, "apt", "purge", "-y", fmt.Sprintf("postgresql-%s", ver))
		}
		_, _ = system.Exec(ctx, "apt", "purge", "-y", "postgresql-common", "postgresql-client-common")
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	} else {
		for _, ver := range i.GetVersions() {
			_, _ = system.Exec(ctx, "dnf", "remove", "-y", fmt.Sprintf("postgresql%s-server", ver), fmt.Sprintf("postgresql%s", ver))
		}
	}

	// Clean up repo files
	cleanupPostgresRepos(osInfo)

	logger.Info().Msg("postgresql uninstalled successfully")
	return nil
}

// ─── Repository Setup ────────────────────────────────────────────────────────

func setupPostgresRepo(ctx context.Context, osInfo *system.OSInfo) error {
	if osInfo.PkgManager == "apt" {
		return setupPostgresRepoAPT(ctx, osInfo)
	}
	return setupPostgresRepoDNF(ctx, osInfo)
}

func setupPostgresRepoAPT(ctx context.Context, osInfo *system.OSInfo) error {
	// Import PGDG signing key
	_, _ = system.Exec(ctx, "bash", "-c",
		"curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg 2>/dev/null || true")

	codename := getDistroCodename()
	if codename == "" {
		return fmt.Errorf("could not detect distro codename for PostgreSQL repo")
	}

	repoLine := fmt.Sprintf(
		"deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n",
		codename,
	)
	if err := os.WriteFile("/etc/apt/sources.list.d/pgdg.list", []byte(repoLine), 0644); err != nil {
		return fmt.Errorf("failed to write PostgreSQL repo: %w", err)
	}

	logger.Info().Str("codename", codename).Msg("configured PostgreSQL PGDG APT repo")
	return nil
}

func setupPostgresRepoDNF(ctx context.Context, osInfo *system.OSInfo) error {
	rhelVer := "9"
	if strings.HasPrefix(osInfo.VersionID, "8") {
		rhelVer = "8"
	}

	rpmURL := fmt.Sprintf(
		"https://download.postgresql.org/pub/repos/yum/reporpms/EL-%s-x86_64/pgdg-redhat-repo-latest.noarch.rpm",
		rhelVer,
	)
	if _, err := system.Exec(ctx, "dnf", "install", "-y", rpmURL); err != nil {
		return fmt.Errorf("failed to install PGDG repo RPM: %w", err)
	}

	// Disable built-in postgresql module to avoid conflicts
	_, _ = system.Exec(ctx, "dnf", "module", "disable", "-y", "postgresql")

	logger.Info().Str("rhel", rhelVer).Msg("configured PostgreSQL PGDG DNF repo")
	return nil
}

func cleanupPostgresRepos(osInfo *system.OSInfo) {
	files := []string{
		"/etc/apt/sources.list.d/pgdg.list",
		"/usr/share/keyrings/postgresql-keyring.gpg",
	}
	for _, f := range files {
		if err := os.Remove(f); err != nil && !os.IsNotExist(err) {
			logger.Warn().Str("file", f).Err(err).Msg("failed to remove repo file")
		}
	}
}

// ─── Configuration ───────────────────────────────────────────────────────────

// pgConfDir returns the PostgreSQL config directory for the given version.
func pgConfDir(version string, osInfo *system.OSInfo) string {
	if osInfo.PkgManager == "apt" {
		if version != "" {
			return fmt.Sprintf("/etc/postgresql/%s/main", version)
		}
		// Find the first installed version
		entries, _ := os.ReadDir("/etc/postgresql")
		for _, e := range entries {
			if e.IsDir() {
				return filepath.Join("/etc/postgresql", e.Name(), "main")
			}
		}
		return "/etc/postgresql"
	}
	if version != "" {
		return fmt.Sprintf("/var/lib/pgsql/%s/data", version)
	}
	return "/var/lib/pgsql/data"
}

// pgDataDir returns the PostgreSQL data directory.
func pgDataDir(version string, osInfo *system.OSInfo) string {
	if osInfo.PkgManager == "apt" {
		if version != "" {
			return fmt.Sprintf("/var/lib/postgresql/%s/main", version)
		}
		entries, _ := os.ReadDir("/var/lib/postgresql")
		for _, e := range entries {
			if e.IsDir() {
				return filepath.Join("/var/lib/postgresql", e.Name(), "main")
			}
		}
		return "/var/lib/postgresql"
	}
	if version != "" {
		return fmt.Sprintf("/var/lib/pgsql/%s/data", version)
	}
	return "/var/lib/pgsql/data"
}

// configurePgHBA ensures the pg_hba.conf allows local peer + md5 auth.
func configurePgHBA(version string, osInfo *system.OSInfo) {
	confDir := pgConfDir(version, osInfo)
	hbaPath := filepath.Join(confDir, "pg_hba.conf")

	if _, err := os.Stat(hbaPath); err != nil {
		logger.Warn().Str("path", hbaPath).Msg("pg_hba.conf not found, skipping configuration")
		return
	}

	hbaContent := `# PostgreSQL Client Authentication Configuration File
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# Local connections
local   all             postgres                                peer
local   all             all                                     md5

# IPv4 local connections
host    all             all             127.0.0.1/32            md5

# IPv6 local connections
host    all             all             ::1/128                 md5
`
	if err := os.WriteFile(hbaPath, []byte(hbaContent), 0640); err != nil {
		logger.Warn().Err(err).Str("path", hbaPath).Msg("failed to write pg_hba.conf")
	}
}

// setupPostgresServerDir creates the standard server directory and log links.
func setupPostgresServerDir(version string, osInfo *system.OSInfo) {
	confDir := pgConfDir(version, osInfo)
	dataDir := pgDataDir(version, osInfo)

	_ = os.MkdirAll("/var/log/postgresql", 0755)

	SetupServerDir("postgresql", []SymlinkDef{
		{Name: "conf", Target: confDir},
		{Name: "data", Target: dataDir},
		{Name: "logs", Target: "/var/log/postgresql"},
	})

	SetupLogLinks([]LogSymlink{
		{Name: "postgresql.log", Target: "/var/log/postgresql/postgresql-" + version + "-main.log"},
	})
}

// ─── Performance Tuning ─────────────────────────────────────────────────────

func writeDefaultPGTuning(ctx context.Context, version string, osInfo *system.OSInfo) {
	res, err := system.Exec(ctx, "free", "-b")
	if err != nil {
		logger.Warn().Err(err).Msg("failed to detect RAM for postgresql tuning")
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
		logger.Warn().Msg("could not parse total RAM, skipping postgresql tuning")
		return
	}

	// shared_buffers: 25% of RAM, max 4GB
	sharedBuffers := totalRAM / 4
	const maxSharedBuffers = 4 * 1024 * 1024 * 1024
	if sharedBuffers > maxSharedBuffers {
		sharedBuffers = maxSharedBuffers
	}
	sharedBuffersMB := sharedBuffers / (1024 * 1024)

	// effective_cache_size: 75% of RAM
	effectiveCacheMB := (totalRAM * 3 / 4) / (1024 * 1024)

	// work_mem: RAM / max_connections / 4, min 4MB
	workMemMB := totalRAM / (200 * 4 * 1024 * 1024)
	if workMemMB < 4 {
		workMemMB = 4
	}
	if workMemMB > 256 {
		workMemMB = 256
	}

	// maintenance_work_mem: RAM/16, max 2GB
	maintWorkMemMB := totalRAM / (16 * 1024 * 1024)
	if maintWorkMemMB > 2048 {
		maintWorkMemMB = 2048
	}
	if maintWorkMemMB < 64 {
		maintWorkMemMB = 64
	}

	tuning := fmt.Sprintf(`# ITDLUPanel PostgreSQL Tuning (auto-generated)
shared_buffers = %dMB
effective_cache_size = %dMB
work_mem = %dMB
maintenance_work_mem = %dMB
max_connections = 200
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
min_wal_size = 1GB
max_wal_size = 4GB
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
max_parallel_maintenance_workers = 4
`, sharedBuffersMB, effectiveCacheMB, workMemMB, maintWorkMemMB)

	// Write to conf.d if available, otherwise append to postgresql.conf
	confDir := pgConfDir(version, osInfo)
	confDDir := filepath.Join(confDir, "conf.d")
	if _, err := os.Stat(confDDir); err == nil {
		tuningPath := filepath.Join(confDDir, "99-itdlu-tuning.conf")
		if err := os.WriteFile(tuningPath, []byte(tuning), 0644); err != nil {
			logger.Warn().Err(err).Str("path", tuningPath).Msg("failed to write PG tuning config")
			return
		}
		logger.Info().Str("path", tuningPath).Msg("wrote postgresql tuning config")
	} else {
		// Create conf.d and add include directive
		_ = os.MkdirAll(confDDir, 0755)
		tuningPath := filepath.Join(confDDir, "99-itdlu-tuning.conf")
		if err := os.WriteFile(tuningPath, []byte(tuning), 0644); err != nil {
			logger.Warn().Err(err).Str("path", tuningPath).Msg("failed to write PG tuning config")
			return
		}

		// Add include_dir if not already present in postgresql.conf
		pgConfPath := filepath.Join(confDir, "postgresql.conf")
		if content, err := os.ReadFile(pgConfPath); err == nil {
			if !strings.Contains(string(content), "include_dir") {
				appendLine := "\n# Include additional configuration\ninclude_dir = 'conf.d'\n"
				_ = os.WriteFile(pgConfPath, append(content, []byte(appendLine)...), 0644)
			}
		}
		logger.Info().Str("path", tuningPath).Msg("wrote postgresql tuning config (created conf.d)")
	}

	// Restart to apply tuning
	svcName := fmt.Sprintf("postgresql-%s", version)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", svcName); err != nil {
		// Try generic service name
		if _, err2 := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", "postgresql"); err2 != nil {
			logger.Warn().Err(err).Str("service", svcName).Msg("failed to restart postgresql after tuning")
		}
	}
}
