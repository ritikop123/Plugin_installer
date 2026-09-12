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
	Security SecurityConfig `yaml:"security"`
}

type PanelConfig struct {
	URL          string `yaml:"url"`           // e.g. https://panel.example.com
	APIKey       string `yaml:"api_key"`       // Application API Key (pterodactyl_admin)
	ClientAPIKey string `yaml:"client_api_key"`// Client API Key (for power actions)
	NodeID       int    `yaml:"node_id"`       // ID of this node
}

type SleepConfig struct {
	DefaultIdleTimeout time.Duration `yaml:"default_idle_timeout"` // e.g. 20m
	CheckInterval      time.Duration `yaml:"check_interval"`       // e.g. 30s
	GracePeriod        time.Duration `yaml:"grace_period"`         // e.g. 3m (grace time after start before sleeping)
	SleepingMOTD       string        `yaml:"sleeping_motd"`
	WakeMessage        string        `yaml:"wake_message"`
	BedrockEnabled     bool          `yaml:"bedrock_enabled"`
	BedrockWakeMessage string        `yaml:"bedrock_wake_message"`
}

type SecurityConfig struct {
	WakeCooldownSeconds   int `yaml:"wake_cooldown_seconds"`   // e.g. 60
	MaxWakesPerWindow     int `yaml:"max_wakes_per_window"`     // e.g. 3
	WindowSeconds         int `yaml:"window_seconds"`           // e.g. 300
	CrashThresholdSeconds int `yaml:"crash_threshold_seconds"` // e.g. 45
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
			DefaultIdleTimeout: 20 * time.Minute,
			CheckInterval:      30 * time.Second,
			GracePeriod:        3 * time.Minute,
			SleepingMOTD:       "§a%s §7[Sleeping]\n§eJoin server to wake it up!",
			WakeMessage:        "§e[SmartSleep] §aServer is currently sleeping and is waking up!\n§fPlease wait §e30 seconds – 1 minute §ffor the server to start, then rejoin.",
			BedrockEnabled:     true,
			BedrockWakeMessage: "§e[SmartSleep] §aServer is sleeping and waking up now! Please wait 30s - 1m and rejoin.",
		},
		Security: SecurityConfig{
			WakeCooldownSeconds:   60,
			MaxWakesPerWindow:     3,
			WindowSeconds:         300,
			CrashThresholdSeconds: 45,
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
