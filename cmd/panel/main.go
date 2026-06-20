package main

import (
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/ITDLUPanel/panel/internal/app"
	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/database"
	"github.com/ITDLUPanel/panel/internal/pkg/crypto"
	"github.com/ITDLUPanel/panel/internal/service"
	v1 "github.com/ITDLUPanel/panel/internal/api/v1"
)

// Build-time variables injected via -ldflags.
var (
	version   = "0.1.0"
	buildTime = "dev"
)

func main() {
	// Sub-command: reset-password
	if len(os.Args) > 1 && os.Args[1] == "reset-password" {
		resetCmd := flag.NewFlagSet("reset-password", flag.ExitOnError)
		cfgPath := resetCmd.String("config", "", "Path to config file")
		username := resetCmd.String("user", "admin", "Username to reset")
		newPass := resetCmd.String("password", "", "New password (min 6 chars)")
		resetCmd.Parse(os.Args[2:])

		if *newPass == "" {
			fmt.Fprintln(os.Stderr, "Usage: itdlupanel reset-password -password <new-password> [-user admin] [-config config/panel.json]")
			os.Exit(1)
		}
		if len(*newPass) < 6 {
			fmt.Fprintln(os.Stderr, "Error: password must be at least 6 characters")
			os.Exit(1)
		}

		cp := resolveConfig(*cfgPath)
		cfg, err := config.Load(cp)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to load config: %v\n", err)
			os.Exit(1)
		}
		db, err := database.New(cfg.Database.Path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to open database: %v\n", err)
			os.Exit(1)
		}
		defer db.Close()

		hashed, err := crypto.HashPassword(*newPass, cfg.Auth.BcryptCost)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to hash password: %v\n", err)
			os.Exit(1)
		}

		res, err := db.GetDB().Exec("UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?", hashed, *username)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to update password: %v\n", err)
			os.Exit(1)
		}
		rows, _ := res.RowsAffected()
		if rows == 0 {
			fmt.Fprintf(os.Stderr, "Error: user '%s' not found\n", *username)
			os.Exit(1)
		}
		fmt.Printf("✅ Password for user '%s' has been reset successfully.\n", *username)
		os.Exit(0)
	}

	// Sub-command: backup
	if len(os.Args) > 1 && os.Args[1] == "backup" {
		runBackupCommand()
		return
	}

	// Sub-command: cron-run
	if len(os.Args) > 1 && os.Args[1] == "cron-run" {
		runCronCommand()
		return
	}

	configPath := flag.String("config", "", "Path to config file (default: auto-detect)")
	showVersion := flag.Bool("version", false, "Show version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("ITDLUPanel v%s (built: %s)\n", version, buildTime)
		os.Exit(0)
	}

	cp := resolveConfig(*configPath)

	// Bootstrap the application.
	application, err := app.New(cp)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialise: %v\n", err)
		os.Exit(1)
	}

	// Register the panel-restart state so the /system/panel-restart
	// endpoint knows how to re-exec the panel with the same arguments.
	v1.SetPanelRestartState(os.Args[0], []string{cp})

	// Always use the build-time version as the source of truth
	cfg := config.Get()
	if version != "" {
		cfg.Panel.Version = version
	}

	defer application.Shutdown()

	// Graceful shutdown on SIGINT / SIGTERM.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := application.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
			os.Exit(1)
		}
	}()

	<-quit
	fmt.Println("\nShutting down...")
}

// installDir returns the panel installation directory derived from the
// running executable's location (binary may be at <root>/bin/itdlupanel
// or directly at <root>/itdlupanel). Falls back to the parent of the
// config file's directory.
func installDir(configPath string) string {
	if exe, err := os.Executable(); err == nil {
		if real, err2 := filepath.EvalSymlinks(exe); err2 == nil {
			exe = real
		}
		// Binary at <root>/bin/itdlupanel → root is parent of parent
		dir := filepath.Dir(filepath.Dir(exe))
		if _, err := os.Stat(filepath.Join(dir, "data", "panel.db")); err == nil {
			return dir
		}
		// Binary at <root>/itdlupanel (no bin subdir) → root is parent
		dir2 := filepath.Dir(exe)
		if _, err := os.Stat(filepath.Join(dir2, "data", "panel.db")); err == nil {
			return dir2
		}
	}
	return filepath.Dir(filepath.Dir(configPath))
}

