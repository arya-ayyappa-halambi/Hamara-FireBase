# AegisDB 🛡️

AegisDB is a lightweight, zero-configuration, production-grade Firebase-like Backend-as-a-Service (BaaS) engine. It is fully self-hosted, extremely performant, and provides developers with a full suite of cloud services straight out of the box—complete with a modern, glassmorphic developer console featuring a Mac-style collapsible sidebar.

![AegisDB Engine](https://img.shields.io/badge/AegisDB-Engine-6366f1?style=for-the-badge&logo=shield&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3.0-003b57?style=for-the-badge&logo=sqlite&logoColor=white)
![OAuth 2.0](https://img.shields.io/badge/OAuth_2.0-Google_|_Apple_|_GitHub-2496ed?style=for-the-badge&logo=google&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=for-the-badge&logo=docker&logoColor=white)

---

## 1. What is AegisDB & Its Purpose?

**AegisDB** was created to bridge the gap between heavy enterprise cloud providers (like AWS, GCP, Firebase) and the need for localized, hyper-fast, secure, and privacy-respecting self-hosted databases.

**Purpose:** To give developers a "Firebase in a box." You can run AegisDB on a single server, a Raspberry Pi, or a massive cloud VM instance, and instantly get:
- A document-oriented NoSQL interface backed by the blistering speed of SQLite WAL-mode.
- Real-time data sync using WebSockets and Server-Sent Events (SSE).
- Multi-provider authentication (Email/Password, Google OAuth2, Apple Sign-In, GitHub OAuth).
- Fine-grained Project-Isolated Access Control and enterprise-level Public Registration Policies.
- File storage and object management with magic byte validation.
- Complete identity, access management, and Time-Based One-Time Password (TOTP) Multi-Factor Authentication (MFA).

**How it works:** AegisDB uses a lightweight Node.js/Express backend with TypeScript, coupled with a highly tuned SQLite WAL-mode database (Write-Ahead Logging). This allows ultra-fast concurrent reads and serialized writes. The frontend is a zero-build-step Vanilla JS Single Page Application (SPA) styled with Tailwind CSS, meaning it loads instantly without requiring heavy frameworks or compilation pipelines.

---

## 2. Comprehensive Security Architecture

AegisDB is built with a "security-first, zero-trust" philosophy. Every layer of the application is hardened against modern web threats.

### Cryptography & Data Protection
- **Two-Tier Envelope Encryption (DEK/KEK):** At-rest data is encrypted using a Master Key Encryption Key (KEK) derived via HKDF-SHA256. This master key wraps per-project Data Encryption Keys (DEKs). Field-level data inside your database is encrypted using AES-256-GCM authenticated encryption. This means that even if a bad actor steals your `.sqlite` file, all sensitive fields are entirely unreadable without the KEK.
- **Non-Destructive Key Rotation:** Administrators can rotate encryption keys seamlessly. Because of the DEK/KEK envelope architecture, rotating the Master Key does not require decrypting and re-encrypting the entire database.
- **Asymmetric RS256 JWKS Token Signing:** All JWT session tokens are signed using an RSA-2048 bit private key. The public keys are exposed via a standard `/.well-known/jwks.json` endpoint, allowing external microservices to cryptographically verify AegisDB tokens without contacting the database directly.

### VM Sandbox Security Rules
- **Execution Isolation:** Collection access is governed by JavaScript security rules executed inside a secure Node.js `vm2` sandbox.
- **Validation:** Developers can write custom JS functions (e.g., `if (data.age < 18) throw new Error("Too young")`) that AegisDB executes in an isolated thread. The `vm2` module strips out dangerous Node.js globals (like `process`, `fs`, `require`), preventing arbitrary remote code execution (RCE) while still allowing deeply complex, custom business logic to validate incoming requests.

### Threat Mitigations
- **15-Minute Brute-Force Lockout:** The system tracks consecutive failed logins by both IP address and Email pairs. Exactly 5 failed attempts trigger an automatic, unbypassable 15-minute HTTP 429 lockout.
- **Inactivity Session Timeout:** Users can configure their console session to automatically terminate after 5m, 15m, 30m, or 60m of mouse/keyboard inactivity. This ensures open browser tabs don't compromise security.
- **Strict Content Security Policy (CSP):** XSS attacks are mitigated via a strict CSP header that restricts scripts, styles, and fonts to trusted CDN origins (like `cdnjs.cloudflare.com` and `cdn.jsdelivr.net`) and completely blocks inline script execution.
- **Dynamic Rate Limiting:** Super Admins can adjust the rate-limiting windows (e.g., Auth endpoints vs. API endpoints) dynamically from the UI without restarting the server.
- **Real-Time Account Moderation & Anomaly Flag Appeals:** Manually flagged accounts dynamically generate synthetic security notices (`flag_${userId}`) that trigger top alert banners, header notification bell counters, and dedicated appeal options in the User Security & Compliance Console.

---

## 3. Project-Isolated Authenticator & OAuth 2.0 Engine

AegisDB features an enterprise-grade, per-project **Authenticator Hub** enabling isolated identity management, multi-provider OAuth, and configurable provisioning policies for every project independently.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATOR TAB                               │
│  Configuring Project: [ Campus Asthra V2 ▾ ]    [ Save Auth Settings ] │
├────────────────────────────────────────────────────────────────────────┤
│  🛡️ Public User Registration                         [ Toggle: ON/OFF ]│
│  Allow self-signup (Open SaaS) vs. Admin-Only Provisioning (Enterprise)│
├────────────────────────────────────────────────────────────────────────┤
│  📧 Email & Password        [✓ Enabled]                                │
│  🌐 Google OAuth2           [✓ Enabled]   Client ID: [•••••••••••• 👁️] │
│  🍏 Apple Sign In           [  Disabled]  Service ID: [            👁️] │
│  🐙 GitHub OAuth            [  Disabled]  Client ID: [             👁️] │
└────────────────────────────────────────────────────────────────────────┘
```

### Supported Identity Providers
1. **Email & Password**: Argon2id salted and hashed passwords with rate-limiting and anti-enumeration protections.
2. **Google OAuth 2.0**: Dual-mode verification supporting Google Identity Services (GIS) ID Tokens via `google-auth-library` and OAuth2 Bearer Access Tokens via `googleapis.com/oauth2/v3/userinfo`.
3. **Apple Sign In**: Validates Apple Identity JWT tokens against Apple's live public JWKS keysets (`appleid.apple.com/auth/keys`).
4. **GitHub OAuth**: Authenticates GitHub access tokens directly with the GitHub API (`api.github.com/user`).

### Key Authenticator Capabilities
- **Zero-Configuration Lockout**: If an OAuth Client ID is empty or cleared in the dashboard, AegisDB automatically disables that provider on both client discovery (`GET /api/v1/project-auth/config`) and server-side verification (`POST /api/v1/project-auth/oauth/:provider` returns `HTTP 403 Forbidden`).
- **Secret Visibility Eye Toggles**: All sensitive Client ID and secret fields in the Authenticator tab feature built-in eye toggle buttons for effortless inspection and copying.
- **Complete Project Isolation**: Toggling settings or changing credentials in one project has zero effect on other projects. Every project maintains its own isolated database configuration.
- **Enterprise Registration Policy (Admin-Only vs. Open Mode)**:
  - **Open Mode (`allowPublicRegistration = true`)**: Ideal for commercial SaaS products. New users can self-register or sign in via Google/Apple/GitHub, and AegisDB dynamically creates their distinct account.
  - **Admin-Only Mode (`allowPublicRegistration = false`)**: Ideal for enterprise portals, universities, and private intranets. Only accounts pre-registered by administrators in `project_users` are permitted to log in. Un-provisioned OAuth sign-in attempts are rejected with `HTTP 403 Forbidden: Account not found. New user registration is restricted to administrators.`

---

## 4. UI & Frontend Capabilities (The Glassmorphic Console)

The AegisDB frontend was engineered to feel like a premium, native desktop application.

- **Mac-Style Auto-Expanding Sidebar:** The primary navigation uses a collapsible sidebar. When collapsed, hovering over it triggers a fluid, Mac-OS-style width expansion, allowing rapid navigation without permanently taking up horizontal screen real estate.
- **Premium Glassmorphism:** The entire UI utilizes backdrop-filters, subtle borders, and deep gradients to create a modern, translucent "glass" aesthetic.
- **FontAwesome Iconography:** Clean, scalable FontAwesome SVG icons ensure visual consistency across operating systems.
- **Responsive Toast Notifications:** Real-time feedback is provided via non-blocking, sliding toast notifications for both successes and errors.
- **Live Scope Switcher:** Seamlessly switch between Super Admin global management and Project Developer workspaces in one click.

---

## 5. Feature Breakdown: User (Developer) vs. Super Admin

### User (Project Developer) Features
*Standard users operate strictly within isolated projects. They do not have access to global infrastructure.*
- **Project Management:** Create multiple independent databases under a single user account.
- **Authenticator Hub:** Manage identity providers, OAuth client IDs, and registration policies per project.
- **API Keys & Scopes:** Generate API keys linked specifically to individual projects.
- **Interactive API Key Tester:** A built-in Postman-like REST client right inside the console. Developers can select an API Key, choose a method (GET/POST), enter a JSON payload, and fire live requests against their database.
- **Advanced Data Browser:** 
  - **Pagination:** Handles massive datasets efficiently with built-in client-side pagination (displays 100 documents per page seamlessly).
  - **Filtering:** Instant search bar filters the current data view, rendering specific JSON keys immediately.
  - **Clipboard Integration:** Developers can click a single button to copy raw JSON payloads of any document.
- **Storage Vault:** Upload and manage binary assets (images, PDFs) with pluggable storage drivers (Local Disk, AWS S3, Cloudflare R2).
- **Secure Password Recovery:** Automated SMTP email recovery flow with cryptographically secure, time-limited reset links.

### Super Admin Features
*The global overseer of the entire AegisDB instance.*
- **Live Infrastructure Telemetry:** A real-time dashboard powered by `Chart.js` polling `/api/v1/admin/stats`. Displays live CPU usage, V8 Memory Heap allocation, active WebSocket connections, and SQLite WAL query latency.
- **Rate Limit Governance:** Adjust the global request throttles to defend against DDoS or traffic spikes.
- **Global Security Auditing:** Access system-wide logs, encryption statuses, and MFA compliance metrics across all users.
- **Emergency CLI Password Reset:** Admins locked out of the UI can regain access directly from the server terminal via the `npm run reset-admin` command.

---

## 6. TOTP Multi-Factor Authentication (MFA) Manual

AegisDB strictly adheres to the RFC 6238 HMAC-SHA1 protocol for Time-Based One-Time Passwords (TOTP).

### How to Enable TOTP
1. Log into your account and navigate to **Settings > Security**.
2. Click **Setup MFA**.
3. AegisDB will cryptographically generate a unique `Base32` secret specifically for your account.
4. Scan the QR code using Google Authenticator, Authy, or Apple Passwords.
5. Enter the 6-digit pin generated by your app into the verification box.
6. Your account is now secured. All future logins will require both your password and a live 6-digit pin.

### Dual Verification Lock
For sensitive account actions, AegisDB enforces a Dual Verification Lock:
- **Disabling MFA:** Requires current account password *and* a live 6-digit TOTP code.
- **Changing Passwords:** Requires current password *and* live TOTP pin.

---

## 7. Dual-Target Disaster Recovery & Backup System

AegisDB includes a fully automated, cryptographically secure Dual-Target Backup engine to ensure absolute data durability.

- **Atomic SQLite Snapshots:** Utilizes SQLite's Online Backup API to safely capture point-in-time snapshots without read/write downtime.
- **Local File System Backups:** Saves heavily compressed `.sqlite3.bak` files directly to the local server.
- **AWS S3 Cloud Backups:** Seamlessly streams multipart upload backups to remote Amazon S3 buckets.
- **Environment & Credential Embedding:** Crucial `.env` secrets (like `JWT_SECRET` and `EMAIL_HASH_PEPPER`) are automatically encrypted using the master `ENCRYPTION_KEY` and embedded securely into the backup file.
- **Generation ID Tracking:** Every backup snapshot is tagged with a unique timestamp-based Generation ID.
- **Automated Backup Cleanup & Retention:** Old backups are automatically pruned based on the configurable retention window.

---

## 8. AegisDB Operations Manual

### Booting the Server
To start the AegisDB engine locally:
```bash
npm install
npm run dev
```
Open your browser to `http://localhost:3000`.

### Initial Setup
1. On the login screen, click **Register Account** to create your first user. The first user is automatically granted Super Admin privileges.
2. Follow the TOTP manual above to secure the root account.

### Admin Password Recovery
If the Super Admin loses their password, force a reset directly from the server CLI:
```bash
npm run reset-admin
```
This safely resets the Super Admin password to `admin123`.

---

## 📚 API Endpoint Registry

### Public Infrastructure & Metrics
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/.well-known/jwks.json` | Public RSA 2048-bit JWK Set for RS256 token verification |
| `GET` | `/metrics` | Prometheus exposition metrics endpoint |
| `GET` | `/health` | Engine health check & status |

### Authentication & Account (`/api/v1/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/register` | Register new user account |
| `POST` | `/login` | Authenticate user & receive JWT access + refresh tokens |
| `POST` | `/refresh` | Rotate refresh token & obtain new JWT |
| `POST` | `/logout` | Revoke refresh token |
| `PATCH` | `/profile` | Update user profile name |
| `POST` | `/change-password` | Update account password (requires TOTP verification if MFA enabled) |
| `POST` | `/forgot-password` | Request password reset email (Anti-enumeration enabled) |
| `POST` | `/reset-password` | Execute password reset via email JWT token |
| `POST` | `/mfa/setup` | Generate Base32 secret key & `otpauth://` QR URI |
| `POST` | `/mfa/verify` | Verify 6-digit TOTP code and enable MFA on profile |
| `POST` | `/mfa/disable` | Disable TOTP MFA (requires password + 6-digit TOTP verification) |
| `GET` | `/me` | Sync real-time user profile, security flags (`isFlagged`) & account status |
| `GET` | `/active-notice` | Fetch active compliance violation notice or synthetic flag notice |
| `POST` | `/notice-explanation` | Submit user explanation or appeal for active notice / flag |

### Project User Authentication & OAuth (`/api/v1/project-auth`)
*Requires `x-aegis-api-key` header.*
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/config` | Get public sanitized auth config (enabled providers & client IDs) |
| `POST` | `/register` | Register a new end-user for a specific project (Subject to Public Registration Policy) |
| `POST` | `/login` | Authenticate project end-user via Email/Password |
| `POST` | `/oauth/:provider` | Authenticate user via OAuth (`google`, `apple`, `github`) |

### Database Services (`/api/v1/db`)
*Requires `x-aegis-api-key` header or Bearer JWT token.*
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/collections` | Register collection with JSON Schema & Rules |
| `GET` | `/collections` | List project collections |
| `POST` | `/collections/:name/documents` | Insert JSON document (auto-creates collection) |
| `GET` | `/collections/:name/documents` | Query documents with limit, offset & filters |
| `GET` | `/collections/:name/documents/:id` | Fetch document by ID |
| `PATCH` | `/collections/:name/documents/:id` | Merge update JSON document |
| `DELETE` | `/collections/:name/documents/:id` | Delete document |
| `GET` | `/collections/:name/realtime` | SSE Change Data Capture (CDC) stream |

### Storage Services (`/api/v1/storage`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/upload` | Multipart file upload with magic byte inspection |
| `POST` | `/signed-url` | Generate pre-signed asset download URL |
| `GET` | `/assets/:storedName` | Download/stream stored file asset |

---

## 🛡️ Security Threat Matrix & Mitigations

| Threat Vector | Mitigation Strategy | Implementation Details |
| :--- | :--- | :--- |
| **Brute-Force Attacks** | 15-Minute Failed Login Lockout | Enforces temporary `429` lockout after 5 consecutive failed attempts per IP:Email. |
| **Credential Theft** | Pure RFC 6238 TOTP MFA | 6-digit time-based authenticator code required during login. |
| **Unauthorized MFA Disable** | Dual Verification Lock | Disabling TOTP MFA requires entering both current password + valid 6-digit TOTP code. |
| **Password Tampering** | Mandatory TOTP Password Change | Password changes strictly require TOTP code validation if MFA is enabled. |
| **Database Data Leak** | Two-Tier Envelope Encryption | AES-256-GCM field encryption with HKDF Master KEK wrapping 256-bit project DEKs. |
| **Key Compromise** | Non-Destructive Key Rotation | Re-wraps project DEKs with new keys without corrupting encrypted field data. |
| **PII Data Leak (Emails)** | Blind Indexing & HMAC-SHA256 | Emails are normalized, encrypted with AES-GCM at rest, and queries use a server-side peppered HMAC-SHA256 hash. |
| **Cascading Data Loss** | Safe Migration Transactions | Enforces `PRAGMA foreign-keys = OFF` during schema migrations to prevent unintended cascading deletes. |
| **Cross-Site Scripting (XSS)** | Helmet Security Headers | Strict Content Security Policy and HTTP headers restricting script, style, and font sources. |
| **HTTP Parameter Pollution** | HPP Middleware | Protects against parameter pollution attacks by safely parsing duplicate query strings. |
| **SQL Injection** | Strict Regex & Parameterization | Collection names sanitized with `/^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/` and parameterized SQL. |
| **Client Data Harvesting** | Strict Project Auth Isolation | Admin-level project endpoints are completely isolated and require a backend Service Role Key or Dashboard Owner JWT. |
| **Zero-Config OAuth Bypasses** | Dynamic Client ID Invalidation | Clearing an OAuth Client ID strictly disables authentication at client discovery and server verification layers. |

---

## 🤖 AI Agent & Developer Context Manual

This section provides context and prompts for developers and **AI Agents** (like GitHub Copilot, Gemini, Claude, Cursor) when connecting an application to AegisDB.

### 🧠 Context for AI Agents
When connecting a frontend or mobile application to AegisDB:
1. **Architecture**: AegisDB is a RESTful API and WebSocket backend. Standard `fetch()` or `axios` calls work directly.
2. **API Key & Headers**: Pass the Project API Key in the `x-aegis-api-key` HTTP header.
3. **Live Auth Discovery**: Fetch `GET /api/v1/project-auth/config` with `x-aegis-api-key` to dynamically inspect which identity providers are enabled for the connected project.
4. **Data Operations**: Insert documents via `POST /api/v1/db/collections/<name>/documents`, query via `GET /api/v1/db/collections/<name>/documents`.
5. **File Uploads**: Use `FormData` with field `file` sent to `POST /api/v1/storage/upload`.

### 📡 Standard API Fetch Wrapper Example
```javascript
async function aegisFetch(endpoint, method = 'GET', body = null) {
  const apiKey = localStorage.getItem('aegisApiKey') || 'YOUR_PROJECT_API_KEY';
  const headers = { 'x-aegis-api-key': apiKey };
  const options = { method, headers };

  if (body) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const response = await fetch(`http://localhost:3000/api/v1${endpoint}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'AegisDB Request Failed');
  return data;
}
```

---

---

## 9. ⚖️ Traffic Control, Management & High-Availability Load Balancing

AegisDB provides enterprise-grade traffic governance, algorithmic rate limiting, and horizontal load balancing architectures designed to handle millions of requests with sub-millisecond response times.

```
                            ┌─────────────────────────────────────────┐
                            │    Incoming Traffic (HTTPS / WSS)       │
                            └────────────────────┬────────────────────┘
                                                 │
                                                 ▼
                            ┌─────────────────────────────────────────┐
                            │      Layer 7 Load Balancer / Proxy      │
                            │      (Nginx / Caddy / Cloudflare)       │
                            │   • Round-Robin / Least-Connections     │
                            │   • WebSocket Sticky Sessions (ip_hash) │
                            │   • SSL/TLS Termination                 │
                            └────────┬──────────────────────┬─────────┘
                                     │                      │
                   ┌─────────────────┴────────┐   ┌─────────┴────────────────┐
                   ▼                          ▼   ▼                          ▼
        ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
        │  AegisDB Worker #1   │   │  AegisDB Worker #2   │   │  AegisDB Worker #N   │
        │ • Token Bucket Thrott│   │ • Token Bucket Thrott│   │ • Token Bucket Thrott│
        │ • VM Sandbox Engine  │   │ • VM Sandbox Engine  │   │ • VM Sandbox Engine  │
        │ • JWT / JWKS Auth    │   │ • JWT / JWKS Auth    │   │ • JWT / JWKS Auth    │
        └──────────┬───────────┘   └──────────┬───────────┘   └──────────┬───────────┘
                   │                          │                          │
                   └──────────────────────────┼──────────────────────────┘
                                              │
                                              ▼
                            ┌─────────────────────────────────────────┐
                            │     High-Performance Storage Engine     │
                            │   • SQLite Write-Ahead Logging (WAL)    │
                            │   • Parallel Non-Blocking Reads         │
                            │   • Serialized Microsecond Writes       │
                            │   • PRAGMA busy_timeout = 5000ms        │
                            └─────────────────────────────────────────┘
```

### 🚦 Algorithmic Token Bucket Rate Limiting
AegisDB implements continuous token bucket mechanics (`src/services/rate-limiter.service.ts`) to prevent DDoS attacks, API abuse, and credential stuffing.
- **Dual-Tier Throttling**:
  - **Auth Tier (`authLimit`)**: Enforces tight throttles on login, registration, and MFA endpoints (e.g. 10 requests per 15 minutes).
  - **API Tier (`apiLimit`)**: Optimized for high-throughput database queries and file asset streaming (e.g. 120+ requests per minute).
- **Dynamic Runtime Reconfiguration**: Super Admins can adjust rate limits on-the-fly via the Developer Console or via `PATCH /api/v1/admin/rate-limits` without restarting the server.
- **Standardized RFC HTTP Headers**: Every response returns live rate limit metadata:
  ```http
  X-RateLimit-Limit: 120
  X-RateLimit-Remaining: 118
  X-RateLimit-Reset: 1786789200
  Retry-After: 12 (When 429 Too Many Requests is triggered)
  ```
- **Real-Time Prometheus Telemetry**: Exposes live rate limit hit gauges and counters at `GET /metrics`.

---

### 🌐 High-Availability Load Balancing Architectures

#### 1. Nginx Load Balancer with WebSocket Sticky Sessions
For multi-instance deployments, use Nginx with `least_conn` algorithm and `ip_hash` to ensure real-time WebSockets and SSE streams remain sticky to the same worker:

```nginx
upstream aegisdb_cluster {
    least_conn;
    ip_hash; # Sticky sessions for real-time WebSockets & SSE
    server 127.0.0.1:3000 max_fails=3 fail_timeout=10s;
    server 127.0.0.1:3001 max_fails=3 fail_timeout=10s;
    server 127.0.0.1:3002 max_fails=3 fail_timeout=10s;
}

server {
    listen 80;
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # Health check for automated failover
    location /health {
        proxy_pass http://aegisdb_cluster/health;
        proxy_next_upstream error timeout http_500 http_502 http_503;
    }

    # API & Dashboard Routing
    location / {
        proxy_pass http://aegisdb_cluster;
        proxy_http_version 1.1;

        # WebSocket & SSE upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for persistent WebSockets
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

#### 2. Caddy High-Availability Load Balancer
Caddy provides automated HTTPS, active health checking, and reverse proxy load balancing out-of-the-box:

```caddy
api.yourdomain.com {
    reverse_proxy 127.0.0.1:3000 127.0.0.1:3001 127.0.0.1:3002 {
        lb_policy least_conn
        health_uri /health
        health_interval 5s
        health_timeout 2s
    }
}
```

#### 3. PM2 Zero-Downtime Cluster Mode
To utilize all available CPU cores on a single high-spec server:
```bash
# Start AegisDB in cluster mode across all CPU cores
pm2 start dist/server.js -i max --name aegisdb

# Zero-downtime rolling reload during updates
pm2 reload aegisdb
```

---

### ⚡ SQLite High-Concurrency Engine
AegisDB leverages SQLite's Write-Ahead Logging (WAL) architecture:
- **Unlimited Parallel Readers**: Read operations (`GET /documents`) do not block other readers or writers.
- **Serialized Microsecond Writes**: Write operations (`POST/PATCH/DELETE`) execute in sub-millisecond transactions.
- **Busy Timeout Queuing**: Configured with `PRAGMA busy_timeout = 5000;` so simultaneous requests gracefully queue and resolve without throw-and-fail locking.

---

## 10. ⚖️ Data Privacy Compliance: Right to Erasure & Data Portability

AegisDB is architected to comply with global privacy regulations including **GDPR (Articles 17 & 20)**, **CCPA/CPRA (§ 1798.105 & § 1798.130)**, and **India's DPDP Act 2023 (§ 12)**.

```
┌────────────────────────────────────────────────────────────────────────┐
│             TWO-TIER RIGHT TO ERASURE (GDPR ART. 17)                   │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Mandatory Identity Verification (Password + TOTP code check)        │
│ 2. GDPR Art. 20 Data Portability (Download JSON data export)          │
│ 3. Cascading Cryptographic Shredding:                                  │
│    • Purge user from SQLite ('users' / 'project_users')                │
│    • Invalidate all active JWT sessions ('refresh_tokens')             │
│    • Destroy project Data Encryption Keys (DEKs) in 'project_keys'     │
│    • Wipe collections, documents, uploaded assets, and webhooks        │
│ 4. Anonymized Audit Tombstone:                                         │
│    • Records compliance proof with zero PII retained in 'audit_logs'   │
└────────────────────────────────────────────────────────────────────────┘
```

### 📦 GDPR Article 20 / CCPA Data Portability
Users can download a structured, portable JSON bundle containing their complete account metadata and associated documents:
### 🗑️ 7-Day Cooling-Off Grace Period & Right to Erasure ("Right to be Forgotten")

In compliance with GDPR Art. 17 and user protection best practices against accidental data loss or ransomware attacks, account deletion uses a **7-Day Cooling-Off Grace Period**:

```
[ User Initiates Deletion ] ──► Status: pending_deletion ──► [ 7-Day Grace Period Window ]
                                                                       │
                         ┌─────────────────────────────────────────────┴─────────────────────────────────────────────┐
                         ▼                                                                                           ▼
         [ User / Super Admin Retains Account ]                                                    [ Grace Period Expires (7 Days) ]
                         │                                                                                           │
                         ▼                                                                                           ▼
          • POST /api/v1/auth/cancel-deletion                                                        • Scheduled Background Purge Daemon
          • POST /api/v1/admin/account-deletions/:id/cancel                                          • Permanent cryptographic shredding
          • Status restored to 'active'                                                              • Zero-PII Audit Tombstone recorded
```

1. **Initiate Deletion (7-Day Countdown)**:
   - **Developer Account**: `DELETE /api/v1/auth/account`
     - Body: `{ "password": "...", "totpCode": "123456" }`
     - Transitions account to `status: 'pending_deletion'` with a 7-day timer (`scheduledDeletionAt`).
   - **Project End-User**: `DELETE /api/v1/project-auth/account`
     - Body: `{ "password": "..." }`
     - Transitions project user to `pending_deletion` with a 7-day timer.

2. **User Self-Service Cancellation & Restoration**:
   - Signing in during the 7-day window displays an urgent recovery banner showing remaining days.
   - **Developer Account**: `POST /api/v1/auth/cancel-deletion` restores status to `'active'`.
   - **Project End-User**: `POST /api/v1/project-auth/cancel-deletion` restores status to `'active'`.

3. **Super Admin Retention Audit & Controls**:
   - Super Admins can monitor all active, cancelled, and purged deletion requests in the console:
     - `GET /api/v1/admin/account-deletions`
   - Super Admins can retain accounts upon verified user ticket requests:
     - `POST /api/v1/admin/account-deletions/:id/cancel`
   - *Security Guard*: Manual immediate deletion options are strictly disabled for Super Admins to protect against accidental catastrophic administrative mistakes.

4. **Automated Background Purge Daemon**:
   - A background scheduler periodically scans for expired deletion requests (`scheduledDeletionAt <= NOW`).
   - Executes permanent cascading disk shredding, DB row deletion, and writes a zero-PII audit tombstone to `audit_logs`.

---

## 11. 🛡️ Trust & Safety, Violation Hearing Notices & Flag Appeals

AegisDB provides a comprehensive, transparent **Trust & Safety Management Engine** that balances platform security with user due process.

```
┌────────────────────────────────────────────────────────────────────────┐
│             TRUST & SAFETY & HEARING APPEAL WORKFLOW                   │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Super Admin / Automated Threat Flagging:                            │
│    • Super Admin manually flags account or security threat anomaly fires│
│    • System generates synthetic flag notice ('flag_${userId}')         │
│ 2. Real-Time Alert Broadcasts:                                         │
│    • WebSocket emits 'SECURITY_ALERT_FLAGGED' to client session        │
│    • Client state updates 'isFlagged = true' and triggers header alert │
│ 3. Multi-Surface Alerting & Appeal Options:                            │
│    • Top Alert Banner & Header Notification Bell Badge counter         │
│    • 'Account Security, Compliance & Hearing Status' Card in Settings  │
│ 4. Hearing Explanation & Appeal Process:                               │
│    • User clicks 'Submit Appeal' to open Compliance Appeal Modal       │
│    • Explanation submitted to Super Admin for formal review            │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Capabilities
- **Real-Time WebSocket & Endpoint Sync**: On page load or live threat detection, `GET /api/v1/auth/me` and WebSocket events dynamically update client profile state (`isFlagged`, `noticeStatus`, `status`).
- **Top Header Threat Alert Feed**: Displays prominent amber/rose notification cards in the top header dropdown with quick action buttons (**"Submit Appeal"** / **"Cancel Deletion"**).
- **Settings Compliance Card**: Gives users a clear, non-intrusive status panel in User Settings showing active flags, remaining notice days, and deletion grace period status.
- **Synthetic Flag Hearing Notices**: Accounts flagged manually for threat reviews automatically produce synthetic notice objects, enabling immediate appeal submission without requiring a separate manual notice creation step.

---

## 📄 License & Production Deployment

This project is licensed under the MIT License.
### Production Deployment & HTTPS
In production, deploy AegisDB behind a TLS-terminating reverse proxy (like Nginx, Caddy, or Traefik):

**Example Caddyfile:**
```
aegisdb.yourdomain.com {
    reverse_proxy localhost:3000
}
```

**Example Nginx config:**
```nginx
server {
    listen 443 ssl;
    server_name aegisdb.yourdomain.com;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
