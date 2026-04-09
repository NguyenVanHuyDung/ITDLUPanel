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
	// RHEL: pure-ftpd is in EPEL, not default repos
	if osInfo.PkgManager == "dnf" {
		EnsureEPEL(ctx, osInfo)
	}
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	progress(30)
	pkg := "pure-ftpd"
	serviceName := "pure-ftpd"

	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", pkg); err != nil {
		return fmt.Errorf("failed to install pure-ftpd: %w", err)
	}

	// Stop the service if auto-started by package postinst so we can configure first
	_, _ = system.ExecWithTimeout(10*time.Second, "systemctl", "stop", serviceName)

	progress(50)

	// Create ftpuser/ftpgroup for virtual user mapping
	if _, err := system.ExecWithTimeout(5*time.Second, "groupadd", "-f", "ftpgroup"); err != nil {
		logger.Warn().Err(err).Msg("failed to create ftpgroup (non-fatal)")
	}
	if _, err := system.ExecWithTimeout(5*time.Second, "useradd", "-g", "ftpgroup", "-d", "/dev/null", "-s", "/usr/sbin/nologin", "ftpuser"); err != nil {
		logger.Warn().Err(err).Msg("ftpuser may already exist (non-fatal)")
	}

	progress(60)

	// ── Configure BEFORE starting ──

	if osInfo.PkgManager == "apt" {
		// Ensure standalone mode (not inetd)
		commonConf := "/etc/default/pure-ftpd-common"
		if data, err := os.ReadFile(commonConf); err == nil {
			content := strings.ReplaceAll(string(data), "STANDALONE_OR_INETD=inetd", "STANDALONE_OR_INETD=standalone")
			_ = os.WriteFile(commonConf, []byte(content), 0644)
		}

		os.MkdirAll("/etc/pure-ftpd/conf", 0755)
		os.MkdirAll("/etc/pure-ftpd/auth", 0755)

		// Passive port range
		_ = os.WriteFile("/etc/pure-ftpd/conf/PassivePortRange", []byte("39000 40000\n"), 0644)

		// Enable PureDB virtual user authentication
		_ = os.Symlink("../conf/PureDB", "/etc/pure-ftpd/auth/50puredb")

		// Create empty PureDB if it doesn't exist (critical: pure-ftpd fails without this)
		passwdFile := "/etc/pure-ftpd/pureftpd.passwd"
		pdbFile := "/etc/pure-ftpd/pureftpd.pdb"
		if _, err := os.Stat(pdbFile); os.IsNotExist(err) {
			// Create empty passwd file and generate PDB
			if _, statErr := os.Stat(passwdFile); os.IsNotExist(statErr) {
				_ = os.WriteFile(passwdFile, []byte(""), 0600)
			}
			if _, mkErr := system.ExecWithTimeout(10*time.Second, "pure-pw", "mkdb", pdbFile); mkErr != nil {
				logger.Warn().Err(mkErr).Msg("failed to create initial PureDB (non-fatal)")
			}
		}
	} else {
		// RHEL: pure-ftpd uses /etc/pure-ftpd/pure-ftpd.conf
		os.MkdirAll("/etc/pure-ftpd", 0755)
		confFile := "/etc/pure-ftpd/pure-ftpd.conf"
		if data, err := os.ReadFile(confFile); err == nil {
			content := string(data)
			if !strings.Contains(content, "PassivePortRange") {
				content += "\nPassivePortRange 39000 40000\n"
			}
			_ = os.WriteFile(confFile, []byte(content), 0644)
		}
	}

	progress(70)

	// Set ForcePassiveIP to server's public IP for external access
	if pubIP, err := system.ExecWithTimeout(5*time.Second, "curl", "-s", "ifconfig.me"); err == nil {
		ip := strings.TrimSpace(pubIP.Stdout)
		if ip != "" {
			if osInfo.PkgManager == "apt" {
				_ = os.WriteFile("/etc/pure-ftpd/conf/ForcePassiveIP", []byte(ip+"\n"), 0644)
			} else {
				confFile := "/etc/pure-ftpd/pure-ftpd.conf"
				if data, err := os.ReadFile(confFile); err == nil {
					content := string(data)
					if !strings.Contains(content, "ForcePassiveIP") {
						content += "\nForcePassiveIP " + ip + "\n"
						_ = os.WriteFile(confFile, []byte(content), 0644)
					}
				}
			}
		}
	}

	progress(80)

	// ── Enable and start with all config in place ──
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to enable pure-ftpd service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err != nil {
		return fmt.Errorf("failed to start pure-ftpd: %w", err)
	}

	progress(90)

	confTarget := "/etc/pure-ftpd"
	if osInfo.PkgManager == "dnf" {
		os.MkdirAll("/etc/pure-ftpd", 0755)
	}
	SetupServerDir("pureftpd", []SymlinkDef{
		{Name: "conf", Target: confTarget},
	})

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
