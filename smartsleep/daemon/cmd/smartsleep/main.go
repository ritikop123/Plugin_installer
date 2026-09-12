package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

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
	freePorts := flag.Bool("free", false, "Release all hibernating ports and wake/start all servers normally")
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
			cfg.Sleep.GracePeriod = 45 * time.Second
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

	if *freePorts {
		fmt.Println("[SmartSleep] Freeing all hibernating ports across this node...")

		// 1. Send /free to running daemon if active
		req, err := http.NewRequest("GET", "http://127.0.0.1:8995/free", nil)
		if err == nil {
			client := &http.Client{Timeout: 1 * time.Second}
			resp, err := client.Do(req)
			if err == nil {
				resp.Body.Close()
				fmt.Println("[SmartSleep] Released all listening sockets in daemon via IPC.")
			}
		}

		// 2. Connect to Pterodactyl and start all servers normally
		pteroClient := ptero.NewClient(cfg)
		servers, err := pteroClient.GetNodeServers(cfg.Panel.NodeID)
		if err == nil {
			for _, s := range servers {
				fmt.Printf("Signaling server %s (port %d) to start...\n", s.Name, s.PrimaryPort)
				_ = pteroClient.SendPowerAction(s.Identifier, "start")
			}
		}

		fmt.Println("[SUCCESS] All ports freed and servers signaled to start normally.")
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

	// 4. Start local IPC HTTP Control Server for instantaneous panel power actions
	go startControlServer(tracker, portManager)

	// 5. Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	sig := <-sigChan
	log.Printf("[SmartSleep] Received signal %v. Shutting down gracefully...", sig)

	tracker.Stop()
	portManager.UnbindAll()

	log.Println("[SmartSleep] SmartSleep daemon stopped cleanly.")
}

func startControlServer(tracker *monitor.Tracker, portManager *gateway.PortManager) {
	mux := http.NewServeMux()

	// /free (Release all ports across all servers immediately)
	mux.HandleFunc("/free", func(w http.ResponseWriter, r *http.Request) {
		log.Println("[SmartSleep] [IPC] Received /free signal. Releasing ALL ports immediately...")
		portManager.UnbindAll()
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"success":true,"action":"free"}`)
	})

	// /wake?uuid=...&port=... (Called when panel Start/Restart is clicked)
	mux.HandleFunc("/wake", func(w http.ResponseWriter, r *http.Request) {
		portStr := r.URL.Query().Get("port")
		if portStr != "" {
			if p, err := strconv.Atoi(portStr); err == nil && p > 0 {
				log.Printf("[SmartSleep] [IPC] Direct unbind requested for port %d", p)
				portManager.UnbindPort(p)
			}
		}
		uuid := r.URL.Query().Get("uuid")
		if uuid == "" {
			uuid = r.URL.Query().Get("id")
		}
		if uuid != "" {
			log.Printf("[SmartSleep] [IPC] Received wake signal for server %s. Unbinding ports...", uuid)
			tracker.UnbindAndWake(uuid)
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"success":true,"action":"wake"}`)
	})

	// /unbind?uuid=...&port=... (Called when panel Stop/Kill is clicked)
	mux.HandleFunc("/unbind", func(w http.ResponseWriter, r *http.Request) {
		portStr := r.URL.Query().Get("port")
		if portStr != "" {
			if p, err := strconv.Atoi(portStr); err == nil && p > 0 {
				log.Printf("[SmartSleep] [IPC] Direct unbind requested for port %d", p)
				portManager.UnbindPort(p)
			}
		}
		uuid := r.URL.Query().Get("uuid")
		if uuid == "" {
			uuid = r.URL.Query().Get("id")
		}
		if uuid != "" {
			log.Printf("[SmartSleep] [IPC] Received unbind signal for server %s. Releasing ports...", uuid)
			tracker.Unbind(uuid)
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"success":true,"action":"unbind"}`)
	})

	// /status
	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"active","version":"%s"}`, Version)
	})

	server := &http.Server{
		Addr:    "0.0.0.0:8995",
		Handler: mux,
	}

	log.Println("[SmartSleep] [IPC] Control server listening on :8995 for panel power hooks.")
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Printf("[SmartSleep] [IPC] Control server error: %v", err)
	}
}
