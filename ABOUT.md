# About FlareBase

![FlareBase](https://img.shields.io/badge/FlareBase-Engine-6366f1?style=flat-square&logo=shield&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?style=flat-square&logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-macOS_|_Windows_|_Linux-informational?style=flat-square)

**FlareBase** is a lightweight, zero-configuration, production-grade **Backend-as-a-Service (BaaS)** and open-source alternative to Google Firebase, AWS DynamoDB, and Supabase.

---

## Mission & Vision

The modern web development landscape is fragmented by complex, expensive cloud backend services with unpredictable per-read/per-write billing models and heavy infrastructure setup requirements. 

FlareBase was built to give developers, startups, and enterprise teams complete **backend sovereignty**:
- **Zero Cloud Bills**: Run on your own laptop, private server, Raspberry Pi, or any cloud VM.
- **Microsecond Speed**: Native SQLite Write-Ahead Logging (WAL) architecture with parallel lock-free reads.
- **1-Click Execution**: Double-clickable launchers on Windows (`setup.bat` / `start.bat`), macOS (`setup.command` / `start.command`), and Linux (`setup.sh` / `start.sh`).
- **Complete BaaS Primitives**: Document database, Auth (JWT, TOTP MFA, OAuth 2.0), Real-Time WebSockets (CDC), S3 Disaster Recovery, Envelope Encryption, and GDPR privacy shredding out of the box.

---

## Technology Stack

| Layer | Technologies Used | Badges |
| :--- | :--- | :--- |
| **Backend Engine** | Node.js LTS (v20+), TypeScript 5.3, Express 4.x | ![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?style=flat-square&logo=nodedotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?style=flat-square&logo=typescript&logoColor=white) |
| **Database & WAL** | SQLite with WAL (Write-Ahead Logging) via `better-sqlite3` | ![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003b57?style=flat-square&logo=sqlite&logoColor=white) |
| **Realtime & CDC** | WebSockets (`ws`), Server-Sent Events (SSE) | ![WebSocket](https://img.shields.io/badge/WebSocket-Realtime-informational?style=flat-square) |
| **Security & Auth** | Argon2id, RFC 6238 TOTP MFA, AES-256-GCM Envelope Encryption, JWT | ![Security](https://img.shields.io/badge/Security-AES_256_GCM-10b981?style=flat-square) |
| **Frontend Console** | Glassmorphic Vanilla JS SPA, Tailwind CSS, FontAwesome 6, Chart.js | ![Tailwind](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) |
| **Disaster Recovery** | AWS SDK S3 client (`@aws-sdk/client-s3`), SQLite snapshotting | ![AWS S3](https://img.shields.io/badge/Amazon_S3-Backup-569A31?style=flat-square&logo=amazons3&logoColor=white) |
| **Client SDKs** | TypeScript/JavaScript SDK (`@flarebase/sdk`), Drop-in Browser Client (`flarebase.js`) | ![NPM](https://img.shields.io/badge/NPM-SDK-CB3837?style=flat-square&logo=npm&logoColor=white) |

---

## Architectural Highlights

1. **Multi-Tenant Project Isolation**: Independent API keys, user rosters, OAuth providers, and security rules per project.
2. **Dual-Layer Row-Level Security (RLS)**: Declarative access control at both collection and document levels.
3. **Zero-Downtime Live Port Rebinding**: Dynamic TCP socket switching directly from the Developer Console without server restarts.
4. **GDPR / CCPA / DPDP Privacy Compliance**: Article 20 JSON data portability export, 7-day cooling-off erasure windows, and cryptographic data shredding.

---

## License
 
- **License**: Proprietary & Confidential. All rights reserved.
- **Repository**: [https://github.com/aryaayyappa/Hamara-FireBase](https://github.com/aryaayyappa/Hamara-FireBase)
- **Safe Copy**: [https://github.com/aryaayyappa/FlareBase-Safe-Copy-](https://github.com/aryaayyappa/FlareBase-Safe-Copy-)
