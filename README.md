# AegisDB 🛡️

AegisDB is a lightweight, zero-configuration, production-grade Firebase-like Backend-as-a-Service (BaaS) engine. It is fully self-hosted, extremely performant, and provides developers with a full suite of cloud services straight out of the box—complete with a glassmorphic modern web dashboard.

![AegisDB Engine](https://img.shields.io/badge/AegisDB-Engine-6366f1?style=for-the-badge&logo=shield&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3.0-003b57?style=for-the-badge&logo=sqlite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=for-the-badge&logo=docker&logoColor=white)

---

## ✨ Architectural Features & Capabilities

- **🔐 Asymmetric RS256 JWKS Token Signing**: RSA 2048-bit key pair generation and public key exposition at `GET /.well-known/jwks.json` for external service token verification.
- **🔑 Two-Tier Envelope Encryption (DEK / KEK)**: 256-bit per-project Data Encryption Keys (DEKs) wrapped using a HKDF-SHA256 derived Master Key Encryption Key (KEK). Transparent AES-256-GCM field encryption (`x-encrypted: true`) with non-destructive key rotation.
- **🔒 TOTP Multi-Factor Authentication (MFA)**: Pure RFC 6238 HMAC-SHA1 TOTP generator/verifier. Base32 secrets, `otpauth://` QR-code URIs, setup/verify endpoints, and login enforcement.
- **⛔ 15-Minute Failed Login Lockout Policy**: Tracks 5 consecutive failed login attempts per `IP:Email` combination and enforces an automatic 15-minute temporary lockout (`HTTP 429`).
- **☁️ Continuous WAL Replication (Litestream)**: 1-second continuous WAL replication to AWS S3, MinIO, or Cloudflare R2 object storage targets with Point-in-Time Recovery (PITR).
- **📦 Multi-Driver Storage Abstraction**: Pluggable storage abstraction supporting `LocalStorageDriver` (disk-bound) and `S3StorageDriver` (AWS S3, MinIO, Cloudflare R2), dynamically selected via `STORAGE_DRIVER=s3|local`.
- **📊 Prometheus Telemetry Instrumentation (`GET /metrics`)**: Standardized Prometheus exposition metrics collecting CPU usage, resident memory size, heap statistics, `http_requests_total`, `rate_limit_hits_total`, and active WebSockets.
- **⚡ Real-Time Data Streams**: Native WebSocket support broadcasting live change stream events (insert, update, delete) to subscribed clients instantly.
- **👑 Role Context Scope Switcher**: Dynamic glassmorphic web console supporting Super Admin global platform management mode and Project / Developer scoped view.

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

### Authentication (`/api/v1/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/register` | Register new user account |
| `POST` | `/login` | Authenticate user & receive JWT access + refresh tokens |
| `POST` | `/refresh` | Rotate refresh token & obtain new JWT |
| `POST` | `/logout` | Revoke refresh token |
| `POST` | `/mfa/setup` | Generate Base32 secret key & `otpauth://` QR URI |
| `POST` | `/mfa/verify` | Verify 6-digit TOTP code and enable MFA on profile |

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
| **Credential Theft** | TOTP Multi-Factor Authentication | RFC 6238 HMAC-SHA1 6-digit TOTP verification required during login. |
| **Database Data Leak** | Two-Tier Envelope Encryption | AES-256-GCM field encryption with HKDF Master KEK wrapping 256-bit project DEKs. |
| **Key Compromise** | Non-Destructive Key Rotation | Re-wraps project DEKs with new keys without corrupting encrypted field data. |
| **Cross-Site Scripting** | Strict Content Security Policy | Restricts script, style, and font sources to trusted local & CDN origins. |
| **SQL Injection** | Strict Regex & Parameterization | Collection names sanitized with `/^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/` and parameterized SQL. |

---

## 📄 License
This project is licensed under the MIT License.
