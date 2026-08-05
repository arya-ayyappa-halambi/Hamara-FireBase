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

## 📊 Technical Report & Project Specifications

This section serves as a formal system design document and technical report detailing AegisDB's architectural model, database layout, security patterns, and distributed scaling capabilities.

### 1. System Architecture

AegisDB is designed as a modular, decoupled self-hosted BaaS engine. Below is a high-level representation of the data and control flow:

```mermaid
graph TD
    Client[Client Apps & SDKs] -->|HTTP / WebSockets / SSE| Gateway[API Gateway / Middleware]
    
    subgraph Gateway Layer
        Gateway -->|Key Check| Auth[Key Segregation & JWT Auth]
        Gateway -->|Attestation| AppCheck[App Check Middleware]
        Gateway -->|Rate Limiting| RateLimit[Token Bucket Rate Limiter]
    end
    
    subgraph Router Layer
        Auth & AppCheck -->|Route Match| DBRouter[Database Router]
        Auth & AppCheck -->|Route Match| StorageRouter[Storage Router]
    end

    subgraph Database Layer (WAL Mode)
        DBRouter -->|Writes| PrimaryDB[(Primary SQLite DB)]
        DBRouter -->|Reads - Round Robin| Replicas[(Reader Connection Pool x3)]
        PrimaryDB -->|Encryption/Decryption| AESGCM[AES-256-GCM HKDF Handler]
        PrimaryDB -->|Rules Validation| Sandbox[Sandboxed VM Engine]
    end

    subgraph Storage Layer
        StorageRouter -->|Signed URLs| Multer[Multer Upload Engine]
        Multer -->|Optimizations| Jimp[Jimp Media Transformation Pipeline]
        Jimp -->|Local Disk| Uploads[(File Assets Directory)]
    end

    subgraph Async Side-Effect Workers
        PrimaryDB -->|Queue Event| TaskQueue[Write-Behind Task Queue]
        TaskQueue -->|Async Log| AuditLog[(audit_logs Table)]
        TaskQueue -->|HMAC POST| Webhook[Webhook Dispatcher]
        TaskQueue -->|Logical Sync| CRDT[LWW-CRDT Peer Replication]
    end
```

---

### 2. Database Schema Specifications

The underlying SQLite store uses a relational multi-tenant layout. All table structures, fields, and indices are detailed below:

#### `users` Table (Super Admins)
Stores platform administrators authorized to manage projects and access global statistics.
- **`id`** (TEXT, Primary Key): UUIDv4 identifier.
- **`email`** (TEXT, Unique): Admin email address.
- **`passwordHash`** (TEXT): Hashed credentials (Argon2id).
- **`isSuperAdmin`** (INTEGER): Flag (`0` or `1`) for super admin privilege.

#### `projects` Table
Defines separate project scopes (tenants).
- **`id`** (TEXT, Primary Key): UUIDv4 identifier.
- **`name`** (TEXT): Descriptive project name.
- **`apiKeyHash`** (TEXT): Cryptographic hash of the public client key (`aegis_pk_...`).
- **`serviceKeyHash`** (TEXT): Cryptographic hash of the server administrative key (`aegis_sk_...`).
- **`authConfig`** (TEXT): JSON configuration string (JWT secrets, OAuth keys, App Check flag).
- **`maxAssetSizeBytes`** (INTEGER): Individual file size limit (default: 10MB).
- **`maxStorageBytes`** (INTEGER): Cumulative storage limit (default: 100MB).
- **`monthlyWriteQuota`** / **`monthlyReadQuota`** (INTEGER): API rate quota controls.

#### `project_users` Table
Multi-tenant user registry scoped to specific projects.
- **`id`** (TEXT, Primary Key): UUIDv4 identifier.
- **`projectId`** (TEXT, FK): Foreign key referencing `projects(id)`.
- **`email`** (TEXT): User login email.
- **`passwordHash`** (TEXT): Argon2id hashed password.
- **`role`** (TEXT): Access control role (`admin`, `editor`, `viewer`).
- **`customClaims`** (TEXT): JSON string containing custom claims.
- **`createdAt`** / **`updatedAt`** (TEXT): ISO-8601 timestamps.

#### `collections` Table
User-defined collections storing document records.
- **`ownerId`** (TEXT) / **`projectId`** (TEXT) / **`name`** (TEXT): Composite Primary Key.
- **`schema`** (TEXT): JSON Schema string defining collection structure and `"x-encrypted"` fields.
- **`rules`** (TEXT): JSON security rule expressions for `"read"` and `"write"` scopes.

#### `documents` Table
Document store holding serialized JSON payloads.
- **`id`** (TEXT, Primary Key): UUIDv4 identifier.
- **`ownerId`** (TEXT) / **`projectId`** (TEXT) / **`collectionName`** (TEXT): Foreign Key referencing `collections`.
- **`data`** (TEXT): Encrypted/Plaintext JSON document contents.
- **`version`** (INTEGER): Incremental write counter for CRDT LWW sync.
- **`createdAt`** / **`updatedAt`** (TEXT): ISO-8601 timestamps.

