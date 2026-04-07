package service

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// TelegramConfig holds Telegram Bot API configuration.
type TelegramConfig struct {
	BotToken string `json:"bot_token"`
	ChatID   string `json:"chat_id"`
}

// TelegramService sends notifications via Telegram Bot API.
type TelegramService struct {
	client *http.Client
}

// NewTelegramService returns a new TelegramService.
func NewTelegramService() *TelegramService {
	return &TelegramService{
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

// ParseConfig unmarshals a JSON config string into TelegramConfig.
func (s *TelegramService) ParseConfig(raw string) (TelegramConfig, error) {
	var cfg TelegramConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return cfg, fmt.Errorf("invalid telegram config: %w", err)
	}
	return cfg, nil
}

// Send sends a MarkdownV2 message to the specified chat.
func (s *TelegramService) Send(cfg TelegramConfig, text string) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", cfg.BotToken)
	form := url.Values{
		"chat_id":    {cfg.ChatID},
		"text":       {text},
		"parse_mode": {"MarkdownV2"},
	}

	resp, err := s.client.PostForm(apiURL, form)
	if err != nil {
		return fmt.Errorf("telegram send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("telegram API %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

// TestConnection verifies the bot token and sends a test message.
func (s *TelegramService) TestConnection(cfg TelegramConfig) error {
	text := "✅ *ITDLUPanel — Connection Test*\n\n" +
		"Telegram notification is configured correctly\\.\n" +
		"You will receive alerts from your server here\\.\n\n" +
		"⏱ `" + escapeMarkdownV2(time.Now().Format("2006-01-02 15:04:05 MST")) + "`"
	return s.Send(cfg, text)
}

// GetBotInfo returns the bot username to verify the token.
func (s *TelegramService) GetBotInfo(token string) (string, error) {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/getMe", token)
	resp, err := s.client.Get(apiURL)
	if err != nil {
		return "", fmt.Errorf("telegram getMe: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", fmt.Errorf("telegram API %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		OK     bool `json:"ok"`
		Result struct {
			Username string `json:"username"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if !result.OK {
		return "", fmt.Errorf("telegram API returned ok=false")
	}
	return result.Result.Username, nil
}

// FormatEventMessage builds a MarkdownV2 message for a notification event.
func (s *TelegramService) FormatEventMessage(eventType, severity, title, detail string) string {
	meta := telegramEventMeta(eventType, severity)

	var sb strings.Builder

	// Header with icon and severity badge
	fmt.Fprintf(&sb, "%s *%s*\n", meta.icon, escapeMarkdownV2(title))
	fmt.Fprintf(&sb, "_%s_\n\n", escapeMarkdownV2(meta.tagline))

	// Info block
	sb.WriteString("┌─────────────────────\n")
	fmt.Fprintf(&sb, "│ 📋  *Event:*  `%s`\n", escapeMarkdownV2Code(eventDisplayName(eventType)))
	fmt.Fprintf(&sb, "│ 🏷  *Severity:*  `%s`\n", escapeMarkdownV2Code(strings.ToUpper(severity)))
	fmt.Fprintf(&sb, "│ ⏱  *Time:*  `%s`\n", escapeMarkdownV2Code(time.Now().Format("2006-01-02 15:04:05 MST")))
	sb.WriteString("└─────────────────────\n")

	// Detail block
	if detail != "" {
		fmt.Fprintf(&sb, "\n📝 *Details:*\n```\n%s\n```", detail)
	}

	// Footer
	sb.WriteString("\n\n\\_\\_\\_\n")
	sb.WriteString("🖥 _ITDLUPanel · Automated Alert_")

	return sb.String()
}

type telegramMeta struct {
	icon    string
	tagline string
}

func telegramEventMeta(eventType, severity string) telegramMeta {
	metas := map[string]telegramMeta{
		"cron_success":            {icon: "✅", tagline: "Scheduled task completed successfully"},
		"cron_failed":             {icon: "❌", tagline: "Scheduled task execution failed"},
		"ssl_expiry_warning":      {icon: "⚠️", tagline: "SSL certificate approaching expiration"},
		"ssl_expired":             {icon: "🚨", tagline: "SSL certificate has expired!"},
		"backup_completed":        {icon: "✅", tagline: "Backup created successfully"},
		"backup_failed":           {icon: "❌", tagline: "Backup operation failed"},
		"software_installed":      {icon: "📦", tagline: "Software installed successfully"},
		"software_install_failed": {icon: "❌", tagline: "Software installation failed"},
		"site_created":            {icon: "🌐", tagline: "New website created"},
		"site_deleted":            {icon: "🗑", tagline: "Website has been removed"},
		"cpu_high":                {icon: "🔥", tagline: "CPU usage threshold exceeded"},
		"memory_high":             {icon: "💾", tagline: "Memory usage critically high"},
		"disk_high":               {icon: "💿", tagline: "Disk space running low"},
		"service_down":            {icon: "🔻", tagline: "Service is unresponsive"},
		"login_failed":            {icon: "🔒", tagline: "Failed login attempt detected"},
	}
	if m, ok := metas[eventType]; ok {
		return m
	}
	iconMap := map[string]string{"info": "ℹ️", "success": "✅", "warning": "⚠️", "error": "❌", "critical": "🚨"}
	icon := iconMap[severity]
	if icon == "" {
		icon = "🔔"
	}
	return telegramMeta{icon: icon, tagline: "System event occurred"}
}

func escapeMarkdownV2(s string) string {
	replacer := strings.NewReplacer(
		"_", "\\_", "*", "\\*", "[", "\\[", "]", "\\]",
		"(", "\\(", ")", "\\)", "~", "\\~", "`", "\\`",
		">", "\\>", "#", "\\#", "+", "\\+", "-", "\\-",
		"=", "\\=", "|", "\\|", "{", "\\{", "}", "\\}",
		".", "\\.", "!", "\\!",
	)
	return replacer.Replace(s)
}

// escapeMarkdownV2Code escapes only backtick inside code spans.
func escapeMarkdownV2Code(s string) string {
	return strings.ReplaceAll(s, "`", "\\`")
}
