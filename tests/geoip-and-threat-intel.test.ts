// ─────────────────────────────────────────────────────────────────────────────
//  tests/geoip-and-threat-intel.test.ts
//  AegisDB — Phase 3: Real-Time Geo-IP & Threat Intelligence Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { geoipThreatIntelService } from '../src/services/geoip-threat-intel.service';
import { networkAccessService } from '../src/services/network-access.service';
import { getDb } from '../src/db/sqlite.connection';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`, detail || '');
    failedTests++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Running Phase 3: Geo-IP & Threat Intelligence Test Suite');
  console.log('================================================================\n');

  const db = getDb();
  db.prepare('DELETE FROM network_access_rules').run();
  db.prepare('DELETE FROM jailed_ip_records').run();
  db.prepare('DELETE FROM tracked_client_devices').run();

  // Reset platform settings to defaults
  networkAccessService.updateNetworkSettings({
    ipFilteringEnabled: false,
    ipFilterDefaultPolicy: 'allow',
    adminEndpointIpLockEnabled: false,
    adminAllowedSubnet: '127.0.0.1',
    requireWriteIpWhitelist: false
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Private vs Public IP Classification
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Private LAN vs Public IP Classification ---');

  assert(geoipThreatIntelService.isPrivateIp('127.0.0.1') === true, '127.0.0.1 identified as private loopback');
  assert(geoipThreatIntelService.isPrivateIp('::1') === true, '::1 identified as private loopback');
  assert(geoipThreatIntelService.isPrivateIp('localhost') === true, 'localhost identified as private loopback');
  assert(geoipThreatIntelService.isPrivateIp('192.168.1.150') === true, '192.168.1.150 identified as private LAN');
  assert(geoipThreatIntelService.isPrivateIp('10.0.5.25') === true, '10.0.5.25 identified as private Class A subnet');
  assert(geoipThreatIntelService.isPrivateIp('172.16.0.1') === true, '172.16.0.1 identified as private Class B subnet');
  assert(geoipThreatIntelService.isPrivateIp('172.31.255.254') === true, '172.31.255.254 identified as private Class B subnet');
  assert(geoipThreatIntelService.isPrivateIp('172.32.0.1') === false, '172.32.0.1 correctly identified as public IP');
  assert(geoipThreatIntelService.isPrivateIp('8.8.8.8') === false, '8.8.8.8 identified as public WAN');
  assert(geoipThreatIntelService.isPrivateIp('1.1.1.1') === false, '1.1.1.1 identified as public WAN');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: ISO Country Flag Emoji Generator
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. ISO Country Code Flag Emoji Generator ---');

  assert(geoipThreatIntelService.getCountryFlagEmoji('IN') === '🇮🇳', 'Generates India flag (🇮🇳) from "IN"');
  assert(geoipThreatIntelService.getCountryFlagEmoji('US') === '🇺🇸', 'Generates US flag (🇺🇸) from "US"');
  assert(geoipThreatIntelService.getCountryFlagEmoji('GB') === '🇬🇧', 'Generates Great Britain flag (🇬🇧) from "GB"');
  assert(geoipThreatIntelService.getCountryFlagEmoji('DE') === '🇩🇪', 'Generates Germany flag (🇩🇪) from "DE"');
  assert(geoipThreatIntelService.getCountryFlagEmoji('JP') === '🇯🇵', 'Generates Japan flag (🇯🇵) from "JP"');
  assert(geoipThreatIntelService.getCountryFlagEmoji('CA') === '🇨🇦', 'Generates Canada flag (🇨🇦) from "CA"');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Private LAN Geo-IP Resolution & Zero-Latency Caching
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Local Subnet & Loopback Geo-IP Resolution ---');

  const loopbackGeo = await geoipThreatIntelService.lookupIp('127.0.0.1');
  assert(loopbackGeo.isPrivate === true, 'Loopback Geo data is marked as private');
  assert(loopbackGeo.countryCode === 'LAN', 'Loopback country code is LAN');
  assert(loopbackGeo.threatType === 'normal', 'Loopback threat type is normal');
  assert(loopbackGeo.threatScore === 0, 'Loopback threat score is 0');

  const lanGeo = await geoipThreatIntelService.lookupIp('192.168.31.45');
  assert(lanGeo.isPrivate === true, 'Wi-Fi LAN IP is marked as private');
  assert(lanGeo.countryCode === 'LAN', 'Wi-Fi LAN country code is LAN');
  assert(lanGeo.countryFlag === '🏠', 'Wi-Fi LAN flag is 🏠');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Geo-Fencing & Country-Level Access Rules
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Geo-Fencing & Country-Level Access Rules ---');

  // 4a. Country Blacklist / Deny Rule
  const denyCountryRules = [
    { ruleType: 'geo_country', ipPattern: 'RU', action: 'deny', label: 'Block Country RU' }
  ];

  const ruResult = geoipThreatIntelService.evaluateGeoCountryRules('RU', denyCountryRules);
  assert(ruResult.allowed === false, 'Country RU is blocked by deny rule');
  assert(ruResult.code === 'GEO_COUNTRY_BLOCKED', 'Error code is GEO_COUNTRY_BLOCKED');

  const inResult = geoipThreatIntelService.evaluateGeoCountryRules('IN', denyCountryRules);
  assert(inResult.allowed === true, 'Country IN is allowed when RU is denied');

  // 4b. Country Whitelist Rule (Allow only IN and US)
  const allowCountryRules = [
    { ruleType: 'geo_country', ipPattern: 'IN', action: 'allow', label: 'Allow India' },
    { ruleType: 'geo_country', ipPattern: 'US', action: 'allow', label: 'Allow United States' }
  ];

  const inAllowed = geoipThreatIntelService.evaluateGeoCountryRules('IN', allowCountryRules);
  assert(inAllowed.allowed === true, 'Country IN is permitted by country whitelist');

  const usAllowed = geoipThreatIntelService.evaluateGeoCountryRules('US', allowCountryRules);
  assert(usAllowed.allowed === true, 'Country US is permitted by country whitelist');

  const frDenied = geoipThreatIntelService.evaluateGeoCountryRules('FR', allowCountryRules);
  assert(frDenied.allowed === false, 'Country FR is denied when not on country whitelist');
  assert(frDenied.code === 'GEO_COUNTRY_RESTRICTED', 'Error code is GEO_COUNTRY_RESTRICTED');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 5: Device Tracker Geo & Threat Metadata Enrichment
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Device Tracker Geo & Threat Enrichment ---');

  // Record a simulated local device
  networkAccessService.recordDeviceActivity({
    ipAddress: '192.168.31.88',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    userEmail: 'alice@example.com'
  });

  const devices = networkAccessService.getTrackedDevices();
  const trackedAlice = devices.find(d => d.ipAddress === '192.168.31.88');
  assert(!!trackedAlice, 'Tracked device is present in device table');
  assert(trackedAlice?.countryCode === 'LAN', 'Tracked device has countryCode = LAN');
  assert(trackedAlice?.threatType === 'normal', 'Tracked device has threatType = normal');
  assert(trackedAlice?.threatScore === 0, 'Tracked device has threatScore = 0');
  assert(trackedAlice?.countryFlag === '🏠', 'Tracked device has countryFlag = 🏠');

  // Auto-detection of ruleType in addRule for 2-letter country code
  const autoCountryRule = networkAccessService.addRule({
    ipPattern: 'DE',
    label: 'Germany Operations Only',
    action: 'allow'
  });
  assert(autoCountryRule.ruleType === 'geo_country', 'addRule auto-detected 2-letter pattern "DE" as "geo_country"');
  networkAccessService.deleteRule(autoCountryRule.id);

  console.log('\n================================================================');
  console.log(`📊 Phase 3 Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
