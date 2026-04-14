package installer

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

type SupervisorInstaller struct{}

func NewSupervisorInstaller() *SupervisorInstaller { return &SupervisorInstaller{} }

func (i *SupervisorInstaller) Name() string { return "supervisor" }

func (i *SupervisorInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Msg("installing Supervisor")

	progress(10)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	progress(20)
	pkg := "supervisor"
	serviceName := "supervisor"
	if osInfo.PkgManager == "dnf" {
		// On RHEL, use pip or EPEL
		EnsureEPEL(ctx, osInfo)
		pkg = "supervisor"
		serviceName = "supervisord"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", pkg); err != nil {
		// Fallback: install via pip
		logger.Warn().Err(err).Msg("package install failed, trying pip")
		system.Exec(ctx, osInfo.PkgManager, "install", "-y", "python3", "python3-pip")
		if _, err := system.Exec(ctx, "pip3", "install", "supervisor"); err != nil {
			return fmt.Errorf("failed to install supervisor: %w", err)
		}
		serviceName = "supervisord"
	}

	progress(60)
	// Ensure config directory
	os.MkdirAll("/etc/supervisor/conf.d", 0755)
	os.MkdirAll("/var/log/supervisor", 0755)

	// Create default config if not exists
	confPath := "/etc/supervisor/supervisord.conf"
	if osInfo.PkgManager == "dnf" {
		confPath = "/etc/supervisord.conf"
	}
	if _, err := os.Stat(confPath); os.IsNotExist(err) {
		defaultConf := `[unix_http_server]
file=/var/run/supervisor.sock

[supervisord]
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid
childlogdir=/var/log/supervisor

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

[supervisorctl]
serverurl=unix:///var/run/supervisor.sock

[include]
files = /etc/supervisor/conf.d/*.conf
`
		os.WriteFile(confPath, []byte(defaultConf), 0644)
	}

	progress(75)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to enable supervisor service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to start supervisor service")
	}

	progress(85)
	SetupServerDir("supervisor", []SymlinkDef{
		{Name: "conf", Target: "/etc/supervisor"},
		{Name: "logs", Target: "/var/log/supervisor"},
	})

	SetupLogLinks([]LogSymlink{
		{Name: "supervisord.log", Target: "/var/log/supervisor/supervisord.log"},
	})

	progress(100)
	logger.Info().Msg("Supervisor installed successfully")
	return nil
}

func (i *SupervisorInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	for _, svc := range []string{"supervisor", "supervisord"} {
		_, _ = system.Exec(ctx, "systemctl", "stop", svc)
		_, _ = system.Exec(ctx, "systemctl", "disable", svc)
	}

	CleanupServerDir("supervisor")
	CleanupLogLinks("supervisor")

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", "supervisor"); err != nil {
		// Try pip uninstall
		system.Exec(ctx, "pip3", "uninstall", "-y", "supervisor")
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	}

	logger.Info().Msg("Supervisor uninstalled successfully")
	return nil
}

func (i *SupervisorInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/bin/supervisord", "/usr/local/bin/supervisord", "/usr/bin/supervisorctl"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *SupervisorInstaller) GetVersions() []string {
	return []string{"stable"}
}

func DetectSupervisorVersion() string {
	res, err := system.ExecWithTimeout(5*time.Second, "supervisord", "--version")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(res.Stdout)
}
