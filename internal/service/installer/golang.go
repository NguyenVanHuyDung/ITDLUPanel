package installer

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

type GolangInstaller struct{}

func NewGolangInstaller() *GolangInstaller { return &GolangInstaller{} }

func (i *GolangInstaller) Name() string { return "golang" }

func (i *GolangInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	if version == "" {
		version = "1.24.4"
	}

	progress(5)
	logger.Info().Str("version", version).Msg("installing Go")

	goRoot := "/usr/local/go"

	// Remove old installation
	os.RemoveAll(goRoot)

	progress(10)
	arch := runtime.GOARCH
	url := fmt.Sprintf("https://go.dev/dl/go%s.linux-%s.tar.gz", version, arch)

	progress(20)
	tmpFile := "/tmp/go.tar.gz"
	if _, err := system.Exec(ctx, "curl", "-fsSL", "-o", tmpFile, url); err != nil {
		return fmt.Errorf("failed to download Go %s: %w", version, err)
	}

	progress(60)
	if _, err := system.Exec(ctx, "tar", "-C", "/usr/local", "-xzf", tmpFile); err != nil {
		return fmt.Errorf("failed to extract Go: %w", err)
	}

	progress(80)
	// Setup PATH in profile
	profileLine := `export PATH=$PATH:/usr/local/go/bin`
	profilePath := "/etc/profile.d/golang.sh"
	os.WriteFile(profilePath, []byte(profileLine+"\n"), 0644)

	// Create symlink for convenience
	os.Remove("/usr/local/bin/go")
	os.Symlink("/usr/local/go/bin/go", "/usr/local/bin/go")

	os.MkdirAll("/ITDLUPanel/server/golang", 0755)

	// Cleanup
	os.Remove(tmpFile)

	progress(100)
	logger.Info().Str("version", version).Msg("Go installed successfully")
	return nil
}

func (i *GolangInstaller) Uninstall(ctx context.Context) error {
	os.RemoveAll("/usr/local/go")
	os.Remove("/etc/profile.d/golang.sh")
	os.Remove("/usr/local/bin/go")
	os.RemoveAll("/ITDLUPanel/server/golang")
	logger.Info().Msg("Go uninstalled successfully")
	return nil
}

func (i *GolangInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/local/go/bin/go", "/usr/bin/go", "/usr/local/bin/go"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *GolangInstaller) GetVersions() []string {
	return []string{"1.24.4", "1.23.8", "1.22.12"}
}

func DetectGolangVersion() string {
	res, err := system.ExecWithTimeout(5*time.Second, "/usr/local/go/bin/go", "version")
	if err != nil {
		res, err = system.ExecWithTimeout(5*time.Second, "go", "version")
		if err != nil {
			return ""
		}
	}
	// Output: "go version go1.24.4 linux/amd64"
	parts := strings.Fields(strings.TrimSpace(res.Stdout))
	if len(parts) >= 3 {
		return strings.TrimPrefix(parts[2], "go")
	}
	return ""
}
