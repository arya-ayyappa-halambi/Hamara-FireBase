# AegisDB 🛡️

AegisDB is a lightweight, zero-configuration Firebase-like Backend-as-a-Service (BaaS) engine. It is designed to be fully self-hosted and provides developers with a full suite of cloud services straight out of the box—complete with a beautiful, modern web dashboard.

![AegisDB Dashboard](https://img.shields.io/badge/AegisDB-Engine-6366f1?style=for-the-badge&logo=shield&logoColor=white)

## ✨ Features

- **Multi-Tenant Architecture**: Firebase-style Projects and API Keys for isolating database environments, collections, and safely interacting with the API.
- **Strict Project-Scoped Databases**: A highly isolated multi-tenant database engine built on top of SQLite. Collections and documents are strictly bound to their respective projects.
- **Dynamic Auto-Collection**: Insert JSON documents on the fly! If a collection doesn't exist, AegisDB will automatically generate it and securely attribute it to your active project context.
- **Real-Time Data Streams**: Native WebSocket support broadcasting live change stream events (insert, update, delete) to subscribed clients instantly.
- **Robust Authentication**: Secure Argon2id password hashing, rotating JWT access tokens, long-lived refresh tokens with a built-in blocklist, and dynamic user state verification.
- **OAuth Integration**: Turnkey native support for **Google, GitHub, and Apple** sign-in providers with dynamic dashboard configuration.
- **Granular Security Rules**: Control access at the collection and document level using a powerful JavaScript-like evaluation engine.
- **Biometric Asset Storage**: A dedicated storage layer for securely handling, verifying (SHA-256 integrity), and serving biometric and media assets.
- **Super Admin Portal**: Platform-wide telemetry, resource monitoring, dynamic rate-limit tuning, and per-user monthly usage quotas.
- **Glassmorphic Web Dashboard**: A premium, Tailwind-powered Vanilla JS dashboard for managing projects, executing queries, testing WebSockets, managing auth configs, and viewing logs in real-time.
- **Docker Ready**: Ships with a fully-configured Docker setup for immediate, persistent deployment to production environments.

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

2. Build the TypeScript source and run:
   ```bash
   npm run build
   npm run dev
   ```

---

## 📚 The AegisDB Manual

This section acts as your comprehensive guide for interacting with AegisDB's API.

### 1. API Authentication
Every request to your project's Database or Storage API requires authentication. You authenticate by providing a Bearer token in the `Authorization` header.

Your frontend application obtains this token by logging the user in via the Authentication endpoints (Email/Password or OAuth).
```http
Authorization: Bearer <YOUR_ACCESS_TOKEN>
```
*Note: If you are making administrative requests bypassing Security Rules, you can alternatively use your Project API Key in the `x-api-key` header.*

### 2. Database Operations (Read/Write)
AegisDB uses a schemaless, NoSQL-style document model backed by SQLite. You do not need to create a collection beforehand; inserting data into a new collection name will automatically generate it!

#### Create a Document
Send a `POST` request to automatically insert a new document. The document ID will be generated for you.
```bash
POST /api/v1/db/collections/<collection_name>/docs
Headers: Authorization: Bearer <token>
Body: 
{ 
  "title": "Hello World", 
  "author": "Alice",
  "published": true
}
```

#### Read Documents
Send a `GET` request to retrieve all documents in a collection.
```bash
GET /api/v1/db/collections/<collection_name>/docs
Headers: Authorization: Bearer <token>
```

#### Update a Document
Send a `PATCH` request to merge updates into an existing document.
```bash
PATCH /api/v1/db/collections/<collection_name>/docs/<document_id>
Headers: Authorization: Bearer <token>
Body: { "published": false }
```

#### Delete a Document
Send a `DELETE` request to permanently remove a document.
```bash
DELETE /api/v1/db/collections/<collection_name>/docs/<document_id>
Headers: Authorization: Bearer <token>
```

### 3. Writing Security Rules
AegisDB provides a powerful, JS-like syntax for securing your database at the collection level. Security rules determine whether a user is authorized to perform specific operations based on their Auth payload and the data itself.

Rules are configured directly in the **Database** tab of the dashboard by providing a JSON object for each collection:
```json
{
  "read": "<condition>",
  "write": "<condition>"
}
```

#### Syntax & Variables
Rules are written as boolean expressions. You have access to the following global variables during evaluation:
- `auth`: The authenticated user's JWT payload (e.g., `auth.sub` is the user ID, `auth.email` is the user's email). If the user is not authenticated, `auth` is `null`.
- `data`: The incoming data payload (for `create` or `update` operations).
- `resource`: The existing document in the database (for `read`, `update`, or `delete` operations).

#### Default Rule
By default, AegisDB locks down collections so that only authenticated users can access them:
```json
{
  "read": "auth != null",
  "write": "auth != null"
}
```

#### Examples

