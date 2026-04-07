package service

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// EmailConfig holds SMTP configuration for sending email notifications.
type EmailConfig struct {
	Host       string          `json:"host"`
	Port       json.Number     `json:"port"`
	Username   string          `json:"username"`
	Password   string          `json:"password"`
	FromAddr   string          `json:"from"`
	Encryption string          `json:"encryption"`
	ToAddr     string          `json:"to"`
}

func (c EmailConfig) PortInt() int {
	n, _ := c.Port.Int64()
	if n == 0 {
		n = 587
	}
	return int(n)
}

// EmailService sends email notifications via SMTP.
type EmailService struct{}

// NewEmailService returns a new EmailService.
func NewEmailService() *EmailService { return &EmailService{} }

// ParseConfig unmarshals a JSON config string into EmailConfig.
func (s *EmailService) ParseConfig(raw string) (EmailConfig, error) {
	var cfg EmailConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return cfg, fmt.Errorf("invalid email config: %w", err)
	}
	return cfg, nil
}

// Send sends an email with HTML body.
func (s *EmailService) Send(cfg EmailConfig, to, subject, htmlBody string) error {
	from := cfg.FromAddr
	if from == "" {
		from = cfg.Username
	}

	headers := map[string]string{
		"From":         from,
		"To":           to,
		"Subject":      subject,
		"MIME-Version": "1.0",
		"Content-Type": "text/html; charset=UTF-8",
		"Date":         time.Now().Format(time.RFC1123Z),
	}

	var msg strings.Builder
	for k, v := range headers {
		fmt.Fprintf(&msg, "%s: %s\r\n", k, v)
	}
	msg.WriteString("\r\n")
	msg.WriteString(htmlBody)

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.PortInt())

	if cfg.Encryption == "ssl" || cfg.PortInt() == 465 {
		return s.sendTLS(cfg, addr, to, msg.String())
	}
	return s.sendStartTLS(cfg, addr, to, msg.String())
}

// sendTLS connects with implicit TLS (port 465).
func (s *EmailService) sendTLS(cfg EmailConfig, addr, to, msg string) error {
	tlsCfg := &tls.Config{ServerName: cfg.Host}
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 10 * time.Second}, "tcp", addr, tlsCfg)
	if err != nil {
		return fmt.Errorf("tls dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	return s.doSend(client, cfg, to, msg)
}

// sendStartTLS connects plain then upgrades with STARTTLS.
func (s *EmailService) sendStartTLS(cfg EmailConfig, addr, to, msg string) error {
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: cfg.Host}); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	}

	return s.doSend(client, cfg, to, msg)
}

func (s *EmailService) doSend(c *smtp.Client, cfg EmailConfig, to, msg string) error {
	if cfg.Username != "" {
		auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
		if err := c.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	from := cfg.FromAddr
	if from == "" {
		from = cfg.Username
	}
	if err := c.Mail(from); err != nil {
		return fmt.Errorf("mail from: %w", err)
	}
	if err := c.Rcpt(to); err != nil {
		return fmt.Errorf("rcpt to: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	if _, err := w.Write([]byte(msg)); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("close data: %w", err)
	}
	return c.Quit()
}

// TestConnection verifies the SMTP connection and authentication.
func (s *EmailService) TestConnection(cfg EmailConfig) error {
	to := cfg.ToAddr
	if to == "" {
		to = cfg.Username
	}
	return s.Send(cfg, to, "ITDLUPanel Test", s.testEmailHTML())
}

func (s *EmailService) testEmailHTML() string {
	return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px">
<h2 style="color:#1565C0">✅ ITDLUPanel — Email Notification Test</h2>
<p>This is a test email from ITDLUPanel. If you received this, your SMTP configuration is working correctly.</p>
<p style="color:#888;font-size:12px">Sent at: ` + time.Now().Format("2006-01-02 15:04:05 MST") + `</p>
</body></html>`
}

// FormatEventEmail builds an HTML email for a notification event.
func (s *EmailService) FormatEventEmail(eventType, severity, title, detail, panelURL string) string {
	colorMap := map[string]string{
		"info":     "#1565C0",
		"success":  "#2E7D32",
		"warning":  "#F57F17",
		"error":    "#C62828",
		"critical": "#B71C1C",
	}
	badgeMap := map[string]string{
		"info":     "ℹ️",
		"success":  "✅",
		"warning":  "⚠️",
		"error":    "❌",
		"critical": "🚨",
	}
	color := colorMap[severity]
	if color == "" {
		color = "#1565C0"
	}
	badge := badgeMap[severity]
	if badge == "" {
		badge = "🔔"
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%%" cellpadding="0" cellspacing="0" style="padding:24px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <tr><td style="background:%s;padding:20px 28px">
    <h1 style="margin:0;color:#fff;font-size:18px;font-weight:600">%s ITDLUPanel</h1>
  </td></tr>
  <tr><td style="padding:28px">
    <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:%s;font-weight:700">%s</p>
    <h2 style="margin:0 0 16px;font-size:20px;color:#222">%s</h2>
    <div style="padding:16px;background:#f8f9fa;border-radius:8px;border-left:4px solid %s;font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap">%s</div>
    <p style="margin:20px 0 0"><a href="%s" style="display:inline-block;padding:10px 24px;background:%s;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600">Open Panel →</a></p>
  </td></tr>
  <tr><td style="padding:16px 28px;border-top:1px solid #eee;font-size:11px;color:#999">
    Sent from ITDLUPanel · %s
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
		color, badge, color, strings.ToUpper(severity), title, color, detail, panelURL, color, time.Now().Format("2006-01-02 15:04:05"))
}
