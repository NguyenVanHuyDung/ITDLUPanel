package installer

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// DockerInstaller handles Docker Engine installation and removal.
type DockerInstaller struct{}

func NewDockerInstaller() *DockerInstaller {
	return &DockerInstaller{}
}

func (i *DockerInstaller) Name() string { return "docker" }

func (i *DockerInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing docker")

	// Remove old/conflicting packages
	progress(10)
	if osInfo.PkgManager == "apt" {
		for _, pkg := range []string{"docker.io", "docker-doc", "docker-compose", "podman-docker", "containerd", "runc"} {
			_, _ = system.Exec(ctx, "apt", "remove", "-y", pkg)
		}
	} else {
		for _, pkg := range []string{"docker", "docker-client", "docker-client-latest", "docker-common",
			"docker-latest", "docker-latest-logrotate", "docker-logrotate", "docker-engine", "podman", "runc"} {
			_, _ = system.Exec(ctx, "dnf", "remove", "-y", pkg)
		}
	}

	// Install prerequisites and set up Docker repo
	progress(20)
	if osInfo.PkgManager == "apt" {
		if _, err := system.Exec(ctx, "apt", "update", "-y"); err != nil {
			logger.Warn().Err(err).Msg("apt update had warnings")
		}
		if _, err := system.Exec(ctx, "apt", "install", "-y", "ca-certificates", "curl", "gnupg"); err != nil {
			return fmt.Errorf("failed to install prerequisites: %w", err)
		}

		progress(30)
		// Add Docker GPG key
		os.MkdirAll("/etc/apt/keyrings", 0755)
		if _, err := system.Exec(ctx, "bash", "-c",
			"curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo $ID)/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg && chmod a+r /etc/apt/keyrings/docker.gpg"); err != nil {
			return fmt.Errorf("failed to add Docker GPG key: %w", err)
		}

		progress(40)
		// Add Docker repository
		if _, err := system.Exec(ctx, "bash", "-c",
			`echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$(. /etc/os-release && echo $ID) $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list`); err != nil {
			return fmt.Errorf("failed to add Docker repository: %w", err)
		}

		progress(50)
		if _, err := system.Exec(ctx, "apt", "update", "-y"); err != nil {
			logger.Warn().Err(err).Msg("apt update had warnings after adding docker repo")
		}

		progress(60)
		if _, err := system.Exec(ctx, "apt", "install", "-y",
			"docker-ce", "docker-ce-cli", "containerd.io", "docker-buildx-plugin", "docker-compose-plugin"); err != nil {
			return fmt.Errorf("failed to install docker: %w", err)
		}
	} else {
		// RHEL/CentOS/Fedora
		if _, err := system.Exec(ctx, "dnf", "install", "-y", "dnf-plugins-core"); err != nil {
			logger.Warn().Err(err).Msg("failed to install dnf-plugins-core")
		}

		progress(30)
		// Use rhel repo (works for CentOS, AlmaLinux, Rocky, RHEL); fall back to centos then fedora
		if _, err := system.Exec(ctx, "dnf", "config-manager", "--add-repo",
			"https://download.docker.com/linux/rhel/docker-ce.repo"); err != nil {
			if _, err2 := system.Exec(ctx, "dnf", "config-manager", "--add-repo",
				"https://download.docker.com/linux/centos/docker-ce.repo"); err2 != nil {
				if _, err3 := system.Exec(ctx, "dnf", "config-manager", "--add-repo",
					"https://download.docker.com/linux/fedora/docker-ce.repo"); err3 != nil {
					return fmt.Errorf("failed to add Docker repository: %w", err)
				}
			}
		}

		progress(50)
		if _, err := system.Exec(ctx, "dnf", "install", "-y",
			"docker-ce", "docker-ce-cli", "containerd.io", "docker-buildx-plugin", "docker-compose-plugin"); err != nil {
			return fmt.Errorf("failed to install docker: %w", err)
		}
	}

	// Enable and start Docker service
	progress(80)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", "docker"); err != nil {
		logger.Warn().Err(err).Msg("failed to enable docker service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", "docker"); err != nil {
		logger.Warn().Err(err).Msg("failed to start docker service")
	}

	// Verify Docker is running
	progress(90)
	if _, err := system.ExecWithTimeout(15*time.Second, "docker", "info"); err != nil {
		logger.Warn().Err(err).Msg("docker info check failed after install")
	}

	// Set up panel directory structure
	SetupServerDir("docker", []SymlinkDef{
		{Name: "conf", Target: "/etc/docker"},
		{Name: "data", Target: "/var/lib/docker"},
	})
	SetupLogLinks([]LogSymlink{
		{Name: "docker.log", Target: "/var/log/docker.log"},
	})

	progress(100)
	logger.Info().Msg("docker installed successfully")
	return nil
}

func (i *DockerInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	// Stop Docker service
	_, _ = system.Exec(ctx, "systemctl", "stop", "docker")
	_, _ = system.Exec(ctx, "systemctl", "stop", "docker.socket")
	_, _ = system.Exec(ctx, "systemctl", "disable", "docker")
	_, _ = system.Exec(ctx, "systemctl", "disable", "docker.socket")

	CleanupServerDir("docker",
		SymlinkDef{Name: "conf", Target: "/etc/docker"},
		SymlinkDef{Name: "data", Target: "/var/lib/docker"},
	)
	CleanupLogLinks("docker")

	if osInfo.PkgManager == "apt" {
		FixDpkg(ctx)
		if _, err := system.Exec(ctx, "apt", "purge", "-y",
			"docker-ce", "docker-ce-cli", "containerd.io", "docker-buildx-plugin", "docker-compose-plugin"); err != nil {
			return fmt.Errorf("failed to uninstall docker: %w", err)
		}
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	} else {
		if _, err := system.Exec(ctx, "dnf", "remove", "-y",
			"docker-ce", "docker-ce-cli", "containerd.io", "docker-buildx-plugin", "docker-compose-plugin"); err != nil {
			return fmt.Errorf("failed to uninstall docker: %w", err)
		}
	}

	logger.Info().Msg("docker uninstalled successfully")
	return nil
}

func (i *DockerInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/bin/docker", "/usr/sbin/docker", "/usr/local/bin/docker"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *DockerInstaller) GetVersions() []string {
	return []string{"stable"}
}
