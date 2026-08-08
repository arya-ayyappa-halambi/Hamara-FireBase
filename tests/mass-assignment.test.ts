// ─────────────────────────────────────────────────────────────────────────────
//  tests/mass-assignment.test.ts
//  Unit tests for Schema Mass Assignment Sanitizer Middleware.
// ─────────────────────────────────────────────────────────────────────────────

import assert from 'assert';
import { sanitizePayload, FORBIDDEN_SYSTEM_FIELDS } from '../src/middleware/mass-assignment.middleware';

async function runMassAssignmentTests() {
  console.log('🧪 Starting Schema Mass Assignment Sanitizer Unit Tests...\n');

  // Test 1: Stripping forbidden system fields by default
  console.log('1. Testing System & Administrative Field Stripping...');
  const maliciousInput = {
    username: 'john_doe',
    email: 'john@example.com',
    isSuperAdmin: true, // Malicious privilege escalation
    role: 'superadmin',  // Malicious role override
    passwordHash: 'stolen_hash',
    _id: 'fake_id',
    mfaSecret: 'hacked_secret',
    apiLimit: 999999,
  };

  const sanitized1 = sanitizePayload(maliciousInput);
  assert.strictEqual(sanitized1.username, 'john_doe');
  assert.strictEqual(sanitized1.email, 'john@example.com');
  assert.strictEqual((sanitized1 as any).isSuperAdmin, undefined, 'isSuperAdmin must be stripped');
  assert.strictEqual((sanitized1 as any).role, undefined, 'role must be stripped');
  assert.strictEqual((sanitized1 as any).passwordHash, undefined, 'passwordHash must be stripped');
  assert.strictEqual((sanitized1 as any)._id, undefined, '_id must be stripped');
  assert.strictEqual((sanitized1 as any).mfaSecret, undefined, 'mfaSecret must be stripped');
  assert.strictEqual((sanitized1 as any).apiLimit, undefined, 'apiLimit must be stripped');
  console.log('   ✅ All forbidden administrative fields successfully stripped.');

  // Test 2: JSON Schema Property Boundaries (additionalProperties = false)
  console.log('2. Testing JSON Schema Property Enforcement (additionalProperties = false)...');
  const userSchema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      content: { type: 'string' },
      tags: { type: 'array' },
    },
    additionalProperties: false,
  };

  const inputWithExtraFields = {
    title: 'AegisDB Security',
    content: 'Advanced protection against mass assignment',
    tags: ['security', 'api'],
    unauthorizedField: 'hacker_data',
    internalStatus: 'approved',
  };

  const sanitized2 = sanitizePayload(inputWithExtraFields, userSchema);
  assert.strictEqual(sanitized2.title, 'AegisDB Security');
  assert.strictEqual(sanitized2.content, 'Advanced protection against mass assignment');
  assert.deepStrictEqual(sanitized2.tags, ['security', 'api']);
  assert.strictEqual((sanitized2 as any).unauthorizedField, undefined, 'Unlisted field must be stripped');
  assert.strictEqual((sanitized2 as any).internalStatus, undefined, 'Unlisted internal field must be stripped');
  console.log('   ✅ Properties restricted strictly to JSON schema declaration.');

  // Test 3: Nested Object Sanitization
  console.log('3. Testing Nested Payload Object Sanitization...');
  const nestedInput = {
    profile: {
      bio: 'Developer',
      isSuperAdmin: true, // Nested attack vector
      avatarUrl: 'https://example.com/pic.jpg',
    },
    status: 'active',
  };

  const sanitized3 = sanitizePayload(nestedInput);
  assert.strictEqual(sanitized3.profile?.bio, 'Developer');
  assert.strictEqual(sanitized3.profile?.avatarUrl, 'https://example.com/pic.jpg');
  assert.strictEqual((sanitized3.profile as any)?.isSuperAdmin, undefined, 'Nested isSuperAdmin must be stripped');
  console.log('   ✅ Nested objects recursively sanitized.');

  // Test 4: Allowing system fields when explicitly configured
  console.log('4. Testing System Field Override Options...');
  const adminInput = {
    name: 'System Account',
    isSuperAdmin: true,
  };

  const sanitized4 = sanitizePayload(adminInput, undefined, { allowSystemFields: true });
  assert.strictEqual(sanitized4.name, 'System Account');
  assert.strictEqual(sanitized4.isSuperAdmin, true, 'isSuperAdmin allowed when allowSystemFields is true');
  console.log('   ✅ Allowed system fields when explicitly requested by system options.');

  console.log('\n🎉 ALL MASS ASSIGNMENT SANITIZER TESTS PASSED SUCCESSFULLY!\n');
}

runMassAssignmentTests().catch((err) => {
  console.error('❌ Mass Assignment Unit Test Failed:', err);
  process.exit(1);
});
