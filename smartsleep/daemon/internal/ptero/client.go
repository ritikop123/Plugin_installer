package ptero

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"smartsleep/internal/config"
)

type ServerInfo struct {
	ID          int               `json:"id"`
	UUID        string            `json:"uuid"`
	Identifier  string            `json:"identifier"`
	Name        string            `json:"name"`
	NodeID      int               `json:"node"`
	PrimaryIP   string            `json:"primary_ip"`
	PrimaryPort int               `json:"primary_port"`
	ExtraPorts  []AllocationInfo  `json:"extra_ports"`
	Environment map[string]string `json:"environment"`

	// SmartSleep specific properties derived from environment/metadata
	Enabled        bool
	IdleTimeout    time.Duration
	CustomMOTD     string
	BedrockPort    int
}

type AllocationInfo struct {
	IP   string `json:"ip"`
	Port int    `json:"port"`
}

type Client struct {
	baseURL      string
	appAPIKey    string
	clientAPIKey string
	httpClient   *http.Client
}

func NewClient(cfg *config.Config) *Client {
	url := strings.TrimRight(cfg.Panel.URL, "/")
	return &Client{
		baseURL:      url,
		appAPIKey:    cfg.Panel.APIKey,
		clientAPIKey: cfg.Panel.ClientAPIKey,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// GetNodeServers fetches all servers on a given node with their allocations and environment variables
func (c *Client) GetNodeServers(nodeID int) ([]*ServerInfo, error) {
	endpoint := fmt.Sprintf("%s/api/application/servers?include=allocations", c.baseURL)
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	apiKey := c.appAPIKey
	if apiKey == "" {
		apiKey = c.clientAPIKey
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to contact Pterodactyl Application API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Pterodactyl API returned %d: %s", resp.StatusCode, string(body))
	}

	var raw struct {
		Data []struct {
			Attributes struct {
				ID          int    `json:"id"`
				UUID        string `json:"uuid"`
				Identifier  string `json:"identifier"`
				Name        string `json:"name"`
				NodeID      int    `json:"node"`
				Container   struct {
					Environment map[string]interface{} `json:"environment"`
				} `json:"container"`
				Relationships struct {
					Allocations struct {
						Data []struct {
							Attributes struct {
								ID       int    `json:"id"`
								IP       string `json:"ip"`
								Port     int    `json:"port"`
								Assigned bool   `json:"assigned"`
							} `json:"attributes"`
						} `json:"data"`
					} `json:"allocations"`
				} `json:"relationships"`
			} `json:"attributes"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("failed to decode servers json: %w", err)
	}

	var result []*ServerInfo
	for _, item := range raw.Data {
		attr := item.Attributes
		// Filter by Node ID if nodeID > 0
		if nodeID > 0 && attr.NodeID != nodeID {
			continue
		}

		server := &ServerInfo{
			ID:          attr.ID,
			UUID:        attr.UUID,
			Identifier:  attr.Identifier,
			Name:        attr.Name,
			NodeID:      attr.NodeID,
			Environment: make(map[string]string),
			Enabled:     true, // Default enabled unless disabled in env
			IdleTimeout: 20 * time.Minute,
		}

		for k, v := range attr.Container.Environment {
			server.Environment[k] = fmt.Sprintf("%v", v)
		}

		// Parse allocations
		for idx, alloc := range attr.Relationships.Allocations.Data {
			a := alloc.Attributes
			if idx == 0 {
				server.PrimaryIP = a.IP
				server.PrimaryPort = a.Port
			} else {
				server.ExtraPorts = append(server.ExtraPorts, AllocationInfo{
					IP:   a.IP,
					Port: a.Port,
				})
			}
		}

		// Read SmartSleep preferences from environment variables
		if val, exists := server.Environment["SMARTSLEEP_ENABLED"]; exists {
			server.Enabled = strings.ToLower(val) == "true" || val == "1"
		}
		if val, exists := server.Environment["SMARTSLEEP_TIMEOUT"]; exists {
			if mins, err := strconv.Atoi(val); err == nil && mins > 0 {
				server.IdleTimeout = time.Duration(mins) * time.Minute
			}
		}
		if val, exists := server.Environment["SMARTSLEEP_MOTD"]; exists && val != "" {
			server.CustomMOTD = val
		}
		if val, exists := server.Environment["SMARTSLEEP_BEDROCK_PORT"]; exists {
			if bp, err := strconv.Atoi(val); err == nil && bp > 0 {
				server.BedrockPort = bp
			}
		}

		result = append(result, server)
	}

	return result, nil
}

// GetServerState returns current server power state (running, offline, starting, stopping)
func (c *Client) GetServerState(serverIdentifier string) (string, error) {
	endpoint := fmt.Sprintf("%s/api/client/servers/%s/resources", c.baseURL, serverIdentifier)
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return "offline", err
	}

	apiKey := c.clientAPIKey
	if apiKey == "" {
		apiKey = c.appAPIKey
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "offline", err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		return "offline", nil
	}

	var data struct {
		Attributes struct {
			CurrentState string `json:"current_state"`
		} `json:"attributes"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "offline", err
	}

	return data.Attributes.CurrentState, nil
}

// SendPowerAction sends a power signal to a server: start, stop, restart, kill
func (c *Client) SendPowerAction(serverIdentifier, signal string) error {
	endpoint := fmt.Sprintf("%s/api/client/servers/%s/power", c.baseURL, serverIdentifier)
	payload, _ := json.Marshal(map[string]string{"signal": signal})

	req, err := http.NewRequest("POST", endpoint, bytes.NewBuffer(payload))
	if err != nil {
		return err
	}

	apiKey := c.clientAPIKey
	if apiKey == "" {
		apiKey = c.appAPIKey
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send power action %s: %w", signal, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("power action %s failed with code %d: %s", signal, resp.StatusCode, string(body))
	}

	return nil
}

// SendCommand sends a console command to a running server (e.g. "save-all")
func (c *Client) SendCommand(serverIdentifier, command string) error {
	endpoint := fmt.Sprintf("%s/api/client/servers/%s/command", c.baseURL, serverIdentifier)
	payload, _ := json.Marshal(map[string]string{"command": command})

	req, err := http.NewRequest("POST", endpoint, bytes.NewBuffer(payload))
	if err != nil {
		return err
	}

	apiKey := c.clientAPIKey
	if apiKey == "" {
		apiKey = c.appAPIKey
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send command: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("command execution failed with code %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
