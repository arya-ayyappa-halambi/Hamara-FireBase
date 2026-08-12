# AegisDB 🛡️

AegisDB is a lightweight, zero-configuration, production-grade Firebase-like Backend-as-a-Service (BaaS) engine. It is fully self-hosted, extremely performant, and provides developers with a full suite of cloud services straight out of the box—complete with a modern, glassmorphic developer console featuring a Mac-style collapsible sidebar.

![AegisDB Engine](https://img.shields.io/badge/AegisDB-Engine-6366f1?style=for-the-badge&logo=shield&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3.0-003b57?style=for-the-badge&logo=sqlite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=for-the-badge&logo=docker&logoColor=white)

---
AegisDB is a lightweight, zero-configuration, production-grade Firebase-like Backend-as-a-Service (BaaS) engine. It is fully self-hosted, extremely performant, and provides developers with a full suite of cloud services out-of-the-box, bundled with a stunning glassmorphic developer console.

---

## 1. What is AegisDB & Its Purpose?

**AegisDB** was created to bridge the gap between heavy enterprise cloud providers (like AWS, GCP, Firebase) and the need for localized, hyper-fast, secure, and privacy-respecting self-hosted databases. 

**Purpose:** To give developers a "Firebase in a box." You can run AegisDB on a single server, a Raspberry Pi, or a massive AWS EC2 instance, and instantly get:
- A document-oriented NoSQL interface backed by the blistering speed of SQLite.
- Real-time data sync using WebSockets.
- File storage and object management.
- Complete identity, access management, and multi-factor authentication (MFA).

**How it works:** AegisDB uses a lightweight Node.js/Express backend coupled with a highly tuned SQLite WAL-mode database (Write-Ahead Logging). This allows ultra-fast concurrent reads and serialized writes. The frontend is a zero-build-step Vanilla JS Single Page Application (SPA) styled with Tailwind CSS, meaning it loads instantly without requiring heavy frameworks or compilation pipelines.

---

## 2. Comprehensive Security Architecture

AegisDB is built with a "security-first, zero-trust" philosophy. Every layer of the application is hardened against modern web threats.

### Cryptography & Data Protection
- **Two-Tier Envelope Encryption (DEK/KEK):** At-rest data is encrypted using a Master Key Encryption Key (KEK) derived via HKDF-SHA256. This master key wraps per-project Data Encryption Keys (DEKs). Field-level data inside your database is encrypted using AES-256-GCM authenticated encryption. This means that even if a bad actor steals your `.sqlite` file, all sensitive fields are entirely unreadable without the KEK.
- **Non-Destructive Key Rotation:** Administrators can rotate encryption keys seamlessly. Because of the DEK/KEK envelope architecture, rotating the Master Key does not require decrypting and re-encrypting the entire database.
- **Asymmetric RS256 JWKS Token Signing:** All JWT session tokens are signed using an RSA-2048 bit private key. The public keys are exposed via a standard `/.well-known/jwks.json` endpoint, allowing external microservices to cryptographically verify AegisDB tokens without contacting the database directly.

### VM Sandbox Security Rules
- **Execution Isolation:** Collection access is governed by JavaScript security rules executed inside a secure Node.js `vm2` sandbox. 
- **Validation:** Developers can write custom JS functions (e.g., `if (data.age < 18) throw new Error("Too young")`) that AegisDB executes in an isolated thread. The `vm2` module strips out dangerous Node.js globals (like `process`, `fs`, `require`), preventing arbitrary remote code execution (RCE) while still allowing deeply complex, custom business logic to validate incoming requests.

### Threat Mitigations
- **15-Minute Brute-Force Lockout:** The system tracks consecutive failed logins by both IP address and Email pairs. Exactly 5 failed attempts trigger an automatic, unbypassable 15-minute HTTP 429 lockout.
- **Inactivity Session Timeout:** Users can configure their console session to automatically terminate after 5m, 15m, 30m, or 60m of mouse/keyboard inactivity. This ensures open browser tabs don't compromise security.
- **Strict Content Security Policy (CSP):** XSS attacks are mitigated via a strict CSP header that restricts scripts, styles, and fonts to trusted CDN origins (like `cdnjs.cloudflare.com` and `cdn.jsdelivr.net`) and completely blocks inline script execution `unsafe-inline`.
- **Dynamic Rate Limiting:** Super Admins can adjust the rate-limiting windows (e.g., Auth endpoints vs. API endpoints) dynamically from the UI without restarting the server.

---

## 3. UI & Frontend Capabilities (The Glassmorphic Console)

The AegisDB frontend was engineered to feel like a premium, native desktop application.

- **Mac-Style Auto-Expanding Sidebar:** The primary navigation uses a collapsible sidebar. When collapsed, hovering over it triggers a fluid, Mac-OS-style width expansion, allowing rapid navigation without permanently taking up horizontal screen real estate.
- **Premium Glassmorphism:** The entire UI utilizes backdrop-filters, subtle borders, and deep gradients to create a modern, translucent "glass" aesthetic.
- **FontAwesome Iconography:** Emojis have been entirely replaced with crisp, scalable FontAwesome SVG icons. This ensures visual consistency across operating systems and gives the application a professional, enterprise look.
- **Responsive Toast Notifications:** Real-time feedback is provided via non-blocking, sliding toast notifications for both successes and errors.

---

## 4. Feature Breakdown: User (Developer) vs. Super Admin

AegisDB utilizes a **Role Context Scope Switcher**. Users can toggle their dashboard view depending on their permissions. Standard Users only see the Project Developer context.

### User (Project Developer) Features
*Standard users operate strictly within isolated projects. They do not have access to global infrastructure.*
- **Project Management:** Create multiple independent databases under a single user account.
- **API Keys & Scopes:** Generate API keys linked specifically to individual projects.
- **Interactive API Key Tester:** A built-in Postman-like REST client right inside the console. Developers can select an API Key, choose a method (GET/POST), enter a JSON payload, and fire live requests against their database to test their endpoints.
- **Advanced Data Browser:** 
  - **Pagination:** Handles massive datasets efficiently with built-in client-side pagination (displays 100 documents per page seamlessly).
  - **Filtering:** Instant search bar filters the current data view, rendering specific JSON keys immediately.
  - **Clipboard Integration:** Developers can click a single button to copy raw JSON payloads of any document.
- **Storage Vault:** Upload and manage binary assets (images, PDFs) with pluggable storage drivers (Local Disk, AWS S3, Cloudflare R2).

### Super Admin Features
*The global overseer of the entire AegisDB instance.*
- **Live Infrastructure Telemetry:** A real-time dashboard powered by `Chart.js` polling `/api/v1/admin/stats`. Displays live CPU usage, V8 Memory Heap allocation, active WebSocket connections, and SQLite WAL query latency. Data refreshes automatically every 3 seconds or via a manual "Refresh Metrics" button.
- **Rate Limit Governance:** Adjust the global request throttles to defend against DDoS or traffic spikes.
- **Global Security Auditing:** Access system-wide logs, encryption statuses, and MFA compliance metrics across all users.

---

## 5. TOTP Multi-Factor Authentication (MFA) Manual

AegisDB strictly adheres to the RFC 6238 HMAC-SHA1 protocol for Time-Based One-Time Passwords (TOTP).

### How to Enable TOTP
1. Log into your account and navigate to **Settings > Security**.
2. Click **Setup MFA**.
3. AegisDB will cryptographically generate a unique `Base32` secret specifically for your account.
4. A QR Code will be rendered on the screen.
5. Open an Authenticator app (e.g., Google Authenticator, Authy, Apple Passwords).
6. Scan the QR code.
7. Enter the 6-digit pin generated by your app into the AegisDB input box to verify sync.
8. Your account is now secured. All future logins will require both your password and a live 6-digit pin.

### Dual Verification Lock
For extremely sensitive account changes, AegisDB enforces a Dual Verification Lock.
- **Disabling MFA:** You cannot simply click "Disable." You must provide your current account password *and* a live 6-digit TOTP code.
- **Changing Passwords:** Even if a session token is hijacked, an attacker cannot change your password without providing your current password *and* the current TOTP pin.

---

## 6. Dual-Target Disaster Recovery & Backup System

AegisDB includes a fully automated, cryptographically secure Dual-Target Backup engine to ensure absolute data durability.

- **Atomic SQLite Snapshots:** Utilizes SQLite's Online Backup API to safely capture point-in-time snapshots of the database without locking the main thread or causing read/write downtime.
- **Local File System Backups:** Saves heavily compressed `.sqlite3.bak` files directly to the local server, providing an ultra-fast Recovery Time Objective (RTO).
- **AWS S3 Cloud Backups:** Seamlessly streams multipart upload backups to remote Amazon S3 buckets, ensuring off-site redundancy.
- **Generation ID Tracking:** Every backup snapshot is tagged with a unique **Generation ID** timestamp, ensuring complete version history and preventing accidental data overwrites.
- **Manual & Scheduled Triggers:** Backups can be scheduled as background cron jobs or triggered manually via the Global Platform Settings in the Developer Console. The UI provides real-time status indicators on the progress of both Local and S3 backup processes.

---

## 7. AegisDB Operations Manual

### Booting the Server
To start the AegisDB engine locally:
1. Ensure dependencies are installed: `npm install`
2. Start the development server: `npm run dev`
3. Open your browser to `http://localhost:3000`

### Initial Setup
1. On the login screen, click **Register Account** to create your first user. The first user is automatically granted Super Admin privileges.
2. Follow the TOTP manual above to secure the root account.

### Creating a Project & Inserting Data
1. Switch your scope to **Project Developer** using the top navigation bar.
2. Navigate to **API Keys & Projects** and create a new project (e.g., "E-Commerce App").
3. Generate a new API Key for that project.
4. Navigate to the **API Tester** tab.
5. Select your new API key from the dropdown. 
6. Set the Method to **POST**, the Collection to `users`, and enter a JSON body:
   ```json
   { "name": "Alice", "role": "admin" }
   ```
7. Click **Send Request**. AegisDB will automatically create the `users` collection and insert the document!
8. Navigate to **Data Browser** to view your newly created documents with full pagination.

### Viewing Real-Time Telemetry
1. Switch your scope back to **Super Admin**.
2. Click on the **Telemetry** (Graph icon) tab.
3. Watch the CPU and Memory charts update in real-time as background tasks run. You can manually force a synchronization by clicking the spinning **Refresh Metrics** button.

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
| `POST` | `/collections/:name/documents` | Insert JSON document (auto-creates collection) |
| `GET` | `/collections/:name/documents` | Query documents with limit, offset & filters |
| `GET` | `/collections/:name/documents/:id` | Fetch document by ID |
| `PATCH` | `/collections/:name/documents/:id` | Merge update JSON document |
| `DELETE` | `/collections/:name/documents/:id` | Delete document |
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
| **Cross-Site Scripting (XSS)** | Helmet Security Headers | Strict Content Security Policy and HTTP headers restricting script, style, and font sources. |
| **HTTP Parameter Pollution** | HPP Middleware | Protects against parameter pollution attacks by safely parsing duplicate query strings. |
| **SQL Injection** | Strict Regex & Parameterization | Collection names sanitized with `/^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/` and parameterized SQL. |
| **API Key Leaks** | Dashboard Key Masking | Project API and Service keys are visually masked in the dashboard and securely copied via data attributes. |
| **Client Data Harvesting** | Strict Project Auth Isolation | Admin-level project endpoints (like listing all users) are completely isolated and require a backend Service Role Key or Dashboard Owner JWT. |
| **Dashboard UI Inspection** | Frontend Inspection Deterrence | The developer console blocks right-click context menus and common DevTools keyboard shortcuts (F12, Inspect, Console) to deter casual tampering. |

---

---

## 🤖 AI Agent & Developer Context Manual

This section provides context, prompts, and details for developers and **AI Agents** (like GitHub Copilot, Gemini, ChatGPT) when migrating an existing frontend (like Campus-Asthra) to use AegisDB, or when building new integrations.

### 🧠 Context for AI Agents
When an AI agent is instructed to "Migrate this app to use AegisDB" or "Build a frontend for AegisDB", the agent should understand the following:

1. **Architecture**: AegisDB is a RESTful API and WebSocket-based backend. There are no proprietary heavy SDKs required; standard `fetch()` or `axios` calls work perfectly.
2. **Authentication**: 
   - AegisDB uses a Project API Key for frontend requests.
   - The key must be passed in the `x-aegis-api-key` HTTP header.
   - **Important Security Rule**: Do NOT hardcode the API key in the frontend repository. Use `localStorage`, environment variables, or a secure prompt so the user can input their API key dynamically.
3. **Data Operations**: 
   - AegisDB operates on a standard JSON Document structure within Collections.
   - Document ID is optionally user-provided or auto-generated by AegisDB if omitted.
4. **File Storage**:
   - AegisDB has a built-in object storage (`/api/v1/storage/upload`).
   - Use `FormData` to upload files with the `file` field. It supports Magic Byte validation to ensure only safe files (like images) are uploaded.

### 🛠️ AI Prompt Templates
Use these prompts to instruct your AI to build or migrate apps using AegisDB:

#### Option A: Migrate Existing App
> *"I want to migrate my frontend application to use AegisDB as its backend. AegisDB is a RESTful BaaS running on `http://localhost:3000`. Please update my API calls to point to AegisDB. Ensure that the Project API Key is passed via the `x-aegis-api-key` header in all fetch requests. Do not hardcode the API key; instead, retrieve it from `localStorage.getItem('aegisApiKey')` or prompt the user for it. Update my database inserts to POST to `/api/v1/db/collections/<collection_name>/documents`, and file uploads to POST to `/api/v1/storage/upload` using FormData."*

#### Option B: Build New App from Scratch
> *"I want to build a new frontend web application that uses AegisDB as its backend. AegisDB is a RESTful BaaS running locally on `http://localhost:3000`. Build the UI and connect it to AegisDB using standard fetch(). Ensure that the Project API Key is passed via the `x-aegis-api-key` header in all requests. Do not hardcode the API key; prompt the user for it or use localStorage. Database inserts should POST to `/api/v1/db/collections/<collection_name>/documents`, and file uploads should POST to `/api/v1/storage/upload` using FormData."*

### 📡 Standard API Fetch Wrapper Example
When integrating AegisDB, use this standard wrapper for your requests:

```javascript
async function aegisFetch(endpoint, method = 'GET', body = null) {
  const apiKey = localStorage.getItem('aegisApiKey'); // Never hardcode!
  if (!apiKey) throw new Error('API Key missing. Please configure it in settings.');

  const headers = { 'x-aegis-api-key': apiKey };
  const options = { method, headers };

  if (body) {
    if (body instanceof FormData) {
      options.body = body; // Let browser set multipart/form-data boundary
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const response = await fetch(`http://localhost:3000${endpoint}`, options);
  const data = await response.json();
  
  if (!response.ok) throw new Error(data.message || 'API Request Failed');
  return data;
}
```

---

## 📄 License
This project is licensed under the MIT License.
