# About AegisDB 🛡️

**AegisDB** is a lightweight, zero-configuration, production-grade **Backend-as-a-Service (BaaS)** and open-source alternative to Google Firebase, AWS DynamoDB, and Supabase.

---

## 🌟 Mission & Vision

The modern web development landscape is fragmented by complex, expensive cloud backend services with unpredictable per-read/per-write billing models and heavy infrastructure setup requirements. 

AegisDB was built to give developers, startups, and enterprise teams complete **backend sovereignty**:
- **Zero Cloud Bills**: Run on your own laptop, private server, Raspberry Pi, or any cloud VM.
- **Microsecond Speed**: Native SQLite Write-Ahead Logging (WAL) architecture with parallel lock-free reads.
- **1-Click Execution**: Double-clickable launchers on Windows (`setup.bat` / `start.bat`), macOS (`setup.command` / `start.command`), and Linux (`setup.sh` / `start.sh`).
- **Complete BaaS Primitives**: Document database, Auth (JWT, TOTP MFA, OAuth 2.0), Real-Time WebSockets (CDC), S3 Disaster Recovery, Envelope Encryption, and GDPR privacy shredding out of the box.

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Backend Engine** | Node.js LTS (v20+), TypeScript 5.3, Express 4.x |
| **Database & WAL** | SQLite with WAL (Write-Ahead Logging) via `better-sqlite3` |
| **Realtime & CDC** | WebSockets (`ws`), Server-Sent Events (SSE) |
| **Security & Auth** | Argon2id, RFC 6238 TOTP MFA, AES-256-GCM Envelope Encryption, JWT |
| **Frontend Console** | Glassmorphic Vanilla JS SPA, Tailwind CSS, FontAwesome 6, Chart.js |
| **Disaster Recovery** | AWS SDK S3 client (`@aws-sdk/client-s3`), SQLite snapshotting |
| **Client SDKs** | TypeScript/JavaScript SDK (`@aegis/sdk`), Drop-in Browser Client (`aegis.js`) |

---

## 📊 Architectural Highlights

1. **Multi-Tenant Project Isolation**: Independent API keys, user rosters, OAuth providers, and security rules per project.
2. **Dual-Layer Row-Level Security (RLS)**: Declarative access control at both collection and document levels.
3. **Zero-Downtime Live Port Rebinding**: Dynamic TCP socket switching directly from the Developer Console without server restarts.
4. **GDPR / CCPA / DPDP Privacy Compliance**: Article 20 JSON data portability export, 7-day cooling-off erasure windows, and cryptographic data shredding.

---

## 📄 License & Authorship

- **License**: [MIT License](LICENSE) — Free for commercial and personal use.
- **Repository**: [https://github.com/aryaayyappa/Hamara-FireBase](https://github.com/aryaayyappa/Hamara-FireBase)
- **Safe Copy**: [https://github.com/aryaayyappa/AegisDB-Safe-Copy-](https://github.com/aryaayyappa/AegisDB-Safe-Copy-)
