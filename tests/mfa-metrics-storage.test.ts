// ─────────────────────────────────────────────────────────────────────────────
//  tests/mfa-metrics-storage.test.ts
//  Integration Test Suite: TOTP MFA, Prometheus Metrics & Storage Drivers
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { totpService } from '../src/services/totp.service';
import { metricsService } from '../src/services/metrics.service';
import { storageDriver } from '../src/storage/storage-driver.factory';

async function runMfaMetricsStorageTests(): Promise<void> {
  console.log('================================================================');
  console.log('🧪 Running TOTP MFA, Prometheus Metrics & Storage Driver Tests');
  console.log('================================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failedCount++;
    }
  }

  try {
    // --- Test Suite 1: TOTP MFA Engine ---
    console.log('--- Test Suite 1: TOTP MFA Engine ---');
    const secret = totpService.generateSecret();
    assert(typeof secret === 'string' && secret.length >= 16, 'Generates valid 160-bit Base32 secret');

    const otpUrl = totpService.generateOtpAuthUrl('alice@flarebase.dev', secret);
    assert(otpUrl.startsWith('otpauth://totp/FlareBase%3Aalice%40flarebase.dev?secret='), 'Generates valid OTPAuth URI');

    const currentCode = totpService.generateCode(secret);
    assert(currentCode.length === 6 && /^\d{6}$/.test(currentCode), 'Generates valid 6-digit TOTP code');

    const isValid = totpService.verifyCode(secret, currentCode);
    assert(isValid === true, 'Verifies valid TOTP code within time window');

    const isInvalid = totpService.verifyCode(secret, '999999');
    assert(isInvalid === false, 'Rejects invalid TOTP code');

    // --- Test Suite 2: Prometheus Metrics Exposition ---
    console.log('\n--- Test Suite 2: Prometheus Metrics Exposition ---');
    metricsService.recordHttpRequest('GET', '/api/v1/projects', 200);
    metricsService.recordRateLimitHit('login');

    const metricsText = metricsService.generatePrometheusMetrics();
    assert(metricsText.includes('process_cpu_seconds_total'), 'Exposes `process_cpu_seconds_total` metric');
    assert(metricsText.includes('process_resident_memory_bytes'), 'Exposes `process_resident_memory_bytes` metric');
    assert(metricsText.includes('http_requests_total'), 'Exposes `http_requests_total` metric');
    assert(metricsText.includes('rate_limit_hits_total'), 'Exposes `rate_limit_hits_total` metric');

    // --- Test Suite 3: Storage Driver Abstraction ---
    console.log('\n--- Test Suite 3: Multi-Driver Storage Abstraction ---');
    const dummyBuffer = Buffer.from('FlareBase Test File Content 12345');
    const uploadRes = await storageDriver.uploadFile(dummyBuffer, 'test_media.txt', 'text/plain');

    assert(!!uploadRes.storedName, 'Storage driver returns stored filename');
    assert(uploadRes.sizeBytes === dummyBuffer.length, 'Storage driver preserves uploaded file byte size');

    const signedUrl = await storageDriver.getSignedUrl(uploadRes.storedName);
    assert(typeof signedUrl === 'string' && signedUrl.length > 0, 'Storage driver generates accessible asset URL');

    await storageDriver.deleteFile(uploadRes.storedName);
    assert(true, 'Storage driver deletes asset without error');

  } catch (err: any) {
    console.error('❌ Test execution error:', err.message);
    failedCount++;
  }

  console.log('\n================================================================');
  console.log(`📊 Test Results: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runMfaMetricsStorageTests();
}
