package service

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"database/sql"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/acme"
	"golang.org/x/crypto/acme/autocert"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
)

const (
	sslBaseDir        = "/ITDLUPanel/server/data/ssl"
	letsencryptDir    = sslBaseDir + "/letsencrypt"
	customCertDir     = sslBaseDir + "/custom"
	panelCertDir      = sslBaseDir + "/panel"
	certFileName      = "fullchain.pem"
	keyFileName       = "privkey.pem"
	expiryThreshold   = 30 * 24 * time.Hour // 30 days
	certTypeLetsEncrypt = "letsencrypt"
	certTypeCustom      = "custom"
	certTypeSelfSigned  = "self-signed"
)

// CertInfo describes an SSL certificate.
type CertInfo struct {
	Domain     string   `json:"domain"`
	SSLName    string   `json:"ssl_name"`
	Issuer     string   `json:"issuer"`
	IssuerCN   string   `json:"issuer_cn"`
	ValidFrom  string   `json:"valid_from"`
	ValidUntil string   `json:"valid_until"`
	SSLType    string   `json:"ssl_type"`
	AutoRenew  bool     `json:"auto_renew"`
	CertPath   string   `json:"cert_path"`
	KeyPath    string   `json:"key_path"`
	DNSNames   []string `json:"dns_names"`
}

// SSLService manages SSL certificates.
type SSLService struct {
	db       *sql.DB
	notifier *NotificationService
}

// NewSSLService creates a new SSLService.
func NewSSLService(db *sql.DB) *SSLService {
	return &SSLService{db: db}
}

// SetNotifier sets the notification service for event dispatching.
func (s *SSLService) SetNotifier(n *NotificationService) { s.notifier = n }

