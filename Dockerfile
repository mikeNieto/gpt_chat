FROM node:20-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV HOME=/var/lib/copilot
ENV XDG_RUNTIME_DIR=/var/lib/copilot/.runtime
ENV DBUS_SESSION_BUS_ADDRESS=unix:path=/var/lib/copilot/.runtime/bus
ENV COPILOT_CLI_PATH=/usr/local/bin/copilot

RUN apt-get update \
	&& apt-get install -y --no-install-recommends dbus gnome-keyring \
	&& rm -rf /var/lib/apt/lists/* \
	&& npm install -g @github/copilot \
	&& mkdir -p /app/.data "$HOME" "$XDG_RUNTIME_DIR"

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]