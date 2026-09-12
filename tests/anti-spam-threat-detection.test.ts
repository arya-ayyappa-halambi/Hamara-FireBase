// ─────────────────────────────────────────────────────────────────────────────
//  tests/anti-spam-threat-detection.test.ts
//  FlareBase — Anti-Abuse, Multi-Account Prevention & Automated Threat Detection
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
process.env.JWT_SECRET = process.env.JWT_SECRET || "a-very-long-secret-key-at-least-32-characters-for-testing-purpose!";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a-very-long-encryption-key-32-bytes-long!";
process.env.RECOVERY_PIN = process.env.RECOVERY_PIN || "948201";

import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { antiAbuseService, DISPOSABLE_EMAIL_DOMAINS } from '../src/services/anti-abuse.service';
import { threatDetectionService } from '../src/services/threat-detection.service';
import { antiSpamRegistrationMiddleware } from '../src/middleware/anti-spam.middleware';
import { registerUser } from '../src/auth/auth.service';
import { projectAuthService } from '../src/project-auth/project-auth.service';
import { projectService } from '../src/project/project.service';
import { userStore } from '../src/store/user.store';

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

async function runAntiSpamThreatDetectionTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🛡️  Running FlareBase Anti-Spam & Threat Detection Test Suite');
  console.log('================================================================\n');

  initSqlite();
  const db = getDb();

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 1: Canonical Email Parsing & Sub-address Normalization
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Canonical Email Normalization & Alias Stripping ---');
  
  const gmailResult = antiAbuseService.canonicalizeEmail('J.o.h.n.D.o.e+spam123@gmail.com');
  assert(gmailResult.canonicalEmail === 'johndoe@gmail.com', 'Gmail dots and +tag alias stripped correctly');
  assert(gmailResult.isSubAddressed === true, 'Sub-addressing detected on Gmail');

  const googlemailResult = antiAbuseService.canonicalizeEmail('jane.smith+work@googlemail.com');
  assert(googlemailResult.canonicalEmail === 'janesmith@gmail.com', 'googlemail.com normalized to gmail.com');

  const protonResult = antiAbuseService.canonicalizeEmail('alice+burner@proton.me');
  assert(protonResult.canonicalEmail === 'alice@proton.me', 'ProtonMail +tag stripped');

  const outlookResult = antiAbuseService.canonicalizeEmail('bob+newsletter@outlook.com');
  assert(outlookResult.canonicalEmail === 'bob@outlook.com', 'Outlook +tag stripped');

  const icloudResult = antiAbuseService.canonicalizeEmail('carol+test@icloud.com');
  assert(icloudResult.canonicalEmail === 'carol@icloud.com', 'iCloud +tag stripped');

  const regularResult = antiAbuseService.canonicalizeEmail('developer@company.org');
  assert(regularResult.canonicalEmail === 'developer@company.org', 'Regular business email unaltered');
  assert(regularResult.isSubAddressed === false, 'Regular email is not sub-addressed');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 2: Disposable / Burner Email Blacklist & Domain Heuristics
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Disposable / Burner Email Detection ---');

  assert(antiAbuseService.isDisposableEmail('attacker@mailinator.com') === true, 'mailinator.com flagged as disposable');
  assert(antiAbuseService.isDisposableEmail('bot@10minutemail.com') === true, '10minutemail.com flagged as disposable');
  assert(antiAbuseService.isDisposableEmail('spammer@temp-mail.org') === true, 'temp-mail.org flagged as disposable');
  assert(antiAbuseService.isDisposableEmail('scam@guerrillamail.biz') === true, 'guerrillamail.biz flagged as disposable');
  assert(antiAbuseService.isDisposableEmail('burner@sharklasers.com') === true, 'sharklasers.com flagged as disposable');
  assert(antiAbuseService.isDisposableEmail('dispos@fakeinbox.com') === true, 'fakeinbox.com flagged as disposable');
  assert(antiAbuseService.isDisposableEmail('user@temporarymail.xyz') === true, 'temporarymail.xyz dynamic pattern flagged');
  assert(antiAbuseService.isDisposableEmail('legit@gmail.com') === false, 'gmail.com recognized as legitimate');
  assert(antiAbuseService.isDisposableEmail('user@proton.me') === false, 'proton.me recognized as legitimate');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 3: Honeypot Trap Inspection
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Zero-Friction Honeypot Trap Inspection ---');

  const cleanBody = { email: 'human@flarebase.dev', password: 'Password123!', name: 'Human' };
  assert(antiAbuseService.inspectHoneypot(cleanBody).isBot === false, 'Clean payload does not trigger honeypot');

  const trappedBody1 = { ...cleanBody, _hp_trap: 'https://spamlink.com' };
  assert(antiAbuseService.inspectHoneypot(trappedBody1).isBot === true, '_hp_trap triggers honeypot flag');
  assert(antiAbuseService.inspectHoneypot(trappedBody1).trapField === '_hp_trap', 'Correct trap field identified');

  const trappedBody2 = { ...cleanBody, _hp_website: 'http://botnet.ru' };
  assert(antiAbuseService.inspectHoneypot(trappedBody2).isBot === true, '_hp_website triggers honeypot flag');

  const trappedBody3 = { ...cleanBody, website_url_hp: 'spam' };
  assert(antiAbuseService.inspectHoneypot(trappedBody3).isBot === true, 'website_url_hp triggers honeypot flag');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 4: Form Timing Heuristics (<800ms)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Form Timing Heuristics ---');

  const now = Date.now();
  const humanTiming = { formRenderTime: now - 3500 }; // 3.5s elapsed
  assert(antiAbuseService.inspectSubmissionTiming(humanTiming).isInstantSubmission === false, '3.5s human submission accepted');

  const botTiming = { formRenderTime: now - 200 }; // 200ms elapsed
  assert(antiAbuseService.inspectSubmissionTiming(botTiming).isInstantSubmission === true, '200ms submission flagged as instant robotic script');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 5: Bot / Headless Scraper User-Agent Detection
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Bot & Headless User-Agent Detection ---');

  const chromeUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  assert(antiAbuseService.isBotUserAgent(chromeUa).isBot === false, 'Standard Chrome browser accepted');

  assert(antiAbuseService.isBotUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/119.0.0.0 Safari/537.36').isBot === true, 'HeadlessChrome flagged');
  assert(antiAbuseService.isBotUserAgent('python-requests/2.31.0').isBot === true, 'python-requests flagged');
  assert(antiAbuseService.isBotUserAgent('curl/8.1.2').isBot === true, 'curl flagged');
  assert(antiAbuseService.isBotUserAgent('PuppeteerExtra/1.0.0').isBot === true, 'Puppeteer flagged');
  assert(antiAbuseService.isBotUserAgent('sqlmap/1.7.2#stable').isBot === true, 'sqlmap flagged');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 6: Subnet Registration Velocity & Clustering (/24 & /48)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Subnet Clustering & Velocity Throttling ---');

  assert(antiAbuseService.getSubnet('192.168.1.55') === '192.168.1.0/24', 'IPv4 subnet calculated as /24');
  assert(antiAbuseService.getSubnet('2001:0db8:85a3:0000:0000:8a2e:0370:7334') === '2001:0db8:85a3::/48', 'IPv6 subnet calculated as /48');

  const testSubnetIp = '10.55.99.12';
  // Simulate 4 registrations in test subnet with limit = 5
  for (let i = 0; i < 4; i++) {
    antiAbuseService.recordSubnetRegistration(`10.55.99.${i + 1}`);
  }
  const velCheck1 = antiAbuseService.checkSubnetRegistrationVelocity(testSubnetIp, 5, 60000);
  assert(velCheck1.allowed === true, '4 registrations allowed under limit 5');

  // Add 5th and 6th
  antiAbuseService.recordSubnetRegistration('10.55.99.5');
  const velCheck2 = antiAbuseService.checkSubnetRegistrationVelocity(testSubnetIp, 5, 60000);
  assert(velCheck2.allowed === false, 'Subnet registration velocity throttles 6th attempt');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 7: Anti-Spam Registration Express Middleware
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Anti-Spam Registration Express Middleware ---');

  let middlewareError: any = null;
  const mockReqHoneypot: any = {
    body: { email: 'test@example.com', _hp_trap: 'spam_value' },
    headers: { 'user-agent': chromeUa },
    ip: '127.0.0.1'
  };
  const mockRes: any = {};
  const mockNext: any = (err?: any) => { middlewareError = err; };

  antiSpamRegistrationMiddleware(mockReqHoneypot, mockRes, mockNext);
  assert(middlewareError?.statusCode === 403, 'Middleware rejects honeypot submission with 403');
  assert(middlewareError?.details?.code === 'BOT_HONEYPOT_TRIGGERED', 'Correct honeypot error code');

  middlewareError = null;
  const mockReqDisposable: any = {
    body: { email: 'baduser@mailinator.com' },
    headers: { 'user-agent': chromeUa },
    ip: '127.0.0.1'
  };
  antiSpamRegistrationMiddleware(mockReqDisposable, mockRes, mockNext);
  assert(middlewareError?.statusCode === 400, 'Middleware rejects disposable email with 400');
  assert(middlewareError?.details?.code === 'DISPOSABLE_EMAIL_NOT_ALLOWED', 'Correct disposable email error code');

  middlewareError = null;
  const mockReqHeadless: any = {
    body: { email: 'valid@gmail.com' },
    headers: { 'user-agent': 'HeadlessChrome/119.0.0.0' },
    ip: '127.0.0.1'
  };
  antiSpamRegistrationMiddleware(mockReqHeadless, mockRes, mockNext);
  assert(middlewareError?.statusCode === 403, 'Middleware rejects HeadlessChrome with 403');
  assert(middlewareError?.details?.code === 'BOT_CLIENT_REJECTED', 'Correct headless client error code');

  middlewareError = null;
  const mockReqClean: any = {
    body: { email: `clean_${Date.now()}@gmail.com` },
    headers: { 'user-agent': chromeUa },
    ip: '172.16.0.42'
  };
  antiSpamRegistrationMiddleware(mockReqClean, mockRes, mockNext);
  assert(!middlewareError, 'Middleware allows valid human registration through');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 8: Automated Threat Evaluation & Account Flagging (Risk Score >= 70)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. Threat Intelligence Evaluation & Auto-Flagging ---');

  const testUserId = `user_threat_${Date.now()}`;
  const testUserEmail = `threat_${Date.now()}@tempmail.com`;

  // Create test user in DB
  db.prepare(`
    INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
    VALUES (?, ?, ?, 'Threat User', 'hash', 0, datetime('now'), datetime('now'))
  `).run(testUserId, testUserEmail, `hash_${testUserId}`);

  const evalResult = await threatDetectionService.evaluateThreat({
    userId: testUserId,
    userEmail: testUserEmail,
    ipAddress: '10.99.1.5',
    userAgent: 'python-requests/2.31.0',
    eventType: 'registration',
    body: { _hp_trap: 'bot_link' }
  });

  assert(evalResult.riskScore >= 70, `High composite risk score generated (${evalResult.riskScore}/100)`);
  assert(evalResult.isFlagged === true, 'High-risk account flagged automatically');

  const flaggedRecord = db.prepare("SELECT * FROM account_security_flags WHERE userId = ?").get(testUserId) as any;
  assert(!!flaggedRecord, 'Security flag record saved in database');
  assert(flaggedRecord.severity === 'high' || flaggedRecord.severity === 'critical', 'Severity marked as high/critical');
  assert(flaggedRecord.status === 'active', 'Flag status is active');

  // ───────────────────────────────────────────────────────────────────────────
  //  TEST 9: Clean End-to-End Registration for Developer and Project User
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 9. End-to-End Clean Platform Developer & Project User Registration ---');

  const cleanDevEmail = `legit_dev_${Date.now()}@company.com`;
  const regResult = await registerUser({
    email: cleanDevEmail,
    password: 'SuperSecurePassword123!',
    name: 'Legit Developer',
    clientIp: '198.51.100.15',
    userAgent: chromeUa
  });

  assert(!!regResult.token, 'Platform developer registered successfully');
  assert(regResult.user.email === cleanDevEmail, 'Developer raw email preserved');

  const { project } = projectService.createProject(regResult.user.id, 'Spam Defense Project');
  assert(!!project.id, 'Project created for developer');

  const cleanProjUserEmail = `enduser_${Date.now()}@gmail.com`;
  const projUserResult = await projectAuthService.registerUser(
    project.id,
    cleanProjUserEmail,
    'EndUserPass123!',
    'email',
    '198.51.100.16'
  );

  assert(!!projUserResult.token, 'Project end-user registered successfully with subnet tracking');
  assert(projUserResult.user.email === cleanProjUserEmail, 'Project user email preserved');

  // ───────────────────────────────────────────────────────────────────────────
  //  SUMMARY
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`🏁 Anti-Spam & Threat Detection Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAntiSpamThreatDetectionTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
