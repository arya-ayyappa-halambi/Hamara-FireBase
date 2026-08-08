// ─────────────────────────────────────────────────────────────────────────────
//  tests/ssrf-guard.test.ts
//  Unit tests for Webhook SSRF Guard module.
// ─────────────────────────────────────────────────────────────────────────────

import assert from 'assert';
import { isPrivateIp, validateSsrfUrl, assertSafeWebhookUrl } from '../src/utils/ssrf-guard';

async function runSsrfGuardTests() {
  console.log('🧪 Starting Webhook SSRF Protection Guard Unit Tests...\n');

  // Test 1: Private & Loopback IPv4 Detection
  console.log('1. Testing IPv4 Private & Loopback Address Detection...');
  assert.strictEqual(isPrivateIp('127.0.0.1'), true, '127.0.0.1 must be private');
  assert.strictEqual(isPrivateIp('127.0.0.5'), true, '127.0.0.5 loopback must be private');
  assert.strictEqual(isPrivateIp('10.0.0.1'), true, '10.0.0.1 (Class A) must be private');
  assert.strictEqual(isPrivateIp('172.16.0.1'), true, '172.16.0.1 (Class B) must be private');
  assert.strictEqual(isPrivateIp('172.31.255.255'), true, '172.31.255.255 must be private');
  assert.strictEqual(isPrivateIp('192.168.1.1'), true, '192.168.1.1 (Class C) must be private');
  assert.strictEqual(isPrivateIp('169.254.169.254'), true, 'AWS Metadata 169.254.169.254 must be private');
  assert.strictEqual(isPrivateIp('8.8.8.8'), false, '8.8.8.8 public IP must be allowed');
  assert.strictEqual(isPrivateIp('1.1.1.1'), false, '1.1.1.1 public IP must be allowed');
  console.log('   ✅ IPv4 private & public detection tests passed.');

  // Test 2: Private & Loopback IPv6 Detection
  console.log('2. Testing IPv6 Private & Loopback Address Detection...');
  assert.strictEqual(isPrivateIp('::1'), true, '::1 loopback must be private');
  assert.strictEqual(isPrivateIp('0:0:0:0:0:0:0:1'), true, '0:0:0:0:0:0:0:1 loopback must be private');
  assert.strictEqual(isPrivateIp('fc00::1'), true, 'fc00::1 Unique Local must be private');
  assert.strictEqual(isPrivateIp('fd12:3456:789a:1::1'), true, 'fd12:: Unique Local must be private');
  assert.strictEqual(isPrivateIp('fe80::1'), true, 'fe80::1 Link Local must be private');
  assert.strictEqual(isPrivateIp('::ffff:127.0.0.1'), true, 'IPv6 mapped 127.0.0.1 must be private');
  assert.strictEqual(isPrivateIp('2607:f8b0:4005:805::200e'), false, 'Public Google IPv6 must be allowed');
  console.log('   ✅ IPv6 private & public detection tests passed.');

  // Test 3: Blocked Hostnames & Schemes
  console.log('3. Testing Protocol & Hostname Restrictions...');
  const fileUrl = await validateSsrfUrl('file:///etc/passwd');
  assert.strictEqual(fileUrl.safe, false, 'file:// protocol must be rejected');

  const ftpUrl = await validateSsrfUrl('ftp://example.com/file.txt');
  assert.strictEqual(ftpUrl.safe, false, 'ftp:// protocol must be rejected');

  const localhostUrl = await validateSsrfUrl('http://localhost/admin');
  assert.strictEqual(localhostUrl.safe, false, 'localhost domain must be rejected');

  const internalDomainUrl = await validateSsrfUrl('https://service.internal/webhook');
  assert.strictEqual(internalDomainUrl.safe, false, '.internal domain must be rejected');

  const directMetadataUrl = await validateSsrfUrl('http://169.254.169.254/latest/meta-data/');
  assert.strictEqual(directMetadataUrl.safe, false, 'Direct Cloud Metadata IP URL must be rejected');
  console.log('   ✅ Protocol & hostname restriction tests passed.');

  // Test 4: Valid External Domain Resolution
  console.log('4. Testing Safe Public Domain Resolution...');
  const safeRes = await validateSsrfUrl('https://example.com/webhook');
  assert.strictEqual(safeRes.safe, true, 'https://example.com must be validated as safe');
  assert.ok(safeRes.resolvedIp, 'Resolved IP must be populated');
  console.log(`   ✅ Public domain validated successfully (Resolved IP: ${safeRes.resolvedIp}).`);

  // Test 5: assertSafeWebhookUrl Assertion Test
  console.log('5. Testing assertSafeWebhookUrl Assertion Error Handling...');
  try {
    await assertSafeWebhookUrl('http://127.0.0.1/admin/shutdown');
    assert.fail('Should have thrown SSRF Guard error');
  } catch (err: any) {
    assert.ok(err.message.includes('SSRF Guard Violation'), 'Should throw SSRF Guard error message');
  }
  console.log('   ✅ assertSafeWebhookUrl rejected internal IP as expected.');

  console.log('\n🎉 ALL WEBHOOK SSRF GUARD TESTS PASSED SUCCESSFULLY!\n');
}

runSsrfGuardTests().catch((err) => {
  console.error('❌ SSRF Guard Unit Test Failed:', err);
  process.exit(1);
});
