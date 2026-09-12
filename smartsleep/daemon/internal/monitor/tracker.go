package monitor

import (
	"log"
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
	Info        *ptero.ServerInfo
	State       ServerState
	IdleSince   time.Time
	LastStarted time.Time
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

		// Check if SmartSleep is disabled for this server
		if !s.Enabled {
			if t.portManager.IsBound(s.Identifier) {
				t.portManager.UnbindServer(s.Identifier)
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
			// If server is offline, Gateway should hold the port to answer pings and wake on join
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
			if t.portManager.IsBound(s.Identifier) {
				t.portManager.UnbindServer(s.Identifier)
			}
			t.rateLimiter.RecordStarted(s.Identifier)

			// Check player count via Server List Ping to localhost
			playerCount, err := gateway.QueryPlayerCount("127.0.0.1", s.PrimaryPort)
			if err != nil {
				// Server might still be in startup sequence
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
					log.Printf("[SmartSleep] Idle timeout expired for %s. Initiating graceful sleep...", s.Name)
					go t.hibernateServer(runtime)
				}
			}

		case "starting":
			runtime.State = StateWaking
			if t.portManager.IsBound(s.Identifier) {
				t.portManager.UnbindServer(s.Identifier)
			}

		case "stopping":
			runtime.State = StateOffline
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
}

// WakeServer is called by JavaListener or BedrockListener when a player joins a sleeping server
func (t *Tracker) WakeServer(serverIdentifier string) {
	t.mu.RLock()
	runtime, exists := t.servers[serverIdentifier]
	t.mu.RUnlock()

	if !exists {
		return
	}

	// 1. Anti-abuse & crash rate limiter check
	canWake, reason := t.rateLimiter.CanWake(serverIdentifier)
	if !canWake {
		log.Printf("[SmartSleep] Wake blocked for %s: %s", runtime.Info.Name, reason)
		return
	}

	log.Printf("[SmartSleep] [Wake] Player detected on %s (%s). Starting server...", runtime.Info.Name, serverIdentifier)

	// 2. Unbind gateway listeners immediately so Docker can bind the port
	t.portManager.UnbindServer(serverIdentifier)

	// 3. Record wake in security limiter
	t.rateLimiter.RecordWake(serverIdentifier)

	// 4. Send start power signal via Pterodactyl Client API
	if err := t.pteroClient.SendPowerAction(serverIdentifier, "start"); err != nil {
		log.Printf("[SmartSleep] [Wake] Failed to start server %s: %v", runtime.Info.Name, err)
		return
	}

	runtime.State = StateWaking
	log.Printf("[SmartSleep] [Wake] Server %s has been signaled to START successfully.", runtime.Info.Name)
}
