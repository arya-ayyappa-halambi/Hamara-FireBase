# Declarative Row-Level Security (RLS) Guide

FlareBase features an expressive, declarative Row-Level Security engine that allows developers to define fine-grained authorization policies directly in document schemas and collection definitions.

---

## 1. Rule Architecture & Execution Model

Security rules in FlareBase are written as pure boolean JavaScript expressions evaluated within an isolated Node.js `vm.createContext` sandbox.

- **Sandbox Boundary**: Prohibits string code generation, WebAssembly compilation, prototype mutation, and access to `process`, `require`, `import`, or global scopes.
- **Fail-Closed Guarantee**: Any parse error, runtime exception, or evaluation timeout (>50ms) immediately fails closed, rejecting access (`return false`).
- **Context Variables**:
  - `auth`: The authenticated user object (`{ uid, email, role, projectId, orgId }`), or `null` if unauthenticated.
  - `resource`: The existing document currently stored in the database (`resource.id`, `resource.userId`, `resource.data`).
  - `data`: The incoming document payload being inserted or updated.
  - `request`: Request metadata (`request.time`, `request.method`, `request.query`).

---

## 2. Document-Level `_rules`

Attach rules directly to individual documents under the `_rules` property during insertion or update:

```json
{
  "title": "Confidential Product Strategy",
  "cost": 15000,
  "status": "draft",
  "userId": "usr_alice_123",
  "_rules": {
    "read": "auth != null && (auth.uid == resource.userId || auth.role == 'admin')",
    "write": "auth != null && auth.uid == resource.userId",
    "delete": "auth != null && auth.role == 'admin'"
  }
}
```

---

## 3. Common RLS Patterns

### Owner Only Access
```js
auth != null && auth.uid == resource.userId
```

### Public Read, Authenticated Write
```js
// read rule
true

// write rule
auth != null
```

### Role-Based Access Control (RBAC)
```js
auth != null && (auth.role == 'admin' || auth.role == 'moderator')
```

### Organization / Team Tenant Isolation
```js
auth != null && auth.orgId == resource.orgId
```

### Multi-Tenant Strict Project Boundary
```js
auth != null && auth.projectId == resource._projectId
```

### Content Publishing Lifecycle
```js
resource.status == 'published' || (auth != null && auth.uid == resource.userId)
```

### Input Data Validation (Write Constraints)
```js
data.cost >= 0 && data.status in {'draft': 1, 'published': 1}
```

---

## 4. Client SDK Usage

When using `@flarebase/client`, RLS rules can be specified directly as the second argument to `.insert()`:

```typescript
import { createClient } from '@flarebase/client';

const flare = createClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'flare_pk_...'
});

const tasks = flare.collection('tasks');

// Insert document with strict RLS enforcement
await tasks.insert(
  {
    title: 'Review production audit',
    completed: false
  },
  {
    read: 'auth != null && (auth.uid == resource._ownerId || auth.role == "admin")',
    write: 'auth != null && auth.uid == resource._ownerId'
  }
);
```
