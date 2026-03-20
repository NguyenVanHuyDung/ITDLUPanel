package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/ITDLUPanel/panel/internal/app"
)

// Build-time variables injected via -ldflags.
var (
	version   = "0.1.0"
	buildTime = "dev"
)

func main() {
	configPath := flag.String("config", "", "Path to config file (default: auto-detect)")
	showVersion := flag.Bool("version", false, "Show version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("ITDLUPanel v%s (built: %s)\n", version, buildTime)
		os.Exit(0)
	}

	// Auto-detect config path when not explicitly provided.
	if *configPath == "" {
		candidates := []string{
			"config/panel.json",
			"/ITDLUPanel/server/config/panel.json",
		}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				*configPath = c
				break
			}
		}
		if *configPath == "" {
			// Fall back to local config which will be created with defaults.
			*configPath = "config/panel.json"
		}
	}

	// Bootstrap the application.
	application, err := app.New(*configPath)
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