// IssueLetsEncrypt obtains a certificate from Let's Encrypt using HTTP-01 challenge.
func (s *SSLService) IssueLetsEncrypt(domain, email string) error {
	if domain == "" {
		return apperrors.New(apperrors.ErrValidation, "domain is required")
	}
	if email == "" {
		return apperrors.New(apperrors.ErrValidation, "email is required")
	}

	certDir := filepath.Join(letsencryptDir, domain)
	if err := os.MkdirAll(certDir, 0700); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create certificate directory")
	}

	// Generate a new ECDSA private key for the certificate.
	certKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate certificate key")
	}

	// Generate ACME account key.
	accountKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate account key")
	}

	client := &acme.Client{
		Key:          accountKey,
		DirectoryURL: acme.LetsEncryptURL,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Register ACME account.
	acct := &acme.Account{Contact: []string{"mailto:" + email}}
	if _, err := client.Register(ctx, acct, acme.AcceptTOS); err != nil {
		// If already registered, that is fine.
		if !strings.Contains(err.Error(), "already") {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to register ACME account")
		}
	}

	// Authorize the domain.
	authz, err := client.Authorize(ctx, domain)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "ACME authorization failed")
	}

	// Find the HTTP-01 challenge.
	var chal *acme.Challenge
	for _, c := range authz.Challenges {
		if c.Type == "http-01" {
			chal = c
			break
		}
	}
	if chal == nil {
		return apperrors.New(apperrors.ErrInternal, "no HTTP-01 challenge offered by ACME server")
	}

	// Serve the challenge token.
	tokenPath := client.HTTP01ChallengePath(chal.Token)
	tokenResponse, err := client.HTTP01ChallengeResponse(chal.Token)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to compute challenge response")
	}

	// Write challenge file to well-known path for external web servers.
	wellKnownDir := "/var/www/html/.well-known/acme-challenge"
	if err := os.MkdirAll(wellKnownDir, 0755); err != nil {
		logger.Warn().Err(err).Msg("could not create .well-known directory, starting temporary server")
	}

	challengeFileName := filepath.Base(tokenPath)
	challengeFilePath := filepath.Join(wellKnownDir, challengeFileName)
	challengeWritten := false
	if err := os.WriteFile(challengeFilePath, []byte(tokenResponse), 0644); err == nil {
		challengeWritten = true
	}

	// Start a temporary HTTP server on port 80 as fallback.
	mux := http.NewServeMux()
	mux.HandleFunc(tokenPath, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, tokenResponse)
	})

	srv := &http.Server{
		Addr:              ":80",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	srvErrCh := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			srvErrCh <- err
		}
		close(srvErrCh)
	}()

	// Give the server a moment to start.
	time.Sleep(500 * time.Millisecond)

	// Accept the challenge.
	if _, err := client.Accept(ctx, chal); err != nil {
		s.shutdownChallengeServer(srv, challengeFilePath, challengeWritten)
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to accept ACME challenge")
	}

	// Wait for authorization to be valid.
	if _, err := client.WaitAuthorization(ctx, authz.URI); err != nil {
		s.shutdownChallengeServer(srv, challengeFilePath, challengeWritten)
		return apperrors.Wrap(err, apperrors.ErrInternal, "ACME authorization validation failed")
	}

	// Create CSR.
	csr, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{
		Subject: pkix.Name{CommonName: domain},
		DNSNames: []string{domain},
	}, certKey)
	if err != nil {
		s.shutdownChallengeServer(srv, challengeFilePath, challengeWritten)
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create CSR")
	}

	// Request the certificate.
	der, _, err := client.CreateCert(ctx, csr, 90*24*time.Hour, true)
	if err != nil {
		s.shutdownChallengeServer(srv, challengeFilePath, challengeWritten)
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to obtain certificate from Let's Encrypt")
	}

	s.shutdownChallengeServer(srv, challengeFilePath, challengeWritten)

	// Write certificate chain.
	var certPEM []byte
	for _, b := range der {
		certPEM = append(certPEM, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: b})...)
	}

	keyDER, err := x509.MarshalECPrivateKey(certKey)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to marshal private key")
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	certPath := filepath.Join(certDir, certFileName)
	keyPath := filepath.Join(certDir, keyFileName)

	if err := os.WriteFile(certPath, certPEM, 0600); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write certificate")
	}
	if err := os.WriteFile(keyPath, keyPEM, 0600); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write private key")
	}

	// Persist metadata.
	if err := s.saveCertMeta(domain, certTypeLetsEncrypt, true); err != nil {
		logger.Error().Err(err).Str("domain", domain).Msg("failed to save cert metadata")
	}

	logger.Info().Str("domain", domain).Msg("Let's Encrypt certificate issued successfully")
	return nil
}

// DNSChallengeInfo holds the DNS TXT record that must be created for DNS-01 validation.
type DNSChallengeInfo struct {
	Domain     string `json:"domain"`       // e.g. "*.example.com"
	RecordName string `json:"record_name"`  // e.g. "_acme-challenge.example.com"
	RecordType string `json:"record_type"`  // "TXT"
	RecordVal  string `json:"record_value"` // the challenge digest
	// internal state (not serialized)
	acmeClient *acme.Client       `json:"-"`
	certKey    *ecdsa.PrivateKey   `json:"-"`
	chalURI    string              `json:"-"`
	authzURI   string              `json:"-"`
}

// pending DNS challenges keyed by domain
var pendingDNS = struct {
	m  map[string]*DNSChallengeInfo
	mu sync.Mutex
}{m: make(map[string]*DNSChallengeInfo)}

