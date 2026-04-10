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
	if osInfo.PkgManager == "dnf" {
		EnsureEPEL(ctx, osInfo)
	}
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	progress(20)
	pkg := "pure-ftpd"
	serviceName := "pure-ftpd"

	if osInfo.PkgManager == "apt" {
		// Fix any pre-existing dpkg issues
		FixDpkg(ctx)

		// Pre-create the directory structure that pure-ftpd-wrapper needs.
		// On Debian/Ubuntu, the postinst script auto-starts the service.
		// If /etc/pure-ftpd/conf/ is missing (e.g. after a purge+reinstall
		// cycle), the wrapper dies with "Couldn't examine directory" and the
		// install appears to fail.
		i.ensureDebianDirs()

		// Pre-seed debconf so the package installs in standalone mode
		system.ExecWithStdin(ctx,
			"pure-ftpd-common pure-ftpd-common/standalone-or-inetd select standalone\n",
			"debconf-set-selections")

		// Install with non-interactive frontend to avoid dpkg prompts
		_, installErr := system.Exec(ctx, "env", "DEBIAN_FRONTEND=noninteractive",
			"apt", "install", "-y", pkg)
		if installErr != nil {
			// The binary may have been installed despite the postinst failure.
			// Try to fix dpkg state and continue if the binary exists.
			logger.Warn().Err(installErr).Msg("apt install had errors, attempting recovery")
			i.ensureDebianDirs()
			FixDpkg(ctx)
			if !i.IsInstalled() {
				return fmt.Errorf("failed to install pure-ftpd: %w", installErr)
			}
		}
	} else {
		if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", pkg); err != nil {
			return fmt.Errorf("failed to install pure-ftpd: %w", err)
		}
	}

	// Stop the service if auto-started by postinst so we can configure first
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

	// ── Configure ──
	if osInfo.PkgManager == "apt" {
		i.configureDebian(ctx)
	} else {
		i.configureRHEL(ctx)
	}

	progress(70)

	// Set ForcePassiveIP to server's public IP
	if pubIP, err := system.ExecWithTimeout(5*time.Second, "curl", "-s", "ifconfig.me"); err == nil {
		ip := strings.TrimSpace(pubIP.Stdout)
		if ip != "" {
			if osInfo.PkgManager == "apt" {
				_ = os.WriteFile("/etc/pure-ftpd/conf/ForcePassiveIP", []byte(ip+"\n"), 0644)
			} else {
				i.appendRHELConf("ForcePassiveIP", "ForcePassiveIP "+ip)
			}
		}
	}

	progress(80)

	// ── Enable and start ──
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to enable pure-ftpd service")
	}
	// Use restart instead of start: handles failed/stale state from postinst
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", serviceName); err != nil {
		// One more attempt after resetting the failed state
		_, _ = system.ExecWithTimeout(10*time.Second, "systemctl", "reset-failed", serviceName)
		if _, err2 := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err2 != nil {
			return fmt.Errorf("failed to start pure-ftpd: %w", err2)
		}
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

// ensureDebianDirs creates the directory structure and minimal config files
// needed by pure-ftpd-wrapper BEFORE apt install runs the postinst script.
func (i *PureFTPdInstaller) ensureDebianDirs() {
	for _, dir := range []string{
		"/etc/pure-ftpd/conf",
		"/etc/pure-ftpd/auth",
		"/etc/pure-ftpd/db",
		"/var/log/pure-ftpd",
		"/var/run/pure-ftpd",
	} {
		os.MkdirAll(dir, 0755)
	}
}

// configureDebian sets up pure-ftpd for Debian/Ubuntu.
func (i *PureFTPdInstaller) configureDebian(ctx context.Context) {
	// Ensure standalone mode
	commonConf := "/etc/default/pure-ftpd-common"
	if data, err := os.ReadFile(commonConf); err == nil {
		content := strings.ReplaceAll(string(data),
			"STANDALONE_OR_INETD=inetd", "STANDALONE_OR_INETD=standalone")
		_ = os.WriteFile(commonConf, []byte(content), 0644)
	}

	i.ensureDebianDirs()

	// Passive port range
	_ = os.WriteFile("/etc/pure-ftpd/conf/PassivePortRange", []byte("39000 40000\n"), 0644)

	// Enable PureDB virtual user authentication
	link := "/etc/pure-ftpd/auth/50puredb"
	os.Remove(link) // remove stale symlink from previous install
	_ = os.Symlink("../conf/PureDB", link)

	// Create empty PureDB (pure-ftpd-wrapper validates this file exists)
	passwdFile := "/etc/pure-ftpd/pureftpd.passwd"
	pdbFile := "/etc/pure-ftpd/pureftpd.pdb"
	if _, err := os.Stat(pdbFile); os.IsNotExist(err) {
		if _, statErr := os.Stat(passwdFile); os.IsNotExist(statErr) {
			_ = os.WriteFile(passwdFile, []byte(""), 0600)
		}
		if _, mkErr := system.ExecWithTimeout(10*time.Second, "pure-pw", "mkdb", pdbFile); mkErr != nil {
			logger.Warn().Err(mkErr).Msg("failed to create initial PureDB (non-fatal)")
		}
	}
}

// configureRHEL sets up pure-ftpd for RHEL/AlmaLinux.
func (i *PureFTPdInstaller) configureRHEL(_ context.Context) {
	os.MkdirAll("/etc/pure-ftpd", 0755)
	i.appendRHELConf("PassivePortRange", "PassivePortRange 39000 40000")
}

// appendRHELConf appends a directive to /etc/pure-ftpd/pure-ftpd.conf if
// it doesn't already contain the given key.
func (i *PureFTPdInstaller) appendRHELConf(key, line string) {
	confFile := "/etc/pure-ftpd/pure-ftpd.conf"
	data, err := os.ReadFile(confFile)
	if err != nil {
		return
	}
	if !strings.Contains(string(data), key) {
		_ = os.WriteFile(confFile, append(data, []byte("\n"+line+"\n")...), 0644)
	}
}

func (i *PureFTPdInstaller) Uninstall(ctx context.Context) error {
	CleanupServerDir("pureftpd",
		SymlinkDef{Name: "conf", Target: "/etc/pure-ftpd"},
	)
	CleanupLogLinks("pureftpd")

	osInfo := system.GetOSInfo()

	_, _ = system.Exec(ctx, "systemctl", "stop", "pure-ftpd")
	_, _ = system.Exec(ctx, "systemctl", "disable", "pure-ftpd")

	if osInfo.PkgManager == "apt" {
		FixDpkg(ctx)
		// Purge both packages so a later reinstall is truly clean
		_, _ = system.Exec(ctx, "apt", "purge", "-y", "pure-ftpd", "pure-ftpd-common")
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	} else {
		if _, err := system.Exec(ctx, osInfo.PkgManager, "remove", "-y", "pure-ftpd"); err != nil {
			return fmt.Errorf("failed to uninstall pure-ftpd: %w", err)
		}
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
