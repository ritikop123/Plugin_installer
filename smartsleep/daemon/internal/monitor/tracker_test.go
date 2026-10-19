package monitor

import (
	"testing"
	"time"
)

func TestNoPlayerStopTimeoutIsTwoDays(t *testing.T) {
	if noPlayerStopTimeout != 48*time.Hour {
		t.Fatalf("noPlayerStopTimeout = %v, want 48h", noPlayerStopTimeout)
	}
}

func TestIdleSinceForPlayerCountResetsWhenPlayerJoins(t *testing.T) {
	now := time.Date(2026, time.October, 9, 12, 0, 0, 0, time.UTC)
	idleSince := now.Add(-24 * time.Hour)

	if got := idleSinceForPlayerCount(idleSince, 1, now); !got.IsZero() {
		t.Fatalf("idle timer was not reset when a player was present: %v", got)
	}

	if got := idleSinceForPlayerCount(time.Time{}, 0, now); !got.Equal(now) {
		t.Fatalf("new empty interval started at %v, want %v", got, now)
	}

	if got := idleSinceForPlayerCount(idleSince, 0, now); !got.Equal(idleSince) {
		t.Fatalf("existing empty interval changed from %v to %v", idleSince, got)
	}
}
