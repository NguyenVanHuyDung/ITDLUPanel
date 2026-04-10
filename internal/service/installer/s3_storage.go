package installer

import (
	"context"
	"os"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// S3StorageInstaller handles S3 storage setup.
type S3StorageInstaller struct{}

func NewS3StorageInstaller() *S3StorageInstaller {
	return &S3StorageInstaller{}
}

func (i *S3StorageInstaller) Name() string { return "s3_storage" }

func (i *S3StorageInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	progress(10)
	logger.Info().Msg("installing S3 Storage")

	installDir := "/ITDLUPanel/server/s3_storage"
	if err := os.MkdirAll(installDir, 0755); err != nil {
		return err
	}
	_ = os.WriteFile(installDir+"/.installed", []byte("s3_storage"), 0644)

	progress(100)
	logger.Info().Msg("S3 Storage installed successfully")
	return nil
}

func (i *S3StorageInstaller) Uninstall(ctx context.Context) error {
	logger.Info().Msg("uninstalling S3 Storage")
	os.RemoveAll("/ITDLUPanel/server/s3_storage")
	logger.Info().Msg("S3 Storage uninstalled")
	return nil
}

func (i *S3StorageInstaller) IsInstalled() bool {
	_, err := os.Stat("/ITDLUPanel/server/s3_storage/.installed")
	return err == nil
}

func (i *S3StorageInstaller) GetVersions() []string {
	return []string{"stable"}
}
