package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/ITDLUPanel/panel/internal/app"
	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/database"
	"github.com/ITDLUPanel/panel/internal/pkg/crypto"
	"github.com/ITDLUPanel/panel/internal/service"
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

// runBackupCommand handles the "backup" sub-command.
// Usage:
//
//	itdlupanel backup -type=site -target=example.com [-max-keep=10] [-config ...]
//	itdlupanel backup -type=site -all [-max-keep=5] [-config ...]
//	itdlupanel backup -type=database -target=mydb [-max-keep=10]
//	itdlupanel backup -type=database -all [-max-keep=5]
//	itdlupanel backup -type=panel [-max-keep=4]
func runBackupCommand() {
	cmd := flag.NewFlagSet("backup", flag.ExitOnError)
	cfgPath := cmd.String("config", "", "Path to config file")
	backupType := cmd.String("type", "", "Backup type: site, database, panel")
	target := cmd.String("target", "", "Target domain (site) or database name")
	all := cmd.Bool("all", false, "Backup all sites or all databases")
	maxKeep := cmd.Int("max-keep", 0, "Max backups to keep (0=unlimited)")
	cmd.Parse(os.Args[2:])

	if *backupType == "" {
		fmt.Fprintln(os.Stderr, "Usage: itdlupanel backup -type=<site|database|panel> [-target=<name>] [-all] [-max-keep=N] [-config ...]")
		os.Exit(1)
	}

	cp := resolveConfig(*cfgPath)
	_, err := config.Load(cp)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load config: %v\n", err)
		os.Exit(1)
	}
	cfg := config.Get()

	db, err := database.New(cfg.Database.Path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	backupSvc := service.NewBackupService(db.GetDB())
	const systemUserID int64 = 1 // system/admin user

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
			b, err := backupSvc.CreateSiteBackup(siteID, systemUserID)
			if err != nil {
				output(result{Status: "error", Type: "site", Error: err.Error()})
				os.Exit(1)
			}
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
			b, err := backupSvc.CreateDatabaseBackup(dbID, systemUserID)
			if err != nil {
				output(result{Status: "error", Type: "database", Error: err.Error()})
				os.Exit(1)
			}
			if *maxKeep > 0 {
				backupSvc.EnforceRetention("database", &dbID, *maxKeep)
			}
			output(result{Status: "ok", Type: "database", Count: 1, File: b.FilePath, Size: b.FileSize})
		} else {
			fmt.Fprintln(os.Stderr, "Error: specify -target=<dbname> or -all for database backup")
			os.Exit(1)
		}

	case "panel":
		b, err := backupSvc.CreatePanelBackup(systemUserID)
		if err != nil {
			output(result{Status: "error", Type: "panel", Error: err.Error()})
			os.Exit(1)
		}
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
