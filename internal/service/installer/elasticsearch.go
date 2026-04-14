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

type ElasticsearchInstaller struct{}

func NewElasticsearchInstaller() *ElasticsearchInstaller { return &ElasticsearchInstaller{} }

func (i *ElasticsearchInstaller) Name() string { return "elasticsearch" }

func (i *ElasticsearchInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	if version == "" {
		version = "8"
	}
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing Elasticsearch")

	// Elasticsearch requires Java — install JDK if missing
	progress(10)
	if err := installJDK(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("JDK install warning (ES bundles its own JDK)")
	}

	progress(15)
	if err := setupElasticsearchRepo(ctx, osInfo, version); err != nil {
		return fmt.Errorf("failed to setup Elasticsearch repo: %w", err)
	}

	progress(30)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	progress(40)
	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", "elasticsearch"); err != nil {
		return fmt.Errorf("failed to install elasticsearch: %w", err)
	}

	progress(70)
	system.ExecWithTimeout(10*time.Second, "systemctl", "daemon-reload")
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", "elasticsearch"); err != nil {
		logger.Warn().Err(err).Msg("failed to enable elasticsearch service")
	}
	if _, err := system.ExecWithTimeout(60*time.Second, "systemctl", "start", "elasticsearch"); err != nil {
		logger.Warn().Err(err).Msg("failed to start elasticsearch service")
	}

	progress(85)
	SetupServerDir("elasticsearch", []SymlinkDef{
		{Name: "conf", Target: "/etc/elasticsearch"},
		{Name: "data", Target: "/var/lib/elasticsearch"},
		{Name: "logs", Target: "/var/log/elasticsearch"},
	})

	SetupLogLinks([]LogSymlink{
		{Name: "elasticsearch.log", Target: "/var/log/elasticsearch/elasticsearch.log"},
	})

	progress(100)
	logger.Info().Str("version", version).Msg("Elasticsearch installed successfully")
	return nil
}

func setupElasticsearchRepo(ctx context.Context, osInfo *system.OSInfo, majorVersion string) error {
	if osInfo.PkgManager == "apt" {
		// Import Elastic GPG key
		system.Exec(ctx, "apt", "install", "-y", "curl", "gnupg", "apt-transport-https")
		if _, err := system.Exec(ctx, "bash", "-c",
			"curl -fsSL https://artifacts.elastic.co/GPG-KEY-elasticsearch | gpg --batch --yes --dearmor -o /usr/share/keyrings/elasticsearch-keyring.gpg"); err != nil {
			return fmt.Errorf("failed to import Elastic GPG key: %w", err)
		}

		repoLine := fmt.Sprintf(
			"deb [signed-by=/usr/share/keyrings/elasticsearch-keyring.gpg] https://artifacts.elastic.co/packages/%s.x/apt stable main",
			majorVersion)
		return os.WriteFile("/etc/apt/sources.list.d/elastic-"+majorVersion+".x.list",
			[]byte(repoLine+"\n"), 0644)
	}

	// DNF
	repoContent := fmt.Sprintf(`[elasticsearch]
name=Elasticsearch repository for %s.x packages
baseurl=https://artifacts.elastic.co/packages/%s.x/yum
gpgcheck=1
gpgkey=https://artifacts.elastic.co/GPG-KEY-elasticsearch
enabled=1
autorefresh=1
type=rpm-md
`, majorVersion, majorVersion)
	return os.WriteFile("/etc/yum.repos.d/elasticsearch.repo", []byte(repoContent), 0644)
}

func (i *ElasticsearchInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	_, _ = system.Exec(ctx, "systemctl", "stop", "elasticsearch")
	_, _ = system.Exec(ctx, "systemctl", "disable", "elasticsearch")

	CleanupServerDir("elasticsearch")
	CleanupLogLinks("elasticsearch")

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", "elasticsearch"); err != nil {
		return fmt.Errorf("failed to uninstall elasticsearch: %w", err)
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
		os.Remove("/etc/apt/sources.list.d/elastic-8.x.list")
		os.Remove("/etc/apt/sources.list.d/elastic-7.x.list")
		os.Remove("/usr/share/keyrings/elasticsearch-keyring.gpg")
	} else {
		os.Remove("/etc/yum.repos.d/elasticsearch.repo")
	}

	logger.Info().Msg("Elasticsearch uninstalled successfully")
	return nil
}

func (i *ElasticsearchInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/share/elasticsearch/bin/elasticsearch", "/usr/bin/elasticsearch"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *ElasticsearchInstaller) GetVersions() []string {
	return []string{"8", "7"}
}

func DetectElasticsearchVersion() string {
	res, err := system.ExecWithTimeout(5*time.Second,
		"/usr/share/elasticsearch/bin/elasticsearch", "--version")
	if err != nil {
		return ""
	}
	// "Version: 8.17.0, Build: ..."
	out := strings.TrimSpace(res.Stdout)
	if idx := strings.Index(out, "Version: "); idx >= 0 {
		ver := out[idx+9:]
		if comma := strings.Index(ver, ","); comma >= 0 {
			ver = ver[:comma]
		}
		return strings.TrimSpace(ver)
	}
	return ""
}
