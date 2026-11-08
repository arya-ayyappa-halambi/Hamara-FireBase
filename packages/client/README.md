# @flarebase/client

> Official, lightweight, zero-dependency TypeScript Client SDK for **FlareBase** — the fast, self-hosted Firebase alternative.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](https://github.com/arya-ayyappa-halambi/Hamara-FireBase/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-success?style=flat-square)](https://github.com/arya-ayyappa-halambi/Hamara-FireBase)

---

## Features

- ⚡ **Zero Runtime Dependencies**: Uses native `fetch` and streaming APIs — ultra-lightweight footprint (< 8 KB gzipped).
- 🔒 **End-to-End Type Safety**: Complete TypeScript declarations for documents, queries, and auth sessions.
- 🔄 **Real-Time Reactive Streams**: Server-Sent Events (SSE) Change Data Capture (`.onSnapshot()`) with zero setup.
- 🛡️ **Declarative Row-Level Security (RLS)**: Enforces rule parameters directly on insert, query, and update.
- 🌐 **Isomorphic**: Runs identically in Modern Browsers, Node.js 18+, Next.js App Router, Cloudflare Workers, Bun, and Deno.

---

## Installation

```bash
npm install @flarebase/client
```

Or using pnpm / yarn:
```bash
pnpm add @flarebase/client
yarn add @flarebase/client
```

### Browser Drop-in (CDN / Self-Hosted)

Include directly from your running FlareBase instance with zero build tools:

```html
<script src="http://localhost:3000/flarebase.js"></script>
<script>
  const flare = new FlareBase.FlareBaseClient({
    baseUrl: 'http://localhost:3000',
    apiKey: 'flare_pk_your_project_key'
  });
</script>
```

---

## Quick Start

### 1. Initialize the Client

```typescript
import { createClient } from '@flarebase/client';

const flare = createClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'flare_pk_your_public_api_key'
});
```

---

### 2. User Authentication

```typescript
// Register a new user
const session = await flare.auth.register({
  email: 'developer@example.com',
  password: 'SecurePassword123!',
  name: 'Ada Lovelace'
});

// Or sign in
const login = await flare.auth.login({
  email: 'developer@example.com',
  password: 'SecurePassword123!'
});

console.log('Logged in as:', flare.auth.getUser());
```

---

### 3. Document Collections (CRUD & Queries)

```typescript
interface Todo {
  title: string;
  completed: boolean;
  priority: 'low' | 'high';
}

const todos = flare.collection<Todo>('todos');

// 1. Insert with Declarative Row-Level Security (RLS)
const newDoc = await todos.insert(
  { title: 'Launch FlareBase SDK', completed: false, priority: 'high' },
  { read: 'auth.uid != null', write: 'auth.uid != null' }
);

// 2. Query documents with filters and pagination
const result = await todos.query({
  limit: 20,
  sortBy: '_createdAt',
  sortOrder: 'desc',
  filter: { completed: false }
});

console.log('Active todos:', result.items);

// 3. Update an existing document
await todos.update(newDoc.id, { completed: true });

// 4. Delete a document
await todos.delete(newDoc.id);
```

---

### 4. Real-Time Change Data Capture (CDC)

Listen to live database changes across any client in real-time:

```typescript
const unsubscribe = todos.onSnapshot((change) => {
  console.log(`Live Event [${change.type}]:`, change.document);

  if (change.type === 'INSERT') {
    // Add to UI
  } else if (change.type === 'UPDATE') {
    // Update UI state
  } else if (change.type === 'DELETE') {
    // Remove from UI
  }
});

// Unsubscribe when component unmounts
// unsubscribe();
```

---

### 5. File & Asset Storage

```typescript
// 1. Upload a file
const fileInput = document.getElementById('my-file') as HTMLInputElement;
const asset = await flare.storage.upload(fileInput.files![0]);
console.log('Asset URL:', flare.storage.getAssetUrl(asset.id));

// 2. Generate a time-limited signed URL
const signed = await flare.storage.getSignedUrl('contracts/nda.pdf', 'read', 3600);
console.log('Temporary download link:', signed.url);

// 3. Inspect storage quota
const quota = await flare.storage.getQuota();
console.log(`Used: ${quota.usedBytes} / ${quota.maxBytes} bytes`);
```

---

### 6. Error Handling

All failed API requests throw a structured `FlareBaseError`:

```typescript
import { FlareBaseError } from '@flarebase/client';

try {
  await todos.get('non-existent-id');
} catch (err) {
  if (err instanceof FlareBaseError) {
    console.error(`FlareBase Error (${err.status} / ${err.code}):`, err.message);
  }
}
```

---

## License

[MIT](LICENSE) © 2026 H R Arya Ayyappa Halambi
