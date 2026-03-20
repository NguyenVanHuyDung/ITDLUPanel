package vhost

// VhostConfig holds the configuration needed to generate a virtual host.
type VhostConfig struct {
	Domain       string
	Aliases      []string
	DocRoot      string
	PHPVersion   string
	SSLEnabled   bool
	SSLCert      string
	SSLKey       string
	CustomConfig string
}

// VhostGenerator defines operations for managing web server virtual hosts.
type VhostGenerator interface {
	Generate(cfg VhostConfig) (string, error)
	GetConfigPath(domain string) string
	EnableSite(domain string) error
	DisableSite(domain string) error
	ReloadServer() error
	TestConfig() error
}
