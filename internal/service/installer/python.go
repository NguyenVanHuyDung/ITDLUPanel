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

type PythonInstaller struct{}

func NewPythonInstaller() *PythonInstaller { return &PythonInstaller{} }

func (i *PythonInstaller) Name() string { return "python" }

func (i *PythonInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	if version == "" {
		version = "3.12"
	}
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing Python")

	progress(10)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	progress(20)
	if osInfo.PkgManager == "apt" {
		// Add deadsnakes PPA for newer Python versions on Ubuntu
		system.Exec(ctx, "apt", "install", "-y", "software-properties-common")
		system.Exec(ctx, "add-apt-repository", "-y", "ppa:deadsnakes/ppa")
		RefreshPackageIndex(ctx, osInfo)

		progress(40)
		pkg := fmt.Sprintf("python%s", version)
		pkgVenv := fmt.Sprintf("python%s-venv", version)
		pkgDev := fmt.Sprintf("python%s-dev", version)
		if _, err := system.Exec(ctx, "apt", "install", "-y", pkg, pkgVenv, pkgDev, "python3-pip"); err != nil {
			// Fallback to default python3
			if _, err2 := system.Exec(ctx, "apt", "install", "-y", "python3", "python3-venv", "python3-dev", "python3-pip"); err2 != nil {
				return fmt.Errorf("failed to install python: %w", err2)
			}
		}
	} else {
		progress(40)
		// RHEL/AlmaLinux
		pkg := fmt.Sprintf("python%s", strings.ReplaceAll(version, ".", ""))
		pkgDevel := fmt.Sprintf("python%s-devel", strings.ReplaceAll(version, ".", ""))
		pkgPip := fmt.Sprintf("python%s-pip", strings.ReplaceAll(version, ".", ""))
		if _, err := system.Exec(ctx, "dnf", "install", "-y", pkg, pkgDevel, pkgPip); err != nil {
			if _, err2 := system.Exec(ctx, "dnf", "install", "-y", "python3", "python3-devel", "python3-pip"); err2 != nil {
				return fmt.Errorf("failed to install python: %w", err2)
			}
		}
	}

	progress(70)
	// Upgrade pip
	system.ExecWithTimeout(30*time.Second, "bash", "-c",
		fmt.Sprintf("python%s -m pip install --upgrade pip 2>/dev/null || python3 -m pip install --upgrade pip 2>/dev/null || true", version))

	progress(80)
	installDir := "/ITDLUPanel/server/python"
	os.MkdirAll(installDir, 0755)

	// Set as default python3 alternative if not already set
	pythonBin := fmt.Sprintf("/usr/bin/python%s", version)
	if _, err := os.Stat(pythonBin); err == nil {
		system.ExecWithTimeout(10*time.Second, "update-alternatives", "--install",
			"/usr/bin/python3", "python3", pythonBin, "10")
	}

	progress(100)
	logger.Info().Str("version", version).Msg("Python installed successfully")
	return nil
}

func (i *PythonInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	if osInfo.PkgManager == "apt" {
		// Remove all deadsnakes python versions
		system.Exec(ctx, "bash", "-c", "apt purge -y python3.1* python3-pip 2>/dev/null || true")
		system.Exec(ctx, "apt", "autoremove", "-y")
	} else {
		system.Exec(ctx, "bash", "-c", "dnf remove -y python3* 2>/dev/null || true")
	}

	os.RemoveAll("/ITDLUPanel/server/python")
	logger.Info().Msg("Python uninstalled successfully")
	return nil
}

func (i *PythonInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/bin/python3", "/usr/bin/python3.12", "/usr/bin/python3.11", "/usr/bin/python3.10"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *PythonInstaller) GetVersions() []string {
	return []string{"3.12", "3.11", "3.10"}
}

func DetectPythonVersion() string {
	res, err := system.ExecWithTimeout(5*time.Second, "python3", "--version")
	if err != nil {
		return ""
	}
	// Output: "Python 3.12.4"
	out := strings.TrimSpace(res.Stdout)
	if strings.HasPrefix(out, "Python ") {
		return strings.TrimPrefix(out, "Python ")
	}
	return ""
}
