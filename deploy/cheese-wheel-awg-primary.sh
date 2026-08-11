#!/bin/sh

set -eu
exec /usr/bin/sudo -n /usr/local/sbin/cheese-wheel-awg-helper "$@"
