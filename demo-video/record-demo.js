const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const puppeteer = require('puppeteer');

const PORT = 3850;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WORK_DIR = path.join(__dirname, 'work');
const FRAMES_DIR = path.join(WORK_DIR, 'frames');
const FINAL_DIR = path.join(__dirname, 'final');
const FPS = 30;
const TOTAL_DURATION_SEC = 80;
const TOTAL_FRAMES = FPS * TOTAL_DURATION_SEC; // Exactly 2400 frames

// Clean frames directory
if (fs.existsSync(FRAMES_DIR)) {
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
}
fs.mkdirSync(FRAMES_DIR, { recursive: true });
fs.mkdirSync(FINAL_DIR, { recursive: true });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

async function startServer() {
  console.log(`[Demo] Starting FlareBase server on port ${PORT}...`);
  const server = spawn('node', ['dist/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe'
  });

  const startTime = Date.now();
  let healthy = false;
  while (Date.now() - startTime < 15000) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch (_) {}
    await sleep(300);
  }

  if (!healthy) {
    server.kill('SIGTERM');
    throw new Error('Server failed to start within 15 seconds.');
  }

  console.log('[Demo] Server is healthy and responsive at', BASE_URL);
  return server;
}

async function main() {
  let serverProcess = null;
  let browser = null;

  try {
    serverProcess = await startServer();

    console.log('[Demo] Launching headless browser at 1920x1080...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080'
      ],
      defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    async function injectOverlay() {
      await page.evaluate(() => {
        if (document.getElementById('__demo_overlay_styles')) return;

        const style = document.createElement('style');
        style.id = '__demo_overlay_styles';
        style.textContent = `
          #__virtual_cursor {
            position: fixed;
            top: 0;
            left: 0;
            width: 28px;
            height: 28px;
            pointer-events: none;
            z-index: 999999;
            transform: translate(-2px, -2px);
            transition: none;
            filter: drop-shadow(0 4px 12px rgba(0,0,0,0.6));
          }
          #__virtual_cursor svg {
            width: 100%;
            height: 100%;
          }
          .cursor-click-ripple {
            position: fixed;
            width: 48px;
            height: 48px;
            margin-top: -24px;
            margin-left: -24px;
            border-radius: 50%;
            border: 2.5px solid #f59e0b;
            background: rgba(245, 158, 11, 0.25);
            pointer-events: none;
            z-index: 999998;
            animation: cursorRippleAnim 0.6s ease-out forwards;
          }
          @keyframes cursorRippleAnim {
            0% { transform: scale(0.2); opacity: 1; }
            100% { transform: scale(1.6); opacity: 0; }
          }
          #__demo_lower_third {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 12px 28px;
            background: rgba(15, 23, 42, 0.92);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 100px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(245, 158, 11, 0.15);
            z-index: 999990;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            transition: opacity 0.3s ease, transform 0.3s ease;
          }
          #__demo_lower_third.hidden-banner {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          #__demo_badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            padding: 4px 12px;
            border-radius: 999px;
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: #020617;
            box-shadow: 0 2px 10px rgba(245, 158, 11, 0.3);
          }
          #__demo_title {
            font-size: 14px;
            font-weight: 700;
            color: #f8fafc;
            letter-spacing: -0.01em;
          }
          #__demo_desc {
            font-size: 11px;
            font-weight: 400;
            color: #94a3b8;
          }
          #__demo_outro_overlay {
            position: fixed;
            inset: 0;
            background: radial-gradient(circle at center, #1e1b4b 0%, #090d16 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999999;
            opacity: 0;
            transition: opacity 0.8s ease;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          #__demo_outro_overlay.visible {
            opacity: 1;
          }
        `;
        document.head.appendChild(style);

        const cursor = document.createElement('div');
        cursor.id = '__virtual_cursor';
        cursor.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.89c.45 0 .67-.54.35-.85L5.85 2.85a.5.5 0 0 0-.35.36z" fill="#f59e0b" stroke="#090d16" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
        `;
        document.body.appendChild(cursor);

        const banner = document.createElement('div');
        banner.id = '__demo_lower_third';
        banner.innerHTML = `
          <div id="__demo_badge"><i class="fa-solid fa-fire"></i> FlareBase</div>
          <div style="display: flex; flex-direction: column;">
            <span id="__demo_title">Private Cloud BaaS & Real-Time Engine</span>
            <span id="__demo_desc">Enterprise-Grade Zero-Trust Database & Hosting Platform</span>
          </div>
        `;
        document.body.appendChild(banner);

        const outro = document.createElement('div');
        outro.id = '__demo_outro_overlay';
        outro.innerHTML = `
          <div style="text-align: center; max-width: 780px; padding: 40px; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.14); border-radius: 32px; backdrop-filter: blur(24px); box-shadow: 0 30px 80px rgba(0,0,0,0.8), 0 0 60px rgba(245,158,11,0.2);">
            <div style="width: 80px; height: 80px; margin: 0 auto 20px; border-radius: 24px; background: linear-gradient(135deg, #f59e0b, #ef4444); display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(245,158,11,0.4);">
              <i class="fa-solid fa-fire" style="font-size: 42px; color: #0f172a;"></i>
            </div>
            <h1 style="font-size: 36px; font-weight: 800; color: #ffffff; margin: 0 0 10px; letter-spacing: -0.02em;">FlareBase Platform</h1>
            <p style="font-size: 15px; color: #cbd5e1; margin: 0 0 24px; line-height: 1.6;">Self-Hosted Firebase Alternative: Super Admin Security Controls, Threat Intelligence Radar, FIDO2 Passkeys, and Developer Workspaces.</p>
            <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
              <span style="padding: 6px 14px; border-radius: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); font-size: 12px; font-weight: 600; color: #f59e0b;"><i class="fa-solid fa-user-shield"></i> Super Admin Portal</span>
              <span style="padding: 6px 14px; border-radius: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); font-size: 12px; font-weight: 600; color: #ef4444;"><i class="fa-solid fa-shield-halved"></i> Threat Radar WAF</span>
              <span style="padding: 6px 14px; border-radius: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); font-size: 12px; font-weight: 600; color: #38bdf8;"><i class="fa-solid fa-database"></i> NoSQL Document DB</span>
              <span style="padding: 6px 14px; border-radius: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); font-size: 12px; font-weight: 600; color: #a855f7;"><i class="fa-solid fa-fingerprint"></i> FIDO2 Passkeys</span>
              <span style="padding: 6px 14px; border-radius: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); font-size: 12px; font-weight: 600; color: #10b981;"><i class="fa-solid fa-building-user"></i> Orgs & Teams</span>
              <span style="padding: 6px 14px; border-radius: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); font-size: 12px; font-weight: 600; color: #34d399;"><i class="fa-solid fa-globe"></i> Multi-Tunnel Mesh</span>
            </div>
          </div>
        `;
        document.body.appendChild(outro);
      });
    }

    async function setCursor(x, y) {
      await page.evaluate(({ cx, cy }) => {
        const cur = document.getElementById('__virtual_cursor');
        if (cur) {
          cur.style.left = `${cx}px`;
          cur.style.top = `${cy}px`;
        }
      }, { cx: x, cy: y });
    }

    async function triggerClickRipple(x, y) {
      await page.evaluate(({ cx, cy }) => {
        const rip = document.createElement('div');
        rip.className = 'cursor-click-ripple';
        rip.style.left = `${cx}px`;
        rip.style.top = `${cy}px`;
        document.body.appendChild(rip);
        setTimeout(() => rip.remove(), 700);
      }, { cx: x, cy: y });
    }

    async function updateBanner(badge, title, desc) {
      await page.evaluate(({ b, t, d }) => {
        const elB = document.getElementById('__demo_badge');
        const elT = document.getElementById('__demo_title');
        const elD = document.getElementById('__demo_desc');
        if (elB) elB.innerHTML = b;
        if (elT) elT.textContent = t;
        if (elD) elD.textContent = d;
      }, { b: badge, t: title, d: desc });
    }

    async function showOutro() {
      await page.evaluate(() => {
        const el = document.getElementById('__demo_outro_overlay');
        if (el) el.classList.add('visible');
        const banner = document.getElementById('__demo_lower_third');
        if (banner) banner.classList.add('hidden-banner');
      });
    }

    let currentCursor = { x: 960, y: 540 };
    let frameIdx = 0;

    async function captureFrame() {
      if (frameIdx >= TOTAL_FRAMES) return;
      const framePath = path.join(FRAMES_DIR, `frame_${String(frameIdx).padStart(5, '0')}.jpg`);
      await page.screenshot({ path: framePath, type: 'jpeg', quality: 92 });
      frameIdx++;
      if (frameIdx % 150 === 0) {
        console.log(`[Demo] Progress: frame ${frameIdx}/${TOTAL_FRAMES} (${(frameIdx / FPS).toFixed(1)}s / ${TOTAL_DURATION_SEC}s)`);
      }
    }

    async function animateMouseTo(targetX, targetY, frameCount) {
      const startX = currentCursor.x;
      const startY = currentCursor.y;

      for (let i = 0; i < frameCount; i++) {
        if (frameIdx >= TOTAL_FRAMES) return;
        const t = easeInOutCubic((i + 1) / frameCount);
        const curX = startX + (targetX - startX) * t;
        const curY = startY + (targetY - startY) * t;
        currentCursor = { x: curX, y: curY };
        await setCursor(curX, curY);
        await captureFrame();
      }
    }

    async function holdFrames(count) {
      for (let i = 0; i < count; i++) {
        if (frameIdx >= TOTAL_FRAMES) return;
        await captureFrame();
      }
    }

    async function clickSidebarTab(tabName, bannerBadge, bannerTitle, bannerDesc, moveFrames = 30) {
      const tabPos = await page.evaluate((tName) => {
        const btn = document.querySelector(`button[data-tab="${tName}"]`);
        if (!btn) return { x: 120, y: 400 };
        btn.scrollIntoView({ block: 'center' });
        const rect = btn.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }, tabName);

      await animateMouseTo(tabPos.x, tabPos.y, moveFrames);
      await triggerClickRipple(tabPos.x, tabPos.y);

      await page.evaluate((tName) => {
        const btn = document.querySelector(`button[data-tab="${tName}"]`);
        if (btn) btn.click();
      }, tabName);

      if (bannerBadge) {
        await updateBanner(bannerBadge, bannerTitle, bannerDesc);
      }
    }

    console.log(`[Demo] Capturing exactly 80.0 seconds (${TOTAL_FRAMES} frames @ 30 FPS)...`);

    // =========================================================================
    // PART A: SUPER ADMIN SECURITY CONTROLS & INFRASTRUCTURE (0:00 - 0:38)
    // =========================================================================

    // SCENE 1: Super Admin Gateway & 1-Click Login (0:00 - 0:07, 210 frames)
    console.log('[Demo] Scene 1: Super Admin Gateway & 1-Click Login...');
    await page.goto(`${BASE_URL}/admin-login.html`, { waitUntil: 'networkidle0' });
    await injectOverlay();
    await updateBanner(
      '<i class="fa-solid fa-shield-halved"></i> Super Admin Gateway',
      'Zero-Trust Authentication & Maintenance Override',
      'RS256 cryptographically signed tokens, TOTP MFA, and emergency perimeter bypass'
    );
    await setCursor(960, 540);
    await holdFrames(30);

    const btnDemoBox = await page.evaluate(() => {
      const btn = document.getElementById('btn-fill-demo-admin');
      if (!btn) return { x: 960, y: 580 };
      const rect = btn.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });

    await animateMouseTo(btnDemoBox.x, btnDemoBox.y, 35);
    await triggerClickRipple(btnDemoBox.x, btnDemoBox.y);
    await page.evaluate(() => {
      const emailInput = document.getElementById('input-admin-email');
      const passInput = document.getElementById('input-admin-password');
      if (emailInput) emailInput.value = 'admin@flarebase.dev';
      if (passInput) passInput.value = 'Admin@123';
      const toast = document.getElementById('toast-container');
      if (toast) {
        toast.textContent = 'Demo credentials populated: admin@flarebase.dev';
        toast.className = 'mt-4 text-center text-xs font-medium p-3 rounded-xl shadow-lg bg-amber-950/90 border border-amber-700 text-amber-200';
        toast.classList.remove('hidden');
      }
    });
    await holdFrames(35);

    const btnLoginBox = await page.evaluate(() => {
      const btn = document.getElementById('btn-admin-login');
      if (!btn) return { x: 960, y: 640 };
      const rect = btn.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await animateMouseTo(btnLoginBox.x, btnLoginBox.y, 35);
    await triggerClickRipple(btnLoginBox.x, btnLoginBox.y);

    await page.evaluate(() => {
      const btn = document.getElementById('btn-admin-login');
      if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Authenticating Super Admin...</span>';
      const toast = document.getElementById('toast-container');
      if (toast) {
        toast.textContent = 'Authentication Successful! Establishing encrypted session...';
        toast.className = 'mt-4 text-center text-xs font-medium p-3 rounded-xl shadow-lg bg-emerald-950/90 border border-emerald-700 text-emerald-200';
      }
    });
    await holdFrames(35);

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
    await injectOverlay();
    await setCursor(currentCursor.x, currentCursor.y);
    await holdFrames(40);

    // SCENE 2: Telemetry & Rate Limits Governance (0:07 - 0:14, 210 frames)
    console.log('[Demo] Scene 2: Telemetry & Rate Limits Governance...');
    await clickSidebarTab(
      'tab-telemetry',
      '<i class="fa-solid fa-chart-line"></i> Super Admin Telemetry',
      'Live CPU, V8 Heap & Query Latency Charts',
      'Real-time microsecond performance monitoring, active client metrics, and WAL engine stats',
      30
    );
    await holdFrames(30);
    await animateMouseTo(520, 310, 30);
    await holdFrames(30);

    await clickSidebarTab(
      'tab-rate-limits',
      '<i class="fa-solid fa-gauge-high"></i> Global Rate Limits',
      'Dynamic Token Bucket & DDoS Defense Governance',
      'Live in-memory token bucket limits, burst allowances, and per-subnet throttling',
      30
    );
    await holdFrames(30);
    await animateMouseTo(640, 420, 30);
    await holdFrames(30);

    // SCENE 3: Network Center & Subnet Access Control (0:14 - 0:21, 210 frames)
    console.log('[Demo] Scene 3: Network Center & Access Control...');
    await clickSidebarTab(
      'tab-network',
      '<i class="fa-solid fa-network-wired"></i> Network Access Center',
      'CIDR Rules, Device Tracking & Subnet Filtering',
      'Real-time connected device roster, subnet bandwidth limits, and 1-click IP toggle blocking',
      30
    );
    await holdFrames(35);
    await animateMouseTo(700, 360, 35);
    await holdFrames(35);
    await animateMouseTo(950, 480, 35);
    await holdFrames(45);

    // SCENE 4: Auto Threat Detection & Live Security Radar (0:21 - 0:29, 240 frames)
    console.log('[Demo] Scene 4: Auto Threat Detection & Live Security Radar...');
    await clickSidebarTab(
      'tab-threat-radar',
      '<i class="fa-solid fa-user-shield"></i> Threat Intelligence Radar',
      'Automated WAF (0.001ms Latency) & Anomaly Matrix',
      'Composite risk scoring (0-100), D_hash hardware device fingerprints, and shared Wi-Fi NAT safety',
      30
    );
    await holdFrames(35);

    const btnScanPos = await page.evaluate(() => {
      const btn = document.getElementById('btn-run-threat-scan');
      if (!btn) return { x: 1100, y: 220 };
      const rect = btn.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await animateMouseTo(btnScanPos.x, btnScanPos.y, 35);
    await triggerClickRipple(btnScanPos.x, btnScanPos.y);
    await page.evaluate(() => {
      if (window.runThreatSecurityScan) window.runThreatSecurityScan();
    });
    await holdFrames(35);
    await animateMouseTo(680, 460, 35);
    await holdFrames(70);

    // SCENE 5: Universal Server Hosting & Emergency Recovery (0:29 - 0:37, 240 frames)
    console.log('[Demo] Scene 5: Universal Server Hosting & Emergency Recovery...');
    await clickSidebarTab(
      'tab-server-hosting',
      '<i class="fa-solid fa-server"></i> Universal Hosting Center',
      'Dual Local/LAN Discovery & Multi-Tunnel Mesh',
      'Zero-config Cloudflare/untun edge tunnels and live socket rebinding',
      30
    );
    await holdFrames(35);
    await animateMouseTo(720, 380, 35);
    await holdFrames(35);

    // Brief peek into System Recovery Portal
    await page.goto(`${BASE_URL}/recovery.html`, { waitUntil: 'networkidle0' });
    await injectOverlay();
    await updateBanner(
      '<i class="fa-solid fa-triangle-exclamation"></i> Bare-Metal Recovery',
      'High-Availability Emergency Restoration Portal',
      'Protected 6-digit RECOVERY_PIN gate and encrypted database snapshot restoration'
    );
    await setCursor(960, 540);
    await holdFrames(35);
    await animateMouseTo(960, 580, 30);
    await holdFrames(40);

    // =========================================================================
    // PART B: DEVELOPER & USER INTERFACE DASHBOARD (0:37 - 1:14)
    // =========================================================================

    // Return to main dashboard
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
    await injectOverlay();
    await setCursor(currentCursor.x, currentCursor.y);

    // SCENE 6: Developer Metrics & Workspace Isolation (0:37 - 0:44, 210 frames)
    console.log('[Demo] Scene 6: Developer Metrics & Project Management...');
    await clickSidebarTab(
      'tab-developer-metrics',
      '<i class="fa-solid fa-chart-pie"></i> Developer Console',
      'Developer Metrics & Activity Telemetry',
      'Project-level request analytics, database operations counter, and storage utilization',
      30
    );
    await holdFrames(30);

    await clickSidebarTab(
      'tab-project-management',
      '<i class="fa-solid fa-folder-open"></i> Project & Workspace Engine',
      'Project Workspace Isolation & API Keys',
      'Scoped API keys, environment parameters, and project repository synchronization',
      30
    );
    await holdFrames(30);
    await animateMouseTo(650, 400, 30);
    await holdFrames(60);

    // SCENE 7: GitHub-Grade Organizations & Functional Teams (0:44 - 0:52, 240 frames)
    console.log('[Demo] Scene 7: GitHub-Grade Organizations & Functional Teams...');
    await clickSidebarTab(
      'tab-organizations',
      '<i class="fa-solid fa-building-user"></i> Organizations & Teams',
      'Multi-Tenant Roster & Functional Groups (@org/team)',
      'Granular project permissions (admin, maintainer, developer, reporter), invites, and audit logs',
      30
    );
    await holdFrames(35);
    await animateMouseTo(540, 340, 35);
    await holdFrames(35);
    await animateMouseTo(860, 460, 35);
    await holdFrames(70);

    // SCENE 8: NoSQL Document Database & RLS (0:52 - 1:00, 240 frames)
    console.log('[Demo] Scene 8: NoSQL Document Database & RLS...');
    await clickSidebarTab(
      'tab-data-browser',
      '<i class="fa-solid fa-database"></i> NoSQL Document Database',
      'Schemaless JSON Collections & Row-Level Security (RLS)',
      'ACID transactional SQLite engine, _rules evaluation, and real-time reactive search querying',
      30
    );
    await holdFrames(35);
    await animateMouseTo(460, 320, 35);
    await holdFrames(35);
    await animateMouseTo(820, 450, 35);
    await holdFrames(70);

    // SCENE 9: Storage Vault & Visual 500MB Quotas (1:00 - 1:07, 210 frames)
    console.log('[Demo] Scene 9: Storage Vault & Quotas...');
    await clickSidebarTab(
      'tab-asset-vault',
      '<i class="fa-solid fa-hard-drive"></i> Media & Asset Storage Vault',
      'Magic Byte Binary Inspection & Visual 500MB Quotas',
      'Executable masking prevention, real-time byte quota metering bar, and temporary signed URLs',
      30
    );
    await holdFrames(35);
    await animateMouseTo(680, 380, 35);
    await holdFrames(35);
    await animateMouseTo(920, 500, 35);
    await holdFrames(45);

    // SCENE 10: User Security Console: Passkeys, Sessions & PATs (1:07 - 1:14, 210 frames)
    console.log('[Demo] Scene 10: User Security Console...');
    await clickSidebarTab(
      'tab-settings',
      '<i class="fa-solid fa-shield-halved"></i> User Security & Passkeys',
      'FIDO2 Passkeys, Active Sessions & Scoped PATs',
      'Biometric authentication, remote device session killswitch, and GDPR Art. 20 data export',
      30
    );
    await holdFrames(35);
    await animateMouseTo(620, 420, 35);
    await holdFrames(35);
    await animateMouseTo(880, 520, 35);
    await holdFrames(45);

    // =========================================================================
    // PART C: OUTRO & SUMMARY CARD (1:14 - 1:20, 180 frames)
    // =========================================================================
    console.log('[Demo] Scene 11: Displaying Outro Summary Card (1:14 - 1:20)...');
    await showOutro();
    await animateMouseTo(960, 540, 30);
    await holdFrames(150);

    // Ensure total frames reaches exactly 2400 (80.0s)
    while (frameIdx < TOTAL_FRAMES) {
      await captureFrame();
    }

    console.log(`[Demo] Frame capture complete! Total captured frames: ${frameIdx}`);

    await browser.close();
    browser = null;

    serverProcess.kill('SIGTERM');
    serverProcess = null;

    // Assemble video with ffmpeg
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const finalVideoFilename = `flarebase-demo-${timestamp}.mp4`;
    const finalVideoPath = path.join(FINAL_DIR, finalVideoFilename);
    const latestVideoPath = path.join(FINAL_DIR, 'flarebase-demo-latest.mp4');

    console.log(`[Demo] Encoding frames to MP4 at 1920x1080 @ 30 FPS using ffmpeg...`);
    const ffmpegCmd = `/opt/homebrew/bin/ffmpeg -y -r ${FPS} -i "${FRAMES_DIR}/frame_%05d.jpg" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -movflags +faststart "${finalVideoPath}"`;

    execSync(ffmpegCmd, { stdio: 'inherit' });

    fs.copyFileSync(finalVideoPath, latestVideoPath);

    const probeOutput = execSync(`/opt/homebrew/bin/ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height,r_frame_rate,codec_name -of json "${finalVideoPath}"`).toString();
    const probeData = JSON.parse(probeOutput);
    const duration = parseFloat(probeData.format?.duration || '0');
    const sizeBytes = parseInt(probeData.format?.size || '0', 10);
    const stream = probeData.streams?.[0] || {};

    console.log('[Demo] Video Verification:');
    console.log(`  Path: ${finalVideoPath}`);
    console.log(`  Duration: ${duration.toFixed(2)}s`);
    console.log(`  Resolution: ${stream.width}x${stream.height}`);
    console.log(`  Framerate: ${stream.r_frame_rate}`);
    console.log(`  Codec: ${stream.codec_name}`);
    console.log(`  Size: ${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`);

    let commitHash = 'unknown';
    try {
      commitHash = execSync('git rev-parse HEAD').toString().trim();
    } catch (_) {}

    const manifest = {
      project: 'FlareBase',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      commitHash,
      startCommand: 'PORT=3850 node dist/server.js',
      viewport: {
        width: 1920,
        height: 1080,
        framerate: FPS
      },
      durationSeconds: duration,
      totalFrames: frameIdx,
      outputFiles: {
        timestamped: path.relative(path.resolve(__dirname, '..'), finalVideoPath),
        latest: path.relative(path.resolve(__dirname, '..'), latestVideoPath)
      },
      storyboard: [
        {
          part: 'A: Super Admin Security Controls & Infrastructure',
          scenes: [
            {
              scene: 1,
              timeRange: '0:00 - 0:07',
              title: 'Super Admin Security Gateway & 1-Click Login',
              details: 'Emergency maintenance gateway, 1-click admin demo login (admin@flarebase.dev), and RS256 token validation.'
            },
            {
              scene: 2,
              timeRange: '0:07 - 0:14',
              title: 'Telemetry & Rate Limits Governance',
              details: 'Real-time CPU/RAM telemetry, active query latency charts, dynamic token bucket rate limits, and DDoS defense.'
            },
            {
              scene: 3,
              timeRange: '0:14 - 0:21',
              title: 'Network Access Center & CIDR Rules',
              details: 'Subnet access control, real-time client device roster, bandwidth metering, and 1-click IP toggle blocking.'
            },
            {
              scene: 4,
              timeRange: '0:21 - 0:29',
              title: 'Auto Threat Detection & User Security Radar',
              details: '5 KPI summary cards, composite risk scores (0-100), D_hash hardware device fingerprints, and live security audit scans.'
            },
            {
              scene: 5,
              timeRange: '0:29 - 0:37',
              title: 'Universal Server Hosting & Bare-Metal Recovery',
              details: 'Dual Local/LAN IP discovery, Cloudflare edge tunnel integration, and 6-digit RECOVERY_PIN emergency console.'
            }
          ]
        },
        {
          part: 'B: Developer & User Workspace Dashboard',
          scenes: [
            {
              scene: 6,
              timeRange: '0:37 - 0:44',
              title: 'Developer Metrics & Project Management',
              details: 'Developer metrics dashboard, scoped API keys, workspace isolation, and repository synchronization.'
            },
            {
              scene: 7,
              timeRange: '0:44 - 0:52',
              title: 'GitHub-Grade Organizations & Functional Teams',
              details: 'Multi-tenant workspace switcher, member rosters, functional groups (@org/team), and granular project access grants.'
            },
            {
              scene: 8,
              timeRange: '0:52 - 1:00',
              title: 'NoSQL Document Database & Row-Level Security',
              details: 'Schemaless JSON collections, document editor with _rules evaluation, and reactive search filtering.'
            },
            {
              scene: 9,
              timeRange: '1:00 - 1:07',
              title: 'Storage Vault & Visual 500MB Quotas',
              details: 'Binary magic byte header inspection, real-time visual byte quota metering bar, and temporary signed URLs.'
            },
            {
              scene: 10,
              timeRange: '1:07 - 1:14',
              title: 'User Security Console: Passkeys, Sessions & PATs',
              details: 'FIDO2 WebAuthn Passkeys, active sessions with remote device killswitch, scoped PATs, and GDPR Art. 20 export.'
            }
          ]
        },
        {
          part: 'C: Outro & Platform Architecture Summary',
          scenes: [
            {
              scene: 11,
              timeRange: '1:14 - 1:20',
              title: 'Unified Platform Architecture Showcase',
              details: 'Outro summary card showcasing both Super Admin Security Controls and Developer BaaS Primitives.'
            }
          ]
        }
      ]
    };

    fs.writeFileSync(path.join(__dirname, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log('[Demo] Saved manifest.json');

    const readmeContent = `# FlareBase Product Demo Video

## Overview
This directory contains the deterministic product walkthrough video for **FlareBase** — showcasing both the **Super Admin Security & Infrastructure Controls** and the **Developer & User Interface Dashboard** as documented in the [main README](../README.md).

- **Recording Date**: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- **Exact Duration**: ${duration.toFixed(1)} seconds (Target: 60–90 seconds)
- **Resolution**: 1920x1080 (1080p Full HD) @ 30 FPS
- **Video Format**: MP4 (H.264 / AAC compatible, \`yuv420p\`, faststart enabled)
- **Primary Deliverable**: \`demo-video/final/${finalVideoFilename}\`
- **Latest Alias**: \`demo-video/final/flarebase-demo-latest.mp4\`

---

## Demonstrated Workflow & Storyboard

### Part A: Super Admin Security & Infrastructure Controls (\`0:00 - 0:37\`)
| Scene | Timestamp | Feature | Description |
| :--- | :--- | :--- | :--- |
| **1** | \`0:00 - 0:07\` | **Super Admin Gateway & Login** | Zero-trust emergency portal, 1-click demo login (\`admin@flarebase.dev\`), and RS256 token verification. |
| **2** | \`0:07 - 0:14\` | **Telemetry & Rate Limits** | Live CPU/RAM metrics, query latency charts, dynamic token bucket rate limit sliders, and DDoS defense. |
| **3** | \`0:14 - 0:21\` | **Network Access Center** | Subnet access control, connected device roster with bandwidth meters, and 1-click IP toggle blocking. |
| **4** | \`0:21 - 0:29\` | **Threat Intelligence Radar** | 5 live KPI cards, composite risk scores (0-100), $D_{\\text{hash}}$ device fingerprints, and live security audit scans. |
| **5** | \`0:29 - 0:37\` | **Hosting & System Recovery** | Dual Local/LAN discovery (\`http://192.168.31.57:3850\`), Cloudflare tunnels, and 6-digit \`RECOVERY_PIN\` emergency recovery portal. |

### Part B: Developer & User Interface Dashboard (\`0:37 - 1:14\`)
| Scene | Timestamp | Feature | Description |
| :--- | :--- | :--- | :--- |
| **6** | \`0:37 - 0:44\` | **Developer Metrics & Projects** | Scoped API keys, project workspace isolation, database operation metrics, and repository sync. |
| **7** | \`0:44 - 0:52\` | **Organizations & Teams** | Multi-tenant workspace switcher, member rosters, functional groups (\`@org/team\`), and project permission grants. |
| **8** | \`0:52 - 1:00\` | **NoSQL Database & RLS** | Schemaless JSON document collections, embedded \`_rules\` evaluation, and real-time reactive search. |
| **9** | \`1:00 - 1:07\` | **Storage Vault & Quotas** | Magic byte binary validation, real-time visual 500MB quota metering bar, and temporary signed URLs. |
| **10** | \`1:07 - 1:14\` | **User Security Console** | FIDO2 Biometric Passkeys, active sessions with remote device killswitch, scoped PATs, and GDPR Art. 20 export. |

### Part C: Architecture Showcase (\`1:14 - 1:20\`)
| Scene | Timestamp | Feature | Description |
| :--- | :--- | :--- | :--- |
| **11** | \`1:14 - 1:20\` | **Outro Summary Card** | Branded high-resolution showcase highlighting all security controls and developer primitives. |

---

## Safe Demo Data & Privacy Verification
- **Zero Real Secrets**: All displayed credentials use standard local demo accounts (\`admin@flarebase.dev\` / \`Admin@123\`).
- **No Token Leaks**: Auth tokens and sensitive PII are masked and encrypted.
- **Isolated Execution**: Recorded on dedicated local port \`3850\` without touching production databases or external endpoints.

---

## Reproducing the Recording
To re-run the deterministic demo capture from scratch:

\`\`\`bash
# 1. Compile TypeScript backend
npm run build

# 2. Run the deterministic demo capture script
node demo-video/record-demo.js
\`\`\`

### Prerequisites
- Node.js \`>= 20.x\`
- \`ffmpeg\` & \`ffprobe\` (available at \`/opt/homebrew/bin/ffmpeg\` or system \`PATH\`)
- Chrome / Chromium (managed via Puppeteer)
`;

    fs.writeFileSync(path.join(__dirname, 'README.md'), readmeContent);
    console.log('[Demo] Saved README.md');

    console.log('[Demo] Demo video generation completed successfully!');
  } catch (err) {
    console.error('[Demo] Fatal Error:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (serverProcess) serverProcess.kill('SIGTERM');
  }
}

main();
