package monitor

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"smartsleep/internal/ptero"
)

const (
	// 25ms CFS period (half of a 50ms Minecraft tick) prevents tick micro-stutters.
	cfsPeriodUs      = 25000
	maxBurstCredits  = 60.0
	minStartCredits  = 12.0
	cpuTickInterval  = 2 * time.Second
	normalWeightV2   = "100"  // cgroup v2 standard weight
	burstWeightV2    = "25"   // cgroup v2 lower weight when bursting above Real CPU
	normalSharesV1   = "1024" // cgroup v1 standard shares
	burstSharesV1    = "256"  // cgroup v1 lower shares when bursting above Real CPU
)

type containerCPUState struct {
	UUID          string
	Name          string
	RealCPU       int
	BurstCPU      int
	CgroupPath    string
	IsV2          bool
	LastUsageUsec uint64
	LastCheckTime time.Time
	CurrentCPUPct float64
	Credits       float64
	SpikeTicks    int
	IsBursting    bool
}

type CPUGovernor struct {
	mu         sync.Mutex
	containers map[string]*containerCPUState
	lastHost   hostCPUStat
}

type hostCPUStat struct {
	total uint64
	idle  uint64
}

func NewCPUGovernor() *CPUGovernor {
	return &CPUGovernor{
		containers: make(map[string]*containerCPUState),
	}
}

func (g *CPUGovernor) UpdateServers(servers []*ptero.ServerInfo) {
	g.mu.Lock()
	defer g.mu.Unlock()

	active := make(map[string]bool)
	for _, s := range servers {
		if s.UUID == "" || s.RealCPU <= 0 || s.BurstCPU <= s.RealCPU {
			continue
		}
		active[s.UUID] = true
		st, exists := g.containers[s.UUID]
		if !exists {
			g.containers[s.UUID] = &containerCPUState{
				UUID:     s.UUID,
				Name:     s.Name,
				RealCPU:  s.RealCPU,
				BurstCPU: s.BurstCPU,
				Credits:  maxBurstCredits,
			}
		} else {
			st.Name = s.Name
			st.RealCPU = s.RealCPU
			st.BurstCPU = s.BurstCPU
		}
	}

	for uuid := range g.containers {
		if !active[uuid] {
			delete(g.containers, uuid)
		}
	}
}

func (g *CPUGovernor) Tick() {
	g.mu.Lock()
	defer g.mu.Unlock()

	if len(g.containers) == 0 {
		return
	}

	hostBusyPct := g.readHostCPUPercent()
	hostCongested := hostBusyPct >= 88.0

	now := time.Now()
	for _, st := range g.containers {
		if st.CgroupPath == "" || !dirExists(st.CgroupPath) {
			path, isV2 := findContainerCgroup(st.UUID)
			if path == "" {
				st.CgroupPath = ""
				st.LastUsageUsec = 0
				st.IsBursting = false
				continue
			}
			st.CgroupPath = path
			st.IsV2 = isV2
			// Initialize container to Real CPU with 25ms low-latency CFS period
			applyCgroupCPU(st.CgroupPath, st.IsV2, st.RealCPU, false)
		}

		usageUsec, err := readCgroupCPUUsageUsec(st.CgroupPath, st.IsV2)
		if err != nil {
			st.CgroupPath = ""
			continue
		}

		if st.LastUsageUsec > 0 && !st.LastCheckTime.IsZero() {
			elapsedUsec := float64(now.Sub(st.LastCheckTime).Microseconds())
			if elapsedUsec > 0 && usageUsec >= st.LastUsageUsec {
				deltaUsec := float64(usageUsec - st.LastUsageUsec)
				st.CurrentCPUPct = (deltaUsec / elapsedUsec) * 100.0
			}
		}
		st.LastUsageUsec = usageUsec
		st.LastCheckTime = now

		realCPU := float64(st.RealCPU)
		burstCPU := float64(st.BurstCPU)
		dtSec := cpuTickInterval.Seconds()

		// Token bucket credit accounting
		if st.CurrentCPUPct > realCPU {
			extraRange := burstCPU - realCPU
			if extraRange < 1.0 {
				extraRange = 1.0
			}
			intensity := (st.CurrentCPUPct - realCPU) / extraRange
			if intensity < 0.5 {
				intensity = 0.5
			} else if intensity > 1.5 {
				intensity = 1.5
			}
			st.Credits -= dtSec * intensity
			if st.Credits < 0 {
				st.Credits = 0
			}
		} else if st.CurrentCPUPct < (realCPU * 0.75) {
			st.Credits += dtSec * 0.6
			if st.Credits > maxBurstCredits {
				st.Credits = maxBurstCredits
			}
		}

		if st.CurrentCPUPct >= (realCPU * 0.82) {
			st.SpikeTicks++
		} else {
			st.SpikeTicks = 0
		}

		wantBurst := st.IsBursting
		if st.IsBursting {
			if st.Credits <= 0 || hostCongested || st.CurrentCPUPct < (realCPU*0.70) {
				wantBurst = false
			}
		} else {
			if !hostCongested && st.SpikeTicks >= 2 && st.Credits >= minStartCredits {
				wantBurst = true
			}
		}

		if wantBurst != st.IsBursting {
			targetCPU := st.RealCPU
			if wantBurst {
				targetCPU = st.BurstCPU
			}
			if err := applyCgroupCPU(st.CgroupPath, st.IsV2, targetCPU, wantBurst); err == nil {
				st.IsBursting = wantBurst
				if wantBurst {
					log.Printf("[CPUGovernor] %s: Spike %.1f%% -> Burst CPU %d%% activated (credits: %.0fs)", st.Name, st.CurrentCPUPct, st.BurstCPU, st.Credits)
				} else {
					log.Printf("[CPUGovernor] %s: Returned to Real CPU %d%% (CPU: %.1f%%, credits: %.0fs)", st.Name, st.RealCPU, st.CurrentCPUPct, st.Credits)
				}
			}
		}
	}
}

