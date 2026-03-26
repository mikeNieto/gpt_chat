#!/bin/sh

set -eu

export HOME="${HOME:-/var/lib/copilot}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-$HOME/.runtime}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"

mkdir -p "$HOME" "$XDG_RUNTIME_DIR" /app/.data
chmod 700 "$HOME" "$XDG_RUNTIME_DIR"

if [ ! -S "$XDG_RUNTIME_DIR/bus" ]; then
	dbus-daemon --session --address="$DBUS_SESSION_BUS_ADDRESS" --fork --nopidfile
fi

gnome-keyring-daemon --start --components=secrets >/dev/null 2>&1 || true

attempt=0
until dbus-send --session --dest=org.freedesktop.DBus --print-reply \
	/org/freedesktop/DBus org.freedesktop.DBus.ListNames 2>/dev/null | grep -q 'org.freedesktop.secrets'; do
	attempt=$((attempt + 1))
	if [ "$attempt" -ge 5 ]; then
		echo "Warning: org.freedesktop.secrets is not available; Copilot CLI may fall back to plain-text token storage." >&2
		break
	fi
	sleep 1
done

exec "$@"