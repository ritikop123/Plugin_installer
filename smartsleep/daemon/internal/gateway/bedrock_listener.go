package gateway

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"
)

// RakNet offline magic bytes used in Bedrock protocol
var raknetMagic = []byte{
	0x00, 0xff, 0xff, 0x00,
	0xfe, 0xfe, 0xfe, 0xfe,
	0xfd, 0xfd, 0xfd, 0xfd,
	0x12, 0x34, 0x56, 0x78,
}

// BedrockListener handles UDP RakNet ping and connection requests for Geyser/Bedrock
type BedrockListener struct {
	serverID   string
	serverName string
	ip         string
	port       int
	motd       string
	wakeMsg    string
	conn       *net.UDPConn
	onWake     func(serverID string)
	closing    bool
	mu         sync.Mutex
}

func NewBedrockListener(serverID, serverName, ip string, port int, motd, wakeMsg string, onWake func(serverID string)) *BedrockListener {
	if motd == "" {
		motd = fmt.Sprintf("§a%s §7[Sleeping]", serverName)
	}
	if wakeMsg == "" {
		wakeMsg = "§e[SmartSleep] §aServer is sleeping and waking up now! Please wait 30s - 1m and rejoin."
	}
	return &BedrockListener{
		serverID:   serverID,
		serverName: serverName,
		ip:         ip,
		port:       port,
		motd:       motd,
		wakeMsg:    wakeMsg,
		onWake:     onWake,
	}
}

func (b *BedrockListener) Start() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	bindAddr := fmt.Sprintf("%s:%d", b.ip, b.port)
	if b.ip == "127.0.0.1" || b.ip == "" {
		bindAddr = fmt.Sprintf("0.0.0.0:%d", b.port)
	}

	udpAddr, err := net.ResolveUDPAddr("udp", bindAddr)
	if err != nil {
		udpAddr, _ = net.ResolveUDPAddr("udp", fmt.Sprintf("0.0.0.0:%d", b.port))
	}

	conn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		return fmt.Errorf("failed to bind UDP port %d: %w", b.port, err)
	}

	b.conn = conn
	b.closing = false

	go b.readLoop()
	return nil
}

func (b *BedrockListener) Stop() {
	b.mu.Lock()
	b.closing = true
	if b.conn != nil {
		_ = b.conn.Close()
		b.conn = nil
	}
	b.mu.Unlock()
}

func (b *BedrockListener) readLoop() {
	buf := make([]byte, 2048)
	serverGUID := int64(123456789012345)

	for {
		n, remoteAddr, err := b.conn.ReadFromUDP(buf)
		if err != nil {
			b.mu.Lock()
			isClosing := b.closing
			b.mu.Unlock()
			if isClosing {
				return
			}
			time.Sleep(50 * time.Millisecond)
			continue
		}

		if n < 1 {
			continue
		}

		packetID := buf[0]

		switch packetID {
		case 0x01, 0x02: // Unconnected Ping or Open Ping
			if n < 25 {
				continue
			}

			// Validate RakNet magic
			if !bytes.Contains(buf[:n], raknetMagic) {
				continue
			}

			// Read client timestamp (bytes 1-9)
			clientTimestamp := binary.BigEndian.Uint64(buf[1:9])

			// Format Bedrock MOTD string
			// Structure: MCPE;Server Name;Protocol;Version;Players;MaxPlayers;ServerId;SubMOTD;GameMode;GameModeNumeric;Port4;Port6;
			formattedName := b.motd
			if strings.Contains(formattedName, "%s") {
				formattedName = fmt.Sprintf(formattedName, b.serverName)
			}
			motdPayload := fmt.Sprintf(
				"MCPE;%s;589;1.20.80;0;100;%d;§eJoin to wake up!;Survival;1;%d;%d;",
				formattedName, serverGUID, b.port, b.port,
			)

			// Construct Unconnected Pong (ID 0x1c)
			var pong bytes.Buffer
			pong.WriteByte(0x1c) // ID Unconnected Pong
			_ = binary.Write(&pong, binary.BigEndian, clientTimestamp)
			_ = binary.Write(&pong, binary.BigEndian, serverGUID)
			pong.Write(raknetMagic)

			// String length (uint16 big-endian)
			_ = binary.Write(&pong, binary.BigEndian, uint16(len(motdPayload)))
			pong.WriteString(motdPayload)

			_, _ = b.conn.WriteToUDP(pong.Bytes(), remoteAddr)

		case 0x05: // Open Connection Request 1 (Bedrock Player clicked "Join Server")
			if !bytes.Contains(buf[:n], raknetMagic) {
				continue
			}

			// 1. Trigger Wake Server callback
			if b.onWake != nil {
				go b.onWake(b.serverID)
			}

			// 2. Respond with Open Connection Reply 1
			// ID (0x06) + Magic (16) + Server GUID (8) + Security (1) + MTU (2)
			var reply bytes.Buffer
			reply.WriteByte(0x06) // ID Open Connection Reply 1
			reply.Write(raknetMagic)
			_ = binary.Write(&reply, binary.BigEndian, serverGUID)
			reply.WriteByte(0x00) // No security
			_ = binary.Write(&reply, binary.BigEndian, uint16(n)) // Echo requested MTU

			_, _ = b.conn.WriteToUDP(reply.Bytes(), remoteAddr)

		case 0x07: // Open Connection Request 2 (Follow-up)
			// Trigger wake again if not already triggered
			if b.onWake != nil {
				go b.onWake(b.serverID)
			}
		}
	}
}
