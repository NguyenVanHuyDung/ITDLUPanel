package service

import (
	"context"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

const defaultRenewalInterval = 24 * time.Hour

// SSLRenewer is a background worker that checks and renews expiring certificates.
type SSLRenewer struct {
	sslService *SSLService
	interval   time.Duration
}

// NewSSLRenewer creates a new SSLRenewer.
func NewSSLRenewer(sslService *SSLService) *SSLRenewer {
	return &SSLRenewer{
		sslService: sslService,
		interval:   defaultRenewalInterval,
	}
}

// Start runs the renewal loop. It blocks until ctx is cancelled.
func (r *SSLRenewer) Start(ctx context.Context) {
	logger.Info().Dur("interval", r.interval).Msg("SSL auto-renewer started")

	// Run once immediately on startup.
	if err := r.RenewExpiring(); err != nil {
		logger.Error().Err(err).Msg("initial SSL renewal check failed")
	}

	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info().Msg("SSL auto-renewer stopped")
			return
		case <-ticker.C:
			if err := r.RenewExpiring(); err != nil {
				logger.Error().Err(err).Msg("SSL renewal check failed")
			}
		}
	}
}

// RenewExpiring renews certificates that expire within 30 days.
func (r *SSLRenewer) RenewExpiring() error {
	expiring, err := r.sslService.CheckExpiry()
	if err != nil {
		return err
	}

	if len(expiring) == 0 {
		logger.Debug().Msg("no certificates expiring soon")
		return nil
	}

	logger.Info().Int("count", len(expiring)).Msg("found certificates expiring soon")

	var lastErr error
	for _, cert := range expiring {
		if !cert.AutoRenew {
			logger.Info().
				Str("domain", cert.Domain).
				Str("type", cert.Type).
				Time("expires", cert.NotAfter).
				Msg("certificate expiring but auto-renew is disabled")
			continue
		}

		logger.Info().
			Str("domain", cert.Domain).
			Time("expires", cert.NotAfter).
			Msg("renewing certificate")

		if err := r.sslService.RenewCertificate(cert.Domain); err != nil {
			logger.Error().
				Err(err).
				Str("domain", cert.Domain).
				Msg("failed to renew certificate")
			lastErr = err
			continue
		}

		logger.Info().Str("domain", cert.Domain).Msg("certificate renewed successfully")
	}

	return lastErr
}
