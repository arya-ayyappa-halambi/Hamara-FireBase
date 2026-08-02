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

## 📄 License
This project is licensed under the MIT License.
