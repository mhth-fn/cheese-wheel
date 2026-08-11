#!/bin/sh

set -eu
exec /usr/bin/ssh \
  -i /var/lib/cheese-wheel/awg-secondary-ssh \
  -o BatchMode=yes \
  -o ConnectTimeout=10 \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=/var/lib/cheese-wheel/awg-known-hosts \
  root@172.86.69.135 \
  "$@"
