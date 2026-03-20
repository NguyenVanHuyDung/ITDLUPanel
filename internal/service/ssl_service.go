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
	"strings"
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
	Domain    string    `json:"domain"`
	Issuer    string    `json:"issuer"`
	NotBefore time.Time `json:"not_before"`
	NotAfter  time.Time `json:"not_after"`
	Type      string    `json:"type"`
	AutoRenew bool      `json:"auto_renew"`
	CertPath  string    `json:"cert_path"`
	KeyPath   string    `json:"key_path"`
}

// SSLService manages SSL certificates.
type SSLService struct {
	db *sql.DB
}

// NewSSLService creates a new SSLService.
func NewSSLService(db *sql.DB) *SSLService {
	return &SSLService{db: db}
}

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

	switch info.Type {
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
func (s *SSLService) UploadCustomCert(domain string, cert, key []byte) error {
	if domain == "" {
		return apperrors.New(apperrors.ErrValidation, "domain is required")
	}

	// Validate the certificate and key.
	if _, err := tls.X509KeyPair(cert, key); err != nil {
		return apperrors.New(apperrors.ErrValidation, "invalid certificate/key pair: "+err.Error())
	}

	certDir := filepath.Join(customCertDir, domain)
	if err := os.MkdirAll(certDir, 0700); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create certificate directory")
	}

	certPath := filepath.Join(certDir, certFileName)
	keyPath := filepath.Join(certDir, keyFileName)

	if err := os.WriteFile(certPath, cert, 0600); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write certificate")
	}
	if err := os.WriteFile(keyPath, key, 0600); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write private key")
	}

	if err := s.saveCertMeta(domain, certTypeCustom, false); err != nil {
		logger.Error().Err(err).Str("domain", domain).Msg("failed to save cert metadata")
	}

	logger.Info().Str("domain", domain).Msg("custom certificate uploaded")
	return nil
}

// GetCertInfo returns information about the certificate for a domain.
func (s *SSLService) GetCertInfo(domain string) (*CertInfo, error) {
	// Check Let's Encrypt directory first, then custom.
	for _, entry := range []struct {
		dir      string
		certType string
	}{
		{filepath.Join(letsencryptDir, domain), certTypeLetsEncrypt},
		{filepath.Join(customCertDir, domain), certTypeCustom},
	} {
		certPath := filepath.Join(entry.dir, certFileName)
		keyPath := filepath.Join(entry.dir, keyFileName)

		if _, err := os.Stat(certPath); err != nil {
			continue
		}

		info, err := s.parseCertFile(certPath, keyPath, domain, entry.certType)
		if err != nil {
			continue
		}
		return info, nil
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

// ListCertificates returns all managed certificates.
func (s *SSLService) ListCertificates() ([]*CertInfo, error) {
	var certs []*CertInfo

	for _, entry := range []struct {
		baseDir  string
		certType string
	}{
		{letsencryptDir, certTypeLetsEncrypt},
		{customCertDir, certTypeCustom},
	} {
		entries, err := os.ReadDir(entry.baseDir)
		if err != nil {
			// Directory may not exist yet.
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
			certs = append(certs, info)
		}
	}

	return certs, nil
}

// CheckExpiry returns certificates expiring within 30 days.
func (s *SSLService) CheckExpiry() ([]*CertInfo, error) {
	all, err := s.ListCertificates()
	if err != nil {
		return nil, err
	}

	var expiring []*CertInfo
	threshold := time.Now().Add(expiryThreshold)
	for _, cert := range all {
		if cert.NotAfter.Before(threshold) {
			expiring = append(expiring, cert)
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
		IPAddresses:           []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback},
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
		info.Type = certTypeSelfSigned
	} else if strings.Contains(strings.ToLower(info.Issuer), "let's encrypt") || strings.Contains(strings.ToLower(info.Issuer), "letsencrypt") {
		info.Type = certTypeLetsEncrypt
	} else {
		info.Type = certTypeCustom
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

	return &CertInfo{
		Domain:    domain,
		Issuer:    cert.Issuer.CommonName,
		NotBefore: cert.NotBefore,
		NotAfter:  cert.NotAfter,
		Type:      certType,
		AutoRenew: autoRenew,
		CertPath:  certPath,
		KeyPath:   keyPath,
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