// InitDNSChallenge starts a DNS-01 ACME challenge and returns the TXT record to add.
func (s *SSLService) InitDNSChallenge(domain, email string) (*DNSChallengeInfo, error) {
	if domain == "" {
		return nil, apperrors.New(apperrors.ErrValidation, "domain is required")
	}
	if email == "" {
		return nil, apperrors.New(apperrors.ErrValidation, "email is required")
	}

	certKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate cert key")
	}
	accountKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate account key")
	}

	client := &acme.Client{Key: accountKey, DirectoryURL: acme.LetsEncryptURL}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	acct := &acme.Account{Contact: []string{"mailto:" + email}}
	if _, err := client.Register(ctx, acct, acme.AcceptTOS); err != nil {
		if !strings.Contains(err.Error(), "already") {
			return nil, apperrors.Wrap(err, apperrors.ErrInternal, "ACME registration failed")
		}
	}

	authz, err := client.Authorize(ctx, domain)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "ACME authorization failed")
	}

	var chal *acme.Challenge
	for _, c := range authz.Challenges {
		if c.Type == "dns-01" {
			chal = c
			break
		}
	}
	if chal == nil {
		return nil, apperrors.New(apperrors.ErrInternal, "no DNS-01 challenge offered by ACME server")
	}

	txtValue, err := client.DNS01ChallengeRecord(chal.Token)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to compute DNS challenge record")
	}

	baseDomain := domain
	if strings.HasPrefix(domain, "*.") {
		baseDomain = domain[2:]
	}
	recordName := "_acme-challenge." + baseDomain

	info := &DNSChallengeInfo{
		Domain:     domain,
		RecordName: recordName,
		RecordType: "TXT",
		RecordVal:  txtValue,
		acmeClient: client,
		certKey:    certKey,
		chalURI:    chal.URI,
		authzURI:   authz.URI,
	}

	pendingDNS.mu.Lock()
	pendingDNS.m[domain] = info
	pendingDNS.mu.Unlock()

	logger.Info().Str("domain", domain).Str("record", recordName).Msg("DNS-01 challenge initiated")
	return info, nil
}

// CompleteDNSChallenge verifies the DNS TXT record and completes certificate issuance.
func (s *SSLService) CompleteDNSChallenge(domain, email string) error {
	pendingDNS.mu.Lock()
	info, ok := pendingDNS.m[domain]
	pendingDNS.mu.Unlock()
	if !ok {
		return apperrors.New(apperrors.ErrNotFound, "no pending DNS challenge for this domain; initiate first")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	baseDomain := domain
	if strings.HasPrefix(domain, "*.") {
		baseDomain = domain[2:]
	}
	records, err := net.LookupTXT("_acme-challenge." + baseDomain)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrValidation, "DNS TXT record lookup failed — ensure record is published")
	}
	found := false
	for _, r := range records {
		if r == info.RecordVal {
			found = true
			break
		}
	}
	if !found {
		return apperrors.New(apperrors.ErrValidation,
			fmt.Sprintf("TXT record for _acme-challenge.%s not found or value mismatch. Expected: %s", baseDomain, info.RecordVal))
	}

	if _, err := info.acmeClient.Accept(ctx, &acme.Challenge{URI: info.chalURI}); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to accept DNS-01 challenge")
	}

	if _, err := info.acmeClient.WaitAuthorization(ctx, info.authzURI); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "DNS-01 authorization validation failed")
	}

	dnsNames := []string{domain}
	if strings.HasPrefix(domain, "*.") {
		dnsNames = append(dnsNames, baseDomain)
	}
	csr, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{
		Subject:  pkix.Name{CommonName: domain},
		DNSNames: dnsNames,
	}, info.certKey)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create CSR")
	}

	der, _, err := info.acmeClient.CreateCert(ctx, csr, 90*24*time.Hour, true)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to obtain certificate from Let's Encrypt")
	}

	certName := sanitizeCertName(domain)
	certDir := filepath.Join(letsencryptDir, certName)
	if err := os.MkdirAll(certDir, 0700); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create cert directory")
	}

	var certPEM []byte
	for _, b := range der {
		certPEM = append(certPEM, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: b})...)
	}
	keyDER, err := x509.MarshalECPrivateKey(info.certKey)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to marshal key")
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	certPath := filepath.Join(certDir, certFileName)
	keyPath := filepath.Join(certDir, keyFileName)
	if err := os.WriteFile(certPath, certPEM, 0600); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write certificate")
	}
	if err := os.WriteFile(keyPath, keyPEM, 0600); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write key")
	}

	if err := s.saveCertMeta(domain, certTypeLetsEncrypt, true); err != nil {
		logger.Error().Err(err).Str("domain", domain).Msg("failed to save cert metadata")
	}

	pendingDNS.mu.Lock()
	delete(pendingDNS.m, domain)
	pendingDNS.mu.Unlock()

	logger.Info().Str("domain", domain).Msg("DNS-01 Let's Encrypt certificate issued")
	return nil
}

