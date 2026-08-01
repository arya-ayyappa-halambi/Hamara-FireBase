# AegisDB 🛡️

**AegisDB** is a lightweight, zero-configuration Firebase-like Backend-as-a-Service (BaaS) engine. It is designed to be fully self-hosted and provides developers with a full suite of cloud services straight out of the box—complete with a beautiful, modern web dashboard.

![AegisDB Dashboard](https://img.shields.io/badge/AegisDB-Engine-6366f1?style=for-the-badge&logo=shield&logoColor=white)

## ✨ Features

- **Dynamic Database Engine**: A schemaless document database built on top of SQLite, allowing on-the-fly collection creation and dynamic JSON document queries.
- **Real-Time Data Streams**: Native WebSocket support broadcasting live change stream events (insert, update, delete) to subscribed clients.
- **Robust Authentication**: Secure Argon2id password hashing, rotating JWT access tokens, and long-lived refresh tokens with a built-in blocklist.
- **Multi-Tenant Architecture**: Firebase-style Projects and API Keys for isolating database environments and securely interacting with the SDK.
- **Biometric Asset Storage**: A dedicated storage layer for securely handling, verifying (SHA-256 integrity), and serving biometric and media assets.
- **Project Hoster**: A container orchestration layer (with Docker & Node Process adapters) to dynamically deploy your applications.
- **Super Admin Portal**: Platform-wide telemetry, resource monitoring, dynamic rate-limit tuning, per-user monthly usage quotas (reads/writes/API), and dynamic penalty lockouts.
- **Glassmorphic Web Dashboard**: A premium, Tailwind-powered Vanilla JS dashboard for managing projects, executing queries, testing WebSockets, and viewing logs in real-time.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v18+)
- (Optional) Docker for containerized hoster deployments

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/aryaayyappa/Hamara-FireBase.git
   cd Hamara-FireBase
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Build the TypeScript source:
   ```bash
   npm run build
   ```

4. Start the engine:
   ```bash
   npm start
   ```

5. Access the Developer Dashboard at `http://localhost:3000`

---

## 🔒 Authentication & Super Admin

AegisDB seeds a Super Admin account automatically on the very first start. You can use these credentials to access the Super Admin Portal from the dashboard.

**Super Admin Credentials:**
- **Email:** `admin@aegis.dev`
- **Password:** `AdminPass123!`

For all API endpoints, access tokens must be supplied in the `Authorization: Bearer <TOKEN>` header. Project-level Database endpoints require your unique Project API Key in the `x-aegis-api-key` header.

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

// Insert a Document
await aegis.db.collection('sensors').insert({ temp: 24.5, active: true });

// Listen for Real-Time Changes
aegis.realtime.subscribe('sensors', (event) => {
  console.log('Live Database Event:', event);
});
```

---

## 🛠️ Tech Stack

- **Runtime Environment:** Node.js, Express.js
- **Language:** TypeScript
- **Database:** SQLite (via `better-sqlite3`)
- **Real-Time:** WebSockets (`ws`)
- **Security:** JWT, Argon2, `express-rate-limit`
- **Dashboard UI:** Vanilla JavaScript, Tailwind CSS (CDN), FontAwesome

---

## 📄 License

This project is licensed under the MIT License.
