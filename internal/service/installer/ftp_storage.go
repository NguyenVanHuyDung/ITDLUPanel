package installer

import (
	"context"
	"fmt"
	"os"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// FTPStorageInstaller handles lftp installation for FTP-based backup storage.
type FTPStorageInstaller struct{}

func NewFTPStorageInstaller() *FTPStorageInstaller {
	return &FTPStorageInstaller{}
}

func (i *FTPStorageInstaller) Name() string { return "ftp_storage" }

func (i *FTPStorageInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	progress(5)
	logger.Info().Msg("installing FTP Storage (lftp)")

	osInfo := system.GetOSInfo()

	progress(10)
	if _, err := system.Exec(ctx, osInfo.PkgManager, "update", "-y"); err != nil {
		logger.Warn().Err(err).Msg("package index update had warnings")
	}

	progress(30)
	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", "lftp"); err != nil {
		return fmt.Errorf("failed to install lftp: %w", err)
	}

	progress(70)
	installDir := "/ITDLUPanel/server/ftp_storage"
	if err := os.MkdirAll(installDir, 0755); err != nil {
		return fmt.Errorf("failed to create install directory: %w", err)
	}

	progress(100)
	logger.Info().Msg("FTP Storage installed successfully")
	return nil
}

func (i *FTPStorageInstaller) Uninstall(ctx context.Context) error {
	logger.Info().Msg("uninstalling FTP Storage")

	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "apt" {
		system.Exec(ctx, "apt", "remove", "-y", "lftp")
	} else {
		system.Exec(ctx, "dnf", "remove", "-y", "lftp")
	}

	os.RemoveAll("/ITDLUPanel/server/ftp_storage")

	logger.Info().Msg("FTP Storage uninstalled")
	return nil
}

func (i *FTPStorageInstaller) IsInstalled() bool {
	// Check lftp binary exists
	for _, p := range []string{"/usr/bin/lftp", "/usr/local/bin/lftp"} {
		if _, err := os.Stat(p); err == nil {
			if _, err2 := os.Stat("/ITDLUPanel/server/ftp_storage"); err2 == nil {
				return true
			}
		}
	}
	return false
}

func (i *FTPStorageInstaller) GetVersions() []string {
	return []string{"stable"}
}
