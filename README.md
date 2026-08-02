# AegisDB 🛡️

**AegisDB** is a lightweight, zero-configuration Firebase-like Backend-as-a-Service (BaaS) engine. It is designed to be fully self-hosted and provides developers with a full suite of cloud services straight out of the box—complete with a beautiful, modern web dashboard.

![AegisDB Dashboard](https://img.shields.io/badge/AegisDB-Engine-6366f1?style=for-the-badge&logo=shield&logoColor=white)

## ✨ Features

- **Multi-Tenant Architecture**: Firebase-style Projects and API Keys for isolating database environments, collections, and safely interacting with the SDK.
- **Strict Project-Scoped Databases**: A highly isolated multi-tenant database engine built on top of SQLite. Collections and documents are strictly bound to their respective projects, ensuring maximum data isolation and integrity.
- **Dynamic Auto-Collection**: Insert JSON documents on the fly! If a collection doesn't exist, AegisDB will automatically generate it and securely attribute it to your active project context.
- **Real-Time Data Streams**: Native WebSocket support broadcasting live change stream events (insert, update, delete) to subscribed clients instantly.
- **Robust Authentication**: Secure Argon2id password hashing, rotating JWT access tokens, long-lived refresh tokens with a built-in blocklist, and dynamic user state verification.
- **Dynamic Auth Configurations**: Configure specific Authentication Providers (Email, Google, GitHub, Apple) and customize verification/reset templates directly from the dashboard!
- **Biometric Asset Storage**: A dedicated storage layer for securely handling, verifying (SHA-256 integrity), and serving biometric and media assets.
- **Project Hoster**: A container orchestration layer (with Docker & Node Process adapters) to dynamically deploy your applications.
- **Super Admin Portal**: Platform-wide telemetry, resource monitoring, dynamic rate-limit tuning, per-user monthly usage quotas (reads/writes/API), and dynamic penalty lockouts.
- **Glassmorphic Web Dashboard**: A premium, Tailwind-powered Vanilla JS dashboard for managing projects, executing queries, testing WebSockets, managing auth configs, and viewing logs in real-time.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v18+) **OR** [Docker](https://www.docker.com/) & Docker Compose

### 🐳 Installation (Recommended: Docker)
The fastest and safest way to deploy AegisDB is using the included Docker configuration. This ensures environment consistency and mounts your SQLite database securely to a persistent volume.

1. Clone the repository:
   ```bash
   git clone https://github.com/aryaayyappa/Hamara-FireBase.git
   cd Hamara-FireBase
   ```

2. Start the engine in the background:
   ```bash
   docker compose up --build -d
   ```

3. Access the Developer Dashboard at `http://localhost:3000`

*Your database (`aegis.db`) and user uploads are automatically persisted in Docker volumes across restarts!*

### 💻 Installation (Local / Development)

1. Install the dependencies:
   ```bash
   npm install
   ```

2. Build the TypeScript source:
   ```bash
   npm run build
   ```

3. Start the engine:
   ```bash
   npm start
   ```
*(For active development with hot-reloading, run `npm run dev`)*

---

## 🔒 Authentication & Super Admin

AegisDB seeds a Super Admin account automatically on the very first start. You can use these credentials to access the Super Admin Portal from the dashboard.

**Super Admin Credentials:**
- **Email:** `admin@aegis.dev`
- **Password:** `AdminPass123!`

For all API endpoints, access tokens must be supplied in the `Authorization: Bearer <TOKEN>` header. Project-level Database endpoints require your unique Project API Key in the `x-aegis-api-key` header (or `x-aegis-project-id` from the dashboard internal).

---

## 📦 Client SDK

AegisDB ships with a native TypeScript Client SDK (`@aegis/sdk`) that allows you to interface with the engine programmatically from your frontend apps.

```typescript
import { Aegis } from '@aegis/sdk';

// Initialize Client
const aegis = new Aegis({
  endpoint: 'http://localhost:3000',
  apiKey: 'aegis_pk_your_project_key_here'
});

// Authenticate User
await aegis.auth.login('alice@aegis.dev', 'password123');

// Insert a Document (Automatically creates the collection if it doesn't exist!)
await aegis.db.collection('sensors').insert({ temp: 24.5, active: true });

// Listen for Real-Time Changes
aegis.realtime.subscribe('sensors', (event) => {
  console.log('Live Database Event:', event);
});
```

---

## 🛠️ Tech Stack

- **Runtime Environment:** Node.js, Express.js
- **Containerization:** Docker & Docker Compose
- **Language:** TypeScript
- **Database:** SQLite (via `better-sqlite3`)
- **Real-Time:** WebSockets (`ws`)
- **Security:** JWT, Argon2, `express-rate-limit`
- **Dashboard UI:** Vanilla JavaScript, Tailwind CSS (CDN), FontAwesome

---

## 📄 License

This project is licensed under the MIT License.
