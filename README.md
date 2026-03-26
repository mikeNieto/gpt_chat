# gpt_chat

Private ChatGPT-style web client for personal intranet use, built with Next.js and the GitHub Copilot SDK.

## What Is Implemented

- Chat-only experience with ChatGPT-like layout
- Bilingual UI in English and Spanish
- Sidebar with conversation history
- Settings page for:
  - default model selection
  - model cost multipliers such as `3x`, `1x`, `0.25x`
  - GitHub Copilot credential storage
- Secure credential storage using application-layer encryption
- Local persistence for chats, settings, and runtime diagnostics
- Native Copilot SDK infinite sessions with auto-compaction:
  - background compaction at `60%`
  - blocking compaction at `95%`

## Runtime Requirements

- Node.js 18+
- GitHub Copilot CLI installed and available in `PATH`, unless you will only use an explicit GitHub token
- A valid GitHub Copilot-compatible token or an authenticated Copilot CLI session
- A `MASTER_ENCRYPTION_KEY` for secure credential storage

## Environment

Copy the example values into a local environment file:

```bash
cp .env.example .env.local
```

Set at least:

```bash
MASTER_ENCRYPTION_KEY=
```

`MASTER_ENCRYPTION_KEY` must be either:

- 32 bytes encoded as base64
- 64 hex characters

Example generation:

```bash
openssl rand -base64 32
```

Optional:

```bash
COPILOT_CLI_PATH=
```

Use `COPILOT_CLI_PATH` only if the `copilot` binary is not already discoverable in `PATH`.

## Local Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Run the development server over HTTPS with a local self-signed certificate:

```bash
npm run dev:https
```

The HTTPS script writes the generated certificate and key under `.data/tls/`.
Your browser will show a warning unless you replace them with a trusted certificate.
If you open the app from another machine on your LAN, include that hostname or IP in `TLS_HOSTS`
before generating the certificate.

Validation commands:

```bash
npm run lint
npm run typecheck
npm run build
```

## Docker Compose

The production deployment now uses two containers:

- `gpt_chat` for the Next.js app on internal HTTP
- `nginx` for TLS termination and reverse proxy on ports `80` and `443`

The app container installs GitHub Copilot CLI inside the image and uses a
dedicated Docker volume to persist the CLI home directory.

It also starts a lightweight Linux secrets stack inside the container:

- `dbus-daemon`
- `gnome-keyring-daemon`

That gives Copilot CLI a Secret Service-compatible vault instead of forcing it
to fall back to plain-text token storage.

Current app container defaults:

- `COPILOT_CLI_PATH=/usr/local/bin/copilot`
- `HOME=/var/lib/copilot`
- `XDG_RUNTIME_DIR=/var/lib/copilot/.runtime`
- `DBUS_SESSION_BUS_ADDRESS=unix:path=/var/lib/copilot/.runtime/bus`
- named volume `copilot_cli_home` mounted at `/var/lib/copilot`

Build and start the stack:

```bash
docker compose up -d --build
```

Open the app at:

```text
https://localhost
```

Nginx expects a certificate and key inside:

```text
.data/nginx/certs/server.crt
.data/nginx/certs/server.key
```

You can change the mounted host directory with:

```bash
NGINX_CERTS_DIR=./.data/nginx/certs
```

### Important Limitation

Nginx does not make certificates trusted by itself.

To avoid the browser warning completely, the certificate presented by Nginx must be trusted by
the client device. For a home server on a private IP like `192.168.2.200`:

- a public CA normally will not issue a certificate for that private IP
- a self-signed certificate will still show as insecure
- a local CA such as `mkcert` works if you install that CA on each device
- a public certificate works if you use a real domain that resolves to your server

### Recommended Options

Option 1: local trusted CA with `mkcert`

