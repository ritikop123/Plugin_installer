package config

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Panel    PanelConfig    `yaml:"panel"`
	Sleep    SleepConfig    `yaml:"sleep"`
}

type PanelConfig struct {
	URL          string `yaml:"url"`           // e.g. https://panel.example.com
	APIKey       string `yaml:"api_key"`       // Application API Key (pterodactyl_admin)
	ClientAPIKey string `yaml:"client_api_key"`// Client API Key (for power actions)
	NodeID       int    `yaml:"node_id"`       // ID of this node
}

type SleepConfig struct {
	Enabled       bool          `yaml:"enabled"`        // Master switch for this node (default: true)
	CheckInterval time.Duration `yaml:"check_interval"` // e.g. 30s
	GracePeriod   time.Duration `yaml:"grace_period"`   // e.g. 3m (grace time after start before tracking)
}

func DefaultConfig() *Config {
	return &Config{
		Panel: PanelConfig{
			URL:          "http://127.0.0.1",
			APIKey:       "",
			ClientAPIKey: "",
			NodeID:       1,
		},
		Sleep: SleepConfig{
			Enabled:       true,
			CheckInterval: 30 * time.Second,
			GracePeriod:   3 * time.Minute,
		},
	}
}

func LoadConfig(path string) (*Config, error) {
	cfg := DefaultConfig()

	// If no path provided, check standard locations
	if path == "" {
		candidates := []string{
			"/etc/smartsleep/config.yaml",
			"config.yaml",
			"../config.yaml",
		}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				path = c
				break
			}
		}
	}

	if path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("failed to read config file %s: %w", path, err)
		}

		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("failed to parse yaml config %s: %w", path, err)
		}
	}

	// Environment variable overrides
	if envURL := os.Getenv("PANEL_URL"); envURL != "" {
		cfg.Panel.URL = envURL
	}
	if envKey := os.Getenv("PANEL_API_KEY"); envKey != "" {
		cfg.Panel.APIKey = envKey
	}
	if envClientKey := os.Getenv("PANEL_CLIENT_API_KEY"); envClientKey != "" {
		cfg.Panel.ClientAPIKey = envClientKey
	}

	return cfg, nil
}

func (c *Config) SaveConfig(path string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := yaml.Marshal(c)
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}
