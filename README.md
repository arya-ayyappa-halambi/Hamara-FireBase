# AegisDB — Next-Generation Open-Source BaaS

AegisDB is a lightweight, zero-configuration, production-grade Firebase-like Backend-as-a-Service (BaaS) engine. It is fully self-hosted, ultra-performant, and provides developers with a full suite of cloud backend primitives straight out of the box—complete with a modern, glassmorphic developer console featuring a Mac-style collapsible sidebar.

![AegisDB Engine](https://img.shields.io/badge/AegisDB-Engine-6366f1?style=flat-square&logo=shield&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?style=flat-square&logo=typescript&logoColor=white)
![SQLite WAL](https://img.shields.io/badge/SQLite-WAL_Mode-003b57?style=flat-square&logo=sqlite&logoColor=white)
![OAuth 2.0](https://img.shields.io/badge/OAuth_2.0-Google_|_Apple_|_GitHub-2496ed?style=flat-square&logo=google&logoColor=white)
![Security Rules](https://img.shields.io/badge/Security-Row_Level_&_Collection-10b981?style=flat-square&logo=auth0&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-macOS_|_Windows_|_Linux-informational?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## Table of Contents
1. [About AegisDB, Vision & Value Proposition](#1-about-aegisdb-vision--core-value-proposition)
2. [Quick Start, 1-Click Launchers & Zero-Config Setup](#2-quick-start-1-click-launchers--zero-config-setup)
3. [Architecture & Storage Engine](#3-architecture--storage-engine)
4. [Document Database & Row-Level Security (RLS)](#4-document-database--row-level-security-rls)
5. [Project-Isolated Authenticator & OAuth 2.0](#5-project-isolated-authenticator--oauth-20)
6. [Comprehensive Security Architecture](#6-comprehensive-security-architecture)
7. [Storage Vault & Asset Management](#7-storage-vault--asset-management)
8. [Real-Time Change Data Capture (CDC)](#8-real-time-change-data-capture-cdc)
9. [GDPR Privacy, Right to Erasure & Appeals](#9-gdpr-privacy-right-to-erasure--appeals)
10. [Disaster Recovery & S3 Backup Engine](#10-disaster-recovery--s3-backup-engine)
11. [Network & Server Hosting Center, Zero-Downtime Socket Rebinding & Live Terminal Streamer](#11-network--server-hosting-center-zero-downtime-socket-rebinding--live-terminal-streamer)
12. [Super Admin Console & Telemetry](#12-super-admin-console--telemetry)
13. [Complete REST API Registry](#13-complete-rest-api-registry)
14. [Performance Verification & Load Testing Suite](#14-performance-verification--load-testing-suite)
15. [High-Availability & Production Deployment](#15-high-availability--production-deployment)
16. [Official SDKs, Browser Drops & AI Agent Integration](#16-official-sdks-browser-drops--ai-agent-integration)

---

## 1. About AegisDB, Vision & Core Value Proposition

### What is AegisDB?
**AegisDB** is a lightweight, zero-configuration, production-ready **Backend-as-a-Service (BaaS)** and self-hosted Firebase alternative. Designed from first principles in TypeScript, AegisDB delivers complete cloud backend primitives—authentication, relational & JSON document databases, real-time reactive streams, granular row-level security (RLS), multi-tenant isolation, GDPR privacy compliance, S3 disaster recovery, and automated 1-click cross-platform hosting—without external cloud vendor lock-in or recurring monthly database bills.

### Why Was AegisDB Built?
Modern cloud databases (like Firebase Firestore, AWS DynamoDB, and Supabase) often introduce:
1. **Unpredictable Billing & Vendor Lock-In**: Complex pricing tiers charging per-read, per-write, and per-GB egress.
2. **Setup Overhead & Heavy Dependencies**: Requiring complex Docker orchestration, PostgreSQL server clusters, or dedicated cloud accounts just for simple application backends.
3. **Data Sovereignty & Privacy Concerns**: Lack of native GDPR/DPDP cryptographic shredding, cooling-off windows, and offline local network capabilities.

**AegisDB solves this** by packing an entire enterprise backend into a single zero-dependency Node.js engine backed by high-performance SQLite in WAL (Write-Ahead Logging) mode, providing microsecond write latency, lock-free parallel reads, and instant 1-click double-clickable launchers for macOS, Windows, and Linux.

---

### AegisDB vs. Traditional Cloud & BaaS Solutions

| Feature / Primitive | **AegisDB** | **Firebase Firestore** | **Supabase** | **PocketBase** |
| :--- | :---: | :---: | :---: | :---: |
| **Self-Hosting Complexity** | **Zero-Config (1-Click)** | — Proprietary Cloud | ⚠️ Complex (10+ Containers) | ✓ Single Go Binary |
| **Storage Engine** | **SQLite WAL Mode** | Cloud NoSQL | PostgreSQL Cluster | SQLite |
| **Memory Footprint** | **~45 MB RAM** | Cloud Hosted | ~800 MB+ RAM | ~30 MB RAM |
| **Row-Level Security (RLS)** | ✓ **Native Declarative** | ⚠️ Complex Rules Engine | ✓ PostgreSQL RLS | ⚠️ Collection API Rules |
| **Multi-Tenant Projects** | ✓ **Built-in Isolation** | — Multi-Project Setup | ⚠️ Separate DBs | — Single App Realm |
| **Envelope Encryption** | ✓ **AES-256-GCM + DEK/KEK** | — Platform Key Only | ⚠️ Manual pgcrypto | — None |
| **GDPR Portability & Shred**| ✓ **Built-in Art. 20 Export**| — Manual Scripts | — Manual SQL | — Manual SQL |
| **Zero-Downtime Socket Switch**| ✓ **Live GUI Port Rebind** | — N/A | — N/A | — N/A |
| **1-Click Native Launchers** | ✓ **Mac / Win / Linux** | — Cloud Only | — Docker Only | ⚠️ Terminal CLI |

---

### Core Capabilities & Feature Highlights
- **Zero-Config Self-Hosting**: Runs anywhere Node.js runs—from a Raspberry Pi to high-core cloud VMs.
- **SQLite WAL-Mode Acceleration**: Parallel, lock-free reads and serialized microsecond writes.
- **Dual-Layer Security Rules**: Granular, declarative access control at both **Collection-Level** and **Individual Document-Level (Row-Level Security)**.
- **Multi-Tenant Project Isolation**: Independent API keys, user rosters, OAuth configs, and schemas per project.
- **Project-Level OAuth 2.0 Hub**: Google, Apple, and GitHub sign-in with configurable Open SaaS vs. Enterprise Admin-Only provisioning policies.
- **Two-Tier Envelope Encryption**: Master KEK wrapping per-project DEKs with field-level AES-256-GCM authenticated encryption.
- **GDPR / CCPA / DPDP Compliance**: Native Article 20 data portability, 7-day cooling-off erasure windows, and cryptographic shredding.
- **Real-Time CDC**: Streaming live database mutations over Server-Sent Events (SSE) and WebSockets.
- **Real-Time Telemetry**: Live CPU, V8 heap memory, event loop latency, and query execution metrics powered by Chart.js.
- **Drop-In Browser SDK & Native TypeScript Client**: Instant access via `<script src="/aegis.js"></script>` or `@aegis/sdk`.

---

## 2. Quick Start, 1-Click Launchers & Zero-Config Setup

AegisDB includes a built-in pre-flight auto-bootstrapper. On a freshly cloned repository, launching AegisDB automatically:
1. Detects missing dependencies and runs `npm install`.
2. Generates a production-ready `.env` file populated with strong 64-character cryptographic keys (`JWT_SECRET`, `ENCRYPTION_KEY`, `EMAIL_HASH_PEPPER`, `RECOVERY_PIN`).
3. Creates all required database and asset storage directories (`data/`, `uploads/`, `workspaces/`, `backups/`).

### 1-Click Universal First-Time Setup (New Machines & Fresh Clones)

When setting up AegisDB on a brand-new computer for the first time, double-click the dedicated setup launcher for your operating system. It executes an automated, **zero-interaction** setup pipeline in under 15 seconds:
1. **Silent Runtime Provisioning**: Automatically detects if Node.js is installed. On Windows 11/10, it downloads and executes a silent background installation of Node.js 20 LTS (`msiexec /i ... /qn /norestart`) with zero manual wizard screens to click through, and dynamically refreshes the Windows Registry PATH.
2. **Fast Pre-Built Native Dependencies**: Uses `better-sqlite3@11.8.1` with pre-compiled native `.node` binary addons for Windows x64, macOS (Apple Silicon & Intel), and Linux—bypassing C++ compiler requirements completely.
3. **High-Speed Package Pipeline**: Runs `npm install --no-audit --no-fund --loglevel=error` to skip unnecessary vulnerability and fund scan delays.
4. **Security & Cryptography**: Auto-generates a production-grade `.env` file populated with strong 64-character cryptographic keys (`JWT_SECRET`, `ENCRYPTION_KEY`, `EMAIL_HASH_PEPPER`, `RECOVERY_PIN`).
5. **Storage & Directory Structure**: Provisions all required database and asset storage folders (`data/`, `uploads/`, `uploads/biometrics/`, `workspaces/`, `backups/`).
6. **TypeScript Compilation & Launch**: Compiles the project (`npm run build`), starts the server in Dual Host mode (`0.0.0.0:3000`), and automatically opens your default browser directly to the **Server Hosting & Network Center** (`http://localhost:3000/#tab-server-hosting`) via PowerShell `Start-Process`.

- **macOS** ![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white): Double-click **`setup.command`** in Finder (or run `./setup.command`).
- **Windows** ![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white): Double-click **`setup.bat`** in File Explorer.
- **Linux & POSIX** ![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black): Run `./setup.sh` or `npm run setup`.

---

### Universal 1-Click Start Launchers (Daily Usage)

#### macOS Launcher (Finder & Terminal) ![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white)
Double-click **`start.command`** in your project folder, or run:
```bash
./start.command
```
*Launches an interactive terminal setup menu, checks real-time port availability, and automatically opens your browser to the Developer Console.*

#### Windows Launcher (File Explorer & Command Prompt) ![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white)
Double-click **`start.bat`** in File Explorer, or run:
```cmd
start.bat
```
*Opens Command Prompt with the interactive hosting menu, validates Node runtime across `Program Files` and Registry, and auto-opens the browser.*

#### Linux & POSIX Terminal Launcher ![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black)
```bash
./start.sh
# Or run the standalone CLI binary:
./bin/aegis
# Or using npm shortcuts:
npm start
```

---

### Universal 1-Click Stop Launchers & Port Clearance

To stop the server, terminate all background processes, and release all network ports:

- **macOS** ![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white): Double-click **`stop.command`** in Finder (or run `./stop.command`). Automatically terminates the Node server process tree and closes the active terminal window.
- **Windows** ![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white): Double-click **`stop.bat`** in File Explorer. Uses Windows PowerShell `Get-NetTCPConnection` to identify active listeners and executes whole-tree process termination (`taskkill /F /T`) along with WMI supervisor cleanup to prevent `nodemon` from automatically respawning. Includes a native PowerShell fallback if Node is not on PATH.
- **Linux & POSIX** ![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black): Run `./stop.sh` or `npm run stop` / `npm run kill`.
- **Developer Console**: Open **Server Hosting & Network Center** (`/#tab-server-hosting`) and click **"Stop Server"** to gracefully shut down the server, release the port, and close the terminal window directly from your browser.

---

### Interactive Terminal Setup Wizard
When launching, the terminal wizard guides you through:
1. **Hosting & Network Access Modes**:
   - `[1] Dual Host (0.0.0.0)` — Simultaneous Localhost + Wi-Fi / LAN Access *(Recommended)*
   - `[2] Localhost Only (127.0.0.1)` — Strictly isolated to this machine
   - `[3] Wi-Fi Network Only (192.168.x.x)` — Mobile and client testing on your local network
   - `[4] Custom Host IP / Domain` — Custom reverse-proxy or bind IP
   - `[5] Quick Start with Saved Defaults`
2. **Fixed Default Port 3000 & Custom Port Support**: Pressing Enter uses the clean baseline default **`3000`**, or type any valid port (`4000`, `5000`, `8080`, `9000`).
3. **Live Socket Conflict Resolver**: Detects occupied ports in real-time and offers 1-click options to terminate lingering processes or auto-switch to a free port.
4. **Active Socket Readiness Probe**: Actively verifies server health before launching your browser, eliminating premature page load errors.

---

### Initial Administrator Setup
1. Open `http://localhost:3000` in your web browser.
2. Click **Register Account** on the login screen. The very first registered account is automatically promoted to **Super Admin**.
3. Head to **Settings > Security** to activate RFC 6238 TOTP Multi-Factor Authentication (MFA).

### Emergency Administrator Recovery
If you ever lose access to the Super Admin account, execute the CLI recovery script:
```bash
npm run reset-admin
```
This safely resets the primary Super Admin credentials to `admin@aegisdb.dev` / `admin123`.

---

## 3. Architecture & Storage Engine

AegisDB uses a modular, layered architecture optimized for high concurrency, microsecond latency, and resource efficiency.

```
┌────────────────────────────────────────────────────────────────────────┐
│               AegisDB Glassmorphic Developer Console                   │
│          (Vanilla JS SPA • Tailwind CSS • FontAwesome • Chart.js)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST / SSE / WSS
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Express 4.x + TypeScript API                     │
│  ┌───────────────────────┬──────────────────────┬────────────────────┐ │
│  │   Auth & Security     │    Rate Limiter      │  Telemetry Monitor │ │
│  │ (Argon2id, TOTP, JWT) │ (Token Bucket, DDoS) │ (Prometheus, Heap) │ │
│  └───────────────────────┴──────────────────────┴────────────────────┘ │
│  ┌───────────────────────┬──────────────────────┬────────────────────┐ │
│  │   Project Manager     │   Storage Vault      │  CDC Event Bus     │ │
│  │ (Isolation, Metadata) │ (Magic Byte Check)   │ (SSE, WebSockets)  │ │
│  └───────────────────────┴──────────────────────┴────────────────────┘ │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Atomic Transactions
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               SQLite Embedded Engine (WAL Mode Enabled)                │
│  ┌──────────────────────┬──────────────────────┬─────────────────────┐ │
│  │  aegis.db (Core DB)  │ aegis.db-wal (Log)   │ aegis.db-shm (Index)│ │
│  └──────────────────────┴──────────────────────┴─────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Storage Engine Highlights
- **Write-Ahead Logging (WAL)**: Reads and writes never block each other. Read queries run in parallel against memory-mapped shm indexes.
- **Microsecond Execution**: Simple indexed lookups execute in `< 0.5ms`; bulk transactions execute in `< 2.5ms`.
- **Zero Heavy Infrastructure**: No background daemon services (like mysqld or mongod) to configure, patch, or maintain.

---

## 4. Document Database & Row-Level Security (RLS)

AegisDB implements a schemaless NoSQL JSON document database backed by SQLite JSON1 primitives.

### Dual-Layer Declarative Rules Engine
AegisDB evaluates security rules at two independent layers before allowing any query or mutation:

1. **Collection-Level Rules**: Define default baseline policies across the entire collection.
2. **Document-Level Rules (Row-Level Security)**: Embed a reserved `_rules` object inside any individual JSON document to enforce fine-grained row ownership.

```json
{
  "title": "Quarterly Financial Forecast",
  "department": "Finance",
  "ownerId": "usr_998877",
  "_rules": {
    "read": "auth != null && (auth.id == data.ownerId || auth.role == 'admin')",
    "write": "auth != null && auth.id == data.ownerId",
    "delete": "auth != null && auth.role == 'superadmin'"
  }
}
```

### Available Rule Variables
- `auth`: The authenticated user context (`auth.id`, `auth.email`, `auth.role`).
- `data`: The incoming mutation payload.
- `resource`: The existing document currently stored in the database.
- `request`: Request metadata including client IP and timestamp.

---

## 5. Project-Isolated Authenticator & OAuth 2.0

Every AegisDB project operates as an independent authentication realm:

- **Isolated User Rosters**: Users registered in Project A cannot access Project B unless explicitly provisioned.
- **Configurable Registration Policies**:
  - `open_saas`: Public self-registration enabled for consumer applications.
  - `admin_only`: Enterprise-locked provisioning; only project admins can invite users.
- **OAuth 2.0 Federation**: Native support for **Google Identity Services**, **Apple Sign-In**, and **GitHub OAuth**.
- **Dynamic Config Discovery (`/api/v1/project-auth/config`)**: Client SDKs dynamically discover enabled OAuth providers with zero hardcoded secret leakage.

---

## 6. Comprehensive Security Architecture

AegisDB incorporates defense-in-depth security principles across all layers:

- **Password Hashing**: State-of-the-art **Argon2id** algorithm with per-user cryptographic salts.
- **RFC 6238 TOTP Multi-Factor Authentication**: Native Authenticator app integration (Google Authenticator, 1Password, Authy).
- **Two-Tier Envelope Encryption**:
  - Primary Key Encryption Key (KEK) derived from server environment secrets.
  - Per-project Data Encryption Keys (DEKs) wrapping sensitive fields with **AES-256-GCM**.
- **Blind Index Email Search**: Irreversible, peppered HMAC-SHA256 blind indexing for encrypted user lookup.
- **Automated Threat Detection**: Real-time rate anomaly detection, brute-force mitigation, and suspicious activity flagging.

---

## 7. Storage Vault & Asset Management

AegisDB provides a secure file storage subsystem for user uploads, media, and biometrics:

- **Magic Byte Inspection**: File headers are strictly validated against genuine binary signatures (e.g. `image/png`, `application/pdf`, `video/mp4`) to prevent executable file masking.
- **Scoped Quotas & Size Limits**: Configurable per-user and per-project storage caps.
- **Temporary Signed URLs**: Generate time-bounded, cryptographic download links for private assets.

---

## 8. Real-Time Change Data Capture (CDC)

AegisDB streams live database mutations directly to connected frontend clients:

- **Server-Sent Events (SSE)**: Unidirectional real-time document change feeds via standard HTTP connections (`/api/v1/db/collections/:name/realtime`).
- **WebSockets (`/ws`)**: High-throughput, bi-directional event bus supporting live channel subscriptions, presence, and terminal streaming.
- **Instant Client UI Updates**: Drop-in `.onSnapshot()` listeners in the AegisDB SDK update client state in real time.

---

## 9. GDPR Privacy, Right to Erasure & Appeals

AegisDB natively complies with global data privacy regulations (GDPR Article 20, CCPA, and India DPDP):

- **Article 20 Data Portability**: Instant one-click portable JSON export bundles containing all user data and activity.
- **7-Day Cooling-Off Erasure Window**: Users can schedule account deletion with a 7-day cancellation window.
- **Cryptographic Shredding**: Deletion irrecoverably purges user DEKs, rendering all historical encrypted fields permanently unreadable.
- **Compliance Appeals & Hearings**: Formal compliance notices and appeals submission workflow for account moderation.

---

## 10. Disaster Recovery & S3 Backup Engine

AegisDB features an automated disaster recovery engine supporting local snapshotting and remote Amazon S3 backups:

- **Hot Database Snapshots**: Uses SQLite online backup APIs (`VACUUM INTO`) to generate consistent, non-blocking snapshot files.
- **Automated S3 Replication**: Encrypted uploads to Amazon S3 (or any S3-compatible provider such as MinIO or Cloudflare R2).
- **Retention & Purge Policies**: Automated lifecycle cleanup of expired backups based on configurable retention schedules.

---

## 11. Network & Server Hosting Center, Zero-Downtime Socket Rebinding & Live Terminal Streamer

The **Network & Server Hosting Center** (`/#tab-server-hosting`) provides complete control over network binding, active IP interfaces, port migration, live server telemetry, and granular device-level access control:

- **Live Host Binding Modes**: Seamlessly toggle between **Dual Host (`0.0.0.0`)**, **Localhost (`127.0.0.1`)**, **Wi-Fi LAN IP**, and **Custom Domain**.
- **Zero-Downtime Socket Rebinding**: Dynamically rebind the active HTTP/WebSocket server to new IP addresses and ports without dropping active sessions.
- **IP Whitelisting & Subnet Access Control**:
  - **Open LAN vs. Strict Whitelist**: Switch between open local network access and strict whitelist-only mode with 1 click.
  - **Subnet & Extender Control**: Approve or block entire Wi-Fi extenders or subnets using CIDR notation (e.g. `192.168.31.0/24`, `10.0.0.0/16`) or IP ranges (e.g. `192.168.31.100-192.168.31.200`).
  - **Zero-Lockout Guarantee**: Localhost (`127.0.0.1`, `::1`) is hardcoded as unconditionally allowed, ensuring administrators are never locked out of the console.
  - **Glassmorphic 403 Security Screen**: Unauthorized devices visiting via browser receive a clean security access denied screen displaying their client IP, timestamp, and contact instructions.
- **Real-Time Client IP & Device Tracking**:
  - **Live Device Fingerprinting**: Automatically parses User-Agents to detect Device Type (`mobile`, `tablet`, `desktop`, `bot`), OS (`iOS`, `Android`, `macOS`, `Windows`, `Linux`), and Browser (`Safari`, `Chrome`, `Firefox`, `Edge`, `Postman`).
  - **Live Traffic Logs**: Tracks connected client IPs, logged-in user accounts, 24h request counts, and last seen timestamps with zero database write bottlenecks.
  - **1-Click Actions**: Instantly add active client devices to the whitelist with **"+ Whitelist"** or block untrusted devices with **"Block"**.
- **Live Terminal Log Streamer**: Real-time ANSI-colored terminal log feed streamed over WebSockets directly to the web dashboard.
- **Scheduled Automated Migrations**: Schedule endpoint migrations with countdown timers and automated client redirection handover.

---

## 12. Super Admin Console & Telemetry

The Super Admin developer console provides real-time oversight and administrative control:

- **Live Telemetry Charts**: Real-time visual monitoring of CPU load, V8 heap memory allocation, and query latency via Chart.js.
- **Dynamic Rate Limit Governance**: Update global rate limits live without server restarts.
- **User Management & Moderation**: Inspect user rosters, adjust roles, review account deletion queues, and issue security compliance notices.
- **Super Admin Power Controls**: In-dashboard server shutdown button with confirmation modal, process-tree termination, and automatic macOS Terminal window closure.

---

## 13. Complete REST API Registry

### Public System & Monitoring
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server health check and uptime status |
| `GET` | `/metrics` | Prometheus format exposition metrics |
| `GET` | `/api/v1/system/status` | System operational & maintenance status |

### Authentication & Account (`/api/v1/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register new account (first user becomes Super Admin) |
| `POST` | `/api/v1/auth/login` | Authenticate user; returns JWT access & refresh tokens |
| `POST` | `/api/v1/auth/refresh` | Rotate refresh token and issue new JWT |
| `POST` | `/api/v1/auth/logout` | Revoke active refresh token |
| `GET` | `/api/v1/auth/me` | Fetch profile, security flags, and account state |
| `PATCH` | `/api/v1/auth/profile` | Update account display name |
| `POST` | `/api/v1/auth/change-password` | Update password (requires TOTP check if MFA enabled) |
| `POST` | `/api/v1/auth/forgot-password` | Request password reset link |
| `POST` | `/api/v1/auth/reset-password` | Reset password using reset token |
| `POST` | `/api/v1/auth/mfa/setup` | Generate TOTP secret and QR code URI |
| `POST` | `/api/v1/auth/mfa/verify` | Verify 6-digit code and enable TOTP MFA |
| `POST` | `/api/v1/auth/mfa/disable` | Disable TOTP (requires password + live TOTP code) |
| `GET` | `/api/v1/auth/export-data` | Download GDPR Art. 20 portable JSON export |
| `DELETE` | `/api/v1/auth/account` | Request account deletion (starts 7-day grace period) |
| `POST` | `/api/v1/auth/cancel-deletion` | Cancel pending deletion request |

### Project User Auth & OAuth (`/api/v1/project-auth`)
*Requires `x-aegis-api-key` header.*
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/project-auth/config` | Fetch public auth config (enabled providers & client IDs) |
| `POST` | `/api/v1/project-auth/register` | Register end-user (governed by registration policy) |
| `POST` | `/api/v1/project-auth/login` | Authenticate end-user with Email/Password |
| `POST` | `/api/v1/project-auth/oauth/:provider` | Authenticate via OAuth (`google`, `apple`, `github`) |

### Database Services (`/api/v1/db`)
*Requires `x-aegis-api-key` or `Authorization: Bearer <JWT>` header.*
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/db/collections` | List all collections in project |
| `POST` | `/api/v1/db/collections` | Create/register collection with schema & rules |
| `GET` | `/api/v1/db/collections/:name/documents` | Query documents with pagination & search filter |
| `POST` | `/api/v1/db/collections/:name/documents` | Insert new JSON document (evaluates rules) |
| `GET` | `/api/v1/db/collections/:name/documents/:id` | Fetch specific document by ID |
| `PATCH` | `/api/v1/db/collections/:name/documents/:id` | Patch document fields or document-level `_rules` |
| `DELETE` | `/api/v1/db/collections/:name/documents/:id` | Delete document by ID |
| `GET` | `/api/v1/db/collections/:name/realtime` | Server-Sent Events (SSE) CDC stream |

### File Storage (`/api/v1/storage`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/storage/upload` | Multipart file upload with magic byte inspection |
| `POST` | `/api/v1/storage/signed-url` | Generate temporary signed download URL |
| `GET` | `/api/v1/storage/assets/:filename` | Stream or download stored file asset |

### Super Admin Operations (`/api/v1/admin`)
*Requires Super Admin Bearer JWT.*
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/admin/stats` | Real-time CPU, RAM, and SQLite query metrics |
| `PATCH` | `/api/v1/admin/platform-settings` | Update hosting mode, bind IP, port, or custom domain |
| `POST` | `/api/v1/admin/server/shutdown` | Gracefully shut down server, release port & close terminal |
| `GET` | `/api/v1/admin/network/rules` | Fetch all configured IP/CIDR/range access rules |
| `POST` | `/api/v1/admin/network/rules` | Create a new IP, CIDR subnet, or range rule |
| `DELETE` | `/api/v1/admin/network/rules/:id` | Delete a network access rule |
| `GET` | `/api/v1/admin/network/devices` | Retrieve real-time tracked client devices & traffic stats |
| `POST` | `/api/v1/admin/network/devices/:ip/toggle-block` | Toggle 1-click blocking state for a device IP |
| `GET` | `/api/v1/admin/network/settings` | Fetch IP filtering enforcement status & default policy |
| `PATCH` | `/api/v1/admin/network/settings` | Toggle whitelist enforcement or update default policy |
| `PATCH` | `/api/v1/admin/rate-limits` | Adjust global token bucket rate limits live |
| `GET` | `/api/v1/admin/account-deletions` | Inspect active and historical account deletion queues |
| `POST` | `/api/v1/admin/account-deletions/:id/cancel` | Retain an account upon user appeal |
| `POST` | `/api/v1/admin/backups/purge` | Trigger immediate cleanup of expired snapshots |

---

## 14. Performance Verification & Automated Test Suites

AegisDB includes comprehensive integration tests and automated performance stress benchmarking harnesses:

### Automated Integration & Security Tests
```bash
# 1. Network Access Control, CIDR Subnets & Zero-Lockout Tests (24 checks)
npx ts-node tests/network-access-control.test.ts

# 2. Dedicated IP Blocking, Subnet Ranges & Extender Control (20 checks)
npx ts-node tests/ip-blocking-and-ranges.test.ts

# 3. Two-Tier Envelope Encryption & Key Rotation
npx ts-node tests/envelope-encryption.test.ts

# 4. Row-Level Security Rules & Collection RBAC
npx ts-node tests/security-rules.test.ts

# 5. Refresh Token Family & Reuse Detection
npx ts-node tests/token-family.test.ts
```

### Performance & Load Benchmarking (`/loadtest`)
```bash
# 1. Read-Only Throughput & Latency (Simulates concurrent read traffic)
node loadtest/read-only-test.js

# 2. Burst Write Load (Tests SQLite serialized ACID write transaction bursts)
node loadtest/write-load-test.js

# 3. Sustained Write Endurance (Tests extended write cycles and memory stability)
node loadtest/sustained-write-test.js

# 4. Super Admin User Roster Stress (Tests auth token verification under load)
node loadtest/admin-users-test.js
```

### Benchmark Results
| Test Scenario | Concurrency | Operations / Sec | Mean Latency | Error Rate |
| :--- | :--- | :--- | :--- | :--- |
| **Indexed Document Reads** | 100 concurrent workers | ~12,500 req/s | 0.8 ms | 0.00% |
| **ACID Document Inserts** | 50 concurrent workers | ~4,200 req/s | 2.1 ms | 0.00% |
| **Real-time SSE Fan-out** | 500 connected clients | Continuous broadcast | < 5 ms | 0.00% |

---

## 15. High-Availability & Production Deployment

### Option 1: Reverse Proxy with Nginx (Recommended)
```nginx
upstream aegisdb_nodes {
    least_conn;
    ip_hash; # Sticky sessions for WebSockets & SSE
    server 127.0.0.1:3000 max_fails=3 fail_timeout=10s;
    server 127.0.0.1:3001 max_fails=3 fail_timeout=10s;
}

server {
    listen 80;
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://aegisdb_nodes;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }
}
```

### Option 2: Caddy (Automatic HTTPS)
```caddy
api.yourdomain.com {
    reverse_proxy 127.0.0.1:3000 {
        lb_policy least_conn
        health_uri /health
        health_interval 5s
    }
}
```

### Option 3: PM2 Multi-Core Cluster
```bash
# Compile TypeScript to dist/
npm run build

# Start cluster across all CPU cores
pm2 start dist/server.js -i max --name aegisdb

# Perform zero-downtime rolling restart
pm2 reload aegisdb
```

---

## 16. Official SDKs, Browser Drops & AI Agent Integration

AegisDB provides two native client integration methods:
1. **Drop-in Browser Script (`/aegis.js`)**: Zero-build vanilla JS script served directly by your AegisDB instance.
2. **Native Node/TypeScript SDK (`@aegis/sdk`)**: Type-safe SDK with full support for React, Vue, Next.js, Svelte, and Node backends.

---

### Option A: Drop-In Browser Script (`/aegis.js`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AegisDB App</title>
  <!-- Load the AegisDB Client SDK directly from the server -->
  <script src="http://localhost:3000/aegis.js"></script>
  <!-- Optional: Google Identity Services for Google OAuth -->
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>
  <div id="googleBtn"></div>

  <script>
    const aegis = new AegisClient({
      baseUrl: 'http://localhost:3000',
      apiKey: 'aegis_pk_your_project_key_here'
    });

    async function startApp() {
      // 1. Google Sign-In button initialization
      await aegis.auth.initGoogleAuth?.({
        buttonContainer: 'googleBtn',
        callback: (authResponse) => {
          console.log('Logged in user:', authResponse.user);
        }
      });

      // 2. Fetch documents from 'todos' collection
      const todos = await aegis.collection('todos').query();
      console.log('Todos:', todos);

      // 3. Real-time live update listener (SSE CDC)
      const unsubscribe = aegis.collection('todos').onSnapshot((change) => {
        console.log('Real-time event:', change.type, change.document);
      });
    }

    startApp();
  </script>
</body>
</html>
```

---

### Option B: Native TypeScript SDK (`@aegis/sdk`)

```bash
npm install @aegis/sdk
```

```typescript
import { Aegis } from '@aegis/sdk';

const aegis = new Aegis({
  baseUrl: 'http://localhost:3000',
  apiKey: process.env.NEXT_PUBLIC_AEGIS_API_KEY
});

// 1. Dynamic OAuth Configuration Discovery (Zero hardcoded secrets)
const config = await aegis.projectAuth.getConfig();

// 2. Email/Password Sign-In
const session = await aegis.projectAuth.signIn({
  email: 'user@example.com',
  password: 'SecurePassword123'
});

// 3. Insert document with Row-Level Security rule
await aegis.db.collection('notes').insert({
  title: 'Confidential Strategy',
  content: 'Meeting notes...',
  ownerId: session.user.id,
  _rules: {
    read: "auth != null && auth.id == data.ownerId",
    write: "auth != null && auth.id == data.ownerId"
  }
});

// 4. Live Change Data Capture (WebSockets / SSE)
const unsub = aegis.realtime.subscribe('notes', (event) => {
  console.log('Live mutation:', event.type, event.document);
});
```

---

### AI Agent Prompt 1: Complete App Migration
```markdown
You are an expert full-stack engineer and cloud architect.
I want to migrate my application backend from my current stack (Firebase / Supabase / MongoDB / local state / REST) to AegisDB (a self-hosted, lightweight BaaS).

AegisDB Server Specifications:
- Base URL: http://localhost:3000 (or configured host)
- Project API Key: Retrieve from localStorage ('aegisApiKey') or config constant. Pass in 'x-aegis-api-key' header.
- User Session: When users sign in, store their JWT token in localStorage ('aegisToken') and pass 'Authorization: Bearer <token>'.

Please systematically migrate the application according to these specifications:

1. AUTHENTICATION MIGRATION (Firebase/Supabase Auth -> AegisDB Project Auth):
   - Auth Config Discovery: GET http://localhost:3000/api/v1/project-auth/config (Header: 'x-aegis-api-key') to dynamically inspect enabled OAuth providers and registration mode.
   - User Sign-Up: POST http://localhost:3000/api/v1/project-auth/register with body { email, password, name } (Header: 'x-aegis-api-key').
   - User Sign-In: POST http://localhost:3000/api/v1/project-auth/login with body { email, password } (Header: 'x-aegis-api-key'). Returns { token, user: { id, email, name, role } }.
   - OAuth Sign-In: POST http://localhost:3000/api/v1/project-auth/oauth/<provider> (google | apple | github) with body { token: '<id_token_or_access_token>' } (Header: 'x-aegis-api-key').

2. DATABASE & DATA LAYER MIGRATION (Firestore/Postgres -> AegisDB Collections):
   - Insert Document: POST http://localhost:3000/api/v1/db/collections/<collection_name>/documents
     Headers: { 'Content-Type': 'application/json', 'x-aegis-api-key': apiKey, 'Authorization': 'Bearer <token>' }
     Body: { data: { ...fields } }
   - Query Documents: GET http://localhost:3000/api/v1/db/collections/<collection_name>/documents?limit=50&offset=0&sortBy=_createdAt&sortOrder=desc
   - Fetch Single Document: GET http://localhost:3000/api/v1/db/collections/<collection_name>/documents/<id>
   - Update Document: PATCH http://localhost:3000/api/v1/db/collections/<collection_name>/documents/<id>
     Body: { data: { ...fieldsToUpdate } }
   - Delete Document: DELETE http://localhost:3000/api/v1/db/collections/<collection_name>/documents/<id>

3. ROW-LEVEL SECURITY & SECURITY RULES:
   - To assign fine-grained row ownership or custom access rules to any document, attach a reserved '_rules' object inside the document data:
     { data: { ...fields, _rules: { "read": "auth != null", "write": "auth.id == data.ownerId" } } }
   - Rule variables available: 'auth' (user context), 'data' (incoming payload), 'resource' (existing DB row).

4. REAL-TIME DATA SYNC (onSnapshot -> Server-Sent Events):
   - Connect live streams via:
     const sse = new EventSource('http://localhost:3000/api/v1/db/collections/<collection_name>/realtime?apiKey=' + apiKey);
     sse.onmessage = (event) => { const change = JSON.parse(event.data); /* change.type: INSERT|UPDATE|DELETE, change.document */ };

5. FILE STORAGE MIGRATION:
   - Upload: POST http://localhost:3000/api/v1/storage/upload using FormData with field 'file' (or 'biometric').
   - Download/Stream: GET http://localhost:3000/api/v1/storage/assets/<filename>

6. ERROR HANDLING & DATA PARSING:
   - Responses follow: { success: boolean, message: string, data?: any }.
   - Extract data cleanly, handle 401/403 status codes, and show user-friendly notifications.

Refactor all existing mock data, Firebase, and Supabase client calls to use these AegisDB endpoints cleanly.
```

---

### AI Agent Prompt 2: Build New Application from Scratch
```markdown
You are an expert full-stack software engineer.
Build a complete, modern, high-performance web application backed by AegisDB (a self-hosted Backend-as-a-Service running at http://localhost:3000).

ARCHITECTURAL SPECIFICATIONS & INTEGRATION REQUIREMENTS:

1. CLIENT ARCHITECTURE & AUTHENTICATION:
   - Create a clean API service layer (or use AegisClient) that automatically attaches:
     * Header 'x-aegis-api-key': <PROJECT_API_KEY> (from localStorage 'aegisApiKey' or config)
     * Header 'Authorization': 'Bearer ' + <USER_JWT_TOKEN> (from localStorage 'aegisToken')
   - Implement complete user lifecycle UI (Register, Login, OAuth, Logout):
     * Check enabled auth options: GET /api/v1/project-auth/config
     * Register: POST /api/v1/project-auth/register with { email, password, name }
     * Login: POST /api/v1/project-auth/login with { email, password }
     * OAuth: POST /api/v1/project-auth/oauth/<provider> with { token }

2. DATABASE & COLLECTION ARCHITECTURE:
   - Structure business data into organized collections (e.g. 'items', 'tasks', 'profiles', 'orders').
   - Create documents: POST /api/v1/db/collections/<name>/documents with { data: { ...item } }
   - Read with pagination: GET /api/v1/db/collections/<name>/documents?limit=25&offset=0
   - Update: PATCH /api/v1/db/collections/<name>/documents/<id> with { data: { ...updates } }
   - Delete: DELETE /api/v1/db/collections/<name>/documents/<id>

3. ROW-LEVEL SECURITY (RLS) RULES:
   - Protect private user data by attaching '_rules' to created documents:
     { "read": "auth != null", "write": "auth.id == data.ownerId" }

4. REAL-TIME CHANGE DATA CAPTURE (CDC):
   - Keep views synced in real time using Server-Sent Events (SSE):
     const sse = new EventSource('http://localhost:3000/api/v1/db/collections/<name>/realtime?apiKey=' + apiKey);
     sse.onmessage = (e) => { const change = JSON.parse(e.data); updateState(change); };

5. FILE STORAGE & UPLOADS:
   - Upload assets via POST /api/v1/storage/upload using FormData with field 'file'.
   - Display uploaded images/files using http://localhost:3000/api/v1/storage/assets/<filename>.

6. USER EXPERIENCE & INTERFACE:
   - Deliver a responsive, polished UI with loading skeletons, optimistic UI updates, error toasts, and clean empty states.
```

---

### Universal Drop-In SDK (`AegisClient.js` / `AegisClient.ts`)
```javascript
/**
 * AegisClient — Official Universal Drop-in SDK for AegisDB
 * Supports Browser (Vanilla JS, React, Vue, Svelte, Next.js) and Node.js
 */
class AegisClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
    this.apiKey = options.apiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('aegisApiKey') : '') || '';
    this.token = options.token || (typeof localStorage !== 'undefined' ? localStorage.getItem('aegisToken') : '') || '';
  }

  setApiKey(key) {
    this.apiKey = key;
    if (typeof localStorage !== 'undefined') localStorage.setItem('aegisApiKey', key);
  }

  setToken(token) {
    this.token = token;
    if (typeof localStorage !== 'undefined') {
      if (token) localStorage.setItem('aegisToken', token);
      else localStorage.removeItem('aegisToken');
    }
  }

  async request(endpoint, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (this.apiKey) headers['x-aegis-api-key'] = this.apiKey;
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const res = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });
    const json = await res.json().catch(() => ({ success: false, message: 'Invalid server response' }));
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `AegisDB request failed (${res.status})`);
    }
    return json.data !== undefined ? json.data : json;
  }

  // ── Authentication API ────────────────────────────────────────────────────────
  get auth() {
    return {
      getConfig: () => this.request('/api/v1/project-auth/config'),
      signUp: async (email, password, name) => {
        const res = await this.request('/api/v1/project-auth/register', {
          method: 'POST',
          body: { email, password, name }
        });
        if (res?.token) this.setToken(res.token);
        return res;
      },
      signIn: async (email, password) => {
        const res = await this.request('/api/v1/project-auth/login', {
          method: 'POST',
          body: { email, password }
        });
        if (res?.token) this.setToken(res.token);
        return res;
      },
      signInWithOAuth: async (provider, oauthToken) => {
        const res = await this.request(`/api/v1/project-auth/oauth/${encodeURIComponent(provider)}`, {
          method: 'POST',
          body: { token: oauthToken }
        });
        if (res?.token) this.setToken(res.token);
        return res;
      },
      signOut: () => {
        this.setToken('');
      },
      getProfile: () => this.request('/api/v1/auth/me')
    };
  }

  // ── Database & Collections CRUD API ───────────────────────────────────────────
  collection(collectionName) {
    const coll = encodeURIComponent(collectionName);
    return {
      insert: (data, id) => this.request(`/api/v1/db/collections/${coll}/documents`, {
        method: 'POST',
        body: { data, ...(id ? { id } : {}) }
      }),
      query: (options = {}) => {
        const p = new URLSearchParams();
        if (options.limit) p.set('limit', String(options.limit));
        if (options.offset) p.set('offset', String(options.offset));
        if (options.sortBy) p.set('sortBy', options.sortBy);
        if (options.sortOrder) p.set('sortOrder', options.sortOrder);
        if (options.filter) p.set('filter', typeof options.filter === 'object' ? JSON.stringify(options.filter) : options.filter);
        const q = p.toString() ? `?${p.toString()}` : '';
        return this.request(`/api/v1/db/collections/${coll}/documents${q}`);
      },
      get: (docId) => this.request(`/api/v1/db/collections/${coll}/documents/${encodeURIComponent(docId)}`),
      update: (docId, patch) => this.request(`/api/v1/db/collections/${coll}/documents/${encodeURIComponent(docId)}`, {
        method: 'PATCH',
        body: { data: patch }
      }),
      delete: (docId) => this.request(`/api/v1/db/collections/${coll}/documents/${encodeURIComponent(docId)}`, {
        method: 'DELETE'
      }),
      onSnapshot: (callback) => {
        if (typeof EventSource === 'undefined') {
          throw new Error('EventSource is not supported in this environment');
        }
        const sseUrl = `${this.baseUrl}/api/v1/db/collections/${coll}/realtime?apiKey=${encodeURIComponent(this.apiKey)}`;
        const source = new EventSource(sseUrl);
        source.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data);
            callback(parsed);
          } catch (err) {
            console.error('Failed to parse SSE CDC payload:', err);
          }
        };
        return () => source.close();
      }
    };
  }

  // ── Storage API ───────────────────────────────────────────────────────────────
  get storage() {
    return {
      upload: async (file, filename) => {
        const formData = new FormData();
        formData.append('file', file, filename || file.name || 'upload.bin');
        return this.request('/api/v1/storage/upload', {
          method: 'POST',
          body: formData
        });
      },
      getFileUrl: (filename) => `${this.baseUrl}/api/v1/storage/assets/${encodeURIComponent(filename)}`
    };
  }
}

// Export for ES modules, CommonJS, and Browser
if (typeof window !== 'undefined') window.AegisClient = AegisClient;
if (typeof module !== 'undefined' && module.exports) module.exports = { AegisClient };
export default AegisClient;
```

---

## License
This project is open-source and licensed under the [MIT License](LICENSE).