```bash
mkdir -p .data/nginx/certs
mkcert -cert-file .data/nginx/certs/server.crt \
  -key-file .data/nginx/certs/server.key \
  localhost 127.0.0.1 192.168.2.200 gpt_chat
docker compose up -d --build
```

Option 2: real domain + CA-issued certificate

Use a domain name that points to your server and place the CA-issued files at:

```text
.data/nginx/certs/server.crt
.data/nginx/certs/server.key
```

### Why This Is Better Than App-Level HTTPS

- TLS is terminated in Nginx, which is the right place operationally
- the Next.js container stays simpler and serves plain HTTP internally
- replacing certificates no longer requires changing app startup logic
- you can later add redirects, HSTS, auth, or rate limiting in one place

### Use Your Own TLS Certificate

If you already have a trusted certificate, place it in the mounted certs directory:

```bash
mkdir -p .data/nginx/certs
# copy your certificate to .data/nginx/certs/server.crt
# copy your private key to .data/nginx/certs/server.key
```

Then start:

```bash
docker compose up -d --build
```

### Authenticate Copilot CLI Inside the Running Container

If you are not storing a GitHub token in the app settings, the application will
use the authenticated Copilot CLI session from inside the container.

1. Connect to the running container:

```bash
docker compose exec gpt_chat sh
```

2. Start the CLI:

```bash
copilot
```

3. Inside the interactive CLI, run:

```text
/login
```

4. Complete the GitHub authentication flow shown by the CLI.
5. Exit the CLI, then exit the shell:

```bash
exit
```

Because the CLI home directory is stored in the `copilot_cli_home` volume and
the container provides a Linux keyring service, the login should remain
available after container restarts or recreations without using plain-text
config storage.

### Validate the Session Later

Reconnect to the container:

```bash
docker compose exec gpt_chat sh
```

Then run:

```bash
copilot
```

If the CLI opens without asking you to authenticate again, the persisted session
is still valid.

### Verify That The Keyring Service Is Running

From inside the container, you can verify that the Secret Service name is
registered on D-Bus:

```bash
dbus-send --session --dest=org.freedesktop.DBus --print-reply \
  /org/freedesktop/DBus org.freedesktop.DBus.ListNames | grep org.freedesktop.secrets
```

If you see `org.freedesktop.secrets` in the output, the keyring service is
available for Copilot CLI.

### Alternative: Authenticate With a Token

The Copilot CLI also supports authentication through `GH_TOKEN` or
`GITHUB_TOKEN`. According to the GitHub Copilot CLI documentation, the token must
have the `Copilot Requests` permission enabled.

This project can already use a stored GitHub token from the Settings screen. If
that token exists, it takes precedence over the CLI login.

## Credential Modes

The app supports two runtime modes:

1. Stored token from Settings
2. Existing `copilot` CLI login on the host machine
3. Existing `copilot` CLI login persisted inside the Docker container volume

If a stored token exists, it takes precedence.

## Persistence

This MVP uses local file-backed persistence under `.data/` for simplicity in a personal intranet deployment.

Stored locally:

- chat threads
- chat messages
- UI settings
- encrypted GitHub token
- compaction diagnostics

## Auto-Compaction

The chat sessions use the GitHub Copilot SDK native infinite session support.

Configured thresholds:

- `backgroundCompactionThreshold: 0.60`
- `bufferExhaustionThreshold: 0.95`

The app also captures:

- `session.compaction_start`
- `session.compaction_complete`

These are stored as local diagnostics for troubleshooting.

## Notes

- The GitHub Copilot SDK is currently in Technical Preview.
- This project intentionally disables tools and agent-like behavior to stay in chat-only mode.
- The current persistence layer is intentionally simple and can be replaced later with SQLite or Postgres if needed.
- For Docker-based production deployments that rely on CLI login, you must complete `copilot` authentication inside the running container at least once.
- If the keyring service fails to initialize, Copilot CLI may still offer the plain-text storage fallback. In that case, prefer the app's encrypted stored token mode.
