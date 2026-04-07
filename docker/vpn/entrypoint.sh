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

OVPN_PID=""
SOCKS_PID=""

find_auth_file() {
  local ovpn_file="$1"
  local config_dir
  config_dir="$(dirname "$ovpn_file")"
  local profile_name
  profile_name="$(basename "$ovpn_file" .ovpn)"

  # Explicit AUTH_FILE takes priority
  if [ -n "$AUTH_FILE" ] && [ -f "$AUTH_FILE" ]; then
    echo "$AUTH_FILE"
    return
  fi

  # Profile-specific auth (e.g. uk2575.nordvpn.com.udp.auth)
  if [ -f "$config_dir/${profile_name}.auth" ]; then
    echo "$config_dir/${profile_name}.auth"
    return
  fi

  # Shared default auth
  if [ -f "$config_dir/default.auth" ]; then
    echo "$config_dir/default.auth"
    return
  fi

  # Parent-directory default auth (for region subfolders inheriting root auth)
  local parent_dir
  parent_dir="$(dirname "$config_dir")"
  if [ "$parent_dir" != "$config_dir" ] && [ -f "$parent_dir/default.auth" ]; then
    echo "$parent_dir/default.auth"
    return
  fi
}

start_vpn() {
  local ovpn_file="$1"
  local ovpn_args="--config $ovpn_file --verb 3 --connect-retry-max 3"

  # Auto-detect auth file
  local auth_file
  auth_file="$(find_auth_file "$ovpn_file")"
  if [ -n "$auth_file" ]; then
    ovpn_args="$ovpn_args --auth-user-pass $auth_file"
    echo "Using auth file: $auth_file"
  fi

  local ovpn_log="/tmp/openvpn.log"
  rm -f /tmp/vpn-ready "$ovpn_log"

  echo "Starting OpenVPN with config: $ovpn_file"
  openvpn $ovpn_args --log "$ovpn_log" &
  OVPN_PID=$!

  # Wait for tunnel interface to come up
  local timeout=30
  echo "Waiting for tunnel (max ${timeout}s)..."
  for i in $(seq 1 $timeout); do
    if ip addr show tun0 2>/dev/null | grep -q "inet "; then
      local tunnel_ip
      tunnel_ip=$(ip addr show tun0 | grep "inet " | awk '{print $2}')
      echo "Tunnel established: tun0 = $tunnel_ip"

      # Extract DNS servers pushed by the VPN and update resolv.conf
      if grep -q "dhcp-option DNS" "$ovpn_log" 2>/dev/null; then
        grep -o "dhcp-option DNS [0-9.]*" "$ovpn_log" | awk '{print "nameserver "$3}' > /etc/resolv.conf
        echo "DNS updated: $(cat /etc/resolv.conf | tr '\n' ' ')"
      fi

      touch /tmp/vpn-ready
      break
    fi
    if ! kill -0 $OVPN_PID 2>/dev/null; then
      echo "ERROR: OpenVPN process exited unexpectedly"
      cat "$ovpn_log" 2>/dev/null || true
      exit 1
    fi
    sleep 1
  done

  if [ ! -f /tmp/vpn-ready ]; then
    echo "ERROR: Tunnel did not come up within ${timeout}s"
    cat "$ovpn_log" 2>/dev/null || true
    kill $OVPN_PID 2>/dev/null || true
    exit 1
  fi

  echo "Starting SOCKS5 proxy on port 1080..."
  microsocks -p 1080 &
  SOCKS_PID=$!

  echo "Ready. SOCKS5 proxy on port 1080, VPN tunnel on tun0."
}

stop_vpn() {
  kill $OVPN_PID $SOCKS_PID 2>/dev/null || true
  wait $OVPN_PID 2>/dev/null || true
  wait $SOCKS_PID 2>/dev/null || true
  rm -f /tmp/vpn-ready
}

pick_random_profile() {
  local profiles=(/vpn/config/*.ovpn)
  if [ ${#profiles[@]} -eq 0 ] || [ ! -f "${profiles[0]}" ]; then
    echo "$OVPN_FILE"
  else
    echo "${profiles[$RANDOM % ${#profiles[@]}]}"
  fi
}

# --- Initial connection ---
start_vpn "$OVPN_FILE"

# --- Rotation loop (if enabled) ---
if [ -n "$ROTATE_INTERVAL_MINS" ] && [ "$ROTATE_INTERVAL_MINS" -gt 0 ] 2>/dev/null; then
  echo "VPN rotation enabled: every ${ROTATE_INTERVAL_MINS} minutes"
  while true; do
    sleep "${ROTATE_INTERVAL_MINS}m" &
    SLEEP_PID=$!

    # Wait for either the sleep timer or a VPN process to exit
    wait -n $OVPN_PID $SOCKS_PID $SLEEP_PID 2>/dev/null || true

    if ! kill -0 $SLEEP_PID 2>/dev/null; then
      # Sleep completed — time to rotate
      NEW_PROFILE=$(pick_random_profile)
      echo "Rotating VPN to: $(basename "$NEW_PROFILE")"
      stop_vpn
      start_vpn "$NEW_PROFILE"
    else
      # A VPN process died unexpectedly
      echo "A VPN process exited unexpectedly, shutting down..."
      kill $SLEEP_PID 2>/dev/null || true
      stop_vpn
      exit 1
    fi
  done
else
  # No rotation — exit if either process dies
  wait -n $OVPN_PID $SOCKS_PID 2>/dev/null || true
  echo "A process exited, shutting down..."
  kill $OVPN_PID $SOCKS_PID 2>/dev/null || true
  exit 1
fi
