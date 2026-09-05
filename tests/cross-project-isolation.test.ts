// ─────────────────────────────────────────────────────────────────────────────
//  tests/cross-project-isolation.test.ts
//  Comprehensive Test Suite for Strict Multi-Tenant Project Isolation
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
process.env.JWT_SECRET = process.env.JWT_SECRET || "a-very-long-secret-key-at-least-32-characters-for-testing-purpose!";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a-very-long-encryption-key-32-bytes-long!";

import { initSqlite, getDb } from "../src/db/sqlite.connection";
import { projectService } from "../src/project/project.service";
import { projectAuthService } from "../src/project-auth/project-auth.service";
import { registerUser } from "../src/auth/auth.service";
import { userStore } from "../src/store/user.store";
import { dbStore } from "../src/db/db.service";
import { listAssets, getAsset } from "../src/storage/storage.service";
import { wsService } from "../src/realtime/websocket.service";
import { requirePlatformDeveloper } from "../src/middleware/auth.middleware";
import { requireAdminPermission } from "../src/middleware/admin.middleware";

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

async function runCrossProjectTests(): Promise<void> {
  console.log("\n================================================================");
  console.log("🧪 Running Cross-Project Multi-Tenant Isolation Test Suite");
  console.log("================================================================\n");

  initSqlite();
  const db = getDb();

  // 1. Setup Two Distinct Developers and Projects
  console.log("--- 1. Provision Two Distinct Projects ---");
  const devEmail1 = `dev1_${Date.now()}@aegis.dev`;
  const devEmail2 = `dev2_${Date.now()}@aegis.dev`;

  await registerUser({ email: devEmail1, password: "Password123!", name: "Dev Alpha" });
  await registerUser({ email: devEmail2, password: "Password123!", name: "Dev Beta" });

  const devUser1 = await userStore.findByEmail(devEmail1);
  const devUser2 = await userStore.findByEmail(devEmail2);
  assert(!!devUser1 && !!devUser2, "Both developer accounts created successfully");

  const projResultA = projectService.createProject(devUser1!.id, "Alpha Project");
  const projResultB = projectService.createProject(devUser2!.id, "Beta Project");
  const projA = projResultA.project;
  const projB = projResultB.project;

  assert(projA.id !== projB.id, "Projects have unique IDs");
  assert(projResultA.rawApiKey !== projResultB.rawApiKey, "Projects have distinct API keys");

  // 2. Database Documents & Collections Multi-Tenant Isolation
  console.log("\n--- 2. Database & Document Multi-Tenant Isolation ---");
  dbStore.createCollection(devUser1!.id, projA.id, { name: "orders", description: "Alpha Orders" });
  dbStore.createCollection(devUser2!.id, projB.id, { name: "orders", description: "Beta Orders" });

  const docA = dbStore.insertDocument(devUser1!.id, projA.id, "orders", { item: "Alpha Item", price: 100 });
  const docB = dbStore.insertDocument(devUser2!.id, projB.id, "orders", { item: "Beta Item", price: 200 });

  // Query Project A
  const queryResultA = dbStore.queryDocuments(devUser1!.id, projA.id, "orders");
  assert(queryResultA.documents.length === 1, "Project A query returns exactly 1 order");
  assert((queryResultA.documents[0] as any).item === "Alpha Item", "Project A query contains Alpha Item");
  assert(!queryResultA.documents.some((d: any) => d.item === "Beta Item"), "Project A CANNOT see Project B's order");

  // Query Project B
  const queryResultB = dbStore.queryDocuments(devUser2!.id, projB.id, "orders");
  assert(queryResultB.documents.length === 1, "Project B query returns exactly 1 order");
  assert((queryResultB.documents[0] as any).item === "Beta Item", "Project B query contains Beta Item");
  assert(!queryResultB.documents.some((d: any) => d.item === "Alpha Item"), "Project B CANNOT see Project A's order");

  // Cross-Project Document Access Defense
  let crossGetFailed = false;
  try {
    dbStore.getDocument(devUser2!.id, projB.id, "orders", docA._id);
  } catch (err: any) {
    crossGetFailed = true;
  }
  assert(crossGetFailed, "Project B cannot get Document from Project A (404 / isolated)");

  let crossDeleteFailed = false;
  try {
    dbStore.deleteDocument(devUser2!.id, projB.id, "orders", docA._id);
  } catch (err: any) {
    crossDeleteFailed = true;
  }
  assert(crossDeleteFailed, "Project B cannot delete Document from Project A");

  // 3. Storage & Asset Isolation
  console.log("\n--- 3. Biometric Storage & Asset Project Scoping ---");
  const assetIdA = `asset_a_${Date.now()}`;
  const assetIdB = `asset_b_${Date.now()}`;

  db.prepare(`
    INSERT INTO assets (id, ownerId, projectId, originalName, storedName, mimeType, sizeBytes, absolutePath, uploadedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(assetIdA, devUser1!.id, projA.id, "doc_alpha.png", "hash_alpha.png", "image/png", 1024, "/tmp/alpha.png");

  db.prepare(`
    INSERT INTO assets (id, ownerId, projectId, originalName, storedName, mimeType, sizeBytes, absolutePath, uploadedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(assetIdB, devUser2!.id, projB.id, "doc_beta.png", "hash_beta.png", "image/png", 2048, "/tmp/beta.png");

  const assetsForA = listAssets(devUser1!.id, projA.id);
  assert(assetsForA.length === 1 && assetsForA[0].id === assetIdA, "Project A asset list returns only Project A assets");
  assert(!assetsForA.some((a) => a.id === assetIdB), "Project A asset list excludes Project B assets");

  let crossAssetGetFailed = false;
  try {
    getAsset(devUser2!.id, assetIdA, projB.id);
  } catch (_) {
    crossAssetGetFailed = true;
  }
  assert(crossAssetGetFailed, "Project B cannot retrieve asset metadata belonging to Project A");

  // 4. Project End-User Token Cross-Mismatch Defense
  console.log("\n--- 4. End-User Cross-Project Token Mismatch Defense ---");
  const pUserAuthA = await projectAuthService.registerUser(projA.id, `user_a_${Date.now()}@test.com`, "UserPass123!");
  const pUserAuthB = await projectAuthService.registerUser(projB.id, `user_b_${Date.now()}@test.com`, "UserPass123!");

  assert(pUserAuthA.user.projectId === projA.id, "User A belongs to Project A");
  assert(pUserAuthB.user.projectId === projB.id, "User B belongs to Project B");

  // Verify DB Storage Separation
  const pUsersProjA = db.prepare("SELECT id FROM project_users WHERE projectId = ?").all(projA.id) as any[];
  const pUsersProjB = db.prepare("SELECT id FROM project_users WHERE projectId = ?").all(projB.id) as any[];
  assert(pUsersProjA.length === 1 && pUsersProjB.length === 1, "Project users scoped to their respective project_users records");

  // 5. Platform Developer & Perimeter Safeguards
  console.log("\n--- 5. Platform Perimeter & Organization Guards ---");
  const mockProjectUserReq: any = {
    user: {
      sub: pUserAuthA.user.id,
      id: pUserAuthA.user.id,
      projectId: projA.id,
      isProjectUser: true,
    },
  };

  let platformDevBlocked: any = false;
  requirePlatformDeveloper(mockProjectUserReq, {} as any, (err?: any) => {
    if (err) platformDevBlocked = true;
  });
  assert(platformDevBlocked, "requirePlatformDeveloper blocks project user token from developer account routes");

  let adminBlocked: any = false;
  requireAdminPermission()(mockProjectUserReq, {} as any, (err?: any) => {
    if (err) adminBlocked = true;
  });
  assert(adminBlocked, "requireAdminPermission blocks project user token from Super Admin routes");

  // 6. Token Mismatch and Cross-Project Key Replay Defense
  console.log("\n--- 6. Token Mismatch and Replay Defense ---");
  const { register: authRegister, login: authLogin } = require("../src/auth/auth.controller");
  
  // Test root register with API Key (Ingress Interception)
  const clientUserEmail = `client_${Date.now()}@test.com`;
  const mockRegisterReq: any = {
    headers: { 'x-aegis-api-key': projResultA.rawApiKey },
    body: { email: clientUserEmail, password: "ClientPassword123!" }
  };
  let registerResData: any = null;
  let registerStatusCode = 0;
  const mockRegisterRes: any = {
    status: (code: number) => {
      registerStatusCode = code;
      return mockRegisterRes;
    },
    json: (data: any) => {
      registerResData = data;
      return mockRegisterRes;
    }
  };

  await authRegister(mockRegisterReq, mockRegisterRes, (err: any) => {
    if (err) console.error(err);
  });

  assert(registerStatusCode === 201, "Root /api/v1/auth/register with API key returns 201 Created");
  assert(registerResData?.success === true, "Root register response succeeds");
  
  // Verify it was saved in project_users table, NOT users table
  const inPlatformUsers = db.prepare("SELECT id FROM users WHERE email = ?").get(clientUserEmail);
  const inProjectUsers = db.prepare("SELECT id FROM project_users WHERE projectId = ?").all(projA.id) as any[];
  assert(!inPlatformUsers, "Client user registered via root auth is NOT in platform 'users' table");
  assert(inProjectUsers.length >= 2, "Client user registered via root auth is properly saved in 'project_users' table");

  // Test root login with API Key (Ingress Interception)
  const mockLoginReq: any = {
    headers: { 'x-aegis-api-key': projResultA.rawApiKey },
    body: { email: clientUserEmail, password: "ClientPassword123!" },
    ip: "127.0.0.1"
  };
  let loginResData: any = null;
  let loginStatusCode = 0;
  const mockLoginRes: any = {
    status: (code: number) => {
      loginStatusCode = code;
      return mockLoginRes;
    },
    json: (data: any) => {
      loginResData = data;
      return mockLoginRes;
    }
  };

  await authLogin(mockLoginReq, mockLoginRes, (err: any) => {
    if (err) console.error(err);
  });

  assert(loginStatusCode === 200, "Root /api/v1/auth/login with API key returns 200 OK");
  assert(!!loginResData?.data?.accessToken, "Root login returns valid project user access token");
  assert(loginResData?.data?.user?.projectId === projA.id, "Returned project user token belongs to Project A");

  console.log("\n================================================================");
  console.log(`📊 Cross-Project Isolation Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================\n");

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runCrossProjectTests().catch((err) => {
  console.error("Fatal cross-project isolation test error:", err);
  process.exit(1);
});
