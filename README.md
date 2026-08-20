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
11. [Super Admin Console & Telemetry](#11-super-admin-console--telemetry)
12. [Complete REST API Registry](#12-complete-rest-api-registry)
13. [High-Availability & Production Deployment](#13-high-availability--production-deployment)
14. [AI Agent & Developer Integration Context](#14-ai-agent--developer-integration-context)

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
```

The Developer Console will be immediately accessible at `http://localhost:3000`.

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
│    • Collection-Level Fallback Rules                                   │
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

## 4. Document Database & Row-Level Security (RLS)

AegisDB delivers a schemaless, document-oriented NoSQL database experience backed by SQLite's robust transactional guarantees.

### Document Storage Hierarchy
- **Projects**: Top-level administrative and security boundaries.
- **Collections**: Logical groupings of JSON documents (supports optional JSON Schema validation).
- **Documents**: JSON records indexed by unique alphanumeric IDs (`_id` or `id`).

---

### 🛡️ Dual-Tier Security Rules (Collection + Row-Level)

AegisDB features a flexible security rule engine executed in an isolated VM sandbox. Security rules evaluate against incoming request context (`auth`, `data`, `resource`).

#### Evaluation Priority
```
Incoming DB Request
        │
        ▼
Is document being created with payload._rules? ──► [YES] ──► Evaluate creation _rules
        │ [NO]
        ▼
Does existing document contain _rules? ─────────► [YES] ──► Enforce Document-Level Rule
        │ [NO]
        ▼
Fall back to Collection-Level Default Rules ─────────────► Enforce Collection Rule
```

1. **Document-Level Write Rules**: When creating a document, supplying a `_rules: { "write": "..." }` field evaluates that specific rule immediately.
2. **Document-Level Read/Write Rules (Row-Level Security)**: If a document has `_rules` stored, those rules **take precedence exclusively**, completely overriding collection-wide defaults for that row.
3. **Collection-Level Rules**: If no document-specific `_rules` exist, the collection's baseline security rules apply.

#### Rule Variables Available in Sandbox
| Variable | Description | Example Expression |
| :--- | :--- | :--- |
| `auth` | Authenticated user payload (null if unauthenticated) | `auth != null` |
| `auth.id` | User ID of the client making the request | `auth.id == data.ownerId` |
| `auth.role` | User role string | `auth.role == 'admin'` |
| `data` | Incoming request payload (for create/update) | `data.price > 0 && data.status == 'draft'` |
| `resource` | Existing document data in the database | `resource.ownerId == auth.id` |

#### Example Rule Definitions

**Document-Level Row Security (`_rules`):**
```json
{
  "read": "auth != null",
  "write": "auth.id == data.ownerId || auth.role == 'admin'"
}
```

**Public Read / Authenticated Owner Write:**
```json
{
  "read": "true",
  "write": "auth != null && auth.id == data.authorId"
}
```

#### Interactive Dashboard Security Editor
In the Developer Console:
1. Navigate to the **Data Browser**.
2. Select any collection to view its documents.
3. Documents with custom security rules display an emerald **`rules`** shield badge.
4. Click the **Shield Icon** beside any document to open the live **Document Security Rules Modal**, edit rules in JSON format, and save changes instantly.

---

## 5. Project-Isolated Authenticator & OAuth 2.0

AegisDB features a per-project **Authenticator Hub** enabling isolated identity management, multi-provider OAuth, and customizable onboarding policies.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATOR TAB                               │
│  Configuring Project: [ Production App ▾ ]      [ Save Auth Settings ] │
├────────────────────────────────────────────────────────────────────────┤
│  🛡️ Public User Registration                         [ Toggle: ON/OFF ]│
│  Allow self-signup (Open SaaS) vs. Admin-Only Provisioning (Enterprise)│
├────────────────────────────────────────────────────────────────────────┤
│  📧 Email & Password        [✓ Enabled]                                │
│  🌐 Google OAuth2           [✓ Enabled]   Client ID: [•••••••••••• 👁️] │
│  🍏 Apple Sign In           [✓ Enabled]   Service ID: [••••••••••• 👁️] │
│  🐙 GitHub OAuth            [✓ Enabled]   Client ID: [•••••••••••• 👁️] │
└────────────────────────────────────────────────────────────────────────┘
```

### Supported Identity Providers
1. **Email & Password**: Salted and hashed using Argon2id with brute-force rate-limiting and anti-enumeration defenses.
2. **Google OAuth 2.0**: Supports Google Identity Services (GIS) ID Tokens via `google-auth-library` and OAuth2 Bearer Access Tokens via `googleapis.com/oauth2/v3/userinfo`.
3. **Apple Sign In**: Validates Apple Identity JWT tokens against Apple's live public JWKS keysets (`appleid.apple.com/auth/keys`).
4. **GitHub OAuth**: Authenticates GitHub access tokens directly with GitHub's user API (`api.github.com/user`).

### Enterprise Registration Policies
- **Open SaaS Mode (`allowPublicRegistration = true`)**: New users can freely register or sign in via Google/Apple/GitHub. AegisDB dynamically creates their distinct account.
- **Admin-Only Mode (`allowPublicRegistration = false`)**: Ideal for internal tools, university portals, and enterprise SaaS. Only accounts pre-created by administrators in `project_users` are permitted to authenticate. Un-provisioned OAuth sign-ins are rejected with `HTTP 403 Forbidden`.

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

## 11. Super Admin Console & Telemetry

The Super Admin dashboard provides deep visibility into the health and performance of the entire platform.

- **Live Telemetry Charts**: Real-time polling of CPU utilization, V8 memory heap allocation, and SQLite query response times via Chart.js.
- **Dynamic Rate Limit Governance**: Update global rate limits live without server restarts.
- **User Management & Moderation**: View all registered users, adjust role permissions, inspect deletion queues, and issue security flags.
- **System Maintenance Gateway (`/admin-login.html`)**: Dedicated portal for administrators to manage platform maintenance modes.

---

## 12. Complete REST API Registry

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

## 13. High-Availability & Production Deployment

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

## 14. AI Agent & Developer Integration Context

When connecting custom frontend apps, mobile apps, or configuring AI agents (like Gemini, Claude, Cursor, Copilot) to build against AegisDB:

1. **Base Architecture**: AegisDB provides clean, standard RESTful JSON APIs and SSE streams. Standard `fetch()`, `axios`, or native HTTP clients work out-of-the-box without requiring custom heavyweight SDKs.
2. **Project API Key Header**: Supply your Project API Key using the `x-aegis-api-key` header on all database and project-auth requests.
3. **Dynamic Auth Introspection**: Query `GET /api/v1/project-auth/config` to dynamically determine enabled OAuth providers and client IDs for your project.
4. **Row-Level Security in Code**: To assign custom row-level access rules to a document during creation or update, simply include the `_rules` object inside the document data:
   ```json
   {
     "name": "Project Proposal",
     "ownerId": "usr_94812",
     "_rules": {
       "read": "auth != null",
       "write": "auth.id == data.ownerId"
     }
   }
   ```

### 📡 Standard Client Fetch Helper Example
```typescript
async function aegisRequest(endpoint: string, options: RequestInit = {}) {
  const baseUrl = 'http://localhost:3000/api/v1';
  const apiKey = 'YOUR_PROJECT_API_KEY';

  const headers = new Headers(options.headers || {});
  headers.set('x-aegis-api-key', apiKey);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) {
    throw new Error(json.message || `AegisDB Request Failed (${response.status})`);
  }
  return json.data !== undefined ? json.data : json;
}
```

---

## 📄 License
This project is open-source and licensed under the [MIT License](LICENSE).
