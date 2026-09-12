package gateway

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"
)

// VarInt utilities for Minecraft wire protocol
func ReadVarInt(r io.Reader) (int, error) {
	var num int
	var count uint
	buf := make([]byte, 1)

	for {
		if count >= 5 {
			return 0, errors.New("VarInt is too big")
		}
		_, err := r.Read(buf)
		if err != nil {
			return 0, err
		}
		val := buf[0]
		num |= int(val&0x7F) << (count * 7)
		count++
		if (val & 0x80) == 0 {
			break
		}
	}
	return num, nil
}

func WriteVarInt(w io.Writer, value int) error {
	for {
		if (value & ^0x7F) == 0 {
			_, err := w.Write([]byte{byte(value)})
			return err
		}
		_, err := w.Write([]byte{byte((value & 0x7F) | 0x80)})
		if err != nil {
			return err
		}
		value = int(uint(value) >> 7)
	}
}

func WriteString(w io.Writer, s string) error {
	data := []byte(s)
	if err := WriteVarInt(w, len(data)); err != nil {
		return err
	}
	_, err := w.Write(data)
	return err
}

func ReadString(r io.Reader) (string, error) {
	length, err := ReadVarInt(r)
	if err != nil {
		return "", err
	}
	if length < 0 || length > 32767 {
		return "", fmt.Errorf("string length %d out of bounds", length)
	}
	buf := make([]byte, length)
	if _, err := io.ReadFull(r, buf); err != nil {
		return "", err
	}
	return string(buf), nil
}

// JavaListener manages a TCP listener on a sleeping server's port
type JavaListener struct {
	serverID    string
	serverName  string
	ip          string
	port        int
	motd        string
	wakeMsg     string
	listener    net.Listener
	activeConns map[net.Conn]struct{}
	onWake      func(serverID string)
	closing     bool
	mu          sync.Mutex
}

func NewJavaListener(serverID, serverName, ip string, port int, motd, wakeMsg string, onWake func(serverID string)) *JavaListener {
	if motd == "" {
		motd = fmt.Sprintf("§a%s §7[Sleeping]\n§eJoin server to wake it up!", serverName)
	}
	if wakeMsg == "" {
		wakeMsg = "§e[SmartSleep] §aServer is currently sleeping and is waking up!\n§fPlease wait §e30 seconds – 1 minute §ffor the server to start, then rejoin."
	}
	return &JavaListener{
		serverID:    serverID,
		serverName:  serverName,
		ip:          ip,
		port:        port,
		motd:        motd,
		wakeMsg:     wakeMsg,
		activeConns: make(map[net.Conn]struct{}),
		onWake:      onWake,
	}
}

func (l *JavaListener) addConn(c net.Conn) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.activeConns == nil {
		l.activeConns = make(map[net.Conn]struct{})
	}
	l.activeConns[c] = struct{}{}
}

func (l *JavaListener) removeConn(c net.Conn) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.activeConns, c)
}

func (l *JavaListener) Start() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	var ln net.Listener
	var err error

	// Retry binding on 0.0.0.0 for up to 10 seconds while Docker releases the host port
	for attempt := 1; attempt <= 10; attempt++ {
		ln, err = net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", l.port))
		if err == nil {
			break
		}
		time.Sleep(1 * time.Second)
	}

	if err != nil {
		return fmt.Errorf("failed to bind TCP 0.0.0.0:%d after 10s: %w", l.port, err)
	}

	l.listener = ln
	l.closing = false

	go l.acceptLoop()
	return nil
}

func (l *JavaListener) Stop() {
	l.mu.Lock()
	l.closing = true
	if l.listener != nil {
		_ = l.listener.Close()
		l.listener = nil
	}
	for c := range l.activeConns {
		if tcpConn, ok := c.(*net.TCPConn); ok {
			_ = tcpConn.SetLinger(0)
		}
		_ = c.Close()
		delete(l.activeConns, c)
	}
	l.mu.Unlock()
}

