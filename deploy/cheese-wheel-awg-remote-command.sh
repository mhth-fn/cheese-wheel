#!/bin/sh

set -efu
set -f

original_command="${SSH_ORIGINAL_COMMAND:-}"
reject_command() {
  printf 'Restricted AmneziaWG command rejected\n' >&2
  exit 1
}

if [ "$original_command" = 'status' ]; then
  exec /usr/local/sbin/cheese-wheel-awg-helper status
fi

set -- $original_command
[ "$#" -eq 2 ] || reject_command
case "$1" in
  create|delete) ;;
  *) reject_command ;;
esac

peer_id="$2"
case "$peer_id" in
  cw_*_[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]) ;;
  *) reject_command ;;
esac

user_id="${peer_id#cw_}"
user_id="${user_id%_*}"
case "$user_id" in
  ''|0|0*|*[!0-9]*) reject_command ;;
esac

exec /usr/local/sbin/cheese-wheel-awg-helper "$1" "$peer_id"