// resolveConfig returns the config path, auto-detecting if empty.
func resolveConfig(path string) string {
	if path != "" {
		return path
	}
	candidates := []string{
		"config/panel.json",
		"/ITDLUPanel/server/config/panel.json",
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return "config/panel.json"
}

// uploadToRemote uploads a backup to remote storage. Logs errors but does not
// terminate — the local backup is still valid.
func uploadToRemote(backupSvc *service.BackupService, backupID int64, storageType string, storageIDVal int64) {
	var err error
	if storageType == "ftp" {
		err = backupSvc.UploadBackupToFTP(backupID, storageIDVal)
	} else {
		err = backupSvc.UploadBackupToCloud(backupID, storageIDVal, storageType)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to upload backup %d to %s storage %d: %v\n", backupID, storageType, storageIDVal, err)
	}
}

// maybeDeleteLocal implements the -no-keep-local flag: if a remote
// upload succeeded, remove the local backup file. Best-effort: errors
// are logged but never fail the cron run.
func maybeDeleteLocal(backupSvc *service.BackupService, backupID int64, noKeepLocal bool) {
	if !noKeepLocal {
		return
	}
	b, err := backupSvc.GetByID(backupID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "no-keep-local: failed to load backup %d: %v\n", backupID, err)
		return
	}
	if b.Storage == "local" || b.FilePath == "" {
		// Upload didn't happen or hasn't been observed yet; keep
		// the local copy so we don't lose data.
		return
	}
	if err := os.Remove(b.FilePath); err != nil && !os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "no-keep-local: failed to delete %s: %v\n", b.FilePath, err)
		return
	}
	fmt.Fprintf(os.Stdout, "local backup deleted (no-keep-local): %s\n", b.FilePath)
}

