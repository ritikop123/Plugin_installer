package gateway

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"time"
)

func readVarInt(r io.Reader) (int, error) {
	var value int
	var count uint
	var buf [1]byte

	for {
		if count >= 5 {
			return 0, errors.New("VarInt is too big")
		}
		if _, err := io.ReadFull(r, buf[:]); err != nil {
			return 0, err
		}

		value |= int(buf[0]&0x7F) << (count * 7)
		count++
		if buf[0]&0x80 == 0 {
			return value, nil
		}
	}
}

func writeVarInt(w io.Writer, value int) error {
	for {
		if value&^0x7F == 0 {
			_, err := w.Write([]byte{byte(value)})
			return err
		}

		if _, err := w.Write([]byte{byte(value&0x7F | 0x80)}); err != nil {
			return err
		}
		value = int(uint(value) >> 7)
	}
}

func writeString(w io.Writer, value string) error {
	if err := writeVarInt(w, len(value)); err != nil {
		return err
	}
	_, err := io.WriteString(w, value)
	return err
}

func readString(r io.Reader) (string, error) {
	length, err := readVarInt(r)
	if err != nil {
		return "", err
	}
	if length < 0 || length > 32767 {
		return "", fmt.Errorf("string length %d out of bounds", length)
	}

	data := make([]byte, length)
	if _, err := io.ReadFull(r, data); err != nil {
		return "", err
	}
	return string(data), nil
}

// QueryPlayerCount performs a Minecraft Server List Ping against a running server.
func QueryPlayerCount(ip string, port int) (int, error) {
	if port <= 0 {
		return 0, fmt.Errorf("invalid server port %d", port)
	}

	if ip == "0.0.0.0" || ip == "" {
		ip = "127.0.0.1"
	}
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(ip, fmt.Sprint(port)), 3*time.Second)
	if err != nil {
		return 0, err
	}
	defer conn.Close()
	if err := conn.SetDeadline(time.Now().Add(3 * time.Second)); err != nil {
		return 0, err
	}

	var handshake bytes.Buffer
	if err := writeVarInt(&handshake, 0); err != nil {
		return 0, err
	}
	if err := writeVarInt(&handshake, 765); err != nil {
		return 0, err
	}
	if err := writeString(&handshake, "127.0.0.1"); err != nil {
		return 0, err
	}
	if err := binary.Write(&handshake, binary.BigEndian, uint16(port)); err != nil {
		return 0, err
	}
	if err := writeVarInt(&handshake, 1); err != nil {
		return 0, err
	}

	var packet bytes.Buffer
	if err := writeVarInt(&packet, handshake.Len()); err != nil {
		return 0, err
	}
	if _, err := packet.Write(handshake.Bytes()); err != nil {
		return 0, err
	}
	if err := writeVarInt(&packet, 1); err != nil {
		return 0, err
	}
	if err := writeVarInt(&packet, 0); err != nil {
		return 0, err
	}
	if _, err := conn.Write(packet.Bytes()); err != nil {
		return 0, err
	}

	packetLength, err := readVarInt(conn)
	if err != nil {
		return 0, err
	}
	if packetLength <= 0 || packetLength > 1<<20 {
		return 0, fmt.Errorf("invalid status response packet length %d", packetLength)
	}

	response := make([]byte, packetLength)
	if _, err := io.ReadFull(conn, response); err != nil {
		return 0, err
	}

	reader := bytes.NewReader(response)
	if _, err := readVarInt(reader); err != nil {
		return 0, err
	}
	statusJSON, err := readString(reader)
	if err != nil {
		return 0, err
	}

	var status struct {
		Players struct {
			Online int `json:"online"`
		} `json:"players"`
	}
	if err := json.Unmarshal([]byte(statusJSON), &status); err != nil {
		return 0, err
	}

	return status.Players.Online, nil
}
