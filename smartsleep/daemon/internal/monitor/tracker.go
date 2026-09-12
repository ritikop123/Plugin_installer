package monitor

import (
	"log"
	"strings"
	"sync"
	"time"

	"smartsleep/internal/config"
	"smartsleep/internal/gateway"
	"smartsleep/internal/ptero"
	"smartsleep/internal/security"
)

type ServerState string

const (
	StateRunning  ServerState = "running"
	StateIdle     ServerState = "idle"
	StateSleeping ServerState = "sleeping"
	StateWaking   ServerState = "waking"
	StateOffline  ServerState = "offline"
)

type ServerRuntime struct {
	Info            *ptero.ServerInfo
	State           ServerState
	IdleSince       time.Time
	LastStarted     time.Time
	LastPlayerCount int
}

type Tracker struct {
	cfg         *config.Config
	pteroClient *ptero.Client
	portManager *gateway.PortManager
	rateLimiter *security.RateLimiter
	servers     map[string]*ServerRuntime
	mu          sync.RWMutex
	stopChan    chan struct{}
}

func NewTracker(
	cfg *config.Config,
	pteroClient *ptero.Client,
	portManager *gateway.PortManager,
	rateLimiter *security.RateLimiter,
) *Tracker {
	return &Tracker{
		cfg:         cfg,
		pteroClient: pteroClient,
		portManager: portManager,
		rateLimiter: rateLimiter,
		servers:     make(map[string]*ServerRuntime),
		stopChan:    make(chan struct{}),
	}
}

func (t *Tracker) Start() {
	log.Printf("[SmartSleep] Tracker started. Monitoring interval: %v", t.cfg.Sleep.CheckInterval)
	ticker := time.NewTicker(t.cfg.Sleep.CheckInterval)

	// Run initial synchronization immediately
	t.syncServers()

	go func() {
		for {
			select {
			case <-ticker.C:
				t.syncServers()
			case <-t.stopChan:
				ticker.Stop()
				return
			}
		}
	}()
}

func (t *Tracker) Stop() {
	close(t.stopChan)
}

