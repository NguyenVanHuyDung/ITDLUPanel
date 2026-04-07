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

	var msg strings.Builder
	fmt.Fprintf(&msg, "From: %s\r\n", from)
	fmt.Fprintf(&msg, "To: %s\r\n", to)
	fmt.Fprintf(&msg, "Subject: %s\r\n", subject)
	fmt.Fprintf(&msg, "Date: %s\r\n", time.Now().Format(time.RFC1123Z))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
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
	return s.Send(cfg, to, "✅ ITDLUPanel — Connection Test", s.testEmailHTML())
}

func (s *EmailService) testEmailHTML() string {
	return s.buildEmail(emailData{
		Color:       "#1565C0",
		Icon:        "✅",
		SevLabel:    "CONNECTION TEST",
		SevColor:    "#1565C0",
		Title:       "Email Configuration Verified",
		Description: "Your SMTP settings are configured correctly. ITDLUPanel can now send notifications to this email address.",
		Fields:      []emailField{{Label: "Status", Value: "Connected"}, {Label: "Time", Value: time.Now().Format("2006-01-02 15:04:05 MST")}},
		PanelURL:    "",
	})
}

// FormatEventEmail builds a professional HTML email for a notification event.
func (s *EmailService) FormatEventEmail(eventType, severity, title, detail, panelURL string) string {
	meta := eventEmailMeta(eventType, severity)
	fields := []emailField{
		{Label: "Event", Value: eventDisplayName(eventType)},
		{Label: "Severity", Value: strings.ToUpper(severity)},
		{Label: "Time", Value: time.Now().Format("2006-01-02 15:04:05 MST")},
	}
	if detail != "" {
		fields = append(fields, emailField{Label: "Details", Value: detail})
	}

	return s.buildEmail(emailData{
		Color:       meta.color,
		Icon:        meta.icon,
		SevLabel:    strings.ToUpper(severity),
		SevColor:    meta.color,
		Title:       title,
		Description: meta.description,
		Fields:      fields,
		PanelURL:    panelURL,
	})
}

// FormatCustomEmail wraps custom body text in the professional HTML template.
func (s *EmailService) FormatCustomEmail(eventType, severity, title, customBody, panelURL string) string {
	meta := eventEmailMeta(eventType, severity)
	// Split custom body by newlines into fields.
	lines := strings.Split(strings.TrimSpace(customBody), "\n")
	var fields []emailField
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if idx := strings.Index(line, ":"); idx > 0 && idx < 30 {
			fields = append(fields, emailField{Label: line[:idx], Value: strings.TrimSpace(line[idx+1:])})
		} else {
			fields = append(fields, emailField{Label: "", Value: line})
		}
	}
	if len(fields) == 0 {
		fields = append(fields, emailField{Label: "Message", Value: customBody})
	}

	return s.buildEmail(emailData{
		Color:       meta.color,
		Icon:        meta.icon,
		SevLabel:    strings.ToUpper(severity),
		SevColor:    meta.color,
		Title:       title,
		Description: customBody,
		Fields:      fields,
		PanelURL:    panelURL,
	})
}

// ---- email template types ----

type emailField struct {
	Label string
	Value string
}

type emailData struct {
	Color       string
	Icon        string
	SevLabel    string
	SevColor    string
	Title       string
	Description string
	Fields      []emailField
	PanelURL    string
}

type eventMeta struct {
	icon        string
	color       string
	description string
}

func eventDisplayName(eventType string) string {
	names := map[string]string{
		"cron_success":            "Cron Job Success",
		"cron_failed":             "Cron Job Failed",
		"ssl_expiry_warning":      "SSL Expiry Warning",
		"ssl_expired":             "SSL Certificate Expired",
		"backup_completed":        "Backup Completed",
		"backup_failed":           "Backup Failed",
		"software_installed":      "Software Installed",
		"software_install_failed": "Software Install Failed",
		"site_created":            "Website Created",
		"site_deleted":            "Website Deleted",
		"cpu_high":                "High CPU Usage",
		"memory_high":             "High Memory Usage",
		"disk_high":               "High Disk Usage",
		"service_down":            "Service Down",
		"login_failed":            "Login Attempt Failed",
	}
	if n, ok := names[eventType]; ok {
		return n
	}
	return eventType
}

