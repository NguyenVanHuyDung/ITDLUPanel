package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/ITDLUPanel/panel/internal/app"
	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/database"
	"github.com/ITDLUPanel/panel/internal/pkg/crypto"
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