func (t *Tracker) syncServers() {
	// 1. Check Node-level master switch
	if !t.cfg.Sleep.Enabled {
		t.mu.Lock()
		t.portManager.UnbindAll()
		t.mu.Unlock()
		return
	}

	serverList, err := t.pteroClient.GetNodeServers(t.cfg.Panel.NodeID)
	if err != nil {
		log.Printf("[SmartSleep] Failed to fetch servers from Pterodactyl: %v", err)
		return
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	for _, s := range serverList {
		runtime, exists := t.servers[s.Identifier]
		if !exists {
			runtime = &ServerRuntime{
				Info:  s,
				State: StateOffline,
			}
			t.servers[s.Identifier] = runtime
		} else {
			runtime.Info = s
		}

		// Check if SmartSleep is disabled for this server or if it is a proxy
		if !s.Enabled {
			if t.portManager.IsBound(s.Identifier) {
				t.portManager.UnbindServer(s.Identifier)
				t.portManager.UnbindPort(s.PrimaryPort)
			}
			continue
		}

		// Fetch live container state from Pterodactyl Client API
		pteroState, err := t.pteroClient.GetServerState(s.Identifier)
		if err != nil {
			continue
		}

		switch pteroState {
		case "offline":
			// If server is currently waking up, protect it from rebinding for 3 minutes while Wings pulls images/starts
			if runtime.State == StateWaking {
				if time.Since(runtime.LastStarted) < 3*time.Minute {
					continue
				}
				log.Printf("[SmartSleep] Server %s waking window expired without starting.", s.Name)
				runtime.State = StateOffline
			}

			runtime.LastStarted = time.Time{}
			runtime.IdleSince = time.Time{}

			// If server is sleeping/hibernating, Gateway should hold the port to answer pings and wake on join
			if !t.portManager.IsBound(s.Identifier) {
				motd := s.CustomMOTD
				if motd == "" {
					motd = t.cfg.Sleep.SleepingMOTD
				}
				wakeMsg := t.cfg.Sleep.WakeMessage
				bedrockWakeMsg := t.cfg.Sleep.BedrockWakeMessage

				err := t.portManager.BindSleepingServer(
					s.Identifier,
					s.Name,
					s.PrimaryIP,
					s.PrimaryPort,
					s.BedrockPort,
					motd,
					wakeMsg,
					bedrockWakeMsg,
					t.WakeServer,
				)
				if err != nil {
					log.Printf("[SmartSleep] Error binding sleeping ports for %s: %v", s.Name, err)
				} else {
					runtime.State = StateSleeping
					log.Printf("[SmartSleep] Server %s (%s) is now SLEEPING on port %d", s.Name, s.Identifier, s.PrimaryPort)
				}
			}

		case "running":
			// If server is running, make sure Gateway is NOT holding the port
			t.portManager.UnbindServer(s.Identifier)
			t.portManager.UnbindPort(s.PrimaryPort)
			if s.BedrockPort > 0 {
				t.portManager.UnbindPort(s.BedrockPort)
			}
			t.rateLimiter.RecordStarted(s.Identifier)

			// If transitioning to running from offline/waking, track startup time and reset idle
			if runtime.LastStarted.IsZero() {
				runtime.LastStarted = time.Now()
				runtime.IdleSince = time.Time{}
				runtime.State = StateRunning
				log.Printf("[SmartSleep] Server %s is now RUNNING. Grace period: %v", s.Name, t.cfg.Sleep.GracePeriod)
			}

			// Check Grace Period! While within Grace Period after starting, protect server from sleeping
			if time.Since(runtime.LastStarted) < t.cfg.Sleep.GracePeriod {
				runtime.State = StateRunning
				runtime.IdleSince = time.Time{}
				continue
			}

			// Check player count via Server List Ping (try PrimaryIP first, fallback to 127.0.0.1)
			playerCount, err := gateway.QueryPlayerCount(s.PrimaryIP, s.PrimaryPort)
			if err != nil {
				playerCount, err = gateway.QueryPlayerCount("127.0.0.1", s.PrimaryPort)
			}
			if err != nil {
				// Server might still be in internal startup sequence
				continue
			}

			runtime.LastPlayerCount = playerCount

			if playerCount > 0 {
				// Reset idle timer if players are active
				runtime.State = StateRunning
				runtime.IdleSince = time.Time{}
			} else {
				// 0 Players: check idle timeout
				if runtime.IdleSince.IsZero() {
					runtime.IdleSince = time.Now()
					runtime.State = StateIdle
					log.Printf("[SmartSleep] Server %s has 0 players. Starting idle timer (%v)...", s.Name, s.IdleTimeout)
				} else if time.Since(runtime.IdleSince) >= s.IdleTimeout {
					// Idle timeout reached -> Hibernate server
					log.Printf("[SmartSleep] Idle timeout (%v) expired for %s. Initiating graceful sleep...", s.IdleTimeout, s.Name)
					go t.hibernateServer(runtime)
				}
			}

		case "starting":
			runtime.State = StateWaking
			runtime.IdleSince = time.Time{}
			if runtime.LastStarted.IsZero() {
				runtime.LastStarted = time.Now()
			}
			t.portManager.UnbindServer(s.Identifier)
			t.portManager.UnbindPort(s.PrimaryPort)
			if s.BedrockPort > 0 {
				t.portManager.UnbindPort(s.BedrockPort)
			}

		case "stopping":
			runtime.IdleSince = time.Time{}
			runtime.LastStarted = time.Time{}
		}
	}
}

// hibernateServer gracefully saves the world and sends stop signal to Pterodactyl
func (t *Tracker) hibernateServer(runtime *ServerRuntime) {
	s := runtime.Info
	log.Printf("[SmartSleep] [Hibernate] Saving world on %s...", s.Name)
	_ = t.pteroClient.SendCommand(s.Identifier, "save-all")

	time.Sleep(3 * time.Second)

	log.Printf("[SmartSleep] [Hibernate] Stopping server %s to free RAM/CPU...", s.Name)
	if err := t.pteroClient.SendPowerAction(s.Identifier, "stop"); err != nil {
		log.Printf("[SmartSleep] [Hibernate] Failed to stop server %s: %v", s.Name, err)
	}

	t.mu.Lock()
	runtime.IdleSince = time.Time{}
	runtime.LastStarted = time.Time{}
	runtime.State = StateSleeping
	t.mu.Unlock()
}

// WakeServer is called by JavaListener or BedrockListener when a player joins a sleeping server
func (t *Tracker) WakeServer(serverIdentifier string) {
	t.mu.RLock()
	runtime, exists := t.servers[serverIdentifier]
	t.mu.RUnlock()

	if !exists {
		t.mu.RLock()
		for id, r := range t.servers {
			if id == serverIdentifier || r.Info.UUID == serverIdentifier || strings.HasPrefix(r.Info.UUID, serverIdentifier) || strings.HasPrefix(serverIdentifier, id) {
				runtime = r
				serverIdentifier = id
				exists = true
				break
			}
		}
		t.mu.RUnlock()
	}

	if !exists {
		log.Printf("[SmartSleep] Wake requested for unknown server: %s", serverIdentifier)
		return
	}

	// 1. Anti-abuse & crash rate limiter check
	canWake, reason := t.rateLimiter.CanWake(serverIdentifier)
	if !canWake {
		log.Printf("[SmartSleep] Wake blocked for %s: %s", runtime.Info.Name, reason)
		return
	}

	log.Printf("[SmartSleep] [Wake] Player detected on %s (%s). Releasing port %d and starting server...", runtime.Info.Name, serverIdentifier, runtime.Info.PrimaryPort)

	t.mu.Lock()
	runtime.State = StateWaking
	runtime.IdleSince = time.Time{}
	runtime.LastStarted = time.Now()
	t.mu.Unlock()

	// 2. Unbind gateway listeners immediately so Docker can bind the port
	t.portManager.UnbindServer(serverIdentifier)
	t.portManager.UnbindPort(runtime.Info.PrimaryPort)
	if runtime.Info.BedrockPort > 0 {
		t.portManager.UnbindPort(runtime.Info.BedrockPort)
	}

	// 3. Record wake in security limiter
	t.rateLimiter.RecordWake(serverIdentifier)

	// 4. Send start power signal via Pterodactyl Client API
	if err := t.pteroClient.SendPowerAction(serverIdentifier, "start"); err != nil {
		log.Printf("[SmartSleep] [Wake] Failed to start server %s: %v", runtime.Info.Name, err)
		return
	}

	log.Printf("[SmartSleep] [Wake] Server %s has been signaled to START successfully.", runtime.Info.Name)
}

// UnbindAndWake releases ports immediately when panel clicks Start/Restart
func (t *Tracker) UnbindAndWake(serverIdentifier string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	for id, runtime := range t.servers {
		if id == serverIdentifier || runtime.Info.UUID == serverIdentifier || runtime.Info.Identifier == serverIdentifier || strings.HasPrefix(runtime.Info.UUID, serverIdentifier) || strings.HasPrefix(serverIdentifier, id) {
			runtime.State = StateWaking
			runtime.IdleSince = time.Time{}
			runtime.LastStarted = time.Now()
			t.portManager.UnbindServer(id)
			t.portManager.UnbindPort(runtime.Info.PrimaryPort)
			if runtime.Info.BedrockPort > 0 {
				t.portManager.UnbindPort(runtime.Info.BedrockPort)
			}
			log.Printf("[SmartSleep] [IPC] Port %d released for server %s (%s). Ready for Docker start.", runtime.Info.PrimaryPort, runtime.Info.Name, id)
			return
		}
	}

	t.portManager.UnbindServer(serverIdentifier)
}

// Unbind releases ports immediately when panel clicks Stop/Kill
func (t *Tracker) Unbind(serverIdentifier string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	for id, runtime := range t.servers {
		if id == serverIdentifier || runtime.Info.UUID == serverIdentifier || runtime.Info.Identifier == serverIdentifier || strings.HasPrefix(runtime.Info.UUID, serverIdentifier) || strings.HasPrefix(serverIdentifier, id) {
			runtime.State = StateOffline
			runtime.IdleSince = time.Time{}
			runtime.LastStarted = time.Time{}
			t.portManager.UnbindServer(id)
			t.portManager.UnbindPort(runtime.Info.PrimaryPort)
			if runtime.Info.BedrockPort > 0 {
				t.portManager.UnbindPort(runtime.Info.BedrockPort)
			}
			log.Printf("[SmartSleep] [IPC] Server %s stopped. Port %d released.", runtime.Info.Name, runtime.Info.PrimaryPort)
			return
		}
	}

	t.portManager.UnbindServer(serverIdentifier)
}

