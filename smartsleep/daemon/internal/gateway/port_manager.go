package gateway

import (
	"fmt"
	"log"
	"strings"
	"sync"
)

type ActiveListeners struct {
	ServerID    string
	Port        int
	BedrockPort int
	Java        *JavaListener
	Bedrock     *BedrockListener
}

type PortManager struct {
	listeners map[string]*ActiveListeners
	mu        sync.RWMutex
}

func NewPortManager() *PortManager {
	return &PortManager{
		listeners: make(map[string]*ActiveListeners),
	}
}

// BindSleepingServer opens Java and optional Bedrock listeners on the server's allocation ports
func (pm *PortManager) BindSleepingServer(
	serverID string,
	serverName string,
	ip string,
	port int,
	bedrockPort int,
	motd string,
	wakeMsg string,
	bedrockWakeMsg string,
	onWake func(serverID string),
) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	// 1. If any server is holding this port or if already bound, stop old listeners first
	for id, existing := range pm.listeners {
		if id == serverID || existing.Port == port || (bedrockPort > 0 && existing.BedrockPort == bedrockPort) {
			if existing.Java != nil {
				existing.Java.Stop()
			}
			if existing.Bedrock != nil {
				existing.Bedrock.Stop()
			}
			delete(pm.listeners, id)
		}
	}

	targetBedrockPort := bedrockPort
	if targetBedrockPort <= 0 {
		targetBedrockPort = port // Fallback to same port UDP for Geyser clone_remote_port
	}

	group := &ActiveListeners{
		ServerID:    serverID,
		Port:        port,
		BedrockPort: targetBedrockPort,
	}

	// 2. Start Java TCP Listener
	javaListener := NewJavaListener(serverID, serverName, ip, port, motd, wakeMsg, onWake)
	if err := javaListener.Start(); err != nil {
		return fmt.Errorf("failed to bind Java listener on %s:%d: %w", ip, port, err)
	}
	group.Java = javaListener
	log.Printf("[SmartSleep] [Gateway] Listening for Java clients on %s:%d (Server: %s)", ip, port, serverName)

	// 3. Start Bedrock UDP Listener (if bedrockPort > 0 or same port)
	bedrockListener := NewBedrockListener(serverID, serverName, ip, targetBedrockPort, motd, bedrockWakeMsg, onWake)
	if err := bedrockListener.Start(); err != nil {
		log.Printf("[SmartSleep] [Gateway] Warning: Bedrock listener failed on UDP port %d: %v", targetBedrockPort, err)
	} else {
		group.Bedrock = bedrockListener
		log.Printf("[SmartSleep] [Gateway] Listening for Bedrock/Geyser clients on UDP %s:%d (Server: %s)", ip, targetBedrockPort, serverName)
	}

	pm.listeners[serverID] = group
	return nil
}

// UnbindServer closes and frees the TCP and UDP sockets for this server
func (pm *PortManager) UnbindServer(serverIdentifier string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for id, group := range pm.listeners {
		if id == serverIdentifier ||
			strings.HasPrefix(serverIdentifier, id) ||
			strings.HasPrefix(id, serverIdentifier) ||
			fmt.Sprintf("%d", group.Port) == serverIdentifier {
			if group.Java != nil {
				group.Java.Stop()
			}
			if group.Bedrock != nil {
				group.Bedrock.Stop()
			}
			delete(pm.listeners, id)
			log.Printf("[SmartSleep] [Gateway] Released ports for server %s (TCP: %d, UDP: %d)", id, group.Port, group.BedrockPort)
		}
	}
}

// UnbindPort forcefully closes any listener running on the specified port
func (pm *PortManager) UnbindPort(port int) {
	if port <= 0 {
		return
	}
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for id, group := range pm.listeners {
		if group.Port == port || group.BedrockPort == port {
			if group.Java != nil {
				group.Java.Stop()
			}
			if group.Bedrock != nil {
				group.Bedrock.Stop()
			}
			delete(pm.listeners, id)
			log.Printf("[SmartSleep] [Gateway] Forcefully released port %d for server %s", port, id)
		}
	}
}

// IsBound returns true if the gateway is currently holding ports for this server
func (pm *PortManager) IsBound(serverID string) bool {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	_, exists := pm.listeners[serverID]
	return exists
}

// IsPortBound returns true if any listener is active on the specified port
func (pm *PortManager) IsPortBound(port int) bool {
	if port <= 0 {
		return false
	}
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	for _, group := range pm.listeners {
		if group.Port == port || group.BedrockPort == port {
			return true
		}
	}
	return false
}

// UnbindAll closes all active listeners across all servers (used during daemon shutdown)
func (pm *PortManager) UnbindAll() {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for id, group := range pm.listeners {
		if group.Java != nil {
			group.Java.Stop()
		}
		if group.Bedrock != nil {
			group.Bedrock.Stop()
		}
		delete(pm.listeners, id)
	}
	log.Printf("[SmartSleep] [Gateway] Unbound all listening ports.")
}
