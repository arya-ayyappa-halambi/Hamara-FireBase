// ─────────────────────────────────────────────────────────────────────────────
//  tests/admin-rbac.test.ts
//  Comprehensive Test Suite for Admin Accounts, RBAC Scopes & Dedicated IP Locks
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
process.env.JWT_SECRET = process.env.JWT_SECRET || "a-very-long-secret-key-at-least-32-characters-for-testing-purpose!";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a-very-long-encryption-key-32-bytes-long!";

import { initSqlite, getDb } from "../src/db/sqlite.connection";
import { adminService } from "../src/admin/admin.service";
import { userStore } from "../src/store/user.store";
import { loginUser, verifyAdminLoginSecurity, registerUser } from "../src/auth/auth.service";
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

async function runAdminRbacTests(): Promise<void> {
  console.log("\n================================================================");
  console.log("🧪 Running Granular Admin Accounts, RBAC & Dedicated IP Locks Test Suite");
  console.log("================================================================\n");

  initSqlite();
  const db = getDb();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Create a Scoped Admin with Dedicated IP Whitelist Lock
  // ─────────────────────────────────────────────────────────────────────────
  console.log("--- 1. Create Scoped Admin User with IP Lock ---");
  const adminAlice = await adminService.createAdmin({
    name: "Admin Alice",
    email: "alice.admin@company.com",
    password: "SecureAdminPassword123!",
    adminPermissions: ["telemetry", "network", "sec_ops"],
    adminAllowedIpSubnet: "192.168.1.50, 10.0.0.0/24",
    adminRequireMfa: false
  });

  assert(adminAlice.isSuperAdmin === true, "Admin Alice has isSuperAdmin = true");
  assert(adminAlice.name === "Admin Alice", "Admin Alice name matches");
  assert(adminAlice.adminAllowedIpSubnet === "192.168.1.50, 10.0.0.0/24", "Admin Alice IP lock preserved");
  assert(Array.isArray(adminAlice.adminPermissions) && adminAlice.adminPermissions.includes("network"), "Admin Alice has network scope");
  assert(!adminAlice.adminPermissions?.includes("user_management"), "Admin Alice does not have user_management scope");

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Promote Existing Developer to Admin
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n--- 2. Promote Existing Developer to Administrator ---");
  const bobReg = await registerUser({
    name: "Bob Developer",
    email: "bob.dev@company.com",
    password: "Password123!"
  });

  const promotedBob = await adminService.promoteUserToAdmin(
    bobReg.user.id,
    ["user_management", "rate_limits"],
    "127.0.0.1"
  );

  assert(Boolean(promotedBob?.isSuperAdmin) === true, "Bob is now an Administrator");
  assert(promotedBob?.adminAllowedIpSubnet === "127.0.0.1", "Bob has IP lock set to 127.0.0.1");
  assert(Array.isArray(promotedBob?.adminPermissions) && (promotedBob?.adminPermissions?.includes("user_management") ?? false), "Bob has user_management scope");

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Dedicated Admin Login IP Whitelist Enforcement
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n--- 3. Individual Admin Login IP Whitelist Enforcement ---");
  
  // Alice logging in from authorized IP (192.168.1.50)
  let aliceLoginAllowed = false;
  try {
    const loginRes = await loginUser({
      email: "alice.admin@company.com",
      password: "SecureAdminPassword123!",
      clientIp: "192.168.1.50"
    });
    aliceLoginAllowed = Boolean(loginRes.token);
  } catch (e) {
    aliceLoginAllowed = false;
  }
  assert(aliceLoginAllowed, "Alice successfully logs in from whitelisted IP 192.168.1.50");

  // Alice logging in from CIDR range (10.0.0.45)
  let aliceCidrLogin = false;
  try {
    const loginRes = await loginUser({
      email: "alice.admin@company.com",
      password: "SecureAdminPassword123!",
      clientIp: "10.0.0.45"
    });
    aliceCidrLogin = Boolean(loginRes.token);
  } catch (e) {
    aliceCidrLogin = false;
  }
  assert(aliceCidrLogin, "Alice successfully logs in from whitelisted CIDR IP 10.0.0.45");

  // Alice logging in from unauthorized external IP (203.0.113.88)
  let aliceBlockedCode = "";
  try {
    await loginUser({
      email: "alice.admin@company.com",
      password: "SecureAdminPassword123!",
      clientIp: "203.0.113.88"
    });
  } catch (err: any) {
    aliceBlockedCode = err?.details?.code || err?.code || "";
  }
  assert(aliceBlockedCode === "ADMIN_LOGIN_IP_UNAUTHORIZED", "Alice login from unauthorized IP is rejected with ADMIN_LOGIN_IP_UNAUTHORIZED");

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Middleware Granular Scope Authorization & Individual API IP Lock
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n--- 4. Granular RBAC Scope Authorization & API IP Locks ---");
  
  const mockReqAuthorizedScope: any = {
    user: { sub: adminAlice.id, email: adminAlice.email },
    headers: { "x-forwarded-for": "192.168.1.50" }
  };
  let authorizedNextCalled = false;
  const networkMiddleware = requireAdminPermission("network");
  networkMiddleware(mockReqAuthorizedScope, {} as any, (err?: any) => {
    if (!err) authorizedNextCalled = true;
  });
  assert(authorizedNextCalled, "Alice authorized on network endpoint with granted scope");

  const mockReqUnauthorizedScope: any = {
    user: { sub: adminAlice.id, email: adminAlice.email },
    headers: { "x-forwarded-for": "192.168.1.50" }
  };
  let scopeDeniedCode = "";
  const userMgmtMiddleware = requireAdminPermission("user_management");
  userMgmtMiddleware(mockReqUnauthorizedScope, {} as any, (err?: any) => {
    if (err) scopeDeniedCode = err?.details?.code;
  });
  assert(scopeDeniedCode === "ADMIN_INSUFFICIENT_PERMISSIONS", "Alice blocked on user_management endpoint with ADMIN_INSUFFICIENT_PERMISSIONS");

  // API Request from unauthorized IP
  const mockReqUnauthorizedIp: any = {
    user: { sub: adminAlice.id, email: adminAlice.email },
    headers: { "x-forwarded-for": "198.51.100.22" }
  };
  let ipLockedCode = "";
  networkMiddleware(mockReqUnauthorizedIp, {} as any, (err?: any) => {
    if (err) ipLockedCode = err?.details?.code;
  });
  assert(ipLockedCode === "ADMIN_IP_LOCKED", "Alice blocked on API request from unauthorized IP with ADMIN_IP_LOCKED");

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Admin Account Suspension
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n--- 5. Admin Account Suspension ---");
  await adminService.updateAdminSecurityConfig(bobReg.user.id, {
    adminStatus: "suspended"
  });

  let suspendedLoginCode = "";
  try {
    await loginUser({
      email: "bob.dev@company.com",
      password: "Password123!",
      clientIp: "127.0.0.1"
    });
  } catch (err: any) {
    suspendedLoginCode = err?.details?.code;
  }
  assert(suspendedLoginCode === "ADMIN_ACCOUNT_SUSPENDED", "Suspended Admin Bob rejected on login with ADMIN_ACCOUNT_SUSPENDED");

  // Reactivate Bob
  await adminService.updateAdminSecurityConfig(bobReg.user.id, {
    adminStatus: "active"
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Admin Demotion & Safety Guard Invariants
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n--- 6. Admin Demotion & Invariant Protections ---");
  
  // Demote Bob back to Developer
  const demotedBob = await adminService.demoteAdmin(bobReg.user.id, adminAlice.id);
  assert(Boolean(demotedBob?.isSuperAdmin) === false, "Bob successfully demoted back to regular developer");

  // Attempt Self-Demotion
  let selfDemoteError = "";
  try {
    await adminService.demoteAdmin(adminAlice.id, adminAlice.id);
  } catch (err: any) {
    selfDemoteError = err.message;
  }
  assert(selfDemoteError.includes("cannot revoke your own administrator privileges"), "Self-demotion is safely blocked");

  // ─────────────────────────────────────────────────────────────────────────
  // TEST RESULTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n================================================================");
  console.log(`📊 Admin RBAC & IP Lock Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAdminRbacTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
