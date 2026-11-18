#!/bin/sh
# The container starts as root only to make sure the persistent SQLite volume
# is writable. It immediately drops privileges to the unprivileged `bun` user.
set -eu

if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown -R bun:bun /data
  exec setpriv --reuid=bun --regid=bun --clear-groups "$@"
fi

exec "$@"