func (l *JavaListener) acceptLoop() {
	for {
		conn, err := l.listener.Accept()
		if err != nil {
			l.mu.Lock()
			isClosing := l.closing
			l.mu.Unlock()
			if isClosing {
				return
			}
			time.Sleep(100 * time.Millisecond)
			continue
		}

		l.addConn(conn)
		go l.handleConn(conn)
	}
}

func (l *JavaListener) handleConn(conn net.Conn) {
	defer func() {
		if tcpConn, ok := conn.(*net.TCPConn); ok {
			_ = tcpConn.SetLinger(0)
		}
		_ = conn.Close()
		l.removeConn(conn)
	}()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))

	// 1. Read Packet Length
	pktLen, err := ReadVarInt(conn)
	if err != nil || pktLen <= 0 {
		return
	}

	// Read packet payload into buffer
	buf := make([]byte, pktLen)
	if _, err := io.ReadFull(conn, buf); err != nil {
		return
	}
	r := bytes.NewReader(buf)

	// Read Packet ID (Handshake = 0x00)
	pktID, err := ReadVarInt(r)
	if err != nil || pktID != 0x00 {
		return
	}

	// Read Protocol Version
	protoVer, err := ReadVarInt(r)
	if err != nil {
		return
	}

	// Read Server Address
	_, err = ReadString(r)
	if err != nil {
		return
	}

	// Read Server Port (2 bytes)
	var port uint16
	if err := binary.Read(r, binary.BigEndian, &port); err != nil {
		return
	}

	// Read Next State (1 = Status, 2 = Login)
	nextState, err := ReadVarInt(r)
	if err != nil {
		return
	}

	if nextState == 1 {
		// --------------------------------------------------------------------
		// STATUS REQUEST (Server List Ping)
		// --------------------------------------------------------------------
		l.handleStatus(conn, protoVer)
	} else if nextState == 2 {
		// --------------------------------------------------------------------
		// LOGIN REQUEST (Player clicked Join)
		// --------------------------------------------------------------------
		l.handleLogin(conn)
	}
}

func (l *JavaListener) handleStatus(conn net.Conn, clientProto int) {
	// Read Status Request packet (Length 1, ID 0x00)
	_, _ = ReadVarInt(conn) // packet len
	_, _ = ReadVarInt(conn) // packet id

	formattedMOTD := l.motd
	if strings.Contains(formattedMOTD, "%s") {
		formattedMOTD = fmt.Sprintf(formattedMOTD, l.serverName)
	}

	// Build SLP JSON Response
	statusObj := map[string]interface{}{
		"version": map[string]interface{}{
			"name":     "Sleeping",
			"protocol": clientProto,
		},
		"players": map[string]interface{}{
			"max":    0,
			"online": 0,
			"sample": []interface{}{},
		},
		"description": map[string]interface{}{
			"text": formattedMOTD,
		},
	}

	jsonData, err := json.Marshal(statusObj)
	if err != nil {
		return
	}

	// Construct Status Response packet (ID 0x00)
	var pktBuf bytes.Buffer
	_ = WriteVarInt(&pktBuf, 0x00) // Packet ID
	_ = WriteString(&pktBuf, string(jsonData))

	// Send Packet Length + Packet Content
	var fullBuf bytes.Buffer
	_ = WriteVarInt(&fullBuf, pktBuf.Len())
	fullBuf.Write(pktBuf.Bytes())
	_, _ = conn.Write(fullBuf.Bytes())

	// Read optional Ping packet (ID 0x01) and echo back Pong (ID 0x01)
	pingLen, err := ReadVarInt(conn)
	if err == nil && pingLen > 0 {
		pingBuf := make([]byte, pingLen)
		if _, err := io.ReadFull(conn, pingBuf); err == nil && len(pingBuf) >= 9 {
			// Echo exact same bytes (length + payload) back as Pong
			var pongBuf bytes.Buffer
			_ = WriteVarInt(&pongBuf, pingLen)
			pongBuf.Write(pingBuf)
			_, _ = conn.Write(pongBuf.Bytes())
		}
	}
}

