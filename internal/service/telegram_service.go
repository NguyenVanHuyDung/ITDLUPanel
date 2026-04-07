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

// Send sends a Markdown message to the specified chat.
func (s *TelegramService) Send(cfg TelegramConfig, text string) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", cfg.BotToken)
	form := url.Values{
		"chat_id":    {cfg.ChatID},
		"text":       {text},
		"parse_mode": {"Markdown"},
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
	text := "✅ *ITDLUPanel — Telegram Test*\n\nNotification connected successfully\\.\n\n_" +
		time.Now().Format("2006-01-02 15:04:05 MST") + "_"
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

// FormatEventMessage builds a Markdown message for a notification event.
func (s *TelegramService) FormatEventMessage(eventType, severity, title, detail string) string {
	emojiMap := map[string]string{
		"info":     "ℹ️",
		"success":  "✅",
		"warning":  "⚠️",
		"error":    "❌",
		"critical": "🚨",
	}
	emoji := emojiMap[severity]
	if emoji == "" {
		emoji = "🔔"
	}

	severityUpper := strings.ToUpper(severity)

	var sb strings.Builder
	fmt.Fprintf(&sb, "%s *%s*\n\n", emoji, escapeMarkdown(title))
	fmt.Fprintf(&sb, "⏱ %s\n", time.Now().Format("2006-01-02 15:04:05"))
	fmt.Fprintf(&sb, "📋 %s | %s\n", eventType, severityUpper)
	if detail != "" {
		fmt.Fprintf(&sb, "\n```\n%s\n```", detail)
	}
	return sb.String()
}

func escapeMarkdown(s string) string {
	replacer := strings.NewReplacer(
		"_", "\\_", "*", "\\*", "[", "\\[", "]", "\\]",
		"(", "\\(", ")", "\\)", "~", "\\~", "`", "\\`",
		">", "\\>", "#", "\\#", "+", "\\+", "-", "\\-",
		"=", "\\=", "|", "\\|", "{", "\\{", "}", "\\}",
		".", "\\.", "!", "\\!",
	)
	return replacer.Replace(s)
}
