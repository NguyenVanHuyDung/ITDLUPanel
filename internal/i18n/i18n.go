package i18n

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

var (
	instance *Manager
	mu       sync.RWMutex
)

// Manager handles internationalization and translations.
type Manager struct {
	translations map[string]map[string]string // lang → key → value
	defaultLang  string
	mu           sync.RWMutex
}

// New creates a new i18n Manager by loading all JSON locale files from localesDir.
func New(localesDir string) (*Manager, error) {
	m := &Manager{
		translations: make(map[string]map[string]string),
		defaultLang:  "en",
	}

	entries, err := os.ReadDir(localesDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read locales directory %q: %w", localesDir, err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		lang := strings.TrimSuffix(entry.Name(), ".json")
		filePath := filepath.Join(localesDir, entry.Name())

		data, err := os.ReadFile(filePath)
		if err != nil {
			return nil, fmt.Errorf("failed to read locale file %q: %w", filePath, err)
		}

		var translations map[string]string
		if err := json.Unmarshal(data, &translations); err != nil {
			return nil, fmt.Errorf("failed to parse locale file %q: %w", filePath, err)
		}

		m.translations[lang] = translations
	}

	if len(m.translations) == 0 {
		return nil, fmt.Errorf("no locale files found in %q", localesDir)
	}

	return m, nil
}

// T translates a key for the given language with optional format arguments.
// Falls back to the default language, then returns the key itself if not found.
func (m *Manager) T(lang, key string, args ...interface{}) string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if translations, ok := m.translations[lang]; ok {
		if value, ok := translations[key]; ok {
			if len(args) > 0 {
				return fmt.Sprintf(value, args...)
			}
			return value
		}
	}

	// Fallback to default language
	if lang != m.defaultLang {
		if translations, ok := m.translations[m.defaultLang]; ok {
			if value, ok := translations[key]; ok {
				if len(args) > 0 {
					return fmt.Sprintf(value, args...)
				}
				return value
			}
		}
	}

	return key
}

// SetDefault sets the default language.
func (m *Manager) SetDefault(lang string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.defaultLang = lang
}

// GetDefault returns the default language.
func (m *Manager) GetDefault() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.defaultLang
}

// AvailableLanguages returns a sorted list of loaded language codes.
func (m *Manager) AvailableLanguages() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	langs := make([]string, 0, len(m.translations))
	for lang := range m.translations {
		langs = append(langs, lang)
	}
	sort.Strings(langs)
	return langs
}

// Init initializes the global i18n Manager singleton.
func Init(localesDir string) error {
	m, err := New(localesDir)
	if err != nil {
		return err
	}

	mu.Lock()
	instance = m
	mu.Unlock()

	return nil
}

// Get returns the global i18n Manager instance.
func Get() *Manager {
	mu.RLock()
	defer mu.RUnlock()
	return instance
}