**1. Public Read, Authenticated Write**
```json
{
  "read": "true",
  "write": "auth != null"
}
```

**2. User-Specific Data (e.g., User Profiles)**
Only allow the user to read/write their own document (where the document ID equals their user ID):
```json
{
  "read": "auth != null && auth.sub == resource.id",
  "write": "auth != null && auth.sub == resource.id"
}
```

**3. Data Validation on Write**
Ensure that the incoming data contains specific fields before allowing a write:
```json
{
  "read": "true",
  "write": "auth != null && data.title != null && data.price > 0"
}
```

**4. Role-Based Access (Using Email)**
Restrict write access to a specific admin email:
```json
{
  "read": "auth != null",
  "write": "auth != null && auth.email == 'admin@example.com'"
}
```

### 4. Real-time WebSockets
AegisDB supports real-time synchronization. Your clients can listen for changes (creates, updates, deletes) on specific collections and instantly update the UI.

1. **Connect** to the WebSocket endpoint:
   `ws://localhost:3000/?token=<YOUR_ACCESS_TOKEN>`

2. **Subscribe** to a collection by sending a JSON message:
   ```json
   {
     "type": "subscribe",
     "collection": "my_collection"
   }
   ```

3. **Listen** for real-time events. The server will push JSON events whenever data changes:
   ```json
   {
     "type": "change",
     "collection": "my_collection",
     "operation": "INSERT",
     "docId": "5f4d...",
     "data": { "title": "New Post" }
   }
   ```

### 5. Cloud Storage
AegisDB includes built-in object storage for file and media uploads.

#### Upload a File
```bash
POST /api/v1/storage/upload
Headers: Authorization: Bearer <token>
FormData: 
  file: <FILE_BLOB>
```
*Returns the file's unique ID and path.*

#### List Files
```bash
GET /api/v1/storage
Headers: Authorization: Bearer <token>
```

---

## 🔒 Super Admin Access
AegisDB seeds a Super Admin account automatically on the very first start. You can use these credentials to access the Super Admin Portal from the dashboard.

**Super Admin Credentials:**
- **Email:** `admin@aegis.dev`
- **Password:** `AdminPass123!`

---

## 🔌 Firebase Compatibility & Emulation (Hamara-FireBase)

AegisDB includes a drop-in compatibility shim that allows you to swap out real Firebase Firestore and Firebase Auth in existing frontend codebases with AegisDB without changing your application code.

### 1. Vanilla JavaScript SDK (`aegis.js`)
`aegis.js` is a lightweight client SDK for connecting to AegisDB. It handles auth state, session caching, and database/storage API requests.

### 2. Firebase Firestore/Auth Shim (`firebase-shim.js`)
`firebase-shim.js` wraps the `AegisClient` into standard Firebase interface structures. It emulates:
- `firebase.initializeApp(config, appName)`
- `firebase.firestore()` (collections, document reads, document writes, update, delete, batch writes)
- `firebase.auth()` (email/password sign-in, user registration, sign-out, session change listeners)

#### Usage Example
To use it, load the Aegis SDK and Firebase Shim before your application scripts:
```html
<script src="aegis.js"></script>
<script src="firebase-shim.js"></script>
```

Initialize it with your AegisDB credentials:
```javascript
const FB_CFG = {
  aegisBaseUrl: "http://localhost:3000",
  aegisApiKey: "aegis_pk_<your_project_api_key>"
};

// Initializes the emulator default app and any secondary apps
firebase.initializeApp(FB_CFG);

const db = firebase.firestore();
const auth = firebase.auth();

// Read documents (automatically handles AegisDB query wraps)
db.collection('students').get().then(snapshot => {
  snapshot.forEach(doc => {
    console.log(doc.id, doc.data());
  });
});
```

---

## 🛡️ Enterprise Security Hardening & Architecture Upgrades

AegisDB implements state-of-the-art security features and architecture upgrades inspired by Firebase and Supabase to protect your self-hosted database and scale under high concurrent production loads.

### 1. Cryptographic Key Segregation (Supabase Pattern)
API keys are segregated into two distinct isolation tiers:
- **Anon/Public Keys (`aegis_pk_...`):** Safe for client-side distribution in web or mobile apps. All requests are subject to collection-level Security Rules.
- **Service Role Keys (`aegis_sk_...`):** High-privilege keys that bypass Security Rules entirely. Only usable in trusted backend contexts. Requests containing service keys made from a browser-like environment (indicated by `Origin` / `Referer` headers) are explicitly blocked.

### 2. Device & App Integrity Attestation - "Aegis App Check" (Firebase Pattern)
Protect your API endpoints from unauthorized scraping and clients.
- Enforce App Check by setting `"appCheckEnforced": true` in your project's `authConfig`.
- Clients must fetch an App Check token by sending a POST request to `/api/v1/project-auth/attest` with their attestation parameters.
- Provide the returned App Check token in the `x-aegis-app-check` header on database and auth requests.