func (l *JavaListener) handleLogin(conn net.Conn) {
	// Read Login Start packet (Packet Length, ID 0x00, Username)
	loginPktLen, err := ReadVarInt(conn)
	if err != nil || loginPktLen <= 0 {
		return
	}

	loginBuf := make([]byte, loginPktLen)
	if _, err := io.ReadFull(conn, loginBuf); err != nil {
		return
	}

	// 1. Format Disconnect Packet (ID 0x00 in Login State)
	disconnectObj := map[string]interface{}{
		"text": l.wakeMsg,
	}
	disconnectJSON, _ := json.Marshal(disconnectObj)

	var pktBuf bytes.Buffer
	_ = WriteVarInt(&pktBuf, 0x00) // Login Disconnect Packet ID
	_ = WriteString(&pktBuf, string(disconnectJSON))

	var fullBuf bytes.Buffer
	_ = WriteVarInt(&fullBuf, pktBuf.Len())
	fullBuf.Write(pktBuf.Bytes())

	// Send disconnect notice to player
	_, _ = conn.Write(fullBuf.Bytes())

	// Force-close connection immediately with zero linger so TCP port is freed right now
	if tcpConn, ok := conn.(*net.TCPConn); ok {
		_ = tcpConn.SetLinger(0)
	}
	_ = conn.Close()
	l.removeConn(conn)

	// Small pause to allow kernel socket state to clear
	time.Sleep(50 * time.Millisecond)

	// 2. Fire Wake Server event callback AFTER socket is completely released
	if l.onWake != nil {
		go l.onWake(l.serverID)
	}
}

// QueryPlayerCount performs a quick Server List Ping to a running Minecraft server
// on localhost to retrieve its live online player count.
func QueryPlayerCount(ip string, port int) (int, error) {
	target := fmt.Sprintf("%s:%d", ip, port)
	if ip == "0.0.0.0" || ip == "" {
		target = fmt.Sprintf("127.0.0.1:%d", port)
	}

	conn, err := net.DialTimeout("tcp", target, 3*time.Second)
	if err != nil {
		return -1, err
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(3 * time.Second))

	// Send Handshake packet (Protocol 765, Target, Port, State 1)
	var handshakeBuf bytes.Buffer
	_ = WriteVarInt(&handshakeBuf, 0x00)
	_ = WriteVarInt(&handshakeBuf, 765) // 1.20.4 protocol
	_ = WriteString(&handshakeBuf, "127.0.0.1")
	_ = binary.Write(&handshakeBuf, binary.BigEndian, uint16(port))
	_ = WriteVarInt(&handshakeBuf, 1) // Next state: Status

	var frameBuf bytes.Buffer
	_ = WriteVarInt(&frameBuf, handshakeBuf.Len())
	frameBuf.Write(handshakeBuf.Bytes())

	// Status Request (Length 1, ID 0x00)
	_ = WriteVarInt(&frameBuf, 1)
	_ = WriteVarInt(&frameBuf, 0)

	if _, err := conn.Write(frameBuf.Bytes()); err != nil {
		return -1, err
	}

	// Read response
	pktLen, err := ReadVarInt(conn)
	if err != nil || pktLen <= 0 {
		return -1, err
	}

	rawBuf := make([]byte, pktLen)
	if _, err := io.ReadFull(conn, rawBuf); err != nil {
		return -1, err
	}

	r := bytes.NewReader(rawBuf)
	_, _ = ReadVarInt(r) // Packet ID 0x00
	jsonStr, err := ReadString(r)
	if err != nil {
		return -1, err
	}

	var parsed struct {
		Players struct {
			Online int `json:"online"`
			Max    int `json:"max"`
		} `json:"players"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return -1, err
	}

	return parsed.Players.Online, nil
}