func (s *SSLService) shutdownChallengeServer(srv *http.Server, challengeFile string, written bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	if written {
		_ = os.Remove(challengeFile)
	}
}

// RenewCertificate renews the certificate for the given domain.
func (s *SSLService) RenewCertificate(domain string) error {
	info, err := s.GetCertInfo(domain)
	if err != nil {
		return err
	}

	switch info.SSLType {
	case certTypeLetsEncrypt:
		// Re-issue using autocert manager as a simpler renewal path.
		email := s.getStoredEmail(domain)
		if email == "" {
			email = "admin@" + domain
		}
		return s.IssueLetsEncrypt(domain, email)
	case certTypeCustom:
		return apperrors.New(apperrors.ErrValidation, "custom certificates cannot be auto-renewed; upload a new certificate")
	case certTypeSelfSigned:
		return apperrors.New(apperrors.ErrValidation, "self-signed certificates cannot be renewed via ACME")
	default:
		return apperrors.New(apperrors.ErrNotFound, "unknown certificate type")
	}
}

// UploadCustomCert stores a user-provided certificate and key.
func (s *SSLService) UploadCustomCert(domain string, cert, key []byte) (string, error) {
	if domain == "" {
		return "", apperrors.New(apperrors.ErrValidation, "domain is required")
	}

	// Validate the certificate and key.
	if _, err := tls.X509KeyPair(cert, key); err != nil {
		return "", apperrors.New(apperrors.ErrValidation, "invalid certificate/key pair: "+err.Error())
	}

	// Parse cert to extract the primary identity (CN or first DNS name)
	certIdentity := domain
	block, _ := pem.Decode(cert)
	if block != nil {
		if parsed, err := x509.ParseCertificate(block.Bytes); err == nil {
			if len(parsed.DNSNames) > 0 {
				certIdentity = sanitizeCertName(parsed.DNSNames[0])
			} else if parsed.Subject.CommonName != "" {
				certIdentity = sanitizeCertName(parsed.Subject.CommonName)
			}
		}
	}

	// Store under the cert identity name (e.g., _wildcard_.dlu.edu.vn)
	certDir := filepath.Join(customCertDir, certIdentity)
	if err := os.MkdirAll(certDir, 0700); err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to create certificate directory")
	}

	certPath := filepath.Join(certDir, certFileName)
	keyPath := filepath.Join(certDir, keyFileName)

	if err := os.WriteFile(certPath, cert, 0600); err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to write certificate")
	}
	if err := os.WriteFile(keyPath, key, 0600); err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to write private key")
	}

	if err := s.saveCertMeta(certIdentity, certTypeCustom, false); err != nil {
		logger.Error().Err(err).Str("domain", certIdentity).Msg("failed to save cert metadata")
	}

	logger.Info().Str("domain", domain).Str("cert_identity", certIdentity).Msg("custom certificate uploaded")
	return certIdentity, nil
}

// sanitizeCertName converts a certificate CN/DNS name into a safe folder name.
// e.g. "*.dlu.edu.vn" -> "_wildcard_.dlu.edu.vn"
func sanitizeCertName(name string) string {
	return strings.ReplaceAll(name, "*", "_wildcard_")
}

// GetCertInfo returns information about the certificate for a domain.
func (s *SSLService) GetCertInfo(domain string) (*CertInfo, error) {
	// Check under original domain name and sanitized cert identity
	lookups := []string{domain}
	sanitized := sanitizeCertName(domain)
	if sanitized != domain {
		lookups = append(lookups, sanitized)
	}

	for _, lookup := range lookups {
		for _, entry := range []struct {
			dir      string
			certType string
		}{
			{filepath.Join(letsencryptDir, lookup), certTypeLetsEncrypt},
			{filepath.Join(customCertDir, lookup), certTypeCustom},
		} {
			certPath := filepath.Join(entry.dir, certFileName)
			keyPath := filepath.Join(entry.dir, keyFileName)

			if _, err := os.Stat(certPath); err != nil {
				continue
			}

			info, err := s.parseCertFile(certPath, keyPath, lookup, entry.certType)
			if err != nil {
				continue
			}
			return info, nil
		}
	}

	return nil, apperrors.New(apperrors.ErrNotFound, "no certificate found for domain: "+domain)
}

