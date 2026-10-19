package monitor

import (
	"log"
	"sync"
	"time"

	"smartsleep/internal/config"
	"smartsleep/internal/gateway"
	"smartsleep/internal/ptero"
)

const (
	noPlayerStopTimeout = 48 * time.Hour
	stopRetryWindow     = 3 * time.Minute
)

type ServerState string

const (
	StateRunning ServerState = "running"
	StateIdle    ServerState = "idle"
	StateStarting ServerState = "starting"
	StateStopping ServerState = "stopping"
	StateOffline ServerState = "offline"
)

type ServerRuntime struct {
	Info            *ptero.ServerInfo
	State           ServerState
	IdleSince       time.Time
	LastStarted     time.Time
	LastPlayerCount int
	StopRequestedAt time.Time
}

type Tracker struct {
	cfg         *config.Config
	pteroClient *ptero.Client
	servers     map[string]*ServerRuntime
	mu          sync.RWMutex
	stopChan    chan struct{}
}

func NewTracker(cfg *config.Config, pteroClient *ptero.Client) *Tracker {
	return &Tracker{
		cfg:         cfg,
		pteroClient: pteroClient,
		servers:     make(map[string]*ServerRuntime),
		stopChan:    make(chan struct{}),
	}
}

func (t *Tracker) Start() {
	log.Printf("[SmartSleep] Auto-stop tracker started. Monitoring interval: %v", t.cfg.Sleep.CheckInterval)
	ticker := time.NewTicker(t.cfg.Sleep.CheckInterval)

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
	if !t.cfg.Sleep.Enabled {
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

		if !s.Enabled {
			runtime.StopRequestedAt = time.Time{}
			runtime.IdleSince = time.Time{}
			continue
		}

		serverState, err := t.pteroClient.GetServerState(s.Identifier)
		if err != nil {
			log.Printf("[SmartSleep] Failed to get state for %s: %v", s.Name, err)
			continue
		}

		switch serverState {
		case "offline":
			runtime.State = StateOffline
			runtime.IdleSince = time.Time{}
			runtime.LastStarted = time.Time{}
			runtime.StopRequestedAt = time.Time{}

		case "running":
			if !runtime.StopRequestedAt.IsZero() && time.Since(runtime.StopRequestedAt) >= stopRetryWindow {
				log.Printf("[SmartSleep] Stop request timed out for %s; retrying if it remains empty.", s.Name)
				runtime.StopRequestedAt = time.Time{}
			}

			if runtime.LastStarted.IsZero() {
				runtime.LastStarted = time.Now()
				runtime.IdleSince = time.Time{}
				runtime.State = StateRunning
				log.Printf("[SmartSleep] Server %s is running. It will be stopped after %v with no players.", s.Name, noPlayerStopTimeout)
			}

			gracePeriod := t.cfg.Sleep.GracePeriod
			if gracePeriod > 45*time.Second {
				gracePeriod = 45 * time.Second
			}
			if time.Since(runtime.LastStarted) < gracePeriod {
				runtime.State = StateRunning
				runtime.IdleSince = time.Time{}
				continue
			}

			playerCount, err := queryPlayerCount(s)
			if err != nil {
				log.Printf("[SmartSleep] Could not query player count for %s; leaving its idle timer unchanged: %v", s.Name, err)
				continue
			}

			runtime.LastPlayerCount = playerCount
			wasIdle := runtime.IdleSince.IsZero()
			runtime.IdleSince = idleSinceForPlayerCount(runtime.IdleSince, playerCount, time.Now())
			if playerCount > 0 {
				runtime.State = StateRunning
				runtime.StopRequestedAt = time.Time{}
				continue
			}

			if wasIdle {
				runtime.State = StateIdle
				log.Printf("[SmartSleep] %s has 0 players. Starting 48-hour auto-stop timer.", s.Name)
			}
			if time.Since(runtime.IdleSince) >= noPlayerStopTimeout && runtime.StopRequestedAt.IsZero() {
				requestedAt := time.Now()
				runtime.StopRequestedAt = requestedAt
				runtime.State = StateIdle
				log.Printf("[SmartSleep] %s has had no players for %v. Sending graceful stop.", s.Name, noPlayerStopTimeout)
				go t.stopIdleServer(runtime, s, requestedAt)
			}

		case "starting":
			runtime.State = StateStarting
			runtime.StopRequestedAt = time.Time{}
			runtime.IdleSince = time.Time{}
			if runtime.LastStarted.IsZero() {
				runtime.LastStarted = time.Now()
			}

		case "stopping":
			runtime.State = StateStopping
			runtime.StopRequestedAt = time.Time{}
			runtime.IdleSince = time.Time{}
			runtime.LastStarted = time.Time{}
		}
	}
}

func idleSinceForPlayerCount(idleSince time.Time, playerCount int, now time.Time) time.Time {
	if playerCount > 0 {
		return time.Time{}
	}

	if idleSince.IsZero() {
		return now
	}

	return idleSince
}

func queryPlayerCount(s *ptero.ServerInfo) (int, error) {
	playerCount, err := gateway.QueryPlayerCount(s.PrimaryIP, s.PrimaryPort)
	if err != nil {
		playerCount, err = gateway.QueryPlayerCount("127.0.0.1", s.PrimaryPort)
	}

	return playerCount, err
}

func (t *Tracker) stopIdleServer(runtime *ServerRuntime, s *ptero.ServerInfo, requestedAt time.Time) {
	playerCount, err := queryPlayerCount(s)
	if err != nil {
		log.Printf("[SmartSleep] Could not verify player count before stopping %s; will retry: %v", s.Name, err)
		return
	}
	if playerCount > 0 {
		t.mu.Lock()
		if runtime.StopRequestedAt.Equal(requestedAt) {
			runtime.StopRequestedAt = time.Time{}
			runtime.IdleSince = time.Time{}
			runtime.LastPlayerCount = playerCount
			runtime.State = StateRunning
		}
		t.mu.Unlock()
		log.Printf("[SmartSleep] A player joined %s before it could be stopped; idle timer reset.", s.Name)
		return
	}

	t.mu.RLock()
	requestIsCurrent := runtime.StopRequestedAt.Equal(requestedAt)
	t.mu.RUnlock()
	if !requestIsCurrent {
		return
	}

	if err := t.pteroClient.SendPowerAction(s.Identifier, "stop"); err != nil {
		log.Printf("[SmartSleep] Failed to gracefully stop idle server %s; will retry: %v", s.Name, err)
		return
	}

	log.Printf("[SmartSleep] Sent graceful stop to %s after %v with no players.", s.Name, noPlayerStopTimeout)
}
