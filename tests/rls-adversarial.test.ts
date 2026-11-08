// ─────────────────────────────────────────────────────────────────────────────
//  tests/rls-adversarial.test.ts
//  Comprehensive adversarial, edge-case, and property-based test suite for
//  FlareBase Declarative Row-Level Security (RLS) expression evaluator.
// ─────────────────────────────────────────────────────────────────────────────

import assert from 'assert';
import { evaluateRuleExpression } from '../src/db/db.controller';

let totalTests = 0;
let passedTests = 0;

function it(description: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof (res as any).then === 'function') {
      return (res as any).then(() => {
        passedTests++;
        console.log(`  ✅ PASS: ${description}`);
      }).catch((err: any) => {
        console.error(`  ❌ FAIL: ${description}`);
        console.error(err);
        process.exitCode = 1;
      });
    }
    passedTests++;
    console.log(`  ✅ PASS: ${description}`);
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🧪 Running Declarative RLS Adversarial & Property-Based Tests');
  console.log('================================================================\n');

  // Base contexts
  const adminAuth = { uid: 'usr_admin_1', role: 'admin', projectId: 'proj_alpha', orgId: 'org_acme' };
  const memberAuth = { uid: 'usr_bob_2', role: 'member', projectId: 'proj_alpha', orgId: 'org_acme' };
  const attackerAuth = { uid: 'usr_eve_99', role: 'member', projectId: 'proj_beta', orgId: 'org_evil' };

  const ownResource = {
    id: 'doc_101',
    userId: 'usr_bob_2',
    _ownerId: 'usr_bob_2',
    _projectId: 'proj_alpha',
    orgId: 'org_acme',
    status: 'draft',
    cost: 49.99,
    tags: ['sales', 'confidential']
  };

  const otherResource = {
    id: 'doc_999',
    userId: 'usr_alice_1',
    _ownerId: 'usr_alice_1',
    _projectId: 'proj_alpha',
    orgId: 'org_acme',
    status: 'published',
    cost: 1500,
    tags: ['public']
  };

  // ── 1. Deeply Nested Boolean Logic & Precedence ──────────────────────────
  console.log('--- 1. Deeply Nested Boolean Expressions & Precedence ---');

  it('Standard owner-or-admin rule grants owner access', () => {
    const rule = `auth != null && (auth.uid == resource.userId || auth.role == 'admin')`;
    const res = evaluateRuleExpression(rule, { auth: memberAuth, data: null, resource: ownResource, request: null });
    assert.strictEqual(res, true);
  });

  it('Standard owner-or-admin rule grants admin access to other resource', () => {
    const rule = `auth != null && (auth.uid == resource.userId || auth.role == 'admin')`;
    const res = evaluateRuleExpression(rule, { auth: adminAuth, data: null, resource: otherResource, request: null });
    assert.strictEqual(res, true);
  });

  it('Standard owner-or-admin rule blocks non-owner non-admin', () => {
    const rule = `auth != null && (auth.uid == resource.userId || auth.role == 'admin')`;
    const res = evaluateRuleExpression(rule, { auth: attackerAuth, data: null, resource: otherResource, request: null });
    assert.strictEqual(res, false);
  });

  it('Short-circuits safely when auth is null without throwing TypeError', () => {
    const rule = `auth != null && auth.uid == resource.userId`;
    const res = evaluateRuleExpression(rule, { auth: null, data: null, resource: ownResource, request: null });
    assert.strictEqual(res, false);
  });

  it('Operator precedence: && binds tighter than ||', () => {
    // In JS: false && false || true => (false && false) || true => true
    const rule = `false && false || true`;
    assert.strictEqual(evaluateRuleExpression(rule, { auth: null, data: null, resource: null, request: null }), true);

    // true || false && false => true || (false && false) => true
    const rule2 = `true || false && false`;
    assert.strictEqual(evaluateRuleExpression(rule2, { auth: null, data: null, resource: null, request: null }), true);

    // (true || false) && false => false
    const rule3 = `(true || false) && false`;
    assert.strictEqual(evaluateRuleExpression(rule3, { auth: null, data: null, resource: null, request: null }), false);
  });

  it('Complex nested parenthesized boolean hierarchy (25 levels)', () => {
    let deepRule = `auth != null`;
    for (let i = 0; i < 25; i++) {
      deepRule = `(${deepRule} && true)`;
    }
    const res = evaluateRuleExpression(deepRule, { auth: memberAuth, data: null, resource: ownResource, request: null });
    assert.strictEqual(res, true);
  });

  it('De Morgan law negation expression with resource attributes', () => {
    const rule = `!(resource.status == 'archived' || resource.cost > 1000)`;
    assert.strictEqual(evaluateRuleExpression(rule, { auth: memberAuth, data: null, resource: ownResource, request: null }), true);
    assert.strictEqual(evaluateRuleExpression(rule, { auth: memberAuth, data: null, resource: otherResource, request: null }), false);
  });

  // ── 2. Sandbox Breakout & Prototype Pollution Attacks ────────────────────
  console.log('\n--- 2. Sandbox Breakout & Prototype Pollution Defenses ---');

  it('Rejects direct __proto__ access attempts', () => {
    const payloads = [
      `auth.__proto__.polluted = true`,
      `resource.__proto__.isAdmin = true`,
      `Object.__proto__ != null`,
      `({}).__proto__ != null`
    ];
    for (const p of payloads) {
      assert.strictEqual(evaluateRuleExpression(p, { auth: memberAuth, data: null, resource: ownResource, request: null }), false);
    }
  });

  it('Rejects constructor.constructor code generation injection', () => {
    const payloads = [
      `"".constructor.constructor("return process")()`,
      `resource.constructor.constructor("return global")()`,
      `(1).constructor.constructor("return true")()`,
      `[].constructor.constructor("return 1")()`
    ];
    for (const p of payloads) {
      assert.strictEqual(evaluateRuleExpression(p, { auth: memberAuth, data: null, resource: ownResource, request: null }), false);
    }
  });

  it('Blocks process, child_process, and require module escapes', () => {
    const payloads = [
      `process.exit(1)`,
      `process.mainModule.require('child_process').execSync('whoami')`,
      `require('fs').readFileSync('/etc/passwd')`,
      `import('fs')`
    ];
    for (const p of payloads) {
      assert.strictEqual(evaluateRuleExpression(p, { auth: memberAuth, data: null, resource: ownResource, request: null }), false);
    }
  });

  it('Blocks global and globalThis references', () => {
    const payloads = [
      `global != null`,
      `globalThis != null`,
      `globalThis.process.exit(0)`
    ];
    for (const p of payloads) {
      assert.strictEqual(evaluateRuleExpression(p, { auth: memberAuth, data: null, resource: ownResource, request: null }), false);
    }
  });

  it('Terminates and fails closed on infinite loop DoS attacks (vm timeout)', () => {
    const maliciousLoop = `while (true) {}`;
    const start = Date.now();
    const res = evaluateRuleExpression(maliciousLoop, { auth: memberAuth, data: null, resource: ownResource, request: null });
    const elapsed = Date.now() - start;
    assert.strictEqual(res, false, 'Loop must evaluate to false (fail closed)');
    assert(elapsed < 200, `Execution should timeout within 200ms (took ${elapsed}ms)`);
  });

  // ── 3. Type Coercion & Boundary Edge Cases ───────────────────────────────
  console.log('\n--- 3. Type Coercion, Nullability & Boundary Checks ---');

  it('Handles undefined vs null fields without crashing', () => {
    const rule = `resource.nonExistentField == null`;
    assert.strictEqual(evaluateRuleExpression(rule, { auth: memberAuth, data: null, resource: ownResource, request: null }), true);

    const ruleStrict = `resource.nonExistentField === null`;
    assert.strictEqual(evaluateRuleExpression(ruleStrict, { auth: memberAuth, data: null, resource: ownResource, request: null }), false);
  });

  it('Handles numeric boundary comparisons accurately', () => {
    const rule = `resource.cost > 0 && resource.cost < 100`;
    assert.strictEqual(evaluateRuleExpression(rule, { auth: memberAuth, data: null, resource: ownResource, request: null }), true);

    const ruleOverflow = `resource.cost > Number.MAX_SAFE_INTEGER`;
    assert.strictEqual(evaluateRuleExpression(ruleOverflow, { auth: memberAuth, data: null, resource: ownResource, request: null }), false);
  });

  it('Fails closed on NaN arithmetic results', () => {
    const rule = `(resource.cost / "not-a-number") > 0`;
    assert.strictEqual(evaluateRuleExpression(rule, { auth: memberAuth, data: null, resource: ownResource, request: null }), false);
  });

  it('Safely performs array inclusion checks', () => {
    const rule = `resource.tags.includes('confidential')`;
    assert.strictEqual(evaluateRuleExpression(rule, { auth: memberAuth, data: null, resource: ownResource, request: null }), true);

    const ruleBlocked = `resource.tags.includes('super-secret')`;
    assert.strictEqual(evaluateRuleExpression(ruleBlocked, { auth: memberAuth, data: null, resource: ownResource, request: null }), false);
  });

  // ── 4. Cross-Tenant & Cross-Organization Boundaries ───────────────────────
  console.log('\n--- 4. Cross-Tenant & Multi-Tenant Isolation Boundaries ---');

  it('Strict tenant boundary: Blocks access when tenant IDs mismatch', () => {
    const rule = `auth.projectId == resource._projectId`;
    assert.strictEqual(evaluateRuleExpression(rule, { auth: memberAuth, data: null, resource: ownResource, request: null }), true);
    assert.strictEqual(evaluateRuleExpression(rule, { auth: attackerAuth, data: null, resource: ownResource, request: null }), false);
  });

  it('Cross-organization defense: Blocks access when org IDs mismatch even if role is admin', () => {
    const foreignAdmin = { uid: 'usr_foreign_admin', role: 'admin', projectId: 'proj_other', orgId: 'org_other' };
    const rule = `auth.orgId == resource.orgId && (auth.role == 'admin' || auth.uid == resource.userId)`;
    assert.strictEqual(evaluateRuleExpression(rule, { auth: adminAuth, data: null, resource: ownResource, request: null }), true);
    assert.strictEqual(evaluateRuleExpression(rule, { auth: foreignAdmin, data: null, resource: ownResource, request: null }), false);
  });

  it('Write validation rule checking new data payload invariants', () => {
    const rule = `data.cost >= 0 && data.status in {'draft':1, 'pending':1, 'published':1}`;
    const validData = { cost: 25.00, status: 'draft' };
    const invalidData = { cost: -10.00, status: 'draft' };
    const invalidStatus = { cost: 25.00, status: 'hacked_status' };

    assert.strictEqual(evaluateRuleExpression(rule, { auth: memberAuth, data: validData, resource: ownResource, request: null }), true);
    assert.strictEqual(evaluateRuleExpression(rule, { auth: memberAuth, data: invalidData, resource: ownResource, request: null }), false);
    assert.strictEqual(evaluateRuleExpression(rule, { auth: memberAuth, data: invalidStatus, resource: ownResource, request: null }), false);
  });

  // ── 5. Property-Based Generative Fuzzing (100 Iterations) ────────────────
  console.log('\n--- 5. Property-Based Generative Fuzzing (100 Iterations) ---');

  it('Fuzz test: 100 randomly synthesized malformed expressions fail closed safely', () => {
    const tokens = [
      'auth', 'resource', 'data', 'null', 'undefined', 'true', 'false', '0', '1',
      '""', '"admin"', '==', '!=', '===', '!==', '>', '<', '&&', '||', '!', '+', '-',
      '(', ')', '[', ']', '{', '}', '.', '?', ':', ';', ',', 'function', 'return',
      '__proto__', 'constructor', 'Math.random()', 'Date.now()', 'NaN', 'Infinity'
    ];

    let safeEvaluations = 0;

    for (let i = 0; i < 100; i++) {
      // Generate random token sequence of length 3 to 12
      const length = Math.floor(Math.random() * 10) + 3;
      const exprTokens: string[] = [];
      for (let j = 0; j < length; j++) {
        exprTokens.push(tokens[Math.floor(Math.random() * tokens.length)]);
      }
      const candidateExpr = exprTokens.join(' ');

      // Must never throw unhandled exception, must return boolean
      const result = evaluateRuleExpression(candidateExpr, {
        auth: memberAuth,
        data: { cost: 10 },
        resource: ownResource,
        request: null
      });

      assert.strictEqual(typeof result, 'boolean', `Fuzz expression must return boolean: "${candidateExpr}"`);
      safeEvaluations++;
    }

    assert.strictEqual(safeEvaluations, 100, 'All 100 fuzz expressions handled safely');
  });

  // ── Results ──────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`📊 RLS Adversarial Results: ${passedTests} passed, ${totalTests - passedTests} failed`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