// DeleteCertificate removes the certificate for a domain.
func (s *SSLService) DeleteCertificate(domain string) error {
	deleted := false

	for _, dir := range []string{
		filepath.Join(letsencryptDir, domain),
		filepath.Join(customCertDir, domain),
	} {
		if _, err := os.Stat(dir); err == nil {
			if err := os.RemoveAll(dir); err != nil {
				return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete certificate files")
			}
			deleted = true
		}
	}

	if !deleted {
		return apperrors.New(apperrors.ErrNotFound, "no certificate found for domain: "+domain)
	}

	s.deleteCertMeta(domain)
	logger.Info().Str("domain", domain).Msg("certificate deleted")
	return nil
}

// ListCertificates returns all managed certificates, deduplicated by cert content.
// When the same certificate exists under both its cert-identity folder (e.g. _wildcard_.dlu.edu.vn)
// and a site-specific copy, only the cert-identity entry is returned.
func (s *SSLService) ListCertificates() ([]*CertInfo, error) {
	var allCerts []*CertInfo

	for _, entry := range []struct {
		baseDir  string
		certType string
	}{
		{letsencryptDir, certTypeLetsEncrypt},
		{customCertDir, certTypeCustom},
	} {
		entries, err := os.ReadDir(entry.baseDir)
		if err != nil {
			continue
		}

		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			domain := e.Name()
			certPath := filepath.Join(entry.baseDir, domain, certFileName)
			keyPath := filepath.Join(entry.baseDir, domain, keyFileName)

			info, err := s.parseCertFile(certPath, keyPath, domain, entry.certType)
			if err != nil {
				logger.Debug().Err(err).Str("domain", domain).Msg("skipping unparseable cert")
				continue
			}
			allCerts = append(allCerts, info)
		}
	}

	// Deduplicate: group by cert fingerprint (DNS names sorted + validity)
	// Prefer cert-identity folders (containing _wildcard_ or matching first DNS name)
	seen := make(map[string]*CertInfo)
	for _, c := range allCerts {
		key := certDedupeKey(c)
		existing, exists := seen[key]
		if !exists {
			seen[key] = c
			continue
		}
		// Prefer the cert-identity folder (not a site-specific copy)
		if isCertIdentityFolder(c.Domain) && !isCertIdentityFolder(existing.Domain) {
			seen[key] = c
		}
	}

	certs := make([]*CertInfo, 0, len(seen))
	for _, c := range seen {
		certs = append(certs, c)
	}

	return certs, nil
}

// certDedupeKey generates a deduplication key from cert content.
func certDedupeKey(c *CertInfo) string {
	names := make([]string, len(c.DNSNames))
	copy(names, c.DNSNames)
	sort.Strings(names)
	return strings.Join(names, ",") + "|" + c.ValidFrom + "|" + c.ValidUntil + "|" + c.SSLType
}

// isCertIdentityFolder checks if a folder name looks like a cert identity
// (contains _wildcard_ prefix or matches common cert CN patterns) vs a site domain copy.
func isCertIdentityFolder(domain string) bool {
	return strings.Contains(domain, "_wildcard_")
}

// CheckExpiry returns certificates expiring within 30 days.
func (s *SSLService) CheckExpiry() ([]*CertInfo, error) {
	all, err := s.ListCertificates()
	if err != nil {
		return nil, err
	}

	now := time.Now()
	var expiring []*CertInfo
	threshold := now.Add(expiryThreshold)
	for _, cert := range all {
		expDate, _ := time.Parse("2006-01-02", cert.ValidUntil)
		if expDate.Before(threshold) {
			expiring = append(expiring, cert)
			if s.notifier != nil {
				daysLeft := int(expDate.Sub(now).Hours() / 24)
				evType := EventSSLExpiryWarning
				if daysLeft <= 0 {
					evType = EventSSLExpired
				}
				s.notifier.Notify(NotificationEvent{
					Type:   evType,
					Title:  cert.Domain,
					Detail: fmt.Sprintf("Expires: %s (%d days left)", cert.ValidUntil, daysLeft),
				})
			}
		}
	}
	return expiring, nil
}

