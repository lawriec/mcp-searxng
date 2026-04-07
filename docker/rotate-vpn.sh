#!/usr/bin/env bash
# Rotate VPN to a random profile from the config directory.
#
# Usage:
#   ./rotate-vpn.sh [config-dir]
#   Or set OPENVPN_CONFIG_DIR env var.
#
# Run manually between search bursts, or via cron (e.g. every 30 min):
#   */30 * * * * cd /path/to/mcp-searxng/docker && ./rotate-vpn.sh
set -e

CONFIG_DIR="${1:-${OPENVPN_CONFIG_DIR:?Set OPENVPN_CONFIG_DIR or pass config dir as argument}}"

# Collect .ovpn files
PROFILES=("$CONFIG_DIR"/*.ovpn)
if [ ${#PROFILES[@]} -eq 0 ] || [ ! -f "${PROFILES[0]}" ]; then
  echo "No .ovpn files found in $CONFIG_DIR" >&2
  exit 1
fi

# Pick a random profile
RANDOM_PROFILE="${PROFILES[$RANDOM % ${#PROFILES[@]}]}"
PROFILE_NAME="$(basename "$RANDOM_PROFILE" .ovpn)"

echo "Rotating VPN to: $PROFILE_NAME"
export OPENVPN_CONFIG_DIR="$CONFIG_DIR"
export OPENVPN_PROFILE="$PROFILE_NAME"

docker compose -f docker-compose.yml -f docker-compose.vpn.yml up -d --force-recreate vpn
echo "VPN rotated to $PROFILE_NAME. SearXNG will reconnect automatically."
