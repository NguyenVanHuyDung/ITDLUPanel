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

type TomcatInstaller struct{}

func NewTomcatInstaller() *TomcatInstaller { return &TomcatInstaller{} }

func (i *TomcatInstaller) Name() string { return "tomcat" }

func (i *TomcatInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	if version == "" {
		version = "10.1"
	}
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing Tomcat")

	// Install JDK as dependency
	progress(10)
	if err := installJDK(ctx, osInfo); err != nil {
		return fmt.Errorf("failed to install JDK: %w", err)
	}

	progress(30)
	// Map major version to full version for download
	fullVersion := mapTomcatVersion(version)
	majorVer := strings.Split(fullVersion, ".")[0]

	url := fmt.Sprintf("https://dlcdn.apache.org/tomcat/tomcat-%s/v%s/bin/apache-tomcat-%s.tar.gz",
		majorVer, fullVersion, fullVersion)

	tmpFile := "/tmp/tomcat.tar.gz"
	if _, err := system.Exec(ctx, "curl", "-fsSL", "-o", tmpFile, url); err != nil {
		return fmt.Errorf("failed to download Tomcat: %w", err)
	}

	progress(50)
	installDir := "/ITDLUPanel/server/tomcat"
	os.RemoveAll(installDir)
	os.MkdirAll(installDir, 0755)

	if _, err := system.Exec(ctx, "tar", "-xzf", tmpFile, "-C", installDir, "--strip-components=1"); err != nil {
		return fmt.Errorf("failed to extract Tomcat: %w", err)
	}

	progress(70)
	// Create systemd service
	javaHome := detectJavaHome()
	serviceContent := fmt.Sprintf(`[Unit]
Description=Apache Tomcat
After=network.target

[Service]
Type=forking
Environment="JAVA_HOME=%s"
Environment="CATALINA_PID=%s/temp/tomcat.pid"
Environment="CATALINA_HOME=%s"
Environment="CATALINA_BASE=%s"
ExecStart=%s/bin/startup.sh
ExecStop=%s/bin/shutdown.sh
User=root
Group=root
RestartSec=10
Restart=always

[Install]
WantedBy=multi-user.target
`, javaHome, installDir, installDir, installDir, installDir, installDir)

	os.WriteFile("/etc/systemd/system/tomcat.service", []byte(serviceContent), 0644)

	progress(85)
	system.ExecWithTimeout(10*time.Second, "systemctl", "daemon-reload")
	system.ExecWithTimeout(10*time.Second, "systemctl", "enable", "tomcat")
	system.ExecWithTimeout(30*time.Second, "systemctl", "start", "tomcat")

	// Make scripts executable
	system.ExecWithTimeout(5*time.Second, "chmod", "+x", "-R", installDir+"/bin/")

	os.Remove(tmpFile)

	progress(100)
	logger.Info().Str("version", fullVersion).Msg("Tomcat installed successfully")
	return nil
}

func installJDK(ctx context.Context, osInfo *system.OSInfo) error {
	// Check if Java is already installed
	if _, err := os.Stat("/usr/bin/java"); err == nil {
		return nil
	}

	logger.Info().Msg("installing JDK as Tomcat dependency")

	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	if osInfo.PkgManager == "apt" {
		if _, err := system.Exec(ctx, "apt", "install", "-y", "default-jdk"); err != nil {
			return fmt.Errorf("failed to install JDK: %w", err)
		}
	} else {
		if _, err := system.Exec(ctx, "dnf", "install", "-y", "java-17-openjdk-devel"); err != nil {
			if _, err := system.Exec(ctx, "dnf", "install", "-y", "java-11-openjdk-devel"); err != nil {
				return fmt.Errorf("failed to install JDK: %w", err)
			}
		}
	}
	return nil
}

func detectJavaHome() string {
	res, err := system.ExecWithTimeout(5*time.Second, "bash", "-c", "dirname $(dirname $(readlink -f $(which java)))")
	if err == nil && strings.TrimSpace(res.Stdout) != "" {
		return strings.TrimSpace(res.Stdout)
	}
	// Common defaults
	for _, p := range []string{
		"/usr/lib/jvm/java-17-openjdk-amd64",
		"/usr/lib/jvm/java-11-openjdk-amd64",
		"/usr/lib/jvm/java-17-openjdk",
		"/usr/lib/jvm/java-11-openjdk",
	} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "/usr/lib/jvm/default-java"
}

func mapTomcatVersion(version string) string {
	switch version {
	case "10.1":
		return "10.1.40"
	case "9.0":
		return "9.0.102"
	default:
		return "10.1.40"
	}
}

func (i *TomcatInstaller) Uninstall(ctx context.Context) error {
	_, _ = system.Exec(ctx, "systemctl", "stop", "tomcat")
	_, _ = system.Exec(ctx, "systemctl", "disable", "tomcat")

	os.Remove("/etc/systemd/system/tomcat.service")
	system.ExecWithTimeout(5*time.Second, "systemctl", "daemon-reload")

	os.RemoveAll("/ITDLUPanel/server/tomcat")

	logger.Info().Msg("Tomcat uninstalled successfully")
	return nil
}

func (i *TomcatInstaller) IsInstalled() bool {
	_, err := os.Stat("/ITDLUPanel/server/tomcat/bin/catalina.sh")
	return err == nil
}

func (i *TomcatInstaller) GetVersions() []string {
	return []string{"10.1", "9.0"}
}

func DetectTomcatVersion() string {
	res, err := system.ExecWithTimeout(10*time.Second, "bash", "-c",
		"/ITDLUPanel/server/tomcat/bin/catalina.sh version 2>/dev/null | grep 'Server version'")
	if err != nil {
		return ""
	}
	// "Server version: Apache Tomcat/10.1.40"
	out := strings.TrimSpace(res.Stdout)
	if idx := strings.LastIndex(out, "/"); idx >= 0 {
		return out[idx+1:]
	}
	return ""
}
