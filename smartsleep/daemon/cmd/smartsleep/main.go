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
	flag.Parse()

	if *showVersion {
		fmt.Printf("SmartSleep Gateway v%s (Built %s)\n", Version, BuildDate)
		os.Exit(0)
	}

	log.Println("==========================================================")
	log.Printf(" SmartSleep Gateway v%s - Node Optimization Daemon", Version)
	log.Println("==========================================================")

	// 1. Load configuration
	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("[SmartSleep] Configuration error: %v", err)
	}

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
