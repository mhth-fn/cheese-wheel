#!/usr/bin/env bash

set -euo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077

AWG_INTERFACE="awg0"
AWG_CONFIG="/etc/amnezia/amneziawg/${AWG_INTERFACE}.conf"
AWG_LOCK="/run/cheese-wheel-${AWG_INTERFACE}.lock"
ACTION="${1:-}"
CLIENT_ID="${2:-}"

fail() {
  printf 'cheese-wheel-awg: %s\n' "$1" >&2
  exit 1
}

case "$ACTION" in
  status)
    [[ $# -eq 1 ]] || fail "status takes no client id"
    ;;
  create|delete)
    [[ $# -eq 2 ]] || fail "client id is required"
    [[ "$CLIENT_ID" =~ ^cw_[1-9][0-9]*_[a-f0-9]{16}$ ]] || fail "invalid client id"
    ;;
  *)
    fail "unsupported action"
    ;;
esac

[[ -f "$AWG_CONFIG" ]] || fail "server configuration not found"
command -v awg >/dev/null || fail "awg is not installed"
command -v flock >/dev/null || fail "flock is not installed"

exec 9>"$AWG_LOCK"
flock -x 9

read_interface_value() {
  local key="$1"
  awk -F '=' -v key="$key" '
    $1 ~ "^[[:space:]]*" key "[[:space:]]*$" {
      value=$2
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      print value
      exit
    }
  ' "$AWG_CONFIG"
}

read_server_address() {
  local family="$1"
  awk -F '=' -v family="$family" '
    $1 ~ /^[[:space:]]*Address[[:space:]]*$/ {
      count=split($2, addresses, ",")
      for (position=1; position<=count; position++) {
        value=addresses[position]
        gsub(/[[:space:]]/, "", value)
        sub(/\/.*/, "", value)
        if (family == "4" && value ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) {
          print value
          exit
        }
        if (family == "6" && value ~ /:/) {
          print value
          exit
        }
      }
    }
  ' "$AWG_CONFIG"
}

if [[ "$ACTION" == "status" ]]; then
  online=false
  if systemctl is-active --quiet "awg-quick@${AWG_INTERFACE}"; then
    online=true
  fi
  port="$(read_interface_value ListenPort)"
  [[ "$port" =~ ^[0-9]+$ ]] || port=0
  client_count=0
  if [[ "$online" == true ]]; then
    client_count="$(awg show "$AWG_INTERFACE" peers | awk 'NF { count++ } END { print count+0 }')"
  fi
  printf '{"success":true,"online":%s,"port":%s,"clientCount":%s}\n' \
    "$online" "$port" "$client_count"
  exit 0
fi

systemctl is-active --quiet "awg-quick@${AWG_INTERFACE}" \
  || fail "AmneziaWG interface is not active"

marker="# cheese-wheel:${CLIENT_ID}"

if [[ "$ACTION" == "delete" ]]; then
  if ! grep -Fqx "$marker" "$AWG_CONFIG"; then
    printf '{"success":true,"clientId":"%s","removed":false}\n' "$CLIENT_ID"
    exit 0
  fi

  public_key="$(awk -v marker="$marker" '
    $0 == marker { found=1; next }
    found && $0 ~ /^[[:space:]]*PublicKey[[:space:]]*=/ {
      value=$0
      sub(/^[^=]*=[[:space:]]*/, "", value)
      gsub(/[[:space:]]/, "", value)
      print value
      exit
    }
  ' "$AWG_CONFIG")"
  [[ "$public_key" =~ ^[A-Za-z0-9+/]{43}=$ ]] || fail "stored public key is invalid"

  task_dir="$(mktemp -d /run/cheese-wheel-awg-delete.XXXXXX)"
  case "$task_dir" in
    /run/cheese-wheel-awg-delete.*) ;;
    *) fail "unsafe temporary directory" ;;
  esac
  trap 'rm -rf -- "$task_dir"' EXIT
  cp -p "$AWG_CONFIG" "$task_dir/original.conf"
  awk -v marker="$marker" '
    $0 == marker { skipping=1; next }
    skipping && /^$/ { skipping=0; next }
    !skipping { print }
  ' "$AWG_CONFIG" > "$task_dir/updated.conf"

  install -m 600 "$task_dir/updated.conf" "$AWG_CONFIG"
  if ! awg set "$AWG_INTERFACE" peer "$public_key" remove; then
    install -m 600 "$task_dir/original.conf" "$AWG_CONFIG"
    fail "could not remove active peer"
  fi
  printf '{"success":true,"clientId":"%s","removed":true}\n' "$CLIENT_ID"
  exit 0
fi

grep -Fqx "$marker" "$AWG_CONFIG" && fail "client already exists"

