// ─────────────────────────────────────────────────────────────────────────────
//  tests/remote-ott-access.test.ts
//  FlareBase — Ephemeral One-Time Tokens (OTT) & Zero-Trust Device Approvals Tests
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { remoteOttAccessService } from '../src/services/remote-ott-access.service';
import { networkAccessService } from '../src/services/network-access.service';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`, detail || '');
    failed++;
  }
}

async function runRemoteOttTests() {
  console.log('================================================================');
  console.log('🧪 Running Remote OTT Tokens & Zero-Trust Device Approvals Tests');
  console.log('================================================================\n');

  initSqlite();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Ephemeral One-Time Token (OTT) Generation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Generate One-Time Token (OTT) ---');
  const ott1 = remoteOttAccessService.generateOneTimeToken({
    label: 'iPad Emergency Triage',
    createdByUserId: 'admin-1',
    durationMinutes: 15
  });

  assert(ott1.token.startsWith('ott_'), 'OTT token format starts with ott_');
  assert(ott1.isUsed === false, 'Newly generated OTT is unused');
  assert(ott1.label === 'iPad Emergency Triage', 'Label preserved');

  const list1 = remoteOttAccessService.listOneTimeTokens();
  const found1 = list1.find(t => t.id === ott1.id);
  assert(found1 !== undefined, 'OTT is recorded in database');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Single-Use Redemption & Auto-Burn Invariant
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Single-Use Redemption & Auto-Burn ---');
  const redeem1 = remoteOttAccessService.redeemOneTimeToken(ott1.token, '192.168.31.55');
  assert(redeem1.valid === true, 'First redemption succeeds');
  assert(typeof redeem1.jwtToken === 'string', 'Returns signed JWT token');
  assert(redeem1.user?.isSuperAdmin === true, 'Authenticated user is Super Admin');

  // Verify JWT claims
  if (redeem1.jwtToken) {
    const jwtSecret = process.env.JWT_SECRET || 'flarebase_super_secret_jwt_key_2026';
    const verified = jwt.verify(redeem1.jwtToken, jwtSecret) as any;
    assert(verified?.isSuperAdmin === true, 'JWT payload has isSuperAdmin claim');
    assert(verified?.isOttLogin === true, 'JWT payload has isOttLogin flag');
  }

  // SECOND REDEMPTION MUST FAIL (Token burned)
  const redeem2 = remoteOttAccessService.redeemOneTimeToken(ott1.token, '192.168.31.55');
  assert(redeem2.valid === false, 'Second redemption fails (Single-Use Invariant)');
  assert(redeem2.reason?.includes('already been redeemed and burned') === true, 'Rejection reason states token burned');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: IP Lock Restriction Invariant
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. IP Restriction Invariant ---');
  const ottIpRestricted = remoteOttAccessService.generateOneTimeToken({
    label: 'Locked to Workstation IP',
    createdByUserId: 'admin-1',
    durationMinutes: 30,
    ipRestriction: '192.168.31.88'
  });

  // Attempt redemption from wrong IP (192.168.31.99)
  const wrongIpRedeem = remoteOttAccessService.redeemOneTimeToken(ottIpRestricted.token, '192.168.31.99');
  assert(wrongIpRedeem.valid === false, 'Redemption rejected when IP does not match restriction');
  assert(wrongIpRedeem.reason?.includes('restricted to IP 192.168.31.88') === true, 'Reason explains IP mismatch');

  // Correct IP redemption
  const correctIpRedeem = remoteOttAccessService.redeemOneTimeToken(ottIpRestricted.token, '192.168.31.88');
  assert(correctIpRedeem.valid === true, 'Redemption succeeds from authorized IP');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Token Revocation by Admin
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Token Revocation ---');
  const ottToRevoke = remoteOttAccessService.generateOneTimeToken({
    label: 'Temp Token to Revoke',
    createdByUserId: 'admin-1'
  });

  const revokeResult = remoteOttAccessService.revokeOneTimeToken(ottToRevoke.id);
  assert(revokeResult === true, 'Revocation operation returns true');

  const redeemRevoked = remoteOttAccessService.redeemOneTimeToken(ottToRevoke.token, '127.0.0.1');
  assert(redeemRevoked.valid === false, 'Revoked token cannot be redeemed');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Zero-Trust Device Access Requests & Approvals
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Zero-Trust Device Approvals ---');
  const dreq = remoteOttAccessService.submitDeviceAccessRequest({
    ipAddress: '192.168.31.120',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    deviceName: 'Admin iPad Pro'
  });

  assert(dreq.id.startsWith('dreq-'), 'Device request created with dreq- prefix');
  assert(dreq.status === 'pending', 'Initial status is pending');
  assert(dreq.deviceName === 'Admin iPad Pro', 'Device name preserved');

  const allReqs = remoteOttAccessService.listDeviceAccessRequests();
  const foundReq = allReqs.find(r => r.id === dreq.id);
  assert(foundReq !== undefined, 'Device request listed in database');

  // Approve device request for 24 hours
  const approved = remoteOttAccessService.approveDeviceRequest(dreq.id, 'Super Admin', 24);
  assert(approved?.status === 'approved', 'Device request status changed to approved');
  assert(approved?.decidedBy === 'Super Admin', 'decidedBy recorded');
  assert(approved?.expiresAt !== null, 'expiresAt recorded');

  // Verify that an automated whitelist rule was created in NetworkAccessService
  const rules = networkAccessService.getRules();
  const matchingRule = rules.find(r => r.ipPattern === '192.168.31.120' && r.action === 'allow');
  assert(matchingRule !== undefined, 'Automated whitelist network rule created for approved device');

  // Reject a second device request
  const dreq2 = remoteOttAccessService.submitDeviceAccessRequest({
    ipAddress: '198.51.100.77',
    userAgent: 'Unknown Linux Box',
    deviceName: 'Suspicious Laptop'
  });

  const rejected = remoteOttAccessService.rejectDeviceRequest(dreq2.id, 'Super Admin');
  assert(rejected?.status === 'rejected', 'Second device request marked as rejected');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: One-Time Access Ephemeral Session Immutability Guard
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. OTT Session Immutability Guard ---');
  const { disallowOttSessionMutation } = await import('../src/middleware/admin.middleware');

  // Mock Request from an OTT session
  let nextCalledWithErr: any = null;
  const mockReqOtt: any = {
    user: {
      sub: 'admin-id',
      isSuperAdmin: true,
      isOttLogin: true,
      ottId: 'ott_mock_123'
    }
  };
  const mockRes: any = {};
  const mockNext = (err?: any) => {
    nextCalledWithErr = err;
  };

  disallowOttSessionMutation(mockReqOtt, mockRes, mockNext);
  assert(nextCalledWithErr !== null, 'disallowOttSessionMutation blocks OTT session from mutating permissions');
  assert(nextCalledWithErr?.statusCode === 403, 'Returns 403 Forbidden');
  assert(nextCalledWithErr?.details?.code === 'OTT_IMMUTABLE_SESSION', 'Code is OTT_IMMUTABLE_SESSION');

  // Normal Super Admin session without OTT flag should pass through
  const testState = { normalAdminNextCalled: false };
  const mockReqNormal: any = {
    user: {
      sub: 'admin-id',
      isSuperAdmin: true,
      isOttLogin: false
    }
  };
  disallowOttSessionMutation(mockReqNormal, mockRes, (err?: any) => {
    if (!err) testState.normalAdminNextCalled = true;
  });
  assert(Boolean(testState.normalAdminNextCalled) === true, 'Standard Super Admin session is permitted to manage permissions');

  console.log('\n================================================================');
  console.log(`📊 Remote OTT & Zero-Trust Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runRemoteOttTests().catch(err => {
  console.error('Fatal Remote OTT test error:', err);
  process.exit(1);
});