func eventEmailMeta(eventType, severity string) eventMeta {
	colorMap := map[string]string{
		"info": "#1565C0", "success": "#2E7D32", "warning": "#E65100", "error": "#C62828", "critical": "#B71C1C",
	}
	color := colorMap[severity]
	if color == "" {
		color = "#1565C0"
	}

	metas := map[string]eventMeta{
		"cron_success":            {icon: "✅", color: "#2E7D32", description: "A scheduled task has completed successfully."},
		"cron_failed":             {icon: "❌", color: "#C62828", description: "A scheduled task has failed. Please check the task configuration and logs."},
		"ssl_expiry_warning":      {icon: "⚠️", color: "#E65100", description: "An SSL certificate is approaching its expiration date. Renew it to avoid downtime."},
		"ssl_expired":             {icon: "🚨", color: "#B71C1C", description: "An SSL certificate has expired! Visitors will see security warnings. Immediate action required."},
		"backup_completed":        {icon: "✅", color: "#2E7D32", description: "A backup has been created and stored successfully."},
		"backup_failed":           {icon: "❌", color: "#C62828", description: "A backup operation has failed. Please check storage space and permissions."},
		"software_installed":      {icon: "📦", color: "#2E7D32", description: "A software package has been installed successfully on your server."},
		"software_install_failed": {icon: "❌", color: "#C62828", description: "A software installation has failed. Check the task logs for details."},
		"site_created":            {icon: "🌐", color: "#1565C0", description: "A new website has been created on your server."},
		"site_deleted":            {icon: "🗑️", color: "#E65100", description: "A website has been removed from your server."},
		"cpu_high":                {icon: "🔥", color: "#E65100", description: "CPU usage has exceeded the warning threshold. Server performance may be impacted."},
		"memory_high":             {icon: "💾", color: "#E65100", description: "Memory usage is critically high. Consider optimizing applications or upgrading resources."},
		"disk_high":               {icon: "💿", color: "#B71C1C", description: "Disk space is running critically low. Free up space or expand storage immediately."},
		"service_down":            {icon: "🔻", color: "#B71C1C", description: "A monitored service has stopped responding. Immediate investigation required."},
		"login_failed":            {icon: "🔒", color: "#E65100", description: "A failed login attempt was detected on your panel. Review if this was unexpected."},
	}
	if m, ok := metas[eventType]; ok {
		return m
	}
	iconMap := map[string]string{"info": "ℹ️", "success": "✅", "warning": "⚠️", "error": "❌", "critical": "🚨"}
	icon := iconMap[severity]
	if icon == "" {
		icon = "🔔"
	}
	return eventMeta{icon: icon, color: color, description: "A system event has occurred."}
}

func (s *EmailService) buildEmail(d emailData) string {
	var fieldsHTML strings.Builder
	for _, f := range d.Fields {
		fieldsHTML.WriteString(fmt.Sprintf(`
			<tr>
				<td style="padding:8px 12px;font-size:13px;color:#6B7280;font-weight:500;white-space:nowrap;vertical-align:top">%s</td>
				<td style="padding:8px 12px;font-size:13px;color:#1F2937;word-break:break-word">%s</td>
			</tr>`, f.Label, f.Value))
	}

	buttonHTML := ""
	if d.PanelURL != "" {
		buttonHTML = fmt.Sprintf(`
		<tr><td style="padding:24px 32px 0">
			<a href="%s" style="display:inline-block;padding:12px 28px;background:%s;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px">
				Open Panel →
			</a>
		</td></tr>`, d.PanelURL, d.Color)
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif">
<table width="100%%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">

	<!-- Header -->
	<tr><td style="background:linear-gradient(135deg,%s 0%%,%s 100%%);padding:28px 32px">
		<table width="100%%" cellpadding="0" cellspacing="0"><tr>
			<td style="font-size:28px;line-height:1">%s</td>
			<td style="text-align:right">
				<span style="display:inline-block;padding:4px 14px;background:rgba(255,255,255,0.2);border-radius:20px;color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">%s</span>
			</td>
		</tr></table>
		<h1 style="margin:16px 0 0;color:#fff;font-size:20px;font-weight:700;line-height:1.3">%s</h1>
	</td></tr>

	<!-- Description -->
	<tr><td style="padding:24px 32px 0">
		<p style="margin:0;font-size:14px;color:#4B5563;line-height:1.7">%s</p>
	</td></tr>

	<!-- Fields table -->
	<tr><td style="padding:20px 32px 0">
		<table width="100%%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:10px;border:1px solid #E5E7EB;overflow:hidden">
			%s
		</table>
	</td></tr>

	<!-- Button -->
	%s

	<!-- Footer -->
	<tr><td style="padding:28px 32px;border-top:1px solid #F3F4F6;margin-top:24px">
		<table width="100%%" cellpadding="0" cellspacing="0"><tr>
			<td style="font-size:12px;color:#9CA3AF;line-height:1.5">
				<strong style="color:#6B7280">ITDLUPanel</strong><br>
				Automated notification · %s
			</td>
			<td style="text-align:right;font-size:11px;color:#D1D5DB">
				Do not reply to this email
			</td>
		</tr></table>
	</td></tr>

</table>
</td></tr></table>
</body></html>`,
		d.Color, adjustColor(d.Color), d.Icon, d.SevLabel, d.Title,
		d.Description,
		fieldsHTML.String(),
		buttonHTML,
		time.Now().Format("Mon, 02 Jan 2006 15:04 MST"))
}

func adjustColor(hex string) string {
	// Slightly lighter shade for gradient end
	lightMap := map[string]string{
		"#1565C0": "#1E88E5", "#2E7D32": "#43A047", "#E65100": "#F57C00",
		"#C62828": "#E53935", "#B71C1C": "#D32F2F",
	}
	if l, ok := lightMap[hex]; ok {
		return l
	}
	return hex
}
