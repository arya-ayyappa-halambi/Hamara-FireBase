# FlareBase — Fast, Secure, Multi-Tenant Backend-as-a-Service

> **FlareBase** is a lightweight, zero-configuration, production-grade Firebase alternative built for indie hackers & teams.

FlareBase is a lightweight, zero-configuration, production-grade Firebase-like Backend-as-a-Service (BaaS) engine. It is fully self-hosted, ultra-performant, and provides developers with a complete suite of cloud backend primitives straight out of the box—complete with a modern, glassmorphic developer console featuring a Mac-style collapsible sidebar.

![FlareBase Engine](https://img.shields.io/badge/FlareBase-Engine-6366f1?style=flat-square&logo=shield&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?style=flat-square&logo=typescript&logoColor=white)
![SQLite WAL](https://img.shields.io/badge/SQLite-WAL_Mode-003b57?style=flat-square&logo=sqlite&logoColor=white)
![WebAuthn Passkeys](https://img.shields.io/badge/FIDO2-WebAuthn_Passkeys-8b5cf6?style=flat-square&logo=fido&logoColor=white)
![Organizations & Teams](https://img.shields.io/badge/Multi--Tenant-Orgs_%26_Teams-f59e0b?style=flat-square&logo=github&logoColor=white)
![OAuth 2.0](https://img.shields.io/badge/OAuth_2.0-Google_|_Apple_|_GitHub-2496ed?style=flat-square&logo=google&logoColor=white)
![Security Rules](https://img.shields.io/badge/Security-Row_Level_&_Collection-10b981?style=flat-square&logo=auth0&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-macOS_|_Windows_|_Linux-informational?style=flat-square)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)

---

## Table of Contents
1. [About FlareBase, Vision & Value Proposition](#1-about-flarebase-vision--core-value-proposition)
2. [Quick Start, 1-Click Launchers & Zero-Config Setup](#2-quick-start-1-click-launchers--zero-config-setup)
3. [Architecture & Storage Engine](#3-architecture--storage-engine)
4. [GitHub-Grade Multi-Tenant Organizations & Functional Teams](#4-github-grade-multi-tenant-organizations--functional-teams)
5. [FIDO2 Biometric Passkeys (WebAuthn Level 3)](#5-fido2-biometric-passkeys-webauthn-level-3)
6. [Passwordless Magic Links & 6-Digit Email OTP](#6-passwordless-magic-links--6-digit-email-otp)
7. [Active Sessions & Remote Device Logout](#7-active-sessions--remote-device-logout)
8. [Personal Access Tokens (PATs) & Fine-Grained Scopes](#8-personal-access-tokens-pats--fine-grained-scopes)
9. [In-App Real-Time Notification Center](#9-in-app-real-time-notification-center)
10. [User Storage Quotas & Visual Metering](#10-user-storage-quotas--visual-metering)
11. [Document Database & Row-Level Security (RLS)](#11-document-database--row-level-security-rls)
12. [Project-Isolated Authenticator & OAuth 2.0](#12-project-isolated-authenticator--oauth-20)
13. [Comprehensive Security Architecture](#13-comprehensive-security-architecture)
14. [Auto Threat Detection & Live User Security Intelligence Matrix](#14-auto-threat-detection--live-user-security-intelligence-matrix)
15. [Multi-Account Anti-Spam & Shared Wi-Fi / NAT Intelligence](#15-multi-account-anti-spam--shared-wi-fi--nat-intelligence)
16. [Emergency Recovery Portal & High-Availability Gateways](#16-emergency-recovery-portal--high-availability-gateways)
17. [Storage Vault & Asset Management](#17-storage-vault--asset-management)
18. [Real-Time Change Data Capture (CDC)](#18-real-time-change-data-capture-cdc)
19. [GDPR Privacy, Right to Erasure & Appeals](#19-gdpr-privacy-right-to-erasure--appeals)
20. [Disaster Recovery & S3 Backup Engine](#20-disaster-recovery--s3-backup-engine)
21. [Network & Server Hosting Center, Zero-Downtime Socket Rebinding](#21-network--server-hosting-center-zero-downtime-socket-rebinding)
22. [Super Admin Console & Telemetry](#22-super-admin-console--telemetry)
23. [Complete REST API Registry](#23-complete-rest-api-registry)
24. [Performance Verification & Automated Test Suites](#24-performance-verification--automated-test-suites)
25. [High-Availability & Production Deployment](#25-high-availability--production-deployment)
26. [Official SDKs, Browser Drops & AI Agent Integration](#26-official-sdks-browser-drops--ai-agent-integration)
27. [Contributing](#contributing)
28. [License](#license)

---

### 📚 Modular Documentation & Deep-Dive Guides
- 🚀 **[Quickstart & 1-Click Launchers](docs/quickstart.md)**: Native macOS/Windows/Linux setup, manual Node.js, Docker, and Super Admin first-boot.
- 🔑 **[Authentication & WebAuthn](docs/authentication-and-webauthn.md)**: FIDO2 passkeys, OAuth 2.0 (Google/GitHub/Apple), magic links, and PATs.
- 🛡️ **[Declarative Row-Level Security (RLS)](docs/row-level-security.md)**: Sandboxed rule syntax, RBAC, tenant isolation, and client usage.
- 🔒 **[Envelope Encryption & GDPR Sovereignty](docs/encryption-and-gdpr.md)**: Two-tier AES-256-GCM, cryptographic shredding, and HMAC blind indexing.
- 🌐 **[Production Reverse-Proxy Deployment](docs/reverse-proxy-deployment.md)**: Ready-to-use production templates for [Caddy](deploy/caddy/Caddyfile), [Traefik](deploy/traefik/docker-compose.yml), and [Nginx](deploy/nginx/flarebase.conf).

---

## 1. About FlareBase, Vision & Core Value Proposition

### What is FlareBase?
**FlareBase** is a lightweight, zero-configuration, production-ready **Backend-as-a-Service (BaaS)** and self-hosted Firebase alternative. Designed from first principles in TypeScript, FlareBase delivers complete cloud backend primitives—authentication, relational & JSON document databases, real-time reactive streams, granular row-level security (RLS), multi-tenant isolation, GitHub-grade organizations and teams, biometric passkeys, passwordless magic links, PATs, GDPR privacy compliance, S3 disaster recovery, and automated 1-click cross-platform hosting—without external cloud vendor lock-in or recurring monthly database bills.

### Why Was FlareBase Built?
Modern cloud databases (like Firebase Firestore, AWS DynamoDB, and Supabase) often introduce:
1. **Unpredictable Billing & Vendor Lock-In**: Complex pricing tiers charging per-read, per-write, and per-GB egress.
2. **Setup Overhead & Heavy Dependencies**: Requiring complex Docker orchestration, PostgreSQL server clusters, or dedicated cloud accounts just for simple application backends.
3. **Data Sovereignty & Privacy Concerns**: Lack of native GDPR/DPDP cryptographic shredding, cooling-off windows, and offline local network capabilities.

**FlareBase solves this** by packing an entire enterprise backend into a single zero-dependency Node.js engine backed by high-performance SQLite in WAL (Write-Ahead Logging) mode, providing microsecond write latency, lock-free parallel reads, and instant 1-click double-clickable launchers for macOS, Windows, and Linux.

---

### FlareBase vs. Traditional Cloud & BaaS Solutions

| Feature / Primitive | **FlareBase** | **Firebase Firestore** | **Supabase** | **PocketBase** |
| :--- | :---: | :---: | :---: | :---: |
| **Self-Hosting Complexity** | **Zero-Config (1-Click)** | — Proprietary Cloud | ⚠️ Complex (10+ Containers) | ✓ Single Go Binary |
| **Storage Engine** | **SQLite WAL Mode** | Cloud NoSQL | PostgreSQL Cluster | SQLite |
| **Memory Footprint** | **~45 MB RAM** | Cloud Hosted | ~800 MB+ RAM | ~30 MB RAM |
| **Organizations & Teams** | ✓ **Native GitHub-Grade** | — Manual Cloud IAM | ⚠️ Org level only | — Single App Realm |
| **FIDO2 Biometric Passkeys** | ✓ **WebAuthn Level 3** | — Extension / Addon | ⚠️ Enterprise addon | — None |
| **Passwordless Magic Links**| ✓ **Built-in Auto-Burn** | ✓ Extension | ✓ Built-in | ⚠️ Email only |
| **Active Session Revocation**| ✓ **Remote Device Kill** | — Firebase Admin SDK | ⚠️ Manual JWT purge | — None |
| **Personal Access Tokens** | ✓ **Fine-Grained Scopes** | — Service Accounts | ⚠️ Service Role Keys | — None |
| **Row-Level Security (RLS)** | ✓ **Native Declarative** | ⚠️ Complex Rules Engine | ✓ PostgreSQL RLS | ⚠️ Collection API Rules |
| **Multi-Tenant Projects** | ✓ **Built-in Isolation** | — Multi-Project Setup | ⚠️ Separate DBs | — Single App Realm |
| **Envelope Encryption** | ✓ **AES-256-GCM + DEK/KEK** | — Platform Key Only | ⚠️ Manual pgcrypto | — None |
| **GDPR Portability & Shred**| ✓ **Built-in Art. 20 Export**| — Manual Scripts | — Manual SQL | — Manual SQL |
| **Zero-Downtime Socket Switch**| ✓ **Live GUI Port Rebind** | — N/A | — N/A | — N/A |
| **1-Click Native Launchers** | ✓ **Mac / Win / Linux** | — Cloud Only | — Docker Only | ⚠️ Terminal CLI |

---

## 2. Quick Start, 1-Click Launchers & Zero-Config Setup

FlareBase includes a built-in pre-flight auto-bootstrapper. On a freshly cloned repository, launching FlareBase automatically:
1. Detects missing dependencies and runs `npm install`.
2. Generates a production-ready `.env` file populated with strong 64-character cryptographic keys (`JWT_SECRET`, `ENCRYPTION_KEY`, `EMAIL_HASH_PEPPER`, `RECOVERY_PIN`).
3. Creates all required database and asset storage directories (`data/`, `uploads/`, `workspaces/`, `backups/`).

### 1-Click Universal First-Time Setup (New Machines & Fresh Clones)

When setting up FlareBase on a brand-new computer for the first time, double-click the dedicated setup launcher for your operating system:
- **macOS** ![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white): Double-click **`setup.command`** in Finder (or run `./setup.command`).
- **Windows** ![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white): Double-click **`setup.bat`** in File Explorer.
- **Linux & POSIX** ![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black): Run `./setup.sh` or `npm run setup`.

### Universal 1-Click Start Launchers (Daily Usage)

#### macOS Launcher (Finder & Terminal) ![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white)
Double-click **`start.command`** in your project folder, or run:
```bash
./start.command
```

#### Windows Launcher (File Explorer & Command Prompt) ![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white)
Double-click **`start.bat`** in File Explorer, or run:
```cmd
start.bat
```

#### Linux & POSIX Terminal Launcher ![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black)
```bash
./start.sh
# Or using npm shortcuts:
npm start
```

### Universal 1-Click Stop Launchers & Port Clearance

To stop the server, terminate all background processes, and release all network ports:
- **macOS**: Double-click **`stop.command`** in Finder (or run `./stop.command`).
- **Windows**: Double-click **`stop.bat`** in File Explorer.
- **Linux & POSIX**: Run `./stop.sh` or `npm run stop` / `npm run kill`.
- **Developer Console**: Open **Server Hosting & Network Center** (`/#tab-server-hosting`) and click **"Stop Server"**.

### Super Admin Provisioning & Environment Security

FlareBase enforces strict administrative isolation out of the box. Rather than promoting the first arbitrary registering user to Super Admin, FlareBase provisions a dedicated administrative root during initial setup:

- **Development Mode (`NODE_ENV === 'development'`)**:
  - **Default Super Admin**: `admin@flarebase.dev` (Password: `Admin@123`).
  - **1-Click Demo Access**: Amber **1-Click Admin Login (Demo)** quick-fill buttons appear on the login screen (`/`) and Super Admin Portal (`/admin-login.html`) for fast local developer onboarding.
- **Production Mode (`NODE_ENV === 'production'`)**:
  - **Zero-Trust Lockdown**: 1-click demo login UI and predictable fallback passwords are automatically disabled.
  - **Cryptographic First-Boot**: If no `ADMIN_PASSWORD` (or `INITIAL_ADMIN_PASSWORD`) is provided in `.env`, FlareBase generates a secure, cryptographically random 32-character initial password on first startup, hashes it using Argon2id, logs it once to the startup console, and appends it to `.env` (`INITIAL_ADMIN_PASSWORD`).
  - **Persistence**: Subsequent restarts preserve the configured administrator password and never overwrite existing database credentials.
- **Role Isolation**: User registration via `/api/v1/auth/register` provisions standard developer accounts with zero privilege escalation risk.

---

## 3. Architecture & Storage Engine

FlareBase uses a modular, layered architecture optimized for high concurrency, microsecond latency, and resource efficiency.

```
┌────────────────────────────────────────────────────────────────────────┐
│               FlareBase Glassmorphic Developer Console                   │
│          (Vanilla JS SPA • Tailwind CSS • FontAwesome • Chart.js)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST / SSE / WSS
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Express 4.x + TypeScript API                     │
│  ┌───────────────────────┬──────────────────────┬────────────────────┐ │
│  │   Auth & Passkeys     │    Rate Limiter      │  Telemetry Monitor │ │
│  │ (Argon2id, WebAuthn)  │ (Token Bucket, DDoS) │ (Prometheus, Heap) │ │
│  ├───────────────────────┼──────────────────────┼────────────────────┤ │
│  │  Orgs & Teams Engine  │   Storage Vault      │  CDC Event Bus     │ │
│  │ (RBAC, Multi-Tenant)  │ (Magic Byte & Quota) │ (SSE, WebSockets)  │ │
│  ├───────────────────────┼──────────────────────┼────────────────────┤ │
│  │   PATs & Sessions     │  Disaster Recovery   │  In-App Alerts     │ │
│  │ (Scoped Tokens, TTL)  │ (Dual-Target S3/Disk)│ (WebSocket Notifs) │ │
│  └───────────────────────┴──────────────────────┴────────────────────┘ │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Atomic Transactions
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               SQLite Embedded Engine (WAL Mode Enabled)                │
│  ┌──────────────────────┬──────────────────────┬─────────────────────┐ │
│  │  flarebase.db (Core DB)  │ flarebase.db-wal (Log)   │ flarebase.db-shm (Index)│ │
│  └──────────────────────┴──────────────────────┴─────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. GitHub-Grade Multi-Tenant Organizations & Functional Teams

FlareBase delivers enterprise-grade organization architecture modeled after GitHub Workspaces and AWS Organizations:

- **Dedicated Organizations Console (`#tab-organizations`)**: A top-level sidebar tab providing single-pane-of-glass management for organizations, member rosters, functional teams, invitations, and audit logs.
- **Top Bar Workspace Isolation Switcher**:
  - Seamlessly toggle between **Personal Workspace** and **Organization Workspaces** directly from the top header navigation.
  - When an organization is active, all views (Projects, Document Collections, File Storage, and Telemetry) are strictly scoped to that organization.
- **Multi-Tenant RBAC Hierarchy**:
  - `owner`: Full administrative control, ownership transfer, billing/quota overrides, and cascading deletion.
  - `admin`: Member invitations, role promotions, team creation, and project grants.
  - `member`: Standard access to assigned projects and team repositories.
  - `viewer`: Read-only access to organization assets.
- **Functional Teams (`@org/team`)**:
  - Create specialized sub-teams (e.g. `@acme/backend-core`, `@acme/frontend-ui`, `@acme/qa-leads`).
  - Assign granular project access permissions at the team level (`admin`, `maintainer`, `developer`, `reporter`, `guest`).
  - Members automatically inherit the highest permission between their team grant and direct collaborator overrides.
- **Organization Audit Trail**:
  - Records and visualizes 13+ event types with actor attribution, timestamps, IP addresses, and payload diffs.
- **Safe Ownership Transfer & Cascading Deletion**:
  - Transfer organization ownership to any existing admin.
  - Delete organizations with automatic cascading cleanup across all dependent teams, invites, and project grants.

---

## 5. FIDO2 Biometric Passkeys (WebAuthn Level 3)

FlareBase supports native passwordless biometric authentication following the W3C WebAuthn Level 3 standard:

- **Platform Biometrics**: Seamless 1-tap sign-in via Apple Touch ID, Apple Face ID, Windows Hello, and Android Biometrics.
- **Hardware Security Keys**: Full compatibility with FIDO2 hardware tokens (YubiKey 5 Series, Google Titan, Feitian).
- **Secure Enclave Backed**: Private keys never leave the user's hardware device; the server stores only the public key credential and credential ID.
- **Dynamic Signature Verification & Counter Defense**: Cryptographically verifies authenticator signatures with dynamic challenge tokens and signature counter validation to eliminate replay attacks.
- **Passkey Management in User Settings**: Register multiple devices, assign friendly names (e.g. "MacBook Pro Touch ID", "Work YubiKey"), and revoke lost keys with 1 click.
- **Super Admin Platform Toggle**: Super Admins can enable or disable Passkey authentication from the Platform Settings console, automatically showing or removing the Passkey Login button from the public login screen.

---

## 6. Passwordless Magic Links & 6-Digit Email OTP

Eliminate credential friction with auto-burning, passwordless access tokens:

- **Instant Magic Link Delivery**: Sends single-use, cryptographically generated sign-in links valid for 15 minutes.
- **6-Digit Numeric OTP Fallback**: Generates a synchronized 6-digit numeric verification code for users logging in from separate browser tabs or mobile devices.
- **Single-Use Invariant (Auto-Burn)**: Tokens and OTPs are irrecoverably burned upon initial verification, preventing link interception or reuse.
- **Super Admin Platform Toggle & Button Removal**: Super Admins can disable Passwordless Magic Links from the Platform Settings console (e.g., until external email/SMTP senders are configured). When disabled, the Magic Link button is completely removed from the login screen and backend request endpoints return HTTP 403 Forbidden.

---

## 7. Active Sessions & Remote Device Logout

Comprehensive real-time session visibility and instant revocation:

- **User-Agent Device Fingerprinting**: Automatically parses browser headers to display exact Device Type (`Desktop`, `Mobile`, `Tablet`), Operating System (`macOS`, `Windows`, `iOS`, `Android`, `Linux`), and Browser (`Chrome`, `Safari`, `Firefox`, `Edge`).
- **IP Address & Geolocation Tracking**: Displays client IP addresses, country flags, and last-active timestamps for every active session.
- **Current Device Indicator**: Prominently highlights the user's active session with a pulsating green badge.
- **1-Click Remote Logout**: Revoke specific suspicious sessions or click **"Log Out All Other Devices"** to instantly invalidate all remote refresh tokens across the globe.
- **User Security Activity Log**: Audit trail tracking password updates, MFA activations, PAT creations, and session revocations.

---

## 8. Personal Access Tokens (PATs) & Fine-Grained Scopes

Secure automation credentials designed for CI/CD pipelines, CLI tools, and background cron workers:

- **Granular Scope Isolation**:
  - `db:read`: Query documents and collections.
  - `db:write`: Insert, update, and delete documents.
  - `storage:read`: Access private storage assets and signed URLs.
  - `full_access`: Unrestricted administrative programmatic access.
- **Cryptographic Hashing & One-Time Reveal**: PATs are formatted as `pat_...` and hashed with SHA-256 before database storage. The raw secret is revealed exactly once upon creation in a copyable modal drawer.
- **Custom TTL & Expiration**: Set expiration periods (`7d`, `30d`, `90d`, `1y`, or `Never Expire`).
- **Native Header Support**: Authenticate API requests using `Authorization: Bearer pat_...` or `x-flarebase-pat: pat_...`.

---

## 9. In-App Real-Time Notification Center

Integrated notification bell with real-time WebSocket delivery and unread count badges:

- **Interactive Header Bell**: Dropdown drawer displaying real-time alert cards with categories (`security`, `team`, `system`, `quota`, `billing`).
- **WebSocket Streaming**: Instant push delivery for security alerts (new device sign-in, session revocation), team invitations, and quota thresholds.
- **Unread Counter Badge**: Dynamically increments in real time; clears on "Mark All as Read" or individual card dismissal.

---

## 10. User Storage Quotas & Visual Metering

Transparent storage limits and byte-level metering to prevent disk exhaustion:

- **500 MB Default Storage Quota**: Every user receives 500 MB of protected storage out-of-the-box.
- **Real-Time Visual Metering**: Visual progress bars in the Storage Vault displaying used bytes, remaining quota, total file count, and percentage consumption.
- **Dynamic Color Thresholds**:
  - Green (`< 70%`): Healthy usage.
  - Amber (`70% - 90%`): Approaching limit.
  - Red (`> 90%`): Critical quota warning.
- **Upload Protection Shield**: Rejects file uploads exceeding quota with informative HTTP 413 error messages.

---

## 11. Document Database & Row-Level Security (RLS)

FlareBase implements a schemaless NoSQL JSON document database backed by SQLite JSON1 primitives.

### Dual-Layer Declarative Rules Engine
FlareBase evaluates security rules at two independent layers before allowing any query or mutation:
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

---

## 12. Project-Isolated Authenticator & OAuth 2.0

Every FlareBase project operates as an independent authentication realm:
- **Isolated User Rosters**: Users in Project A cannot access Project B unless explicitly provisioned.
- **Configurable Policies**: `open_saas` (public self-registration) vs `admin_only` (enterprise invite-only).
- **OAuth 2.0 Providers**: Google Identity Services, Apple Sign-In, and GitHub OAuth.
- **Dynamic Config Discovery (`/api/v1/project-auth/config`)**: Client SDKs dynamically discover enabled providers with zero hardcoded secret leakage.

---

## 13. Comprehensive Security Architecture

- **Password Hashing**: State-of-the-art **Argon2id** algorithm with per-user cryptographic salts.
- **RFC 6238 TOTP Multi-Factor Authentication**: Native Authenticator app integration (Google Authenticator, 1Password, Authy).
- **Two-Tier Envelope Encryption**: Primary KEK wrapping per-project DEKs with field-level **AES-256-GCM**.
- **Blind Index Email Search**: Irreversible, peppered HMAC-SHA256 blind indexing for encrypted user lookup.
- **Automated Threat Detection & IP Quarantine Jail**: Sliding 60-second threat window with automatic 15-minute jailing after 5 failed attempts.
- **Super Admin Endpoint Perimeter Lock**: Restricts `/api/v1/admin/*` strictly to `127.0.0.1` and authorized management subnets.

## 14. Auto Threat Detection & Live User Security Intelligence Matrix

FlareBase introduces a dedicated, real-time **Threat Intelligence & User Security Radar** workspace tab (`#tab-threat-radar`) restricted exclusively to **Super Administrators**. Every control, filter, inspector modal, and live stream operates with **zero dead buttons** and sub-millisecond WAF inspection. Regular developers and users are restricted from viewing or accessing threat telemetry.

```
   ┌────────────────────────────────────────────────────────────┐
   │       Live Request Ingress (Zero-Latency WAF < 0.01ms)     │
   └─────────────────────────────┬──────────────────────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
   [Clean Requests]                           [Detected Threats]
   Processed Instantly                     • SQL / NoSQL Injection
                                           • XSS Script Injections
                                           • Path Traversal Escapes
                                           • Velocity Spikes / Bursts
                                           • Multi-Account Collisions
                                                       │
                                                       ▼
                                      ┌────────────────────────────────┐
                                      │ Dynamic Risk Score Heuristic   │
                                      │ (0 - 100 Composite Calculation)│
                                      └────────────────┬───────────────┘
                                                       │
                           ┌───────────────────────────┴───────────────────────────┐
                           ▼                                                       ▼
            [Score >= 70: Auto-Quarantine]                         [WebSocket Live Threat Stream]
            • Account flagged in SQLite                            • Broadcasts real-time events
            • JWT tokens revoked                                   • Instant UI console update
            • Admin notification dispatched                        • Audit trail logged
```

### Key Capabilities:
- **5 Live Top-Level KPI Summary Cards**:
  1. 👥 **Inspected Users**: Total platform and project user accounts continuously analyzed.
  2. 🚨 **Quarantined Accounts**: Active security isolates currently blocked from platform resources.
  3. 🛡️ **Threats Blocked**: Aggregate intercepted attack probes across SQLi, XSS, Path Traversal, and DoS bursts.
  4. 📶 **Shared Wi-Fi Safe**: Verified multi-device NAT environments with zero false-positive penalties.
  5. ⚡ **WAF Latency**: Ultra-low microsecond inspection benchmark (**0.0011 ms / req**).
- **Interactive Live Search & Filter Bar**:
  - Instant substring search across User Email, Display Name, User ID, Hardware Device Fingerprint, and IP Subnet.
  - Category filters: *All*, *SQL / NoSQL Injection*, *XSS Attacks*, *Path Traversal*, *DoS Bursts*, *Bot Activity*, *Canonical Alias Flood*, *Multi-Account Physical Device*.
  - Risk Level filter: *Critical Risk (Score $\ge 70$)*, *Moderate Warning (40–69)*, *Clean ($< 40$)*.
  - Account Status toggle: *Quarantined Only* vs *Active Normal*.
- **User Security Threat Matrix Table**:
  - Live composite risk progress bars (🟢 Clean $<40$, 🟡 Warning $40-69$, 🔴 Critical $\ge 70$).
  - Physical hardware device fingerprints ($D_{\text{hash}}$) with **1-click clipboard copy button** and multi-account device counters.
  - Verified network indicators (`Multi-Device NAT Safe (100% conf)` vs `Datacenter / VPN`).
  - Active action controls: **Inspect Details**, **Unflag & Restore**, and **Quarantine**.
- **Deep Incident Payload Inspector Modal (`#modal-threat-incident-detail`)**:
  - Formatted JSON payload viewer displaying matched signatures, parameters, client IP, User-Agent, and timestamps.
  - 1-click status toggle to unflag or quarantine directly inside the inspector.
- **Direct Manual Quarantine Modal (`#modal-quarantine-user-direct`)**:
  - Custom admin reason (`malicious_traffic`, `bot_activity`, `spam`, `compromised_account`), severity picker (`critical`, `high`, `medium`), and investigation notes.
- **Sub-Millisecond Real-Time Threat Event Stream (WebSocket CDC)**:
  - Live scrolling telemetry broadcasting `SECURITY_ALERT_FLAGGED`, `SECURITY_FLAG_RESOLVED`, `SECURITY_AUDIT_COMPLETED`, `IP_JAILED`, `IP_UNJAILED`, and `DEVICE_ACCESS_REQUESTED`.
  - Live stream controls: **Pause / Resume Stream** and **Clear Buffer**.
- **On-Demand Platform & Project Security Audits**:
  - Instant one-click heuristic scan across all registered platform and project accounts.
- **Report Export & Purge**:
  - Export audit logs in formatted JSON or CSV formats, and purge historical resolved incident logs.

---

## 15. Multi-Account Anti-Spam & Shared Wi-Fi / NAT Intelligence

To prevent abusive multi-account creation without penalizing legitimate users in shared network environments (such as university dorms, coffee shops, coworking spaces, and office NATs), FlareBase deploys a multi-signal risk heuristic:

### 1. Hardware Device Fingerprinting ($D_{\text{hash}}$)
- Cryptographic hash synthesized from canvas rendering, WebGL driver vendor signatures, AudioContext hardware oscillations, CPU hardware concurrency, screen color depth, and browser entropy.
- Detects the same physical device creating multiple accounts across distinct browser sessions or incognito windows.

### 2. Canonical Email Alias Normalization
- Normalizes incoming registration emails to detect duplicate alias abuse before database persistence:
  - **Gmail Dot-Trick Normalization**: `j.o.h.n.doe@gmail.com` $\rightarrow$ `johndoe@gmail.com`.
  - **Sub-Addressing / Plus-Tag Stripping**: `user+spam1@example.com` $\rightarrow$ `user@example.com`.
  - **Provider Aliasing**: Normalizes `@googlemail.com` $\rightarrow$ `@gmail.com`.

### 3. Shared Wi-Fi / NAT Confidence Ratio ($R_{\text{unique}}$)
- When multiple accounts register from the same public IP address, FlareBase calculates the network uniqueness ratio:
  $$\text{Confidence} = \frac{\text{Distinct Hardware Devices } (D_{\text{distinct}})}{\text{Total Registered Users } (U_{\text{distinct}})}$$
- If distinct hardware device fingerprints are observed under the same IP, the connection is marked **Shared Wi-Fi Safe (100% confidence)** with **0 risk penalty**.
- If the *same* hardware device fingerprint is used repeatedly across multiple email aliases from the same IP, the system flags a **Multi-Account Device Collision** and applies an elevated risk score.

---

## 16. Emergency Recovery Portal & High-Availability Gateways

FlareBase provides dedicated disaster recovery and emergency administrative gateways that remain **100% operational even during Emergency Maintenance Mode and Panic Lockdowns**:

- **Super Admin Login Gateway (`/admin-login.html`, `/admin-login`, `/admin/login`)**:
  - Dedicated out-of-band portal for platform administrators to authenticate, override maintenance settings, and manage platform locks.
  - Includes a 1-click demo login button for local testing and pre-flight validation.
- **Bare-Metal System Recovery Portal (`/recovery.html`, `/recovery`, `/system/recovery`)**:
  - Protected by a client-side and server-side **6-digit Server Passcode lock** (`RECOVERY_PIN`).
  - Allows bare-metal database snapshot restoration (`.db.gz`, `.sqlite`, `.db`) using the master `ENCRYPTION_KEY`.
  - Features a 60-second idle auto-lock security timer.
- **Guaranteed Maintenance & Lockdown Bypass**:
  - During scheduled maintenance (`503 Service Unavailable`) or panic lockdown levels, the recovery routes (`/recovery.html`, `/api/v1/system/restore`, `/api/v1/system/verify-recovery-pin`, `/admin-login.html`, `/api/v1/auth/login`) are unconditionally whitelisted so administrators are never locked out of their server.

---

## 17. Storage Vault & Asset Management

- **Magic Byte Inspection**: File headers are validated against genuine binary signatures (`image/png`, `application/pdf`, `video/mp4`) to prevent executable masking.
- **Scoped Quotas & Size Limits**: Configurable per-user and per-project storage caps.
- **Temporary Signed URLs**: Generate time-bounded, cryptographic download links for private assets.

---

## 18. Real-Time Change Data Capture (CDC)

- **Server-Sent Events (SSE)**: Unidirectional real-time document change feeds (`/api/v1/db/collections/:name/realtime`).
- **WebSockets (`/ws`)**: High-throughput, bi-directional event bus supporting live channel subscriptions, presence, and terminal streaming.
- **Instant Client UI Updates**: Drop-in `.onSnapshot()` listeners update client state in real time.

---

## 19. GDPR Privacy, Right to Erasure & Appeals

- **Article 20 Data Portability**: Instant one-click portable JSON export bundles containing all user data.
- **7-Day Cooling-Off Erasure Window**: Scheduled account deletion with a 7-day cancellation window.
- **Cryptographic Shredding**: Irrecoverably purges user DEKs, rendering historical encrypted fields permanently unreadable.
- **Compliance Appeals**: Formal compliance notices and appeals submission workflow.

---

## 20. Disaster Recovery & S3 Backup Engine

- **Hot Database Snapshots**: Uses SQLite online backup APIs (`VACUUM INTO`) for consistent, non-blocking snapshots.
- **Automated S3 Replication**: Encrypted uploads to Amazon S3, MinIO, or Cloudflare R2.
- **Retention & Purge Policies**: Automated lifecycle cleanup of expired snapshots.

---

## 21. Network & Server Hosting Center, Zero-Downtime Socket Rebinding

- **Live Host Binding Modes**: Toggle between **Dual Host (`0.0.0.0`)**, **Localhost (`127.0.0.1`)**, **Wi-Fi LAN IP**, and **Custom Domain**.
- **Zero-Downtime Socket Rebinding**: Dynamically rebind the HTTP/WebSocket server to new IP addresses and ports without dropping active sessions.
- **Subnet Access Control & Extender Filtering**: CIDR notation (`192.168.31.0/24`) and IP ranges.
- **Zero-Lockout Guarantee**: Localhost (`127.0.0.1`, `::1`) is hardcoded as unconditionally allowed.
- **Real-Time Geo-IP & Threat Intelligence**: Live country flags, threat scores (Tor, VPN, Cloud VPS, Clean), and country-level geo-fencing.
- **Adaptive Subnet Rate Limiting**: Subnet-level RPM quotas, burst caps, and bandwidth throttling.

---

## 22. Super Admin Console & Telemetry

- **Live Telemetry Charts**: Real-time visual monitoring of CPU load, V8 heap memory allocation, and query latency via Chart.js.
- **Dynamic Rate Limit Governance**: Update global rate limits live without server restarts.
- **User Management & Moderation**: Inspect rosters, adjust roles, review deletion queues, and issue security compliance notices.
- **Super Admin Power Controls**: In-dashboard server shutdown with process-tree termination and terminal closure.

---

## 23. Complete REST API Registry

### Public System & Monitoring
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server health check and uptime status |
| `GET` | `/metrics` | Prometheus format exposition metrics |
| `GET` | `/api/v1/system/status` | System operational & maintenance status |

### User Authentication & Security (`/api/v1/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register new developer/user account (Super Admin is pre-seeded during setup) |
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

### FIDO2 Biometric Passkeys (`/api/v1/auth/passkeys`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/passkeys/register-options` | Generate WebAuthn attestation options & challenge |
| `POST` | `/api/v1/auth/passkeys/register-verify` | Verify attestation signature & store public key |
| `POST` | `/api/v1/auth/passkeys/auth-options` | Generate WebAuthn assertion challenge for sign-in |
| `POST` | `/api/v1/auth/passkeys/auth-verify` | Verify assertion signature & issue JWT tokens |
| `GET` | `/api/v1/auth/passkeys` | List user's registered passkey credentials |
| `PATCH` | `/api/v1/auth/passkeys/:id` | Rename registered passkey device |
| `DELETE` | `/api/v1/auth/passkeys/:id` | Revoke/delete registered passkey |

### Passwordless Magic Links & OTP (`/api/v1/auth/magic-link`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/magic-link/send` | Generate single-use magic link and 6-digit email OTP |
| `POST` | `/api/v1/auth/magic-link/verify` | Verify OTP code or URL token & auto-burn token |

### Active Sessions & Security Logs (`/api/v1/auth/sessions`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/auth/sessions` | List all active client devices with OS, browser, IP |
| `DELETE` | `/api/v1/auth/sessions/:id` | Revoke a specific remote device session |
| `DELETE` | `/api/v1/auth/sessions/others` | Revoke all remote device sessions except current |
| `GET` | `/api/v1/auth/security-logs` | Retrieve user security audit trail |

### Personal Access Tokens (`/api/v1/auth/pats`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/auth/pats` | List user's active personal access tokens |
| `POST` | `/api/v1/auth/pats` | Generate new scoped PAT (returns raw secret once) |
| `DELETE` | `/api/v1/auth/pats/:id` | Revoke a personal access token |

### GitHub-Grade Organizations & Teams (`/api/v1/organizations`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/organizations` | List organizations user belongs to |
| `POST` | `/api/v1/organizations` | Create a new organization |
| `GET` | `/api/v1/organizations/:id` | Get organization details and metrics |
| `PATCH` | `/api/v1/organizations/:id` | Update organization profile, slug, logo |
| `DELETE` | `/api/v1/organizations/:id` | Cascading delete organization (Owner only) |
| `POST` | `/api/v1/organizations/:id/transfer` | Transfer organization ownership |
| `GET` | `/api/v1/organizations/:id/members` | List organization members and roles |
| `POST` | `/api/v1/organizations/:id/members` | Invite new member to organization |
| `PATCH` | `/api/v1/organizations/:id/members/:userId` | Update member role (`admin`, `member`, `viewer`) |
| `DELETE` | `/api/v1/organizations/:id/members/:userId` | Remove member from organization |
| `GET` | `/api/v1/organizations/:id/teams` | List functional teams in organization |
| `POST` | `/api/v1/organizations/:id/teams` | Create a functional team (`@org/team`) |
| `PATCH` | `/api/v1/organizations/:id/teams/:teamId` | Update team name or description |
| `DELETE` | `/api/v1/organizations/:id/teams/:teamId` | Delete a functional team |
| `GET` | `/api/v1/organizations/:id/teams/:teamId/members`| List members of a team |
| `POST` | `/api/v1/organizations/:id/teams/:teamId/members`| Add member to team |
| `DELETE` | `/api/v1/organizations/:id/teams/:teamId/members/:userId`| Remove member from team |
| `GET` | `/api/v1/organizations/:id/projects/:projectId/access`| Get effective project access (teams + direct) |
| `POST` | `/api/v1/organizations/:id/projects/:projectId/teams`| Grant team access to project |
| `DELETE` | `/api/v1/organizations/:id/projects/:projectId/teams/:teamId`| Revoke team project grant |
| `POST` | `/api/v1/organizations/:id/projects/:projectId/collaborators`| Add direct project collaborator override |
| `DELETE` | `/api/v1/organizations/:id/projects/:projectId/collaborators/:userId`| Remove collaborator override |
| `GET` | `/api/v1/organizations/:id/audit-logs` | Retrieve organization audit trail |

### In-App Real-Time Notifications (`/api/v1/notifications`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/notifications` | List user notifications with unread counter |
| `PATCH` | `/api/v1/notifications/:id/read` | Mark single notification as read |
| `PATCH` | `/api/v1/notifications/read-all` | Mark all user notifications as read |

### Project User Auth & OAuth (`/api/v1/project-auth`)
*Requires `x-flarebase-api-key` header.*
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/project-auth/config` | Fetch public auth config (enabled providers & client IDs) |
| `POST` | `/api/v1/project-auth/register` | Register end-user (governed by registration policy) |
| `POST` | `/api/v1/project-auth/login` | Authenticate end-user with Email/Password |
| `POST` | `/api/v1/project-auth/oauth/:provider` | Authenticate via OAuth (`google`, `apple`, `github`) |

### Database Services (`/api/v1/db`)
*Requires `x-flarebase-api-key`, `x-api-key`, `apikey`, `?apiKey=...`, `Authorization: Bearer <JWT>`, or `x-flarebase-pat` header.*
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

### File Storage & Quotas (`/api/v1/storage`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/storage/quota` | Get user storage quota (used bytes, max bytes, file count) |
| `POST` | `/api/v1/storage/upload` | Multipart file upload with quota check & magic byte check |
| `POST` | `/api/v1/storage/signed-url` | Generate temporary signed download URL |
| `GET` | `/api/v1/storage/assets/:filename` | Stream or download stored file asset |

### Super Admin Operations (`/api/v1/admin`)
*Requires Super Admin Bearer JWT or One-Time Access Token (OTT).*
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/admin/stats` | Real-time CPU, RAM, and SQLite query metrics |
| `PATCH` | `/api/v1/admin/platform-settings` | Update hosting mode, bind IP, port, or custom domain |
| `POST` | `/api/v1/admin/server/shutdown` | Gracefully shut down server, release port & close terminal |
| `POST` | `/api/v1/admin/server/hot-restart` | Trigger zero-downtime rolling reload |
| `GET` | `/api/v1/admin/server/cluster-diagnostics` | Scan candidate ports and socket binding matrix |
| `GET` | `/api/v1/admin/tunnel/status` | Fetch live global public tunnel status report & telemetry |
| `POST` | `/api/v1/admin/tunnel/start` | Start global HTTPS tunnel (Cloudflare, Ngrok, Localtunnel) |
| `POST` | `/api/v1/admin/tunnel/stop` | Disconnect active global public tunnel |
| `POST` | `/api/v1/admin/tunnel/attach` | Adopt an existing active external tunnel URL (CLI cloudflared) |
| `PATCH` | `/api/v1/admin/tunnel/settings` | Update saved tunnel provider preferences |
| `DELETE` | `/api/v1/admin/tunnel/settings` | Reset/wipe saved tunnel configuration |
| `GET` | `/api/v1/admin/traffic/topology` | Fetch 4-stage pipeline telemetry & live stream matrix |
| `GET` | `/api/v1/admin/network/rules` | Fetch all configured IP/CIDR/range access rules |
| `POST` | `/api/v1/admin/network/rules` | Create a new IP, CIDR subnet, or range rule |
| `DELETE` | `/api/v1/admin/network/rules/:id` | Delete a network access rule |
| `GET` | `/api/v1/admin/network/devices` | Retrieve real-time tracked client devices & traffic stats |
| `POST` | `/api/v1/admin/network/devices/:ip/toggle-block` | Toggle 1-click blocking state for a device IP |
| `GET` | `/api/v1/admin/network/settings` | Fetch IP filtering enforcement status & default policy |
| `PATCH` | `/api/v1/admin/network/settings` | Toggle whitelist enforcement or update default policy |
| `GET` | `/api/v1/admin/network/geoip/:ip` | Real-time Geo-IP, ISP, ASN, and Threat Intelligence lookup |
| `GET` | `/api/v1/admin/network/jail` | Fetch all quarantined/jailed abusive client IPs |
| `POST` | `/api/v1/admin/network/jail` | Manually quarantine an IP with cooldown duration |
| `POST` | `/api/v1/admin/network/jail/:ip/pardon` | Pardon/unjail a quarantined IP |
| `DELETE` | `/api/v1/admin/network/jail/clear` | Clear all active IP quarantine penalties |
| `GET` | `/api/v1/admin/network/rate-limits` | List all custom subnet rate limiting policies |
| `POST` | `/api/v1/admin/network/rate-limits` | Create new CIDR subnet rate quota and burst cap |
| `PATCH` | `/api/v1/admin/network/rate-limits/:id` | Update subnet rate policy limits and active status |
| `DELETE` | `/api/v1/admin/network/rate-limits/:id` | Delete a subnet rate limiting policy |
| `GET` | `/api/v1/admin/account-deletions` | Inspect active and historical account deletion queues |
| `POST` | `/api/v1/admin/account-deletions/:id/cancel` | Retain an account upon user appeal |
| `POST` | `/api/v1/admin/backups/purge` | Trigger immediate cleanup of expired snapshots |

### Auto Threat Detection & Live User Security Intelligence (`/api/v1/admin/threat-intelligence` & `/api/v1/projects/:id/threat-intelligence`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/admin/threat-intelligence/overview` | Platform-wide threat KPI summary (inspected users, quarantined accounts, threats blocked, shared Wi-Fi safe count, WAF latency) |
| `GET` | `/api/v1/admin/threat-intelligence/users` | Platform user security threat matrix with composite risk scores, device fingerprints, and query filters |
| `GET` | `/api/v1/admin/threat-intelligence/incidents/:id` | Deep incident payload viewer and forensic inspection metadata |
| `POST` | `/api/v1/admin/threat-intelligence/users/:id/quarantine` | Quarantine user account with admin reason, severity, and notes |
| `POST` | `/api/v1/admin/threat-intelligence/users/:id/unflag` | Unflag/pardon user and clear quarantine isolation |
| `POST` | `/api/v1/admin/threat-intelligence/audit` | Trigger on-demand security audit scan across all accounts |
| `GET` | `/api/v1/admin/threat-intelligence/export` | Export threat and security audit logs in JSON or CSV format |
| `DELETE` | `/api/v1/admin/threat-intelligence/logs` | Purge historical resolved threat logs |
| `GET` | `/api/v1/projects/:id/threat-intelligence/overview` | Project-scoped threat KPI metrics and health status |
| `GET` | `/api/v1/projects/:id/threat-intelligence/users` | Project-scoped user security threat matrix |
| `POST` | `/api/v1/projects/:id/threat-intelligence/users/:userId/quarantine` | Quarantine project end-user account |
| `POST` | `/api/v1/projects/:id/threat-intelligence/users/:userId/unflag` | Unflag/restore project end-user account |
| `POST` | `/api/v1/projects/:id/threat-intelligence/audit` | Trigger project-scoped user security scan |

### Bare-Metal System Recovery & High-Availability Gateways (`/api/v1/system`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/system/verify-recovery-pin` | Verify 6-digit server recovery passcode (`RECOVERY_PIN`) |
| `POST` | `/api/v1/system/restore` | Bare-metal database snapshot restore using master `ENCRYPTION_KEY` |
| `GET` | `/admin-login.html` | Super Admin Gateway (guaranteed bypass during maintenance) |
| `GET` | `/recovery.html` | Bare-Metal Recovery Portal (protected by 6-digit passcode) |

---

## 24. Performance Verification & Automated Test Suites

FlareBase includes comprehensive integration test suites with over **365 automated verification checks** running with isolated in-memory SQLite instances (`DB_PATH=:memory:`):

```bash
# Run complete test suite (all 22 test suites passing 100%)
npm test

# 1. Admin RBAC & Route Protection (15 checks)
npx ts-node tests/admin-rbac.test.ts

# 2. Remote One-Time Tokens (OTT) & Zero-Trust Device Approvals (29 checks)
npx ts-node tests/remote-ott-access.test.ts

# 3. Global Public Tunneling Manager & Ingress Killswitches (22 checks)
npx ts-node tests/tunnel-manager.test.ts

# 4. Mesh VPN & Peer WireGuard/Tailscale Network Sync (18 checks)
npx ts-node tests/mesh-vpn.test.ts

# 5. Real-Time Traffic Topology & Flow Telemetry Matrix (28 checks)
npx ts-node tests/traffic-topology.test.ts

# 6. Global Ingress & Super Admin Device Lock (17 checks)
npx ts-node tests/global-perimeter-lock.test.ts

# 7. FIDO2 Biometric Passkeys & WebAuthn Level 3 (20 checks)
npx ts-node tests/passkeys.test.ts

# 8. Passwordless Magic Links & 6-Digit Email OTP (10 checks)
npx ts-node tests/magic-link.test.ts

# 9. User Active Sessions & Remote Device Logout (13 checks)
npx ts-node tests/user-sessions.test.ts

# 10. Personal Access Tokens (PATs) & Fine-Grained Scopes (11 checks)
npx ts-node tests/user-pats.test.ts

# 11. GitHub-Grade Multi-Tenant Organizations & Teams (40 checks)
npx ts-node tests/organizations.test.ts

# 12. In-App Real-Time Notification Center (9 checks)
npx ts-node tests/notifications.test.ts

# 13. User Storage Quotas & Visual Metering (4 checks)
npx ts-node tests/storage-quota.test.ts

# 14. Multi-Tenant Project User Isolation & Scoping (12 checks)
npx ts-node tests/project-user-isolation.test.ts

# 15. Cross-Project Boundary & Data Isolation (15 checks)
npx ts-node tests/cross-project-isolation.test.ts

# 16. Vulnerability Hardening: SQLi, XSS, Path Traversal & ReDoS (25 checks)
npx ts-node tests/vulnerability-hardening.test.ts

# 17. Project Auth Policy & Registration Hardening (14 checks)
npx ts-node tests/project-auth-settings-hardening.test.ts

# 18. Anti-Spam & Threat Detection Heuristics (18 checks)
npx ts-node tests/anti-spam-threat-detection.test.ts

# 19. Multi-Account Physical Device Collision Scoring & Shared Wi-Fi / NAT Intelligence (16 checks)
npx ts-node tests/multi-account-device-scoring.test.ts

# 20. Real-Time Threat Detection & WebSocket CDC Stream (15 checks)
npx ts-node tests/realtime-threat-detection.test.ts

# 21. Threat Intelligence Radar & User Security Matrix (20 checks)
npx ts-node tests/threat-intelligence-matrix.test.ts

# 22. Load Concurrency & Performance Benchmarks (20 checks)
npx ts-node tests/load-concurrency-performance.test.ts
```

---

## 25. High-Availability & Production Deployment

For complete reverse-proxy architecture guides and tuning recommendations, see **[Production Reverse-Proxy Deployment Guide](docs/reverse-proxy-deployment.md)**. Ready-to-use production configuration templates are provided in the repository:
- **Caddy (Automatic HTTPS & HTTP/3)**: [`deploy/caddy/Caddyfile`](deploy/caddy/Caddyfile)
- **Traefik (Container Routing & Let's Encrypt)**: [`deploy/traefik/docker-compose.yml`](deploy/traefik/docker-compose.yml)
- **Nginx (Virtual Host with SSE / WebSocket Tuning)**: [`deploy/nginx/flarebase.conf`](deploy/nginx/flarebase.conf)

### Option 1: Reverse Proxy with Nginx (Recommended)
```nginx
upstream flarebase_nodes {
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
        proxy_pass http://flarebase_nodes;
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

### Option 2: PM2 Multi-Core Cluster
```bash
# Compile TypeScript to dist/
npm run build

# Start cluster across all CPU cores
pm2 start dist/server.js -i max --name flarebase

# Perform zero-downtime rolling restart
pm2 reload flarebase
```

---

## 26. Official SDKs, Browser Drops & AI Agent Integration

FlareBase provides official client SDK packages for modern JavaScript/TypeScript and React ecosystems:

- 📦 **[`@flarebase/client`](packages/client/)**: Standalone, zero-runtime-dependency TypeScript client SDK supporting Node.js 18+, Edge environments, and browsers (ESM, CJS, and IIFE). Includes typed collections, auth, storage, and real-time SSE change data capture.
- ⚛️ **[`@flarebase/react`](packages/react/)**: Reactive React and Next.js hooks package providing `<FlareBaseProvider>`, `useCollection<T>()` with live SSE synchronization and optimistic UI updates, `useDocument<T>()`, `useAuth()`, and `useStorage()`.

### Drop-In Browser Script (`/flarebase.js`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>FlareBase App</title>
  <!-- Load the FlareBase Client SDK directly from the server -->
  <script src="http://localhost:3000/flarebase.js"></script>
</head>
<body>
  <script>
    const flarebase = new FlareBaseClient({
      baseUrl: 'http://localhost:3000',
      apiKey: 'flare_pk_your_project_key_here'
    });

    async function startApp() {
      // 1. Fetch documents from 'todos' collection
      const todos = await flarebase.collection('todos').query();
      console.log('Todos:', todos);

      // 2. Real-time live update listener (SSE CDC)
      const unsubscribe = flarebase.collection('todos').onSnapshot((change) => {
        console.log('Real-time event:', change.type, change.document);
      });
    }

    startApp();
  </script>
</body>
</html>
```

---

## Contributing

We welcome contributions from developers, security researchers, and teams worldwide!

To report issues, propose enhancements, or submit pull requests:
1. Review our [Contributing Guide](CONTRIBUTING.md) for code standards and workflow instructions.
2. Ensure all automated test suites pass cleanly (`npm test`).
3. Submit a pull request or open an issue on GitHub.

For sensitive security reports, please use private GitHub Security Advisories.

---

## License

This project is licensed under the [MIT License](LICENSE) — Copyright (c) 2026 H R Arya Ayyappa Halambi.