#### `assets` Table
Metadata tracking uploaded files.
- **`id`** (TEXT, Primary Key): UUIDv4 identifier.
- **`ownerId`** (TEXT) / **`projectId`** (TEXT): Tenancy owner scopes.
- **`originalName`** (TEXT): Client-side filename.
- **`storedName`** (TEXT): Secure SHA-256 hashed disk filename.
- **`mimeType`** (TEXT): MIME format content type.
- **`sizeBytes`** (INTEGER): File size on disk.
- **`absolutePath`** (TEXT): File system location.

#### `audit_logs` Table
Audit ledger tracking operations.
- **`id`** (TEXT, Primary Key): UUIDv4 identifier.
- **`timestamp`** (TEXT): Event execution timestamp (Indexed).
- **`actorId`** (TEXT): User ID performing the action.
- **`actionType`** (TEXT): Event label (e.g. `document.create`).
- **`projectId`** (TEXT, Indexed): Target project identifier.
- **`status`** (TEXT): Result state (`success`, `failure`).

#### `webhooks` Table
Project webhook endpoints.
- **`id`** (TEXT, Primary Key): UUIDv4 identifier.
- **`projectId`** (TEXT, Indexed): Project identifier.
- **`url`** (TEXT): Endpoint HTTPS destination.
- **`secret`** (TEXT): HMAC-SHA256 signature key.
- **`events`** (TEXT): JSON array of subscribed event types.

---

### 3. Security Threat Matrix & Mitigations

| Threat Vector | Mitigation Strategy | Implementation Details |
| :--- | :--- | :--- |
| **API Abuse & Scraping** | Sliding Token Bucket Rate Limiting | Custom middleware tracking token consumption per IP/User with headers returned. |
| **Sensitive Data Exposure** | Transparent Field-Level Encryption | AES-256-GCM cipher with project keys derived via HKDF using a master server secret. |
| **API Spoofing / Replay** | Device Attestation (App Check) | Derives signature check via a secret, validating client authenticity before routing. |
| **Credential Attacks** | High-entropy Hashing & Blocklisting | Utilizes Argon2id password hashing and active blocklist tracking for revoked JWT tokens. |
| **Malicious DB Injections** | Collection Name Regex & Parameterization | Strictly enforces `/^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/` regex rules and parameterized SQLite queries. |
| **Rules Engine Hijacking** | VM Execution Sandbox | Runs JavaScript rules in Node's native `vm` module with a 50ms execution timeout limits. |

---

### 4. Distributed System Mechanics

#### Logical LWW-CRDT Synchronization
To keep distributed edge nodes synchronized without coordination, AegisDB implements a **Last-Write-Wins (LWW) CRDT** model:
- Every document holds a `version` (scalar clock) and an `updatedAt` (physical timestamp).
- When a node receives a peer replication payload:
  $$\text{if } T_{\text{incoming}} > T_{\text{local}} \rightarrow \text{Apply Update}$$
  $$\text{if } T_{\text{incoming}} = T_{\text{local}} \land V_{\text{incoming}} > V_{\text{local}} \rightarrow \text{Apply Update}$$
  $$\text{else} \rightarrow \text{Discard Update}$$
- Discards stale updates safely, guaranteeing eventual consistency across multi-master region edge nodes.

---

### 5. API Endpoint Registry

#### Database Services (`/api/v1/db`)
- `POST /collections` - Create a collection (JSON Schema, Security Rules).
- `GET /collections` - List registered collections.
- `PATCH /collections/:name` - Update metadata/rules.
- `DELETE /collections/:name` - Delete collection.
- `POST /collections/:name/documents` - Create a document.
- `GET /collections/:name/documents` - Query documents (filters, sorting, pagination).
- `GET /collections/:name/documents/:id` - Fetch single document.
- `PATCH /collections/:name/documents/:id` - Update document.
- `DELETE /collections/:name/documents/:id` - Delete document.
- `POST /collections/:name/query-vector` - Nearest-neighbor semantic search.
- `GET /collections/:name/realtime` - Server-Sent Events (SSE) CDC stream.

#### Storage Services (`/api/v1/storage`)
- `POST /upload` - Standard multipart upload.
- `POST /signed-url` - Generate a signed upload URL.
- `POST /upload-signed` - Direct upload bypassing key validation (attestation check carried in JWT token query parameters).
- `GET /assets` - List user assets.
- `GET /assets/:id/file` - Download/Stream file.

#### Multi-Region Sync (`/api/v1/replication`)
- `POST /replication/sync` - Ingestion path for peer node logical mutations.

---

## 📄 License
This project is licensed under the MIT License.

