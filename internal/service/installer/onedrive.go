package installer

import (
	"context"
	"os"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// OneDriveInstaller handles OneDrive storage setup.
type OneDriveInstaller struct{}

func NewOneDriveInstaller() *OneDriveInstaller {
	return &OneDriveInstaller{}
}

func (i *OneDriveInstaller) Name() string { return "onedrive" }

func (i *OneDriveInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	progress(10)
	logger.Info().Msg("installing OneDrive Storage")

	installDir := "/ITDLUPanel/server/onedrive"
	if err := os.MkdirAll(installDir, 0755); err != nil {
		return err
	}
	_ = os.WriteFile(installDir+"/.installed", []byte("onedrive"), 0644)

	progress(100)
	logger.Info().Msg("OneDrive Storage installed successfully")
	return nil
}

func (i *OneDriveInstaller) Uninstall(ctx context.Context) error {
	logger.Info().Msg("uninstalling OneDrive Storage")
	os.RemoveAll("/ITDLUPanel/server/onedrive")
	logger.Info().Msg("OneDrive Storage uninstalled")
	return nil
}

func (i *OneDriveInstaller) IsInstalled() bool {
	_, err := os.Stat("/ITDLUPanel/server/onedrive/.installed")
	return err == nil
}

func (i *OneDriveInstaller) GetVersions() []string {
	return []string{"stable"}
}
