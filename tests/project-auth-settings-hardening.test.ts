// ─────────────────────────────────────────────────────────────────────────────
//  tests/project-auth-settings-hardening.test.ts
//  FlareBase — Project Auth Provider Controls & Security Hardening Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
process.env.JWT_SECRET = process.env.JWT_SECRET || "a-very-long-secret-key-at-least-32-characters-for-testing-purpose!";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a-very-long-encryption-key-32-bytes-long!";
process.env.RECOVERY_PIN = process.env.RECOVERY_PIN || "948201";

import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { projectAuthService } from '../src/project-auth/project-auth.service';
import { projectService } from '../src/project/project.service';
import { registerUser } from '../src/auth/auth.service';
import { userStore } from '../src/store/user.store';
import { AppError } from '../src/types/auth.types';
import { authenticateApiKeyOrJwt } from '../src/middleware/apikey.middleware';
import { authenticateJwt } from '../src/middleware/auth.middleware';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

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

async function runProjectAuthHardeningTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🛡️  Running FlareBase Project Auth Provider Hardening Test Suite');
  console.log('================================================================\n');

  initSqlite();
  const db = getDb();

  // 1. Seed Platform Developer & Test Project
  console.log('--- 1. Seed Platform Developer & Test Project ---');
  const devEmail = `dev_auth_${Date.now()}@flarebase.dev`;
  await registerUser({
    email: devEmail,
    password: 'SecureDevPassword123!',
    name: 'FlareBase Platform Dev'
  });
  const devUser = await userStore.findByEmail(devEmail);
  assert(!!devUser, 'Platform developer account created successfully');

  const { project, rawApiKey } = projectService.createProject(devUser!.id, 'Dynamic Auth Test Project');
  const projectId = project.id;
  assert(!!projectId, 'Test project created with unique ID and API keys');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 2: Dynamic Provider Discovery & Public Config Defaults
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Dynamic Provider Discovery & Defaults ---');
  
  // By default, public registration and email auth are enabled, OAuth is disabled
  const projRow1 = db.prepare('SELECT authConfig FROM projects WHERE id = ?').get(projectId) as any;
  let authConfig1 = projRow1?.authConfig ? JSON.parse(projRow1.authConfig) : {};
  assert(authConfig1.allowPublicRegistration !== false, 'Default public registration is enabled');
  assert(authConfig1.email?.enabled !== false, 'Default email auth is enabled');
  assert(!authConfig1.google?.enabled, 'Default Google OAuth is disabled until configured');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 3: Save Auth Config with Google OAuth in FlareBase Auth Tab
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Configure Google OAuth & Client ID Propagation ---');
  const testGoogleClientId = '1234567890-testgoogleapps.apps.googleusercontent.com';
  const updatedConfig = {
    allowPublicRegistration: true,
    email: { enabled: true },
    google: { enabled: true, clientId: testGoogleClientId },
    github: { enabled: false, clientId: '' },
    apple: { enabled: false, clientId: '' },
    magicLink: { enabled: true },
    passkeys: { enabled: false }
  };

  projectService.updateAuthConfig(projectId, devUser!.id, updatedConfig, false);

  const projRow2 = db.prepare('SELECT authConfig FROM projects WHERE id = ?').get(projectId) as any;
  const savedConfig = JSON.parse(projRow2.authConfig);
  assert(savedConfig.google?.enabled === true, 'Google OAuth marked enabled in project config');
  assert(savedConfig.google?.clientId === testGoogleClientId, 'Google Client ID stored accurately');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 4: Strict Disabled-Provider Lockout (Email Auth Disabled)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Strict Disabled-Provider Lockout: Email Auth Disabled ---');
  
  // Disable Email Auth
  const emailDisabledConfig = {
    ...updatedConfig,
    email: { enabled: false }
  };
  projectService.updateAuthConfig(projectId, devUser!.id, emailDisabledConfig, false);

  // Attempt 1: Register with Email
  let registerBlocked = false;
  try {
    await projectAuthService.registerUser(projectId, 'test_user@example.com', 'Password123!');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403 && err.message.includes('Email registration is disabled')) {
      registerBlocked = true;
    }
  }
  assert(registerBlocked, 'Email registration is strictly blocked with HTTP 403 when email auth is disabled');

  // Attempt 2: Login with Email
  let loginBlocked = false;
  try {
    await projectAuthService.loginUser(projectId, 'test_user@example.com', 'Password123!');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403 && err.message.includes('Email authentication is disabled')) {
      loginBlocked = true;
    }
  }
  assert(loginBlocked, 'Email login is strictly blocked with HTTP 403 when email auth is disabled');

  // Re-enable email auth for subsequent tests
  projectService.updateAuthConfig(projectId, devUser!.id, updatedConfig, false);

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 5: Strict Disabled-Provider Lockout: OAuth Providers (Google/GitHub/Apple)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Strict Disabled-Provider Lockout: OAuth Toggles ---');

  // Attempt to authenticate via GitHub (which is disabled)
  let githubBlocked = false;
  try {
    await projectAuthService.handleOAuth(projectId, 'github', 'gho_dummy_token_12345');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403 && err.message.includes('github authentication is disabled')) {
      githubBlocked = true;
    }
  }
  assert(githubBlocked, 'GitHub OAuth is strictly rejected with HTTP 403 when disabled in project settings');

  // Attempt to authenticate via Apple (which is disabled)
  let appleBlocked = false;
  try {
    await projectAuthService.handleOAuth(projectId, 'apple', 'apple_dummy_token_12345');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403 && err.message.includes('apple authentication is disabled')) {
      appleBlocked = true;
    }
  }
  assert(appleBlocked, 'Apple OAuth is strictly rejected with HTTP 403 when disabled in project settings');

  // Disable Google OAuth and verify it immediately blocks even if a token is passed
  const googleDisabledConfig = {
    ...updatedConfig,
    google: { enabled: false, clientId: testGoogleClientId }
  };
  projectService.updateAuthConfig(projectId, devUser!.id, googleDisabledConfig, false);

  let googleBlocked = false;
  try {
    await projectAuthService.handleOAuth(projectId, 'google', 'google_id_token_12345');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403 && err.message.includes('google authentication is disabled')) {
      googleBlocked = true;
    }
  }
  assert(googleBlocked, 'Google OAuth is strictly rejected with HTTP 403 when toggled OFF, even with valid Client ID present');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 6: Public Registration Restriction (Admin-Only Provisioning)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Public Registration Restriction ---');
  
  const privateRegistrationConfig = {
    ...updatedConfig,
    email: { enabled: true },
    allowPublicRegistration: false
  };
  projectService.updateAuthConfig(projectId, devUser!.id, privateRegistrationConfig, false);

  let publicRegBlocked = false;
  try {
    await projectAuthService.registerUser(projectId, 'public_stranger@example.com', 'SecretPass123!');
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403 && err.message.includes('Public user registration is disabled')) {
      publicRegBlocked = true;
    }
  }
  assert(publicRegBlocked, 'Public sign-up is blocked with HTTP 403 when allowPublicRegistration is false');

  // Restore public registration
  projectService.updateAuthConfig(projectId, devUser!.id, updatedConfig, false);

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 7: Legitimate Project User Flow & Token Lifecycles
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Legitimate Project User Registration & Token Lifecycles ---');
  
  const legitEmail = `legit_user_${Date.now()}@example.com`;
  const authRes = await projectAuthService.registerUser(projectId, legitEmail, 'LegitPassword123!');
  assert(!!authRes.token && !!authRes.refreshToken, 'User successfully registered when email auth is enabled');

  // Verify access token expiration is 1 hour
  const decoded = jwt.decode(authRes.token) as any;
  assert(decoded.exp - decoded.iat === 3600, 'Access token is strictly 1-hour expiration');
  assert(decoded.isProjectUser === true, 'Token payload explicitly carries isProjectUser: true');
  assert(decoded.projectId === projectId, 'Token payload is scoped to correct projectId');

  // Refresh token rotation
  const rotated = await projectAuthService.rotateRefreshToken(projectId, authRes.refreshToken);
  assert(!!rotated.token && !!rotated.refreshToken, 'Successfully rotated refresh token');
  assert(rotated.refreshToken !== authRes.refreshToken, 'New refresh token is uniquely generated');

  // Replay Attack Detection: Reusing the old refresh token
  let replayDetected = false;
  try {
    await projectAuthService.rotateRefreshToken(projectId, authRes.refreshToken);
  } catch (err: any) {
    if (err instanceof AppError && (err.details === 'TOKEN_REUSE_DETECTED' || err.message.includes('reuse detected'))) {
      replayDetected = true;
    }
  }
  assert(replayDetected, 'Refresh token replay detected and triggered full token family invalidation');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 8: Project User Isolation Invariants
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. Project User Isolation Invariants ---');
  
  // Ensure project end-user does NOT appear in platform developers users table
  const platformUsers = db.prepare('SELECT * FROM users WHERE email = ?').all(legitEmail);
  assert(platformUsers.length === 0, 'Project end-user does not exist in platform developers table');

  const projectUsers = db.prepare('SELECT * FROM project_users WHERE projectId = ?').all(projectId);
  assert(projectUsers.length >= 1, 'Project end-user properly resides in project_users table');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 9: Forged / Hardcoded Auth ID Rejection
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 9. Forged / Hardcoded Auth ID Rejection ---');

  // Sign a JWT with valid secret and project ID, but a non-existent / forged sub
  const fakeToken = jwt.sign({
    sub: 'forged_fake_user_id_99999',
    projectId: projectId,
    email: 'fake_demo@example.com',
    isProjectUser: true,
    role: 'admin'
  }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  let fakeTokenRejectedApiKey = false;
  const mockReq1 = {
    headers: {
      'x-flarebase-api-key': rawApiKey,
      authorization: `Bearer ${fakeToken}`
    },
    query: {},
    method: 'GET',
    originalUrl: '/api/v1/db/collections/users/documents',
    ip: '127.0.0.1',
  } as any;

  authenticateApiKeyOrJwt(mockReq1, {} as any, (err?: any) => {
    if (err instanceof AppError && err.statusCode === 401 && err.message.includes('Project user does not exist')) {
      fakeTokenRejectedApiKey = true;
    }
  });
  assert(fakeTokenRejectedApiKey, 'Forged / hardcoded user ID with API key is strictly rejected with HTTP 401');

  let fakeTokenRejectedDirectJwt = false;
  const mockReq2 = {
    headers: {
      authorization: `Bearer ${fakeToken}`
    },
    query: {},
    method: 'GET',
    originalUrl: '/api/v1/db/collections/users/documents',
    ip: '127.0.0.1',
  } as any;

  authenticateJwt(mockReq2, {} as any, (err?: any) => {
    if (err instanceof AppError && err.statusCode === 401) {
      fakeTokenRejectedDirectJwt = true;
    }
  });
  assert(fakeTokenRejectedDirectJwt, 'Forged / hardcoded user ID without API key is strictly rejected with HTTP 401');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 10: Real-Time Data Access Lockout When Provider is Disabled
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 10. Real-Time Data Access Lockout on Disabled Provider ---');

  // Enable email auth first and get valid token
  projectService.updateAuthConfig(projectId, devUser!.id, {
    allowPublicRegistration: true,
    email: { enabled: true }
  }, false);

  const activeEmailUser = await projectAuthService.registerUser(projectId, `active_email_${Date.now()}@example.com`, 'SecurePass123!');
  assert(!!activeEmailUser.token, 'Legitimate email user token created');

  // Verify access is allowed when provider is enabled
  let allowedWhenEnabled = false;
  const mockReqAllowed = {
    headers: {
      'x-flarebase-api-key': rawApiKey,
      authorization: `Bearer ${activeEmailUser.token}`
    },
    query: {},
    method: 'GET',
    originalUrl: '/api/v1/db/collections/test/documents',
    ip: '127.0.0.1',
  } as any;
  authenticateApiKeyOrJwt(mockReqAllowed, {} as any, (err?: any) => {
    if (!err && mockReqAllowed.projectUser?.sub === activeEmailUser.user.id) {
      allowedWhenEnabled = true;
    }
  });
  assert(allowedWhenEnabled, 'Active email user token permitted access when email provider is enabled');

  // Now DISABLE email auth in project settings
  projectService.updateAuthConfig(projectId, devUser!.id, {
    allowPublicRegistration: true,
    email: { enabled: false }
  }, false);

  // Attempt data access with previously issued token
  let blockedWhenDisabled = false;
  const mockReqBlocked = {
    headers: {
      'x-flarebase-api-key': rawApiKey,
      authorization: `Bearer ${activeEmailUser.token}`
    },
    query: {},
    method: 'GET',
    originalUrl: '/api/v1/db/collections/test/documents',
    ip: '127.0.0.1',
  } as any;
  authenticateApiKeyOrJwt(mockReqBlocked, {} as any, (err?: any) => {
    if (err instanceof AppError && err.statusCode === 403 && err.message.includes('Authentication provider "email" is disabled')) {
      blockedWhenDisabled = true;
    }
  });
  assert(blockedWhenDisabled, 'Data endpoint strictly rejects email user token with HTTP 403 when email auth is disabled');

  // Test token refresh also blocked
  let refreshBlockedOnDisabled = false;
  try {
    await projectAuthService.rotateRefreshToken(projectId, activeEmailUser.refreshToken);
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403 && err.message.includes('Authentication provider "email" is disabled')) {
      refreshBlockedOnDisabled = true;
    }
  }
  assert(refreshBlockedOnDisabled, 'Refresh token rotation strictly rejects with HTTP 403 when provider is disabled');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 11: Suspended / Quarantined Account Rejection on Data Access
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 11. Suspended / Quarantined Account Rejection on Data Endpoints ---');

  // Re-enable email auth
  projectService.updateAuthConfig(projectId, devUser!.id, {
    allowPublicRegistration: true,
    email: { enabled: true }
  }, false);

  // Suspend the user
  db.prepare('UPDATE project_users SET status = ? WHERE id = ?').run('suspended', activeEmailUser.user.id);

  let suspendedUserBlocked = false;
  const mockReqSuspended = {
    headers: {
      'x-flarebase-api-key': rawApiKey,
      authorization: `Bearer ${activeEmailUser.token}`
    },
    query: {},
    method: 'GET',
    originalUrl: '/api/v1/db/collections/test/documents',
    ip: '127.0.0.1',
  } as any;
  authenticateApiKeyOrJwt(mockReqSuspended, {} as any, (err?: any) => {
    if (err instanceof AppError && err.statusCode === 403 && err.message.includes('suspended or quarantined')) {
      suspendedUserBlocked = true;
    }
  });
  assert(suspendedUserBlocked, 'Suspended user data access is strictly blocked with HTTP 403');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 12: OAuth / Google Provider Real-Time Lockout
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 12. OAuth / Google Provider Real-Time Data Access Lockout ---');

  // Enable Google Auth and register user with provider 'google'
  projectService.updateAuthConfig(projectId, devUser!.id, {
    allowPublicRegistration: true,
    google: { enabled: true, clientId: 'test-google-id' }
  }, false);

  const googleUserId = `google_user_${Date.now()}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO project_users (id, projectId, email, emailHash, provider, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 'google', ?, ?)
  `).run(googleUserId, projectId, JSON.stringify({ ciphertext: 'fake', iv: 'fake', tag: 'fake' }), 'fake_google_hash', now, now);

  const googleUserToken = jwt.sign({
    sub: googleUserId,
    projectId: projectId,
    email: 'google_user@gmail.com',
    isProjectUser: true,
    role: 'viewer'
  }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  // Verify access succeeds when Google is enabled
  let googleAllowedWhenEnabled = false;
  const mockReqGoogleAllowed = {
    headers: {
      'x-flarebase-api-key': rawApiKey,
      authorization: `Bearer ${googleUserToken}`
    },
    query: {},
    method: 'GET',
    originalUrl: '/api/v1/db/collections/test/documents',
    ip: '127.0.0.1',
  } as any;
  authenticateApiKeyOrJwt(mockReqGoogleAllowed, {} as any, (err?: any) => {
    if (!err && mockReqGoogleAllowed.projectUser?.sub === googleUserId) {
      googleAllowedWhenEnabled = true;
    }
  });
  assert(googleAllowedWhenEnabled, 'Google OAuth user permitted data access when Google auth is enabled');

  // Disable Google Auth in project settings
  projectService.updateAuthConfig(projectId, devUser!.id, {
    allowPublicRegistration: true,
    google: { enabled: false }
  }, false);

  // Verify immediate lockout for Google user on data endpoint
  let googleBlockedWhenDisabled = false;
  const mockReqGoogleBlocked = {
    headers: {
      'x-flarebase-api-key': rawApiKey,
      authorization: `Bearer ${googleUserToken}`
    },
    query: {},
    method: 'GET',
    originalUrl: '/api/v1/db/collections/test/documents',
    ip: '127.0.0.1',
  } as any;
  authenticateApiKeyOrJwt(mockReqGoogleBlocked, {} as any, (err?: any) => {
    if (err instanceof AppError && err.statusCode === 403 && err.message.includes('Authentication provider "google" is disabled')) {
      googleBlockedWhenDisabled = true;
    }
  });
  assert(googleBlockedWhenDisabled, 'Google OAuth user strictly blocked with HTTP 403 on data endpoints when Google auth is toggled off');

  console.log('\n================================================================');
  console.log(`📊 Project Auth Hardening Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runProjectAuthHardeningTests().catch((err) => {
  console.error('Fatal Test Execution Error:', err);
  process.exit(1);
});
