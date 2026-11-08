# @flarebase/react

Official React and Next.js reactive hooks for [FlareBase](https://github.com/arya-ayyappa-halambi/Hamara-FireBase) — the self-hosted, SQLite-powered Firebase alternative.

## Features

- **⚡ Zero Boilerplate**: Easily inject FlareBase into your React or Next.js app with `<FlareBaseProvider>`.
- **🔄 Real-Time Reactive Collections**: `useCollection()` binds document queries to live SSE change streams with automatic teardown and unmount cleanup.
- **📄 Single Document Subscriptions**: `useDocument()` tracks individual records and propagates partial updates immediately.
- **🛡️ First-Class Auth State**: `useAuth()` provides reactive session tracking, login, registration, and logout flows.
- **🗂️ Built-in Storage Helpers**: `useStorage()` manages multi-part uploads, signed URLs, and storage quotas with loading states.
- **🚀 SSR & Next.js Compatible**: Safe for Next.js App Router (`'use client'`), Pages Router, and standard Vite/React single-page applications.

---

## Installation

```bash
npm install @flarebase/client @flarebase/react
# or
yarn add @flarebase/client @flarebase/react
# or
pnpm add @flarebase/client @flarebase/react
```

---

## Quickstart

### 1. Initialize the Provider

Wrap your application in `FlareBaseProvider`:

```tsx
// app/providers.tsx
"use client";
import React from 'react';
import { createClient } from '@flarebase/client';
import { FlareBaseProvider } from '@flarebase/react';

const flare = createClient({
  baseUrl: process.env.NEXT_PUBLIC_FLAREBASE_URL || 'http://localhost:3000',
  apiKey: process.env.NEXT_PUBLIC_FLAREBASE_KEY || 'flare_pk_...'
});

export function Providers({ children }: { children: React.ReactNode }) {
  return <FlareBaseProvider client={flare}>{children}</FlareBaseProvider>;
}
```

---

### 2. Real-Time Collections with `useCollection`

```tsx
import React, { useState } from 'react';
import { useCollection } from '@flarebase/react';

interface Task {
  title: string;
  completed: boolean;
}

export function TaskList() {
  const { data: tasks, loading, insert, update, remove } = useCollection<Task>('tasks', {
    realTime: true,
    orderBy: 'createdAt',
    order: 'desc'
  });

  const [newTitle, setNewTitle] = useState('');

  if (loading) return <div>Loading tasks...</div>;

  return (
    <div>
      <form onSubmit={async (e) => {
        e.preventDefault();
        await insert({ title: newTitle, completed: false });
        setNewTitle('');
      }}>
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <button type="submit">Add Task</button>
      </form>

      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <span style={{ textDecoration: task.data.completed ? 'line-through' : 'none' }}>
              {task.data.title}
            </span>
            <button onClick={() => update(task.id, { completed: !task.data.completed })}>
              Toggle
            </button>
            <button onClick={() => remove(task.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

### 3. Single Document Subscription with `useDocument`

```tsx
import React from 'react';
import { useDocument } from '@flarebase/react';

export function UserProfile({ userId }: { userId: string }) {
  const { data: profile, loading, update } = useDocument<{ displayName: string; bio: string }>(
    'profiles',
    userId
  );

  if (loading) return <div>Loading profile...</div>;
  if (!profile) return <div>Profile not found</div>;

  return (
    <div>
      <h2>{profile.data.displayName}</h2>
      <p>{profile.data.bio}</p>
      <button onClick={() => update({ bio: 'Updated bio!' })}>Update Bio</button>
    </div>
  );
}
```

---

### 4. Authentication State with `useAuth`

```tsx
import React, { useState } from 'react';
import { useAuth } from '@flarebase/react';

export function AuthCard() {
  const { user, isAuthenticated, loading, login, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (loading) return <div>Checking session...</div>;

  if (isAuthenticated && user) {
    return (
      <div>
        <p>Signed in as <strong>{user.email}</strong></p>
        <button onClick={() => logout()}>Sign Out</button>
      </div>
    );
  }

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      await login({ email, password });
    }}>
      <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
      <button type="submit">Sign In</button>
    </form>
  );
}
```

---

### 5. File Uploads with `useStorage`

```tsx
import React from 'react';
import { useStorage } from '@flarebase/react';

export function FileUploader() {
  const { upload, uploading, getSignedUrl } = useStorage();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const res = await upload(file, 'file');
    const signedUrl = await getSignedUrl(res.filename, 'read', 3600);
    console.log('Secure asset URL:', signedUrl.url);
  };

  return (
    <div>
      <input type="file" onChange={handleUpload} disabled={uploading} />
      {uploading && <p>Uploading file...</p>}
    </div>
  );
}
```

---

## License

MIT License. Copyright 2026 H R Arya Ayyappa Halambi.