// EnablePanelSSL installs an SSL certificate for the panel itself.
func (s *SSLService) EnablePanelSSL(cert, key []byte) error {
	if _, err := tls.X509KeyPair(cert, key); err != nil {
		return apperrors.New(apperrors.ErrValidation, "invalid certificate/key pair: "+err.Error())
	}

	if err := os.MkdirAll(panelCertDir, 0700); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create panel SSL directory")
	}

	certPath := filepath.Join(panelCertDir, certFileName)
	keyPath := filepath.Join(panelCertDir, keyFileName)

	if err := os.WriteFile(certPath, cert, 0600); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write panel certificate")
	}
	if err := os.WriteFile(keyPath, key, 0600); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write panel key")
	}

	logger.Info().Msg("panel SSL certificate installed")
	return nil
}

// GenerateSelfSignedCert generates a self-signed certificate for the panel.
// It includes the system hostname, localhost, and all detected network IPs as SANs.
func (s *SSLService) GenerateSelfSignedCert() error {
	if err := os.MkdirAll(panelCertDir, 0700); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create panel SSL directory")
	}

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate private key")
	}

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate serial number")
	}

	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "localhost"
	}

	// Collect all server IPs for SANs so the cert works from remote access
	ips := []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback}
	if ifaces, err := net.Interfaces(); err == nil {
		for _, iface := range ifaces {
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}
			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}
			for _, addr := range addrs {
				var ip net.IP
				switch v := addr.(type) {
				case *net.IPNet:
					ip = v.IP
				case *net.IPAddr:
					ip = v.IP
				}
				if ip != nil && !ip.IsLoopback() {
					ips = append(ips, ip)
				}
			}
		}
	}

	template := &x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"ITDLUPanel"},
			CommonName:   hostname,
		},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              []string{hostname, "localhost"},
		IPAddresses:           ips,
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create self-signed certificate")
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to marshal private key")
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	certPath := filepath.Join(panelCertDir, certFileName)
	keyPath := filepath.Join(panelCertDir, keyFileName)

	if err := os.WriteFile(certPath, certPEM, 0600); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write self-signed certificate")
	}
	if err := os.WriteFile(keyPath, keyPEM, 0600); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write self-signed key")
	}

	logger.Info().Msg("self-signed panel certificate generated")
	return nil
}

// PanelCertPaths returns the paths to the panel SSL certificate and key.
func PanelCertPaths() (certPath, keyPath string) {
	return filepath.Join(panelCertDir, certFileName), filepath.Join(panelCertDir, keyFileName)
}

// PanelCertExists returns true if the panel SSL certificate files exist.
func PanelCertExists() bool {
	certPath, keyPath := PanelCertPaths()
	if _, err := os.Stat(certPath); err != nil {
		return false
	}
	if _, err := os.Stat(keyPath); err != nil {
		return false
	}
	return true
}

// GetPanelSSLInfo returns the panel's current SSL certificate info.
func (s *SSLService) GetPanelSSLInfo() (*CertInfo, error) {
	certPath := filepath.Join(panelCertDir, certFileName)
	keyPath := filepath.Join(panelCertDir, keyFileName)

	if _, err := os.Stat(certPath); err != nil {
		return nil, apperrors.New(apperrors.ErrNotFound, "no panel SSL certificate configured")
	}

	info, err := s.parseCertFile(certPath, keyPath, "panel", "")
	if err != nil {
		return nil, err
	}

	// Determine type from issuer.
	if info.Issuer == info.Domain || strings.Contains(info.Issuer, "ITDLUPanel") {
		info.SSLType = certTypeSelfSigned
	} else if strings.Contains(strings.ToLower(info.Issuer), "let's encrypt") || strings.Contains(strings.ToLower(info.Issuer), "letsencrypt") {
		info.SSLType = certTypeLetsEncrypt
	} else {
		info.SSLType = certTypeCustom
	}

	return info, nil
}