// runBackupCommand handles the "backup" sub-command.
// Usage:
//
//	itdlupanel backup -type=site -target=example.com [-max-keep=10] [-config ...]
//	itdlupanel backup -type=site -all [-max-keep=5] [-config ...]
//	itdlupanel backup -type=database -target=mydb [-max-keep=10]
//	itdlupanel backup -type=database -all [-max-keep=5]
//	itdlupanel backup -type=panel [-max-keep=4]
//	itdlupanel backup -type=site -target=example.com -storage=ftp -storage-id=1
//	itdlupanel backup -type=database -all -storage=s3 -storage-id=2
func runBackupCommand() {
	cmd := flag.NewFlagSet("backup", flag.ExitOnError)
	cfgPath := cmd.String("config", "", "Path to config file")
	backupType := cmd.String("type", "", "Backup type: site, database, panel")
	target := cmd.String("target", "", "Target domain (site) or database name")
	all := cmd.Bool("all", false, "Backup all sites or all databases")
	maxKeep := cmd.Int("max-keep", 0, "Max backups to keep (0=unlimited)")
	storage := cmd.String("storage", "", "Remote storage type: ftp, s3, google_drive, onedrive")
	storageID := cmd.Int64("storage-id", 0, "Storage configuration ID for remote upload")
	noKeepLocal := cmd.Bool("no-keep-local", false, "Delete the local backup file after successful remote upload")
	strategy := cmd.String("strategy", "full", "Backup strategy: 'full' (default) or 'incremental' (rsync+hardlinks)")
	cmd.Parse(os.Args[2:])

	if *backupType == "" {
		fmt.Fprintln(os.Stderr, "Usage: itdlupanel backup -type=<site|database|panel> [-target=<name>] [-all] [-max-keep=N] [-config ...]")
		os.Exit(1)
	}

	cp := resolveConfig(*cfgPath)

	// Change working directory to install directory for relative paths.
	rootDir := installDir(cp)
	_ = os.Chdir(rootDir)

	_, err := config.Load(cp)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load config: %v\n", err)
		os.Exit(1)
	}
	cfg := config.Get()

	dbPath := cfg.Database.Path
	if !filepath.IsAbs(dbPath) {
		dbPath = filepath.Join(rootDir, dbPath)
	}

	db, err := database.New(dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	// Resolve a real user ID for system-initiated actions. The default
	// admin row historically lived at id=1, but if it has been removed
	// (e.g. an operator account was created and the original admin was
	// deleted) we must not use a stale id, otherwise the
	// backups.created_by foreign key will reject the insert and the
	// backup silently writes a tarball but no DB record. We fall back
	// to whichever user currently exists in the table.
	systemUserID, err := resolveSystemUserID(db.GetDB())
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to resolve system user: %v\n", err)
		os.Exit(1)
	}

	ftpStorageSvc := service.NewFTPStorageService(db.GetDB())
	cloudStorageSvc := service.NewCloudStorageService(db.GetDB())
	backupSvc := service.NewBackupService(db.GetDB(), ftpStorageSvc, cloudStorageSvc)
	uploadSvc := service.NewBackupUploadService(db.GetDB(), cloudStorageSvc, backupSvc)
	uploadSvc.Start(2)
	defer uploadSvc.Stop(10 * time.Second)
	backupSvc.SetUploadService(uploadSvc)

	type result struct {
		Status  string `json:"status"`
		Type    string `json:"type"`
		Count   int    `json:"count,omitempty"`
		File    string `json:"file,omitempty"`
		Size    int64  `json:"size,omitempty"`
		Error   string `json:"error,omitempty"`
		Deleted int    `json:"retention_deleted,omitempty"`
	}

	output := func(r result) {
		data, _ := json.Marshal(r)
		fmt.Println(string(data))
	}

	switch *backupType {
	case "site":
		if *all {
			backups, err := backupSvc.CreateAllSitesBackup(systemUserID)
			if err != nil {
				output(result{Status: "error", Type: "site", Error: err.Error()})
				os.Exit(1)
			}
			if *storage != "" && *storageID > 0 {
				for _, bk := range backups {
					uploadToRemote(backupSvc, bk.ID, *storage, *storageID)
					maybeDeleteLocal(backupSvc, bk.ID, *noKeepLocal)
				}
			}
			if *maxKeep > 0 {
				sites, _ := backupSvc.ListAllSites()
				for _, s := range sites {
					sid := s.ID
					backupSvc.EnforceRetention("site", &sid, *maxKeep)
				}
			}
			output(result{Status: "ok", Type: "site", Count: len(backups)})
		} else if *target != "" {
			siteID, err := backupSvc.GetSiteByDomain(*target)
			if err != nil {
				output(result{Status: "error", Type: "site", Error: err.Error()})
				os.Exit(1)
			}
			opts := service.BackupOptions{Strategy: *strategy}
			b, err := backupSvc.CreateSiteBackupWithOpts(opts, siteID, systemUserID)
			if err != nil {
				output(result{Status: "error", Type: "site", Error: err.Error()})
				os.Exit(1)
			}
		if *storage != "" && *storageID > 0 {
			uploadToRemote(backupSvc, b.ID, *storage, *storageID)
		}
		maybeDeleteLocal(backupSvc, b.ID, *noKeepLocal)
		if *maxKeep > 0 {
			backupSvc.EnforceRetention("site", &siteID, *maxKeep)
		}
			output(result{Status: "ok", Type: "site", Count: 1, File: b.FilePath, Size: b.FileSize})
		} else {
			fmt.Fprintln(os.Stderr, "Error: specify -target=<domain> or -all for site backup")
			os.Exit(1)
		}

	case "database":
		if *all {
			backups, err := backupSvc.CreateAllDatabasesBackup(systemUserID)
			if err != nil {
				output(result{Status: "error", Type: "database", Error: err.Error()})
				os.Exit(1)
			}
			if *storage != "" && *storageID > 0 {
				for _, bk := range backups {
					uploadToRemote(backupSvc, bk.ID, *storage, *storageID)
					maybeDeleteLocal(backupSvc, bk.ID, *noKeepLocal)
				}
			}
			if *maxKeep > 0 {
				dbs, _ := backupSvc.ListAllDatabases()
				for _, d := range dbs {
					did := d.ID
					backupSvc.EnforceRetention("database", &did, *maxKeep)
				}
			}
			output(result{Status: "ok", Type: "database", Count: len(backups)})
		} else if *target != "" {
			dbID, err := backupSvc.GetDatabaseByName(*target)
			if err != nil {
				output(result{Status: "error", Type: "database", Error: err.Error()})
				os.Exit(1)
			}
			opts := service.BackupOptions{Strategy: *strategy}
			b, err := backupSvc.CreateDatabaseBackupWithOpts(opts, dbID, systemUserID)
			if err != nil {
				output(result{Status: "error", Type: "database", Error: err.Error()})
				os.Exit(1)
			}
			if *storage != "" && *storageID > 0 {
				uploadToRemote(backupSvc, b.ID, *storage, *storageID)
			}
			maybeDeleteLocal(backupSvc, b.ID, *noKeepLocal)
			if *maxKeep > 0 {
				backupSvc.EnforceRetention("database", &dbID, *maxKeep)
			}
			output(result{Status: "ok", Type: "database", Count: 1, File: b.FilePath, Size: b.FileSize})
		} else {
			fmt.Fprintln(os.Stderr, "Error: specify -target=<dbname> or -all for database backup")
			os.Exit(1)
		}

	case "panel":
		opts := service.BackupOptions{Strategy: *strategy}
		b, err := backupSvc.CreatePanelBackupWithOpts(opts, systemUserID)
		if err != nil {
			output(result{Status: "error", Type: "panel", Error: err.Error()})
			os.Exit(1)
		}
		if *storage != "" && *storageID > 0 {
			uploadToRemote(backupSvc, b.ID, *storage, *storageID)
		}
		maybeDeleteLocal(backupSvc, b.ID, *noKeepLocal)
		if *maxKeep > 0 {
			backupSvc.EnforceRetention("panel", nil, *maxKeep)
		}
		output(result{Status: "ok", Type: "panel", Count: 1, File: b.FilePath, Size: b.FileSize})

	default:
		fmt.Fprintf(os.Stderr, "Error: unknown backup type '%s' (use site, database, or panel)\n", *backupType)
		os.Exit(1)
	}

	os.Exit(0)
}

