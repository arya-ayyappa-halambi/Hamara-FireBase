# AegisDB 🛡️

AegisDB is a lightweight, zero-configuration, production-grade Firebase-like Backend-as-a-Service (BaaS) engine. It is fully self-hosted, extremely performant, and provides developers with a full suite of cloud services straight out of the box—complete with a modern, glassmorphic developer console featuring a Mac-style collapsible sidebar.

![AegisDB Engine](https://img.shields.io/badge/AegisDB-Engine-6366f1?style=for-the-badge&logo=shield&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3.0-003b57?style=for-the-badge&logo=sqlite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=for-the-badge&logo=docker&logoColor=white)

---

## ✨ Architectural Features & Capabilities

- **🔐 Asymmetric RS256 JWKS Token Signing**: RSA 2048-bit key pair generation and public key exposition at `GET /.well-known/jwks.json` for external service token verification.
- **🔑 Two-Tier Envelope Encryption (DEK / KEK)**: 256-bit per-project Data Encryption Keys (DEKs) wrapped using a HKDF-SHA256 derived Master Key Encryption Key (KEK). Transparent AES-256-GCM field encryption (`x-encrypted: true`) with non-destructive key rotation.
- **🔒 Pure TOTP Multi-Factor Authentication (MFA)**: Pure RFC 6238 HMAC-SHA1 TOTP generator/verifier. Base32 secrets, dynamic QR code image URIs, setup/verify endpoints, and login enforcement.
- **🛡️ Secure TOTP Disabling & Password Change Enforcement**: Disabling TOTP MFA or changing account passwords strictly requires dual verification (account password + valid 6-digit TOTP code).
- **⏱️ Configurable Inactivity Session Timeout**: User-configurable session timeout (5m, 15m, 30m, 60m, or Disabled) with real-time user activity tracking (`mousemove`, `keydown`, `click`, `scroll`, `touchstart`).
- **🍏 Mac-Style Hover Auto-Expanding Sidebar**: Glassmorphic sidebar with ☰ Hamburger toggle for Pinned vs Collapsed mode, featuring Mac-style smooth auto-expansion on hover.
- **⛔ 15-Minute Failed Login Lockout Policy**: Tracks 5 consecutive failed login attempts per `IP:Email` combination and enforces an automatic 15-minute temporary lockout (`HTTP 429`).
- **☁️ Continuous WAL Replication (Litestream)**: 1-second continuous WAL replication to AWS S3, MinIO, or Cloudflare R2 object storage targets with Point-in-Time Recovery (PITR).
- **📦 Multi-Driver Storage Abstraction**: Pluggable storage abstraction supporting `LocalStorageDriver` (disk-bound) and `S3StorageDriver` (AWS S3, MinIO, Cloudflare R2), dynamically selected via `STORAGE_DRIVER=s3|local`.
- **🛡️ VM Sandbox Rules**: Node.js `vm2` sandbox for executing custom JavaScript security and validation rules on collections.
- **📊 Real-Time Prometheus Telemetry**: Standardized Prometheus exposition metrics collecting CPU usage, resident memory size, heap statistics, `http_requests_total`, `rate_limit_hits_total`, and active WebSockets. Includes a live dashboard polling real-time CPU/Memory data.
- **📄 Multi-Format Telemetry Export**: 1-click generation of project metrics and telemetry reports natively in JSON, Markdown, Excel (CSV), MS Word (.doc), and formatted PDF, completely generated client-side without backend overhead.
- **⚡ Real-Time Data Streams**: Native WebSocket support broadcasting live change stream events (insert, update, delete) to subscribed clients instantly.
- **👑 Role Context Scope Switcher**: Dynamic web console supporting Super Admin global platform management mode and Project / Developer scoped views.
- **🧪 Interactive API Key Tester**: Built-in developer console tool to securely test Project API keys against live endpoints via an integrated REST client.
- **🔎 Document Search & Pagination**: Effortlessly browse large datasets with built-in client-side pagination (100 docs per page) and real-time field filtering in the Data Browser.
- **🗺️ Interactive Guided Tours**: Integrated Driver.js with a custom glassmorphic theme to provide step-by-step onboarding for new developers.
- **✨ Enterprise Glassmorphism UI**: Beautiful, modern dashboard featuring blurred glass panels, dynamic modal overlays, and independent scroll zones. Includes a completely unified dark glassmorphic login screen with a full-screen, crossfading dynamic feature carousel.
---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v18+) **OR** [Docker](https://www.docker.com/) & Docker Compose

### 🐳 Installation (Recommended: Docker)

```bash
# 1. Clone the repository
git clone https://github.com/aryaayyappa/Hamara-FireBase.git
cd Hamara-FireBase

# 2. Start the engine in background
docker compose up --build -d
```

Access the Developer Console at **`http://localhost:3000`**.

---

### 💻 Installation (Local / Development)

```bash
# 1. Install dependencies
npm install

# 2. Build TypeScript source
npm run build

# 3. Start development server with Nodemon
npm run dev
```

---

## 🛠️ CLI Utilities & Test Commands

```bash
# Run TOTP MFA, Prometheus Metrics & Storage Driver Integration Tests
npx ts-node tests/mfa-metrics-storage.test.ts

# Run Envelope Encryption & Key Rotation Integration Tests
npx ts-node tests/envelope-encryption.test.ts

# Execute Database Migration to Two-Tier Envelope Encryption
npx ts-node src/scripts/migrate-envelope-encryption.ts
```

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
| `POST` | `/mfa/setup` | Generate Base32 secret key & `otpauth://` QR URI |
| `POST` | `/mfa/verify` | Verify 6-digit TOTP code and enable MFA on profile |
| `POST` | `/mfa/disable` | Disable TOTP MFA (requires password + 6-digit TOTP verification) |

### Database Services (`/api/v1/db`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/collections` | Register collection with JSON Schema & Rules |
| `GET` | `/collections` | List project collections |
| `POST` | `/collections/:name/docs` | Insert JSON document (auto-creates collection) |
| `GET` | `/collections/:name/docs` | Query documents with limit, offset & filters |
| `GET` | `/collections/:name/docs/:id` | Fetch document by ID |
| `PATCH` | `/collections/:name/docs/:id` | Merge update JSON document |
| `DELETE` | `/collections/:name/docs/:id` | Delete document |
| `GET` | `/collections/:name/realtime` | SSE Change Data Capture (CDC) stream |

### Storage Services (`/api/v1/storage`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/upload` | Multipart file upload |
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
| **Cross-Site Scripting** | Strict Content Security Policy | Restricts script, style, and font sources to trusted local & CDN origins. |
| **SQL Injection** | Strict Regex & Parameterization | Collection names sanitized with `/^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/` and parameterized SQL. |

---

## 📄 License
This project is licensed under the MIT License.