// SetupAutoRenew registers the auto-renewal background worker.
// This is a convenience method that creates and starts an SSLRenewer.
func (s *SSLService) SetupAutoRenew() error {
	renewer := NewSSLRenewer(s)
	ctx := context.Background()
	go renewer.Start(ctx)
	logger.Info().Msg("SSL auto-renewal worker started")
	return nil
}

// parseCertFile reads a PEM certificate file and extracts metadata.
func (s *SSLService) parseCertFile(certPath, keyPath, domain, certType string) (*CertInfo, error) {
	certData, err := os.ReadFile(certPath)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read certificate file")
	}

	block, _ := pem.Decode(certData)
	if block == nil {
		return nil, apperrors.New(apperrors.ErrInternal, "failed to decode PEM certificate")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to parse certificate")
	}

	autoRenew := certType == certTypeLetsEncrypt
	meta := s.getCertMeta(domain)
	if meta != nil {
		autoRenew = meta.autoRenew
		if certType == "" {
			certType = meta.certType
		}
	}

	issuerOrg := cert.Issuer.CommonName
	if len(cert.Issuer.Organization) > 0 {
		issuerOrg = cert.Issuer.Organization[0]
	}

	// Build a human-readable SSL name from DNS names or CN
	sslName := domain
	if len(cert.DNSNames) > 0 {
		sslName = strings.Join(cert.DNSNames, ", ")
	} else if cert.Subject.CommonName != "" {
		sslName = cert.Subject.CommonName
	}

	return &CertInfo{
		Domain:     domain,
		SSLName:    sslName,
		Issuer:     issuerOrg,
		IssuerCN:   cert.Issuer.CommonName,
		ValidFrom:  cert.NotBefore.Format("2006-01-02"),
		ValidUntil: cert.NotAfter.Format("2006-01-02"),
		SSLType:    certType,
		AutoRenew:  autoRenew,
		CertPath:   certPath,
		KeyPath:    keyPath,
		DNSNames:   cert.DNSNames,
	}, nil
}

type certMeta struct {
	certType  string
	autoRenew bool
	email     string
}

func (s *SSLService) saveCertMeta(domain, certType string, autoRenew bool) error {
	s.ensureCertTable()
	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO ssl_certificates (domain, cert_type, auto_renew, updated_at)
		VALUES (?, ?, ?, datetime('now'))
	`, domain, certType, autoRenew)
	return err
}

func (s *SSLService) getCertMeta(domain string) *certMeta {
	s.ensureCertTable()
	row := s.db.QueryRow("SELECT cert_type, auto_renew FROM ssl_certificates WHERE domain = ?", domain)
	var meta certMeta
	if err := row.Scan(&meta.certType, &meta.autoRenew); err != nil {
		return nil
	}
	return &meta
}

func (s *SSLService) deleteCertMeta(domain string) {
	s.ensureCertTable()
	_, _ = s.db.Exec("DELETE FROM ssl_certificates WHERE domain = ?", domain)
}

func (s *SSLService) getStoredEmail(domain string) string {
	s.ensureCertTable()
	var email sql.NullString
	_ = s.db.QueryRow("SELECT email FROM ssl_certificates WHERE domain = ?", domain).Scan(&email)
	return email.String
}

func (s *SSLService) ensureCertTable() {
	_, _ = s.db.Exec(`
		CREATE TABLE IF NOT EXISTS ssl_certificates (
			domain     TEXT PRIMARY KEY,
			cert_type  TEXT NOT NULL DEFAULT 'custom',
			auto_renew INTEGER NOT NULL DEFAULT 0,
			email      TEXT DEFAULT '',
			updated_at DATETIME DEFAULT (datetime('now'))
		)
	`)
}

// Ensure autocert.Manager is usable — suppress unused import warning.
var _ = autocert.Manager{}
