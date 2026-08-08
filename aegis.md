# AegisDB: Comprehensive System Manual & Security Report

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

## 6. AegisDB Operations Manual

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
