package security

import (
	"fmt"
	"sync"
	"time"

	"smartsleep/internal/config"
)

type ServerSecurityState struct {
	WakeHistory   []time.Time
	LastWakeTime  time.Time
	IsWaking      bool
	WakeStartTime time.Time
	IsCrashed     bool
	CrashReason   string
}

type RateLimiter struct {
	cfg    *config.SecurityConfig
	states map[string]*ServerSecurityState
	mu     sync.Mutex
}

func NewRateLimiter(cfg *config.SecurityConfig) *RateLimiter {
	return &RateLimiter{
		cfg:    cfg,
		states: make(map[string]*ServerSecurityState),
	}
}

func (rl *RateLimiter) getOrCreate(serverID string) *ServerSecurityState {
	if s, exists := rl.states[serverID]; exists {
		return s
	}
	s := &ServerSecurityState{
		WakeHistory: make([]time.Time, 0),
	}
	rl.states[serverID] = s
	return s
}

// CanWake checks if a server is allowed to be automatically woken up
func (rl *RateLimiter) CanWake(serverID string) (bool, string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	s := rl.getOrCreate(serverID)

	// If currently in middle of waking up, don't trigger duplicate wake
	if s.IsWaking && time.Since(s.WakeStartTime) < 60*time.Second {
		return false, "Server is already in the process of starting up."
	}

	// If server is flagged as crashed, prevent crash loops
	if s.IsCrashed {
		return false, fmt.Sprintf("Auto-wake suspended: Server crashed previously (%s). Please start manually.", s.CrashReason)
	}

	now := time.Now()
	cutoff := now.Add(-time.Duration(rl.cfg.WindowSeconds) * time.Second)

	// Filter recent wake history
	validHistory := make([]time.Time, 0)
	for _, t := range s.WakeHistory {
		if t.After(cutoff) {
			validHistory = append(validHistory, t)
		}
	}
	s.WakeHistory = validHistory

	// Check max wakes per window
	if len(s.WakeHistory) >= rl.cfg.MaxWakesPerWindow {
		return false, fmt.Sprintf("Too many wake attempts (%d in %ds). Cooldown active.", len(s.WakeHistory), rl.cfg.WindowSeconds)
	}

	// Check minimum cooldown between individual wakes
	if !s.LastWakeTime.IsZero() && time.Since(s.LastWakeTime) < time.Duration(rl.cfg.WakeCooldownSeconds)*time.Second {
		remaining := time.Duration(rl.cfg.WakeCooldownSeconds)*time.Second - time.Since(s.LastWakeTime)
		return false, fmt.Sprintf("Wake cooldown active. Please wait %d seconds.", int(remaining.Seconds()))
	}

	return true, ""
}

// RecordWake marks that a wake attempt has started
func (rl *RateLimiter) RecordWake(serverID string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	s := rl.getOrCreate(serverID)
	now := time.Now()
	s.WakeHistory = append(s.WakeHistory, now)
	s.LastWakeTime = now
	s.IsWaking = true
	s.WakeStartTime = now
}

// RecordStarted signals that the server finished booting successfully
func (rl *RateLimiter) RecordStarted(serverID string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	s := rl.getOrCreate(serverID)
	s.IsWaking = false
	s.IsCrashed = false
}

// RecordCrashed checks if container stopped too quickly after waking (crash loop detection)
func (rl *RateLimiter) RecordCrashed(serverID string, reason string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	s := rl.getOrCreate(serverID)
	s.IsWaking = false

	// If server died within crash threshold after being woken, flag it
	threshold := time.Duration(rl.cfg.CrashThresholdSeconds) * time.Second
	if !s.WakeStartTime.IsZero() && time.Since(s.WakeStartTime) < threshold {
		s.IsCrashed = true
		s.CrashReason = reason
	}
}

// ResetCrash clears any crash lock (e.g. admin started it manually)
func (rl *RateLimiter) ResetCrash(serverID string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	s := rl.getOrCreate(serverID)
	s.IsCrashed = false
	s.IsWaking = false
}
