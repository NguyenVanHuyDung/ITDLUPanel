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

// PureFTPdInstaller handles Pure-FTPd installation and removal.
type PureFTPdInstaller struct{}

// NewPureFTPdInstaller creates a new PureFTPdInstaller.
func NewPureFTPdInstaller() *PureFTPdInstaller {
	return &PureFTPdInstaller{}
}

func (i *PureFTPdInstaller) Name() string { return "pureftpd" }

func (i *PureFTPdInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Msg("installing pure-ftpd")

	progress(10)
	if _, err := system.Exec(ctx, osInfo.PkgManager, "update", "-y"); err != nil {
		logger.Warn().Err(err).Msg("package index update had warnings")
	}

	progress(30)
	pkg := "pure-ftpd"
	serviceName := "pure-ftpd"

	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", pkg); err != nil {
		return fmt.Errorf("failed to install pure-ftpd: %w", err)
	}

	progress(70)

	// Create ftpuser/ftpgroup for virtual user mapping
	if _, err := system.ExecWithTimeout(5*time.Second, "groupadd", "-f", "ftpgroup"); err != nil {
		logger.Warn().Err(err).Msg("failed to create ftpgroup (non-fatal)")
	}
	if _, err := system.ExecWithTimeout(5*time.Second, "useradd", "-g", "ftpgroup", "-d", "/dev/null", "-s", "/usr/sbin/nologin", "ftpuser"); err != nil {
		logger.Warn().Err(err).Msg("ftpuser may already exist (non-fatal)")
	}

	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to enable pure-ftpd service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to start pure-ftpd service")
	}

	// Configure passive port range
	if osInfo.PkgManager == "apt" {
		passiveConf := "/etc/pure-ftpd/conf/PassivePortRange"
		os.MkdirAll("/etc/pure-ftpd/conf", 0755)
		if err := os.WriteFile(passiveConf, []byte("39000 40000\n"), 0644); err != nil {
			logger.Warn().Err(err).Msg("failed to set passive port range (non-fatal)")
		}
		// Enable PureDB virtual user authentication
		os.MkdirAll("/etc/pure-ftpd/auth", 0755)
		_ = os.Symlink("../conf/PureDB", "/etc/pure-ftpd/auth/50puredb")
	} else {
		// RHEL: pure-ftpd uses /etc/pure-ftpd/pure-ftpd.conf
		confFile := "/etc/pure-ftpd/pure-ftpd.conf"
		if data, err := os.ReadFile(confFile); err == nil {
			content := string(data)
			if !strings.Contains(content, "PassivePortRange") {
				content += "\nPassivePortRange 39000 40000\n"
				_ = os.WriteFile(confFile, []byte(content), 0644)
			}
		}
	}
	// Set ForcePassiveIP to server's public IP for external access
	if pubIP, err := system.ExecWithTimeout(5*time.Second, "curl", "-s", "ifconfig.me"); err == nil {
		ip := strings.TrimSpace(pubIP.Stdout)
		if ip != "" {
			_ = os.WriteFile("/etc/pure-ftpd/conf/ForcePassiveIP", []byte(ip+"\n"), 0644)
		}
	}
	// Restart to apply
	system.ExecWithTimeout(10*time.Second, "systemctl", "restart", "pure-ftpd")

	confTarget := "/etc/pure-ftpd"
	if osInfo.PkgManager == "dnf" {
		confTarget = "/etc/pure-ftpd"
		// RHEL may not have the conf/ subdirectory structure
		os.MkdirAll("/etc/pure-ftpd", 0755)
	}
	SetupServerDir("pureftpd", []SymlinkDef{
		{Name: "conf", Target: confTarget},
	})

	// Log path differs between Ubuntu and RHEL
	ftpLog := "/var/log/syslog"
	if osInfo.PkgManager == "dnf" {
		ftpLog = "/var/log/messages"
	}
	SetupLogLinks([]LogSymlink{
		{Name: "pureftpd.log", Target: ftpLog},
	})

	progress(100)
	logger.Info().Msg("pure-ftpd installed successfully")
	return nil
}

func (i *PureFTPdInstaller) Uninstall(ctx context.Context) error {
	CleanupServerDir("pureftpd",
		SymlinkDef{Name: "conf", Target: "/etc/pure-ftpd"},
	)
	CleanupLogLinks("pureftpd")

	osInfo := system.GetOSInfo()

	_, _ = system.Exec(ctx, "systemctl", "stop", "pure-ftpd")
	_, _ = system.Exec(ctx, "systemctl", "disable", "pure-ftpd")

	// Fix any interrupted dpkg state
	if osInfo.PkgManager == "apt" {
		FixDpkg(ctx)
	}

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", "pure-ftpd"); err != nil {
		return fmt.Errorf("failed to uninstall pure-ftpd: %w", err)
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	}

	logger.Info().Msg("pure-ftpd uninstalled successfully")
	return nil
}

func (i *PureFTPdInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/sbin/pure-ftpd", "/usr/bin/pure-ftpd"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *PureFTPdInstaller) GetVersions() []string {
	return []string{"stable"}
}
