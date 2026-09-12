package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"smartsleep/internal/config"
	"smartsleep/internal/gateway"
	"smartsleep/internal/monitor"
	"smartsleep/internal/ptero"
	"smartsleep/internal/security"
)

var (
	Version   = "1.0.0"
	BuildDate = "2026-09-13"
)

func main() {
	configPath := flag.String("config", "", "Path to config.yaml file")
	showVersion := flag.Bool("version", false, "Print version information and exit")
	enableNode := flag.Bool("enable", false, "Enable SmartSleep hibernation across this node")
	disableNode := flag.Bool("disable", false, "Disable SmartSleep hibernation across this node")
	statusNode := flag.Bool("status", false, "Display SmartSleep status for this node")
	timeoutStr := flag.String("timeout", "", "Set global idle timeout (e.g. 2m, 5m, 20m)")
	flag.Parse()

	if *showVersion {
		fmt.Printf("SmartSleep Gateway v%s (Built %s)\n", Version, BuildDate)
		os.Exit(0)
	}

	targetConfig := *configPath
	if targetConfig == "" {
		if _, err := os.Stat("/etc/smartsleep/config.yaml"); err == nil {
			targetConfig = "/etc/smartsleep/config.yaml"
		} else {
			targetConfig = "config.yaml"
		}
	}

	cfg, err := config.LoadConfig(targetConfig)
	if err != nil {
		log.Fatalf("[SmartSleep] Configuration error: %v", err)
	}

	if *timeoutStr != "" {
		dur, err := time.ParseDuration(*timeoutStr)
		if err != nil {
			log.Fatalf("Invalid duration format: %v (use e.g. 2m, 5m, 20m)", err)
		}
		cfg.Sleep.DefaultIdleTimeout = dur
		if dur <= 2*time.Minute {
			cfg.Sleep.CheckInterval = 10 * time.Second
			cfg.Sleep.GracePeriod = 30 * time.Second
		}
		if err := cfg.SaveConfig(targetConfig); err != nil {
			log.Fatalf("Failed to save config: %v", err)
		}
		fmt.Printf("SmartSleep global idle timeout set to %v (saved in %s).\n", dur, targetConfig)
		os.Exit(0)
	}

	if *enableNode {
		cfg.Sleep.Enabled = true
		if err := cfg.SaveConfig(targetConfig); err != nil {
			log.Fatalf("Failed to save config: %v", err)
		}
		fmt.Println("SmartSleep has been ENABLED for this node.")
		os.Exit(0)
	}

	if *disableNode {
		cfg.Sleep.Enabled = false
		if err := cfg.SaveConfig(targetConfig); err != nil {
			log.Fatalf("Failed to save config: %v", err)
		}
		fmt.Println("SmartSleep has been DISABLED for this node.")
		os.Exit(0)
	}

	if *statusNode {
		statusStr := "ENABLED (Active)"
		if !cfg.Sleep.Enabled {
			statusStr = "DISABLED (Suspended)"
		}
		fmt.Printf("Node ID: %d | SmartSleep: %s | Default Timeout: %v\n", cfg.Panel.NodeID, statusStr, cfg.Sleep.DefaultIdleTimeout)
		os.Exit(0)
	}

	log.Println("==========================================================")
	log.Printf(" SmartSleep Gateway v%s - Node Optimization Daemon", Version)
	log.Println("==========================================================")

	if cfg.Panel.APIKey == "" && cfg.Panel.ClientAPIKey == "" {
		log.Printf("[SmartSleep] WARNING: No API key provided in config.yaml! Set panel.api_key or PANEL_API_KEY.")
	}

	log.Printf("[SmartSleep] Connected to Panel: %s (Node ID: %d)", cfg.Panel.URL, cfg.Panel.NodeID)

	// 2. Initialize components
	pteroClient := ptero.NewClient(cfg)
	portManager := gateway.NewPortManager()
	rateLimiter := security.NewRateLimiter(&cfg.Security)
	tracker := monitor.NewTracker(cfg, pteroClient, portManager, rateLimiter)

	// 3. Start Tracker
	tracker.Start()

	// 4. Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	sig := <-sigChan
	log.Printf("[SmartSleep] Received signal %v. Shutting down gracefully...", sig)

	tracker.Stop()
	portManager.UnbindAll()

	log.Println("[SmartSleep] SmartSleep daemon stopped cleanly.")
}