### 3. VM Sandboxed Rules Engine
Dynamic security rules are compiled and run inside Node's native `vm.runInContext` sandbox environment.
- Rule evaluation is CPU timeout-restricted (50ms execution ceiling) to prevent infinite loop exploits.
- Supported context variables:
  - `auth`: The authenticated user's decoded JWT payload.
  - `data`: The incoming data payload (for write operations).
  - `resource`: The current existing document data.
  - `request.time`: The current server ISO timestamp.

### 4. Sliding Token Bucket Rate Limiting
Custom in-memory sliding token bucket rate limiter tracking requests per project/IP/user.
- Enforces default thresholds (e.g. max 120 reads/writes per minute) and returns `429 Too Many Requests` with a standard `Retry-After` header when exceeded.
- Exposes real-time rate limiting telemetry to the Super Admin portal.

### 5. Transparent Field-Level Encryption at Rest (AES-GCM)
Encrypts sensitive fields (declared with `"x-encrypted": true` in collection schemas, plus default fields like `ssn`, `creditCard`) before storing payloads in SQLite.
- Uses AES-256-GCM cipher mode with unique IVs and authentication tags.
- Derives separate 256-bit encryption keys per project utilizing HKDF with a secure master secret.
- Automatically decrypts encrypted values transparently upon authorized retrieval.

### 6. Dedicated Audit Logging Service
Every security-sensitive event (mutations, authentication, and policy changes) is captured by a dedicated audit service.
- Persisted in an indexed `audit_logs` SQLite table.
- Accessible to Super Admins via `/api/v1/admin/audit-logs`.

### 7. Online Hot SQLite Backups & Retention
Ensures data durability without blocking database operations.
- Employs SQLite's online non-blocking `.backup()` snapshot API.
- Compresses backups into `.db.gz` archives and enforces an automated 10-backup rotation retention policy.
- Automated daily scheduled backups alongside manual backup invocation via `POST /api/v1/admin/backups`.

### 8. Role-Based Access Control (RBAC) & Custom Claims
Natively supports user-level roles (`admin`, `editor`, `viewer`) and arbitrary JSON custom claims.
- Decoded roles and claims are embedded inside JWT access tokens and automatically populated in Security Rules' `auth` variable.

---

## 🏢 Enterprise-Grade Scaling & Resiliency

### 1. SQLite High-Concurrency Tuning
Optimized connection options by running performance PRAGMAs on startup:
- **WAL (Write-Ahead Logging) Mode** with `NORMAL` synchronous write safety to prevent locking.
- **5-second busy-timeout** to handle high-concurrency contention gracefully.
- **Memory cache sizing** (20MB) to keep hot database sectors in memory.
- **Memory temp-store** to accelerate sorting and temporary queries.

### 2. Read-Replica Routing & Query Offloading
Safely handles read-heavy workloads by splitting transaction traffic:
- Establishes a pool of 3 read-only SQLite connections.
- Automatically routes all reads round-robin across reader connections, reserving the primary SQLite connection exclusively for writes.

### 3. Asynchronous Write-Behind Task Queue
Decouples non-critical side effects from the request thread.
- Processes tasks like audit log writes and webhook dispatches out-of-band in a sequential background micro-task worker queue.
- Drastically reduces API response latency.

### 4. Database Change Data Capture (CDC) & Real-Time SSE Streams
In addition to WebSockets, AegisDB supports Server-Sent Events (SSE) CDC streams.
- Exposes `GET /api/v1/db/collections/:name/realtime` supporting browser `EventSource` connections.
- Allows clients to filter change notifications in real-time by passing query parameters (e.g. `?name=apple`), mimicking Firebase/Supabase real-time filters.

### 5. Vector Search & Semantic RAG Queries
Integrates high-dimensional semantic search:
- Schema property `"type": "vector"` supports storing float array embeddings.
- Endpoint `POST /api/v1/db/collections/:name/query-vector` performs high-speed Cosine Similarity calculations to return nearest-neighbor matches for AI agent memory and RAG workflows.

### 6. Signed Upload URLs & On-The-Fly Media transformations
- **Signed URL uploads**: Endpoint `POST /api/v1/storage/signed-url` generates secure, time-bound upload URLs so clients can bypass global key validation and upload files directly.
- **On-the-fly transformations**: Automatically resizes images, generates thumbnails, and converts format (JPEG/PNG) based on query parameters (`?width=150&format=png`) during upload.

### 7. Multi-Region Replication & CRDT-based Conflict Resolution
- Synchronizes write events across edge replica nodes using logical replication.
- Implements **Last-Write-Wins (LWW-CRDT)** resolution using incremental document version tracking and logical timestamps, guaranteeing eventual consistency across geographical multi-master nodes without data loss.

---

## 📄 License
This project is licensed under the MIT License.

