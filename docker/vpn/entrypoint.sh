#!/bin/bash
set -e

if [ -z "$OVPN_FILE" ]; then
  echo "ERROR: OVPN_FILE environment variable not set"
  exit 1
fi

if [ ! -f "$OVPN_FILE" ]; then
  echo "ERROR: OpenVPN config not found: $OVPN_FILE"
  exit 1
fi

# Create TUN device if it doesn't exist
mkdir -p /dev/net
if [ ! -c /dev/net/tun ]; then
  mknod /dev/net/tun c 10 200
fi

# Build OpenVPN args
OVPN_ARGS="--config $OVPN_FILE --verb 3 --connect-retry-max 3"

# Add auth file if provided
if [ -n "$AUTH_FILE" ] && [ -f "$AUTH_FILE" ]; then
  OVPN_ARGS="$OVPN_ARGS --auth-user-pass $AUTH_FILE"
fi

# Log to file so we can parse DNS options after connection
OVPN_LOG="/tmp/openvpn.log"

# Start OpenVPN in background
echo "Starting OpenVPN with config: $OVPN_FILE"
openvpn $OVPN_ARGS --log "$OVPN_LOG" &
OVPN_PID=$!

# Wait for tunnel interface to come up
TIMEOUT=30
echo "Waiting for tunnel (max ${TIMEOUT}s)..."
for i in $(seq 1 $TIMEOUT); do
  if ip addr show tun0 2>/dev/null | grep -q "inet "; then
    TUNNEL_IP=$(ip addr show tun0 | grep "inet " | awk '{print $2}')
    echo "Tunnel established: tun0 = $TUNNEL_IP"

    # Extract DNS servers pushed by the VPN and update resolv.conf
    if grep -q "dhcp-option DNS" "$OVPN_LOG" 2>/dev/null; then
      grep -o "dhcp-option DNS [0-9.]*" "$OVPN_LOG" | awk '{print "nameserver "$3}' > /etc/resolv.conf
      echo "DNS updated: $(cat /etc/resolv.conf | tr '\n' ' ')"
    fi

    touch /tmp/vpn-ready
    break
  fi
  # Check if openvpn process died
  if ! kill -0 $OVPN_PID 2>/dev/null; then
    echo "ERROR: OpenVPN process exited unexpectedly"
    cat "$OVPN_LOG" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

if [ ! -f /tmp/vpn-ready ]; then
  echo "ERROR: Tunnel did not come up within ${TIMEOUT}s"
  cat "$OVPN_LOG" 2>/dev/null || true
  kill $OVPN_PID 2>/dev/null || true
  exit 1
fi

# Start SOCKS5 proxy on all interfaces (so host can reach it via port mapping)
echo "Starting SOCKS5 proxy on port 1080..."
microsocks -p 1080 &
SOCKS_PID=$!

echo "Ready. SOCKS5 proxy on port 1080, VPN tunnel on tun0."

# If either process dies, exit
wait -n $OVPN_PID $SOCKS_PID 2>/dev/null || true
echo "A process exited, shutting down..."
kill $OVPN_PID $SOCKS_PID 2>/dev/null || true
exit 1