// runCronCommand handles the "cron-run" sub-command.
// It executes a cron job by ID, logs output, and updates the database.
//
// Usage:
//
//	itdlupanel cron-run -id=8 [-config config/panel.json]
func runCronCommand() {
	cmd := flag.NewFlagSet("cron-run", flag.ExitOnError)
	cfgPath := cmd.String("config", "", "Path to config file")
	cronID := cmd.Int64("id", 0, "Cron job ID to execute")
	cmd.Parse(os.Args[2:])

	if *cronID <= 0 {
		fmt.Fprintln(os.Stderr, "Usage: itdlupanel cron-run -id=<cron_id> [-config config/panel.json]")
		os.Exit(1)
	}

	cp := resolveConfig(*cfgPath)

	// Change working directory to the install directory so relative paths
	// (e.g. "data/panel.db") resolve correctly when called from cron.
	rootDir := installDir(cp)
	if err := os.Chdir(rootDir); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to chdir to %s: %v\n", rootDir, err)
		os.Exit(1)
	}

	_, err := config.Load(cp)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load config: %v\n", err)
		os.Exit(1)
	}
	cfg := config.Get()

	// Resolve database path relative to install directory.
	dbPath := cfg.Database.Path
	if !filepath.IsAbs(dbPath) {
		dbPath = filepath.Join(rootDir, dbPath)
	}

	db, err := database.New(dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	// Resolve a real user ID for system-initiated actions. The default
	// admin row historically lived at id=1, but if it has been removed
	// (e.g. an operator account was created and the original admin was
	// deleted) we must not use a stale id, otherwise the
	// backups.created_by foreign key will reject the insert and the
	// backup silently writes a tarball but no DB record. We fall back
	// to whichever user currently exists in the table.
	if _, err := resolveSystemUserID(db.GetDB()); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to resolve system user: %v\n", err)
		os.Exit(1)
	}

	cronSvc := service.NewCronService(db.GetDB())
	// Wire up notification service so cron can dispatch alerts.
	notifSvc := service.NewNotificationService(db.GetDB(), nil)
	cronSvc.SetNotifier(notifSvc)

	output, runErr := cronSvc.RunNow(*cronID)

	// Allow goroutine-based notification dispatch to complete before exit.
	notifSvc.Wait()

	if runErr != nil {
		fmt.Fprintf(os.Stderr, "Cron job %d failed: %v\n", *cronID, runErr)
		if output != "" {
			fmt.Fprintln(os.Stderr, output)
		}
		os.Exit(1)
	}
	if output != "" {
		fmt.Print(output)
	}
	os.Exit(0)
}

// resolveSystemUserID returns the user ID that should be recorded as the
// creator of system-initiated actions (cron-driven backups, etc.).
//
// Historically the first admin row was inserted at id=1 and the backup
// command hard-coded that value. When the original admin account is
// removed (e.g. replaced by a different user) the hard-coded value
// stops pointing at a real row, the backups.created_by foreign key
// rejects the insert, and the backup silently produces a tarball with
// no DB record. We pick the first existing user (admin role preferred)
// instead of a magic number.
func resolveSystemUserID(db *sql.DB) (int64, error) {
	// Prefer an admin so audit trails clearly attribute system jobs.
	var id int64
	err := db.QueryRow(
		`SELECT id FROM users WHERE role = 'admin' AND status = 1 ORDER BY id LIMIT 1`,
	).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}
	// Fall back to any active user.
	err = db.QueryRow(
		`SELECT id FROM users WHERE status = 1 ORDER BY id LIMIT 1`,
	).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err == sql.ErrNoRows {
		return 0, fmt.Errorf("no active users in database; cannot record backup creator")
	}
	return 0, err
}
