# Production Reverse-Proxy Deployment Guide

When deploying FlareBase in production, it should be placed behind a high-performance reverse proxy (such as **Caddy**, **Traefik**, or **Nginx**) that handles TLS termination, request buffering, and rate limiting.

---

## 1. Critical Proxy Header Requirements

Because FlareBase provides real-time Server-Sent Events (`EventSource`) and WebSockets (`ws://` / `wss://`), your reverse proxy **must** be configured with the following rules:

1. **Disable Proxy Buffering for SSE (`/api/v1/db/realtime/*`, `/api/v1/events/*`)**:
   - Reverse proxies like Nginx buffer HTTP responses by default. This will delay or stall SSE events.
   - Set `X-Accel-Buffering: no` or `proxy_buffering off;`.
2. **WebSocket Upgrade Headers**:
   - Pass `Upgrade $http_upgrade;` and `Connection $connection_upgrade;`.
3. **Connection Timeouts**:
   - Set `proxy_read_timeout` to at least `3600s` (1 hour) to keep real-time listener streams alive without unexpected reconnect cycles.
4. **Preserve Client IP**:
   - Forward `X-Forwarded-For` and `X-Real-IP` so FlareBase's rate limiters, anti-spam heuristics, and IP perimeter locks function accurately.

---

## 2. Included Production Configurations

Ready-to-use production configurations are provided in the [`deploy/`](../deploy/) directory:

- **Caddy**: [`deploy/caddy/Caddyfile`](../deploy/caddy/Caddyfile) (Automatic Let's Encrypt SSL, zero-config HTTP/3)
- **Traefik**: [`deploy/traefik/docker-compose.yml`](../deploy/traefik/docker-compose.yml) (Cloud-native container routing with Let's Encrypt TLS)
- **Nginx**: [`deploy/nginx/flarebase.conf`](../deploy/nginx/flarebase.conf) (Standard battle-tested Nginx virtual host with SSE and WebSocket tuning)

---

## 3. Quick Reference Setup

### Option A: Caddy (Simplest, Automatic HTTPS)
```bash
# Edit domain in deploy/caddy/Caddyfile, then:
caddy run --config deploy/caddy/Caddyfile
```

### Option B: Traefik (Docker Environments)
```bash
cd deploy/traefik
docker-compose up -d
```

### Option C: Nginx (Ubuntu / Debian / RHEL)
```bash
sudo cp deploy/nginx/flarebase.conf /etc/nginx/sites-available/flarebase.conf
sudo ln -s /etc/nginx/sites-available/flarebase.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
