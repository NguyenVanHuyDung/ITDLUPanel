package installer

import (
	"context"
	"os"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// GoogleDriveInstaller handles Google Drive storage setup.
type GoogleDriveInstaller struct{}

func NewGoogleDriveInstaller() *GoogleDriveInstaller {
	return &GoogleDriveInstaller{}
}

func (i *GoogleDriveInstaller) Name() string { return "google_drive" }

func (i *GoogleDriveInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	progress(10)
	logger.Info().Msg("installing Google Drive Storage")

	installDir := "/ITDLUPanel/server/google_drive"
	if err := os.MkdirAll(installDir, 0755); err != nil {
		return err
	}

	progress(100)
	logger.Info().Msg("Google Drive Storage installed successfully")
	return nil
}

func (i *GoogleDriveInstaller) Uninstall(ctx context.Context) error {
	logger.Info().Msg("uninstalling Google Drive Storage")
	os.RemoveAll("/ITDLUPanel/server/google_drive")
	logger.Info().Msg("Google Drive Storage uninstalled")
	return nil
}

func (i *GoogleDriveInstaller) IsInstalled() bool {
	_, err := os.Stat("/ITDLUPanel/server/google_drive")
	return err == nil
}

func (i *GoogleDriveInstaller) GetVersions() []string {
	return []string{"stable"}
}