server_ipv4="$(read_server_address 4)"
[[ "$server_ipv4" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || fail "invalid server IPv4"
ipv4_prefix="${server_ipv4%.*}"
client_suffix=""
for candidate in $(seq 2 254); do
  if ! grep -Fq "${ipv4_prefix}.${candidate}/32" "$AWG_CONFIG"; then
    client_suffix="$candidate"
    break
  fi
done
[[ -n "$client_suffix" ]] || fail "address pool is exhausted"

client_ipv4="${ipv4_prefix}.${client_suffix}"
server_ipv6="$(read_server_address 6)"
client_ipv6=""
if [[ -n "$server_ipv6" ]]; then
  ipv6_prefix="${server_ipv6%%::*}"
  [[ -n "$ipv6_prefix" ]] || fail "invalid server IPv6"
  client_ipv6="${ipv6_prefix}::${client_suffix}"
fi

listen_port="$(read_interface_value ListenPort)"
[[ "$listen_port" =~ ^[0-9]+$ ]] || fail "invalid listen port"
endpoint="$(ip -4 route get 1.1.1.1 | awk '
  { for (position=1; position<=NF; position++) if ($position == "src") { print $(position+1); exit } }
')"
[[ "$endpoint" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || fail "public endpoint not found"
server_public_key="$(awg show "$AWG_INTERFACE" public-key)"
[[ "$server_public_key" =~ ^[A-Za-z0-9+/]{43}=$ ]] || fail "invalid server public key"

jc="$(read_interface_value Jc)"
jmin="$(read_interface_value Jmin)"
jmax="$(read_interface_value Jmax)"
s1="$(read_interface_value S1)"
s2="$(read_interface_value S2)"
h1="$(read_interface_value H1)"
h2="$(read_interface_value H2)"
h3="$(read_interface_value H3)"
h4="$(read_interface_value H4)"
for value in "$jc" "$jmin" "$jmax" "$s1" "$s2" "$h1" "$h2" "$h3" "$h4"; do
  [[ "$value" =~ ^[0-9]+$ ]] || fail "invalid obfuscation parameters"
done

task_dir="$(mktemp -d /run/cheese-wheel-awg-create.XXXXXX)"
case "$task_dir" in
  /run/cheese-wheel-awg-create.*) ;;
  *) fail "unsafe temporary directory" ;;
esac
trap 'rm -rf -- "$task_dir"' EXIT

awg genkey > "$task_dir/private.key"
awg pubkey < "$task_dir/private.key" > "$task_dir/public.key"
awg genpsk > "$task_dir/psk.key"
client_private_key="$(tr -d '\r\n' < "$task_dir/private.key")"
client_public_key="$(tr -d '\r\n' < "$task_dir/public.key")"
preshared_key="$(tr -d '\r\n' < "$task_dir/psk.key")"

client_addresses="${client_ipv4}/32"
server_allowed_ips="${client_ipv4}/32"
if [[ -n "$client_ipv6" ]]; then
  client_addresses="${client_addresses},${client_ipv6}/128"
  server_allowed_ips="${server_allowed_ips},${client_ipv6}/128"
fi

printf '%s\n' \
  '[Interface]' \
  "PrivateKey = ${client_private_key}" \
  "Address = ${client_addresses}" \
  'DNS = 1.1.1.1,1.0.0.1' \
  "Jc = ${jc}" \
  "Jmin = ${jmin}" \
  "Jmax = ${jmax}" \
  "S1 = ${s1}" \
  "S2 = ${s2}" \
  "H1 = ${h1}" \
  "H2 = ${h2}" \
  "H3 = ${h3}" \
  "H4 = ${h4}" \
  '' \
  '[Peer]' \
  "PublicKey = ${server_public_key}" \
  "PresharedKey = ${preshared_key}" \
  "Endpoint = ${endpoint}:${listen_port}" \
  'AllowedIPs = 0.0.0.0/0,::/0' \
  'PersistentKeepalive = 25' \
  > "$task_dir/client.conf"

cp -p "$AWG_CONFIG" "$task_dir/original.conf"
cp -p "$AWG_CONFIG" "$task_dir/updated.conf"
printf '\n%s\n[Peer]\nPublicKey = %s\nPresharedKey = %s\nAllowedIPs = %s\n' \
  "$marker" "$client_public_key" "$preshared_key" "$server_allowed_ips" \
  >> "$task_dir/updated.conf"

install -m 600 "$task_dir/updated.conf" "$AWG_CONFIG"
if ! awg set "$AWG_INTERFACE" peer "$client_public_key" \
  preshared-key "$task_dir/psk.key" allowed-ips "$server_allowed_ips"; then
  install -m 600 "$task_dir/original.conf" "$AWG_CONFIG"
  fail "could not activate peer"
fi

config_base64="$(base64 -w 0 < "$task_dir/client.conf")"
printf '{"success":true,"clientId":"%s","address":"%s","configBase64":"%s"}\n' \
  "$CLIENT_ID" "$client_addresses" "$config_base64"