func findContainerCgroup(serverUUID string) (string, bool) {
	cleanUUID := strings.ReplaceAll(serverUUID, "-", "")
	patterns := []string{
		"/sys/fs/cgroup/system.slice/docker-*" + serverUUID + "*",
		"/sys/fs/cgroup/system.slice/docker-*" + cleanUUID + "*",
		"/sys/fs/cgroup/docker/*" + serverUUID + "*",
		"/sys/fs/cgroup/docker/*" + cleanUUID + "*",
		"/sys/fs/cgroup/cpu/docker/*" + serverUUID + "*",
		"/sys/fs/cgroup/cpu/docker/*" + cleanUUID + "*",
		"/sys/fs/cgroup/cpu/system.slice/docker-*" + serverUUID + "*",
	}

	for _, p := range patterns {
		matches, _ := filepath.Glob(p)
		for _, m := range matches {
			if dirExists(m) {
				_, errV2 := os.Stat(filepath.Join(m, "cpu.max"))
				return m, errV2 == nil
			}
		}
	}
	return "", false
}

func readCgroupCPUUsageUsec(cgroupPath string, isV2 bool) (uint64, error) {
	if isV2 {
		data, err := os.ReadFile(filepath.Join(cgroupPath, "cpu.stat"))
		if err != nil {
			return 0, err
		}
		for _, line := range strings.Split(string(data), "\n") {
			fields := strings.Fields(line)
			if len(fields) == 2 && fields[0] == "usage_usec" {
				return strconv.ParseUint(fields[1], 10, 64)
			}
		}
		return 0, fmt.Errorf("usage_usec not found")
	}

	// cgroup v1: cpuacct.usage is in nanoseconds
	data, err := os.ReadFile(filepath.Join(cgroupPath, "cpuacct.usage"))
	if err != nil {
		return 0, err
	}
	ns, err := strconv.ParseUint(strings.TrimSpace(string(data)), 10, 64)
	if err != nil {
		return 0, err
	}
	return ns / 1000, nil
}

func applyCgroupCPU(cgroupPath string, isV2 bool, cpuPercent int, isBursting bool) error {
	quotaUs := (cpuPercent * cfsPeriodUs) / 100
	if quotaUs < 1000 {
		quotaUs = 1000
	}

	if isV2 {
		maxVal := fmt.Sprintf("%d %d", quotaUs, cfsPeriodUs)
		if err := os.WriteFile(filepath.Join(cgroupPath, "cpu.max"), []byte(maxVal), 0644); err != nil {
			return err
		}
		weight := normalWeightV2
		if isBursting {
			weight = burstWeightV2
		}
		_ = os.WriteFile(filepath.Join(cgroupPath, "cpu.weight"), []byte(weight), 0644)
		return nil
	}

	// cgroup v1
	_ = os.WriteFile(filepath.Join(cgroupPath, "cpu.cfs_period_us"), []byte(strconv.Itoa(cfsPeriodUs)), 0644)
	if err := os.WriteFile(filepath.Join(cgroupPath, "cpu.cfs_quota_us"), []byte(strconv.Itoa(quotaUs)), 0644); err != nil {
		return err
	}
	shares := normalSharesV1
	if isBursting {
		shares = burstSharesV1
	}
	_ = os.WriteFile(filepath.Join(cgroupPath, "cpu.shares"), []byte(shares), 0644)
	return nil
}

func (g *CPUGovernor) readHostCPUPercent() float64 {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0.0
	}
	lines := strings.Split(string(data), "\n")
	if len(lines) == 0 {
		return 0.0
	}
	fields := strings.Fields(lines[0])
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0.0
	}

	var total, idle uint64
	for i := 1; i < len(fields); i++ {
		v, _ := strconv.ParseUint(fields[i], 10, 64)
		total += v
		if i == 4 || i == 5 { // idle + iowait
			idle += v
		}
	}

	if g.lastHost.total == 0 || total <= g.lastHost.total {
		g.lastHost = hostCPUStat{total: total, idle: idle}
		return 0.0
	}

	totalDelta := float64(total - g.lastHost.total)
	idleDelta := float64(idle - g.lastHost.idle)
	g.lastHost = hostCPUStat{total: total, idle: idle}

	if totalDelta <= 0 {
		return 0.0
	}
	busy := ((totalDelta - idleDelta) / totalDelta) * 100.0
	if busy < 0 {
		busy = 0
	}
	return busy
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}
