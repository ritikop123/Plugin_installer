package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"smartsleep/internal/config"
	"smartsleep/internal/monitor"
	"smartsleep/internal/ptero"
)

var (
	Version   = "1.0.0"
	BuildDate = "2026-09-13"
)

func main() {
	configPath := flag.String("config", "", "Path to config.yaml file")
	showVersion := flag.Bool("version", false, "Print version information and exit")
	enableNode := flag.Bool("enable", false, "Enable automatic idle-server stopping across this node")
	disableNode := flag.Bool("disable", false, "Disable automatic idle-server stopping across this node")
	statusNode := flag.Bool("status", false, "Display auto-stop status for this node")
	flag.Parse()

	if *showVersion {
		fmt.Printf("SmartSleep Auto-Stop v%s (Built %s)\n", Version, BuildDate)
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

	if *enableNode {
		cfg.Sleep.Enabled = true
		if err := cfg.SaveConfig(targetConfig); err != nil {
			log.Fatalf("Failed to save config: %v", err)
		}
		fmt.Println("Automatic idle-server stopping has been ENABLED for this node.")
		os.Exit(0)
	}

	if *disableNode {
		cfg.Sleep.Enabled = false
		if err := cfg.SaveConfig(targetConfig); err != nil {
			log.Fatalf("Failed to save config: %v", err)
		}
		fmt.Println("Automatic idle-server stopping has been DISABLED for this node.")
		os.Exit(0)
	}

	if *statusNode {
		status := "ENABLED"
		if !cfg.Sleep.Enabled {
			status = "DISABLED"
		}
		fmt.Printf("Node ID: %d | Auto-stop: %s | Empty-server timeout: 48h\n", cfg.Panel.NodeID, status)
		os.Exit(0)
	}

	log.Println("==========================================================")
	log.Printf(" SmartSleep Auto-Stop v%s - Node Monitor", Version)
	log.Println("==========================================================")

	if cfg.Panel.APIKey == "" && cfg.Panel.ClientAPIKey == "" {
		log.Printf("[SmartSleep] WARNING: No API key provided in config.yaml! Set panel.api_key or PANEL_API_KEY.")
	}

	log.Printf("[SmartSleep] Connected to Panel: %s (Node ID: %d)", cfg.Panel.URL, cfg.Panel.NodeID)

	tracker := monitor.NewTracker(cfg, ptero.NewClient(cfg))
	tracker.Start()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	sig := <-sigChan
	log.Printf("[SmartSleep] Received signal %v. Shutting down gracefully...", sig)

	tracker.Stop()
	log.Println("[SmartSleep] Auto-stop monitor stopped cleanly.")
}
