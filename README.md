# AegisDB 🛡️ — Next-Generation Open-Source BaaS

AegisDB is a lightweight, zero-configuration, production-grade Firebase-like Backend-as-a-Service (BaaS) engine. It is fully self-hosted, ultra-performant, and provides developers with a full suite of cloud backend primitives straight out of the box—complete with a modern, glassmorphic developer console featuring a Mac-style collapsible sidebar.

![AegisDB Engine](https://img.shields.io/badge/AegisDB-Engine-6366f1?style=for-the-badge&logo=shield&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![SQLite WAL](https://img.shields.io/badge/SQLite-WAL_Mode-003b57?style=for-the-badge&logo=sqlite&logoColor=white)
![OAuth 2.0](https://img.shields.io/badge/OAuth_2.0-Google_|_Apple_|_GitHub-2496ed?style=for-the-badge&logo=google&logoColor=white)
![Security Rules](https://img.shields.io/badge/Security-Row_Level_&_Collection-10b981?style=for-the-badge&logo=target&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=for-the-badge&logo=docker&logoColor=white)

---

## 📑 Table of Contents
1. [Overview & Core Value Proposition](#1-overview--core-value-proposition)
2. [Quick Start & Setup](#2-quick-start--setup)
3. [Architecture & Storage Engine](#3-architecture--storage-engine)
4. [Document Database & Row-Level Security (RLS)](#4-document-database--row-level-security-rls)
5. [Project-Isolated Authenticator & OAuth 2.0](#5-project-isolated-authenticator--oauth-20)
6. [Comprehensive Security Architecture](#6-comprehensive-security-architecture)
7. [Storage Vault & Asset Management](#7-storage-vault--asset-management)
8. [Real-Time Change Data Capture (CDC)](#8-real-time-change-data-capture-cdc)
9. [GDPR Privacy, Right to Erasure & Appeals](#9-gdpr-privacy-right-to-erasure--appeals)
10. [Disaster Recovery & Backup Engine](#10-disaster-recovery--backup-engine)
11. [Network & Hosting Center, Zero-Downtime Socket Rebinding & Live Terminal Streamer](#11-network--hosting-center-zero-downtime-socket-rebinding--live-terminal-streamer)
12. [Super Admin Console & Telemetry](#12-super-admin-console--telemetry)
13. [Complete REST API Registry](#13-complete-rest-api-registry)
14. [Performance Verification & Load Testing Suite](#14-performance-verification--load-testing-suite)
15. [High-Availability & Production Deployment](#15-high-availability--production-deployment)
16. [Official SDKs, Browser Drops & AI Agent Integration](#16-official-sdks-browser-drops--ai-agent-integration)

---

## 1. Overview & Core Value Proposition

**AegisDB** is engineered to eliminate the operational complexity and prohibitive costs of enterprise cloud databases (such as AWS DynamoDB, Google Cloud Firestore, and Firebase) while maintaining enterprise-grade security and developer ergonomics.

### ✨ Key Capabilities
- 🚀 **Zero-Config Self-Hosting**: Runs anywhere Node.js runs—from a Raspberry Pi to high-core cloud VMs.
- ⚡ **SQLite WAL-Mode Acceleration**: Parallel, lock-free reads and serialized microsecond writes.
- 🛡️ **Dual-Layer Security Rules**: Granular, declarative access control at both **Collection-Level** and **Individual Document-Level (Row-Level Security)**.
- 🔑 **Multi-Tenant Project Isolation**: Independent API keys, user rosters, OAuth configs, and schemas per project.
- 🌐 **Project-Level OAuth 2.0 Hub**: Google, Apple, and GitHub sign-in with configurable Open SaaS vs. Enterprise Admin-Only provisioning policies.
- 🔒 **Two-Tier Envelope Encryption**: Master KEK wrapping per-project DEKs with field-level AES-256-GCM authenticated encryption.
- 📦 **GDPR / CCPA / DPDP Compliance**: Native Article 20 data portability, 7-day cooling-off erasure windows, and cryptographic shredding.
- 📡 **Real-Time CDC**: Streaming live database mutations over Server-Sent Events (SSE) and WebSockets.
- 📊 **Real-Time Telemetry**: Live CPU, V8 heap memory, event loop latency, and query execution metrics powered by Chart.js.
- 💻 **Drop-In Browser SDK & Native TypeScript Client**: Instant access via `<script src="/aegis.js"></script>` or `@aegis/sdk`.

---

## 2. Quick Start & Setup

### Prerequisites
- Node.js 18.x or 20.x+
- npm or pnpm

### Local Installation
```bash
# 1. Clone the repository
git clone https://github.com/aryaayyappa/Hamara-FireBase.git
cd Hamara-FireBase

# 2. Install dependencies
npm install

# 3. Configure environment variables (or copy example)
cp .env.example .env

# 4. Start in development mode
npm run dev

# 5. (Optional) Interactive Terminal Startup
# Prompts interactively for Host (Dual 0.0.0.0, Localhost, Wi-Fi LAN IP, or Custom) and Port
npm run start:interactive
```

The Developer Console will be immediately accessible at `http://localhost:3000` (or your chosen `HOST` & `PORT`).

### 🚀 Universal 1-Click Launch Scripts & Hosting Setup Wizard
AegisDB provides zero-friction 1-click launchers and an interactive terminal setup wizard for all operating systems and devices:

#### 🍎 macOS (1-Click Double-Click in Finder)
Simply double-click **`start.command`** in your project folder in Finder, or run:
```bash
./start.command
```
*Opens a clean terminal window, performs real-time port availability probing, lets you select Dual Host / Localhost / Wi-Fi IP, and opens your browser straight to the Server Hosting & Network Center (`/#tab-server-hosting`).*

#### 🪟 Windows (1-Click Double-Click in File Explorer)
Simply double-click **`start.bat`** in File Explorer, or run:
```cmd
start.bat
```
*Opens Command Prompt with the interactive setup menu and auto-launches the browser.*

#### 🐧 Linux / Terminal Launcher (`start.sh` or `./bin/aegis`)
```bash
./start.sh
# Or run the standalone CLI binary:
./bin/aegis
# Or using npm shortcuts:
npm start
npm run host:open
```

### 🎛️ Interactive Terminal Wizard Options
When launched, the CLI wizard provides:
1. **Hosting Mode Selection**:
   - `[1] Dual Host (0.0.0.0)` — Localhost + Wi-Fi / LAN Access [Recommended]
   - `[2] Localhost Only (127.0.0.1)` — Isolated to this machine
   - `[3] Wi-Fi Network Only (192.168.x.x)` — Mobile and external client testing
   - `[4] Custom Host IP / Domain`
   - `[5] Quick Start with Saved Defaults`
2. **Live Socket Port Scanner**: Real-time CLI verification of free vs occupied ports (`● 3000 [FREE]`, `● 4000 [IN USE]`, `● 5000 [FREE]`) with immediate conflict warnings.
3. **Direct Browser Auto-Open**: Automatically opens your browser to `http://localhost:<PORT>/#tab-server-hosting`.

### 🛑 1-Click Server Stop & Port Release Scripts
To stop the server and cleanly release all network ports at any time:

- **🍎 macOS**: Double-click **`stop.command`** in Finder (or run `./stop.command`).
- **🪟 Windows**: Double-click **`stop.bat`** in File Explorer (or run `stop.bat`).
- **🐧 Linux & CLI**: Run `./stop.sh` or `npm run stop` / `npm run kill`.
- **🛡️ Super Admin Console**: Open **Server Hosting & Network Center** (`/#tab-server-hosting`) and click **"🛑 Stop Server"** to gracefully shut down the server directly from your browser.

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
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Rule Evaluation Engine (VM Sandbox)                │
│    • Document-Level Row Security (_rules)                              │
│    • Scoped & Granular Collection-Level Rules (CRUD + list/get)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    SQLite 3 Embedded Engine (WAL Mode)                 │
│    • PRAGMA journal_mode = WAL                                         │
│    • PRAGMA busy_timeout = 5000                                        │
│    • Non-blocking parallel reads & microsecond serialized writes       │
│    • AES-256-GCM Two-Tier Envelope Encryption                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Document Database & Dual-Layer Security Rules (Collection + Document RLS)

AegisDB delivers a schemaless, document-oriented NoSQL database experience backed by SQLite's robust transactional guarantees, protected by an isolated, declarative JavaScript VM security rule engine.

### Document Storage Hierarchy
- **Projects**: Top-level multi-tenant administrative and security boundaries.
- **Collections**: Logical groupings of JSON documents (supports optional JSON Schema validation and collection-level rules).
- **Documents**: JSON records indexed by unique alphanumeric IDs (`_id` or `id`), supporting embedded document-level Row-Level Security (`_rules`).

---

### 🛡️ Dual-Tier Security Rules (Collection-Wise & Document-Wise)

Security rules dynamically **enable or disable access** for every operation based on declarative expressions executed inside a secure 50ms Node.js VM sandbox.

```
Incoming DB Request (get, list, create, update, delete)
        │
        ▼
Is caller Service Role (`aegis_sk_...`) or Project Owner? ──► [YES] ──► Bypass Rules (Admin)
        │ [NO - API Key / Project User]
        ▼
Is this a Document-Scoped Operation? (get, create, update, delete)
 ├──► [YES]
 │      │
 │      ├─► Does document have embedded `_rules`? ─────► [YES] ──► Evaluate `_rules[action]` / `_rules[parent]`
 │      │
 │      ├─► Does collection have `document` scope? ──► [YES] ──► Evaluate `collection.document[action]`
 │      │
 │      └─► Fallback to collection flat rule ─────────────────► Evaluate `collection[action]` / `collection[parent]`
 │
 └──► [NO - Collection-Scoped: list / query / realtime]
        │
        ├─► Does collection have `collection` scope? ─► [YES] ──► Evaluate `collection.collection[action]`
        │
        ├─► Fallback to collection flat rule ─────────────────► Evaluate `collection[action]` / `collection[parent]`
        │
        └─► On Query/List: Evaluate Row Security per Document ─► Filter out unauthorized rows automatically
```

---

### ⚙️ Supported Operations & Hierarchy

AegisDB supports granular operation rules with automatic hierarchical fallback:

| Action | Scope | Description | Fallback Parent Action |
| :--- | :--- | :--- | :--- |
| `get` | Document | Reading a single document by ID (`GET /documents/:id`) | `read` |
| `list` | Collection | Querying or listing a collection (`GET /documents`) | `read` |
| `create` | Document | Inserting a new document (`POST /documents`) | `write` |
| `update` | Document | Patching an existing document (`PATCH /documents/:id`) | `write` |
| `delete` | Document | Deleting a document (`DELETE /documents/:id`) | `write` |
| `read` | Both | General read umbrella covering `get` and `list` | — |
| `write` | Both | General write umbrella covering `create`, `update`, `delete` | — |

---

### 📦 Supported Security Rule Formats

#### 1. Flat Collection Rules
```json
{
  "read": "auth != null",
  "write": "auth.id == resource.authorId || auth.role == 'admin'"
}
```

#### 2. Granular CRUD Rules
```json
{
  "list": true,
  "get": "auth != null",
  "create": "auth != null",
  "update": "auth.id == resource.authorId",
  "delete": "auth.role == 'admin'"
}
```

#### 3. Scoped Collection vs. Document Rules
```json
{
  "collection": {
    "list": true,
    "write": "auth.role == 'admin'"
  },
  "document": {
    "read": "auth != null",
    "create": "auth != null",
    "update": "auth.id == resource.ownerId",
    "delete": "auth.role == 'admin' || auth.id == resource.ownerId"
  }
}
```

#### 4. Document-Level Row Security (`_rules` on Document)
Attach fine-grained Row-Level Security directly to any document payload when creating or updating:
```json
{
  "data": {
    "title": "Confidential Financial Report",
    "department": "Finance",
    "_rules": {
      "read": "auth.id == 'user_123' || auth.role == 'finance_auditor'",
      "write": "auth.id == 'user_123'",
      "delete": "auth.role == 'superadmin'"
    }
  }
}
```

---

### 🔍 Row-Level Security (RLS) Query Filtering
When clients query a collection (`GET /api/v1/db/collections/:name/documents`):
1. AegisDB first verifies collection-level `list` / `read` access.
2. For each document in the collection, the document's row-level read rule (`doc._rules.get` $\rightarrow$ `doc._rules.read` $\rightarrow$ `rules.document.read` $\rightarrow$ `rules.read`) is evaluated against the requesting user's `auth` context.
3. Documents where access evaluates to `false` are **automatically excluded (hidden)** from the response envelope.
4. Total counts and pagination offsets accurately reflect the documents permitted to that specific user.

---

### 🧪 Rule Evaluation Context & Variables

The following sandboxed variables are available in rule expressions:

| Variable | Type | Description | Example Expression |
| :--- | :--- | :--- | :--- |
| `auth` | `Object \| null` | Authenticated user payload (null for anonymous requests) | `auth != null` |
| `auth.id`, `auth.uid`, `auth.sub` | `String` | Unique ID of the authenticated project user | `auth.id == resource.authorId` |
| `auth.email` | `String` | User email address | `auth.email.endsWith('@company.com')` |
| `auth.role` | `String` | User RBAC role (`admin`, `member`, `user`, etc.) | `auth.role == 'admin'` |
| `auth.customClaims` | `Object` | Custom claims dictionary attached to the user | `auth.customClaims.tier == 'premium'` |
| `resource` | `Object \| null` | Existing document in the database prior to write/read | `resource.authorId == auth.id` |
| `resource.data` | `Object \| null` | Alias for existing document fields | `resource.data.status == 'published'` |
| `data` | `Object \| null` | Incoming document payload for `create` or `update` | `data.price > 0 && data.title.length > 3` |
| `request` | `Object` | Request metadata object | `request.method == 'create'` |
| `request.time` | `String` | ISO-8601 server request timestamp | `request.time > '2026-01-01T00:00:00Z'` |
| `request.method` | `String` | Active operation (`get`, `list`, `create`, `update`, `delete`) | `request.method == 'update'` |

---

### 🖥️ Interactive Dashboard Security Editor & Simulator

In the Developer Console:
1. **Collection Rules Tab**: Select any collection in the **Data Browser** and open the **Rules Tab** to configure collection-level security rules with instant syntax validation.
2. **Document-Level Rules (RLS)**: Documents containing row rules display an emerald **`rules`** shield badge in the data table. Click the **Shield Icon** on any row to edit or attach document-level rules.
3. **Live Rules Simulation Sandbox**: Navigate to **Developer Workspace > Security Rules Sandbox** to test rule evaluations against mock `auth`, `resource`, `data`, and `request` contexts with microsecond execution telemetry.

---

## 5. Project-Isolated Authenticator & OAuth 2.0

AegisDB features a dedicated per-project **Authenticator Hub** in the Developer Console, providing fully isolated identity management, multi-provider OAuth 2.0 configuration, dynamic client ID discovery, and customizable onboarding governance.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   AUTHENTICATOR TAB                                    │
│  Configuring Project: [ Production App ▾ ]                      [ 💾 Save Auth Settings ]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│  🛡️ Public User Registration                                        [ Toggle: ON/OFF ] │
│  Allow self-signup (Open SaaS) vs. Admin-Only Provisioning (Enterprise / Invite-Only)  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  📧 Email & Password        [✓ Enabled]                                                │
│  🌐 Google OAuth 2.0        [✓ Enabled]   Client ID:  [ 123456-apps.google.com 👁️ ]     │
│  🍏 Apple Sign In           [✓ Enabled]   Service ID: [ com.example.serviceid   👁️ ]     │
│  🐙 GitHub OAuth            [✓ Enabled]   Client ID:  [ Iv1.890abcdef1234567   👁️ ]     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  👥 PROJECT USER ROSTER & RBAC                                   [ + Provision User ]  │
│  ┌──────────────────────┬──────────┬──────────┬─────────────────┬───────────────────┐  │
│  │ Email                │ Provider │ Role     │ Status          │ Actions           │  │
│  ├──────────────────────┼──────────┼──────────┼─────────────────┼───────────────────┤  │
│  │ alex@company.com     │ GOOGLE   │ admin    │ Active          │ ⚙️ Claims │ 🗑️ Delete│  │
│  │ sarah@dev.io         │ GITHUB   │ editor   │ Active          │ ⚙️ Claims │ 🗑️ Delete│  │
│  │ test@example.com     │ EMAIL    │ viewer   │ Pending Deletion│ 🔄 Restore│ 🗑️ Delete│  │
│  └──────────────────────┴──────────┴──────────┴─────────────────┴───────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 🔑 Dynamic Client ID Discovery (Zero Hardcoded Secrets)

AegisDB completely eliminates the need to hardcode OAuth Client IDs into client-side codebases, mobile apps, or `.env` bundles.

1. **Centralized Configuration**: Developers enter their OAuth Client IDs (Google, Apple, GitHub) directly into the AegisDB **Authenticator Tab** with mask/unmask eye controls (`👁️`).
2. **Real-Time Discovery (`GET /api/v1/project-auth/config`)**:
   Frontend applications and SDKs dynamically fetch the active configuration using the project API key:
   ```json
   {
     "success": true,
     "data": {
       "allowPublicRegistration": true,
       "email": { "enabled": true },
       "google": {
         "enabled": true,
         "clientId": "1082345678901-abcdefgh123456.apps.googleusercontent.com"
       },
       "github": {
         "enabled": true,
         "clientId": "Iv1.890abcdef1234567"
       },
       "apple": {
         "enabled": false
       }
     }
   }
   ```
3. **Pre-Flight Security Guards (`verifyProvider`)**:
   Before initiating OAuth flows, the SDK automatically validates that the provider is enabled and a valid Client ID is present on the server. If disabled by an administrator, client requests fail fast with explicit security violations.

---

### 🌐 Supported Identity Providers & Verification Engines

| Provider | Authentication Mechanism | Server-Side Verification Pipeline |
| :--- | :--- | :--- |
| **Email & Password** | Salted & Hashed Passwords | **Argon2id** (`memory: 64MB`, `timeCost: 3`, `parallelism: 4`) with blind index lookups and failed-attempt lockouts. |
| **Google OAuth 2.0** | Google Identity Services (GIS) / OAuth2 Tokens | **Multi-tier Verification**: (1) `google-auth-library` ID Token validation with audience check, falling back to (2) Google `oauth2/v3/userinfo` Bearer verification, and (3) `tokeninfo` endpoint inspection. |
| **Apple Sign In** | Apple Identity Tokens (JWT) | Validates Apple JWT signatures in real time against Apple's live public JWKS keyset (`https://appleid.apple.com/auth/keys`) with cryptographic audience matching. |
| **GitHub OAuth** | GitHub OAuth2 Access Tokens | Resolves token against `https://api.github.com/user` and queries `https://api.github.com/user/emails` to extract verified primary email addresses. |

---

### 🛡️ Enterprise Onboarding & Registration Policies

- **Open SaaS Mode (`allowPublicRegistration = true`)**:
  - Anyone can register with Email/Password or complete one-click sign-in via Google, Apple, or GitHub.
  - AegisDB automatically provisions an isolated record in `project_users`, encrypts their email with AES-256-GCM, and assigns the default `viewer` role.
- **Admin-Only / Enterprise Mode (`allowPublicRegistration = false`)**:
  - Designed for internal enterprise tools, universities, and private SaaS.
  - Public registration is completely locked down.
  - Only users **pre-provisioned by administrators** in the Developer Console or via admin API can log in.
  - Unknown users attempting OAuth sign-in are immediately rejected with `HTTP 403 Forbidden` (`"Account not found. New account registration is restricted to administrators."`).

---

### 👥 Project User Roster & Role-Based Access Control (RBAC)

The **Authenticator Tab** includes an interactive administrative management roster:
- **User Provisioning**: Manually provision users with assigned roles (`admin`, `editor`, `viewer`) and optional temporary passwords.
- **Custom Claims JSON Editor**: Attach arbitrary structured metadata and permission claims (e.g. `{ "teams": ["engineering"], "isVip": true }`) that are embedded directly into user JWT access tokens.
- **GDPR 7-Day Erasure Monitoring**: Visual indicator of accounts in `pending_deletion` with the days remaining and one-click restoration/cancellation.
- **Cryptographic Blind Indexing**: User emails in `project_users` are encrypted at rest with per-project DEKs while fast lookups use peppered HMAC-SHA256 blind indexes to protect PII.

---

## 6. Comprehensive Security Architecture

AegisDB is built with a zero-trust, defense-in-depth philosophy.

### Cryptography & Key Management
- **Two-Tier Envelope Encryption (DEK/KEK)**: Field-level data is encrypted with AES-256-GCM using project-specific Data Encryption Keys (DEKs). DEKs are wrapped using a master Key Encryption Key (KEK) derived via HKDF-SHA256.
- **Non-Destructive Key Rotation**: Rotating the Master KEK re-wraps the project DEKs instantly without requiring a full database re-encryption cycle.
- **Blind Indexing for Sensitive Lookups**: PII like user email addresses are encrypted at rest with AES-256-GCM while search queries use a peppered HMAC-SHA256 blind index to prevent plaintext indexing.

### Brute-Force & Abuse Protections
- **15-Minute Failed Login Lockout**: Automatically triggers an unbypassable 15-minute `429 Too Many Requests` lockout after 5 consecutive failed attempts per IP:Email pair.
- **Continuous Token Bucket Rate Limiting**: Separate, configurable token bucket tiers for Authentication endpoints (`authLimit`) and Database/API queries (`apiLimit`).
- **Inactivity Session Auto-Lock**: Configurable client inactivity timer (5m, 15m, 30m, 60m) that automatically terminates active browser sessions.
- **Strict Content Security Policy (CSP)**: Hardened HTTP headers preventing XSS, clickjacking, and MIME-type sniffing.

---

## 7. Storage Vault & Asset Management

AegisDB includes a built-in file and binary asset storage engine.

- **Magic Byte Inspection**: Verifies file headers against declared MIME types to prevent malicious executable uploads masked as images or documents.
- **Pluggable Storage Drivers**:
  - **Local Disk**: Default zero-config storage in the `/storage` directory.
  - **Amazon S3 / Cloudflare R2**: High-durability cloud object storage.
- **Pre-Signed Download URLs**: Secure, time-limited download links via `POST /api/v1/storage/signed-url`.

---

## 8. Real-Time Change Data Capture (CDC)

Subscribe to live database changes using standard HTTP Server-Sent Events (SSE) or WebSockets without needing external message brokers.

### Subscribing to Collection Events
```javascript
const eventSource = new EventSource(
  'http://localhost:3000/api/v1/db/collections/messages/realtime',
  { headers: { 'x-aegis-api-key': 'YOUR_PROJECT_API_KEY' } }
);

eventSource.onmessage = (event) => {
  const change = JSON.parse(event.data);
  console.log('Live Database Change:', change.type, change.document);
  // change.type: 'INSERT' | 'UPDATE' | 'DELETE'
};
```

---

## 9. GDPR Privacy, Right to Erasure & Appeals

AegisDB provides out-of-the-box compliance tools for **GDPR (Articles 17 & 20)**, **CCPA/CPRA**, and **India's DPDP Act 2023**.

```
[ User Initiates Deletion ] ──► Status: pending_deletion ──► [ 7-Day Grace Period Window ]
                                                                       │
                         ┌─────────────────────────────────────────────┴─────────────────────────────────────────────┐
                         ▼                                                                                           ▼
         [ User / Super Admin Cancels Deletion ]                                                   [ Grace Period Expires (7 Days) ]
                         │                                                                                           │
                         ▼                                                                                           ▼
          • POST /api/v1/auth/cancel-deletion                                                        • Automated Background Purge Daemon
          • Status restored to 'active'                                                              • Permanent cryptographic shredding
                                                                                                     • Zero-PII Audit Tombstone in audit_logs
```

- **Data Portability (GDPR Art. 20)**: Users can download a comprehensive, structured JSON export of their profile and data with one click.
- **7-Day Deletion Grace Period (GDPR Art. 17)**: Prevents accidental data loss or malicious account hijack deletion. Users can restore their account within 7 days.
- **Permanent Cryptographic Shredding**: Purges database rows, destroys project DEKs in `project_keys`, wipes uploaded files, and records an anonymized zero-PII tombstone in `audit_logs`.
- **Trust & Safety Appeals**: Flagged accounts receive synthetic notices and can submit direct explanations/appeals to the Super Admin via the Compliance Modal.

---

## 10. Disaster Recovery & Backup Engine

AegisDB features an automated dual-target backup engine to ensure continuous data safety.

- **Atomic Online SQLite Snapshots**: Uses SQLite's Online Backup API to create point-in-time snapshots with zero database downtime.
- **Dual Destination Storage**: Stores compressed `.sqlite3.bak` snapshots locally and streams copies to Amazon S3.
- **Encrypted Secret Embedding**: Encrypts and embeds critical environment metadata into backup archives.
- **Automated Lifecycle & Retention**: Prunes expired snapshots older than the configured threshold (e.g., 7, 14, 30 days) automatically.
- **Protected Recovery Console (`/recovery.html`)**: Server-side PIN-protected restore gateway with automated 60-second inactivity lock.

---

## 11. Network & Hosting Center, Zero-Downtime Socket Rebinding & Live Terminal Streamer

AegisDB features a built-in, Super Admin-exclusive **Network & Server Hosting Control Center** (`#tab-server-hosting`) designed for frictionless local network, Wi-Fi LAN, and production domain migrations.

```
┌────────────────────────────────────────────────────────────────────────┐
│             Network & Server Hosting Architecture                      │
├────────────────────────────────────────────────────────────────────────┤
│  1. In-Memory Socket Rebinding (Zero Process Restarts):                │
│     server.closeAllConnections() ──► server.listen(newPort, newHost)   │
│                                                                        │
│  2. Dual-Mode Socket Health Probe:                                     │
│     Favicon Image Probe (CORS-Bypass) + Cache-Busted REST Probing      │
│                                                                        │
│  3. Cross-Port Zero-Login Session Handover:                            │
│     Old Origin (#auth_handover=...) ──► New Origin (Restores Session)  │
│                                                                        │
│  4. Live Terminal & Log Streamer Engine:                               │
│     stdout/stderr Ring Buffer ──► WebSocket Broadcast (Real-time)      │
└────────────────────────────────────────────────────────────────────────┘
```

### 🌐 1. Dynamic In-Memory TCP Socket Rebinding
- **Zero Process Downtime**: Switch between `0.0.0.0` (Dual Localhost + Wi-Fi), `127.0.0.1` (Localhost Only), LAN IP (e.g. `192.168.x.x`), or Custom Hostnames and Ports (`3000`, `4000`, `8080`, `9000`, etc.) live from the UI without restarting Node.js or nodemon.
- **Port Conflict Diagnostics**: Automatically probes candidate ports (`3000`-`9000`) and displays live free/in-use status chips for 1-click safe selection.
- **Persistent Settings**: Saves the active port and host to SQLite `platform_settings` so server restarts persist the chosen binding.

### 🔑 2. Cross-Port Zero-Login Session Handover Protocol
- **Browser Port Partition Bypass**: Standard browsers isolate `localStorage` by port (`http://192.168.1.5:3000` cannot share tokens with `http://192.168.1.5:9000`).
- **Encrypted Handover**: When migrating endpoints, AegisDB packages an active session handover ticket in the redirect URL hash (`#auth_handover=...`).
- **Seamless Transfer**: The new port consumes the handover ticket, populates `localStorage` on the new origin, and cleanly purges the URL hash with `window.history.replaceState()`. **Zero re-login, zero re-authentication, and zero manual refresh required.**

### 🖥️ 3. Live Embedded Terminal Console & Server Streamer
- **WebSocket Log Broadcast**: Intercepts server `stdout` and `stderr` streams and broadcasts them in real time over WebSocket.
- **Interactive Controls**:
  - **Live Filter**: Filter logs by *All*, *HTTP Requests (`→`)*, *System Banners*, *Warnings*, or *Errors*.
  - **Pause / Resume**: Freeze log streams to inspect stack traces or query payloads.
  - **1-Click Copy Buffer**: Copy the entire formatted terminal log history to your clipboard.
  - **Auto-Scroll**: Toggle automatic pinning to the newest log entries.

### ⏰ 4. Scheduled Migration Rollouts, Zero-Downtime Multi-Tab Redirection & Notifications
- **Real-Time Network Broadcast**: When a Super Admin schedules a port or host change, AegisDB stores the schedule in SQLite and broadcasts `ENDPOINT_MIGRATION_SCHEDULED` across all connected WebSocket streams.
- **Top-Level Screen-Wide Countdown Banner**: Displays an amber warning banner directly below the header with real-time countdown clocks (`In 00:01:45`), target URL, and developer notice messages across all open workspaces.
- **Synchronized Header Notification Bell**: Automatically unhides the alert bell in the top navigation header for all connected developers with live badge counts and target endpoint details.
- **Strict Role-Based Protection**: Non-admin developers see the live countdown notice with "Copy Target URL" and "Copy Updated Prompt" actions, while the "Cancel Migration" capability is strictly restricted to Super Administrators.
- **Synchronized Zero-Downtime Multi-Tab Handover**:
  - The server broadcasts `ENDPOINT_MIGRATION_EXECUTED` *before* closing the listening socket, ensuring every open tab receives the redirect signal.
  - The client-side countdown timer also autonomously triggers handover as a fail-safe the exact second the timer reaches `00:00:00`.
  - All connected clients across the entire local network transition together using the 4-step handover overlay and zero-login URL hash token transfer.

### 🤖 5. Dynamic AI Prompt Center Synchronization
- **Live Endpoint Binding**: The AI Agent & Developer Prompt Center (`#tab-about`) automatically polls the active host and port configuration from `GET /api/v1/system/status` and syncs on every workspace switch.
- **Always Up-to-Date Prompts**: App Migration prompts, New Project prompts, and Drop-In SDK code snippets dynamically adapt to the active port and Wi-Fi LAN IP without static hardcoding.

### 📋 6. Universal Fallback Clipboard Engine (`window.copyToClipboard`)
- **HTTP LAN IP Compatibility**: Browsers (especially Safari) restrict `navigator.clipboard` to secure contexts (HTTPS or localhost).
- **Graceful Fallback**: Implements an automatic detached `<textarea>` + `document.execCommand('copy')` fallback engine, guaranteeing 100% reliable 1-click prompt and log copying across all HTTP network IPs (`http://192.168.x.x:<port>`).

### 🛡️ 7. Privileged System Port Guard (< 1024)
- **Automatic Validation**: Validates candidate port numbers between `1` and `65535`.
- **Permission Guard**: Disallows non-root processes from binding to privileged system ports (< 1024 like `80`, `443`, `1000`) on macOS and Linux, preventing silent connection drops and network lockouts. Valid unprivileged ports (e.g. `3000`, `4000`, `8080`, `9000`) are recommended.

### 🔄 8. Bidirectional Host-Mode Switching (Dual ⇄ Localhost ⇄ Wi-Fi Network)
- **Mode Change Detection**: The backend (`PATCH /api/v1/admin/platform-settings`) automatically detects changes to `serverHostingMode` even when the port remains unchanged, broadcasting `ENDPOINT_MIGRATION_EXECUTED` across all active WebSocket connections.
- **Smart Same-Port Reload & Cross-Host Routing**:
  - When switching from **Dual (`0.0.0.0`)** to **Localhost Only (`127.0.0.1`)**, clients connected via LAN IP (`192.168.x.x`) are automatically redirected to `http://localhost:<port>`, while clients already on `localhost` receive an immediate refresh.
  - When switching from **Localhost Only** to **Wi-Fi Network Only**, clients on `localhost` are dynamically routed to the active LAN IP (`http://192.168.x.x:<port>`).
  - When remaining on the same port, the migration pipeline executes a smart `window.location.reload()` to cleanly synchronize client state without triggering invalid browser no-ops.
- **Real-Time Client Background Synchronization**: The WebSocket `SERVER_HOST_CONFIG_UPDATED` listener synchronizes non-migrated secondary browser tabs and remote devices on the local network in real-time.

### 📜 9. Mandatory Policy Consent Gate & GDPR Governance
- **Zero-Bypass Policy Enforcement**: When updated terms (e.g. `v1.1.0`) are rolled out by Super Admins, all users encounter a blocking, glassmorphic Policy Gate Modal upon sign-in.
- **Cross-Browser Sanitization**: Enforces strict `.trim()` normalization on policy version strings to eliminate `400 Bad Request` errors caused by trailing whitespace on Safari.
- **Full Decline Suite**: If users choose to decline updated terms, they can download an instant GDPR Article 20 JSON data export bundle, schedule 7-day account deletion, or cleanly sign out with automated server-side token revocation (`POST /api/v1/auth/logout`).

### 📡 10. Accurate Dual-Stage Port Scanner & Migration Port Reservation
- **Dual-Stage Probing Engine**: Combines a real-time TCP connection handshake probe (`127.0.0.1`, `::1`, `localhost`) with multi-interface bind tests (`0.0.0.0`, `127.0.0.1`). Eliminates macOS IPv6 bypass false negatives, accurately detecting occupied ports (e.g. port `4000`).
- **Scheduled Migration Reservation (`scheduled_reserved`)**: Ports booked for pending future migrations in SQLite are automatically reserved with amber status badges, preventing double-booking or port conflicts.
- **Real-Time Custom Port Validation**: Typing any port into the interface provides instant live conflict feedback (`✓ Free & Ready`, `⚠️ In use by another process`, `⏳ Reserved for Scheduled Migration`, `✓ Active AegisDB Server`).
- **Pre-Switch Conflict Gate**: Displays an interactive confirmation warning if an administrator attempts to immediately switch or schedule migration to an in-use or reserved port.

---

## 12. Super Admin Console & Telemetry

The Super Admin dashboard provides deep visibility into the health and performance of the entire platform.

- **Live Telemetry Charts**: Real-time polling of CPU utilization, V8 memory heap allocation, and SQLite query response times via Chart.js.
- **Dynamic Rate Limit Governance**: Update global rate limits live without server restarts.
- **User Management & Moderation**: View all registered users, adjust role permissions, inspect deletion queues, and issue security flags.
- **System Maintenance Gateway (`/admin-login.html`)**: Dedicated portal for administrators to manage platform maintenance modes.

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
| `PATCH` | `/api/v1/admin/rate-limits` | Adjust global token bucket rate limits live |
| `GET` | `/api/v1/admin/account-deletions` | Inspect active and historical account deletion queues |
| `POST` | `/api/v1/admin/account-deletions/:id/cancel` | Retain an account upon user appeal |
| `POST` | `/api/v1/admin/backups/purge` | Trigger immediate cleanup of expired snapshots |

---

## 13. Performance Verification & Load Testing Suite

AegisDB includes a built-in automated stress and performance benchmarking harness located in `/loadtest` to validate concurrency, SQLite WAL microsecond write throughput, and sub-millisecond read latency.

### Running the Test Suite
Ensure the server is running (`npm run dev` or `./start.sh`), then execute any of the load testing scenarios:

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

### Benchmark Metrics
| Test Scenario | Concurrency | Operations / Sec | Mean Latency | Error Rate |
| :--- | :--- | :--- | :--- | :--- |
| **Indexed Document Reads** | 100 concurrent workers | ~12,500 req/s | 0.8 ms | 0.00% |
| **ACID Document Inserts** | 50 concurrent workers | ~4,200 req/s | 2.1 ms | 0.00% |
| **Real-time SSE Fan-out** | 500 connected clients | Continuous broadcast | < 5 ms | 0.00% |

---

## 14. High-Availability & Production Deployment

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

## 15. Official SDKs, Browser Drops & AI Agent Integration

AegisDB provides two native client integration methods designed for instant developer adoption and AI agent compatibility:
1. **🌐 Drop-in Browser Script (`/aegis.js`)**: Zero-build vanilla JS / frontend script served directly by your AegisDB instance.
2. **📦 Native Node/TypeScript SDK (`@aegis/sdk`)**: Type-safe SDK with full support for React, Vue, Next.js, Svelte, and Node backends.

---

### Option A: Drop-In Browser Script (`/aegis.js`)
Include the script tag directly in any HTML file without npm or bundlers:

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
    // Initialize client with Project API Key
    const aegis = new AegisClient({
      baseUrl: 'http://localhost:3000',
      apiKey: 'aegis_pk_your_project_key_here'
    });

    async function startApp() {
      // 1. Automatically render Google Sign-In button with Client ID from dashboard
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
# In your client project:
npm install @aegis/sdk
```

```typescript
import { Aegis } from '@aegis/sdk';

// Initialize with Project API Key
const aegis = new Aegis({
  baseUrl: 'http://localhost:3000',
  apiKey: process.env.NEXT_PUBLIC_AEGIS_API_KEY
});

// 1. Dynamic OAuth Configuration Discovery (Zero hardcoded secrets)
const config = await aegis.projectAuth.getConfig();
console.log('Enabled Providers:', config);

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

### 🛡️ `ProjectAuthClient` Security Capabilities
- **Dynamic Config Discovery (`getConfig()`)**: Fetches active OAuth Client IDs in real time from AegisDB settings.
- **Pre-Flight Security Guard (`verifyProvider()`)**: Automatically aborts login attempts with clear errors if an administrator disabled that provider in the dashboard.
- **Google Identity Helper (`initGoogleAuth()`)**: One-line initialization of Google's One-Tap & standard button with seamless AegisDB authentication.

---

### 🤖 AI Agent Copy-Paste Prompt 1: Complete App Migration
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

### 🚀 AI Agent Copy-Paste Prompt 2: Build New Application from Scratch
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

### 📦 Universal Drop-In SDK (`AegisClient.js` / `AegisClient.ts`)
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

## 📄 License
This project is open-source and licensed under the [MIT License](LICENSE).
