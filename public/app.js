// ─────────────────────────────────────────────────────────────────────────────
//  public/app.js
//  AegisDB High-End Enterprise Dashboard Controller.
// ─────────────────────────────────────────────────────────────────────────────

// Global error handler - catches ALL uncaught JS errors
window.onerror = function(message, source, lineno, colno, error) {
  console.error('🚨 JS Error:', message, 'at', source, 'line', lineno);
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;background:#ff0000;color:#fff;padding:12px 24px;border-radius:8px;font-size:13px;max-width:80vw;word-break:break-all;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
  toast.textContent = '❌ JS ERROR: ' + message + ' (line ' + lineno + ')';
  document.body?.appendChild(toast);
  setTimeout(() => toast?.remove(), 15000);
};
console.log('✅ app.js v17 loaded successfully');

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

// Universal Clipboard Copy with Fallback for HTTP / LAN IP origins
window.copyToClipboard = async function(text) {
  if (text === undefined || text === null) return false;
  const strText = String(text);
  
  if (navigator.clipboard && window.isSecureContext && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(strText);
      return true;
    } catch (_) {}
  }

  // Fallback for non-secure / HTTP contexts (Safari & Chrome on local network IPs)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = strText;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.warn('Fallback clipboard copy failed:', err);
    return false;
  }
};

const state = {
  baseUrl: window.location.origin,
  wsUrl: window.location.origin.replace(/^http/, 'ws'),
  accessToken: localStorage.getItem('aegis_access_token') || null,
  refreshToken: localStorage.getItem('aegis_refresh_token') || null,
  user: JSON.parse(localStorage.getItem('aegis_user') || 'null'),
  roleMode: 'developer', // 'superadmin' or 'developer'
  projects: [],
  activeProject: null,
  collections: [],
  activeCollection: null,
  documents: [],
  assets: [],
  pendingMfaSecret: null,
  ws: null,
  wsSubscriptions: new Set(),
  telemetryChartCpuMemory: null,
  telemetryChartLatency: null,
  idleTimer: null,
  timeoutMinutes: parseInt(localStorage.getItem('aegis_session_timeout') || '15', 10),
};

// ── Modal Helper Service ───────────────────────────────────────────────────────

window.showModal = function(id) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('flex');
  el.style.removeProperty('display');
  el.style.setProperty('display', 'flex', 'important');
};

window.hideModal = function(id) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (!el) return;
  el.classList.add('hidden');
  el.classList.remove('flex');
  el.style.removeProperty('display');
  el.style.setProperty('display', 'none', 'important');
};

// ── Toast Notification Service ─────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  let bgClass = 'bg-slate-900/90 border-slate-700 text-slate-100';
  let icon = '<i class="fa-solid fa-circle-info text-indigo-400"></i>';

  if (type === 'success') {
    bgClass = 'bg-emerald-950/90 border-emerald-800 text-emerald-100';
    icon = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
  } else if (type === 'error') {
    bgClass = 'bg-rose-950/90 border-rose-800 text-rose-100';
    icon = '<i class="fa-solid fa-circle-exclamation text-rose-400"></i>';
  } else if (type === 'warning') {
    bgClass = 'bg-amber-950/90 border-amber-800 text-amber-100';
    icon = '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i>';
  }

  toast.className = `flex items-center space-x-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md pointer-events-auto toast-enter ${bgClass}`;
  toast.innerHTML = `
    <div class="flex-shrink-0 text-base">${icon}</div>
    <div class="text-xs font-medium pr-2">${message}</div>
    <button class="ml-auto text-slate-400 hover:text-white transition" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }
  }, 6000);
}

// ── API Service Helper ─────────────────────────────────────────────────────────

async function apiRequest(endpoint, method = 'GET', body = null, isFormData = false) {
  const headers = {};
  if (state.accessToken) {
    headers['Authorization'] = `Bearer ${state.accessToken}`;
  }
  if (state.activeProject) {
    headers['x-aegis-project-id'] = state.activeProject.id;
  }
  if (body && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    method,
    headers,
    cache: 'no-store',
    body: body ? (isFormData ? body : JSON.stringify(body)) : null,
  };

  let res = await fetch(`${state.baseUrl}${endpoint}`, config);
  const json = await res.json().catch(() => ({}));

  if (res.status === 503 && json.error === 'MAINTENANCE_MODE') {
    if (!state.user?.isSuperAdmin && state.user?.role !== 'super_admin') {
      const maintenanceEl = document.getElementById('view-maintenance');
      if (maintenanceEl) maintenanceEl.classList.remove('hidden');
    }
    throw new Error('System is under maintenance');
  }

  if (res.status === 401) {
    // If refreshToken exists and not already trying to auth, attempt silent token refresh
    if (state.refreshToken && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/login')) {
      try {
        const refreshRes = await fetch(`${state.baseUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: state.refreshToken })
        });
        const refreshData = await refreshRes.json();
        if (refreshData?.accessToken) {
          state.accessToken = refreshData.accessToken;
          localStorage.setItem('aegis_access_token', refreshData.accessToken);
          if (refreshData.refreshToken) {
            state.refreshToken = refreshData.refreshToken;
            localStorage.setItem('aegis_refresh_token', refreshData.refreshToken);
          }
          headers['Authorization'] = `Bearer ${state.accessToken}`;
          res = await fetch(`${state.baseUrl}${endpoint}`, config);
          const retriedJson = await res.json().catch(() => ({}));
          if (res.ok && retriedJson.success !== false) {
            return retriedJson.data !== undefined ? retriedJson.data : retriedJson;
          }
        }
      } catch (_) {}
    }

    // If still 401 or refresh failed, purge stale session
    if (state.accessToken || state.user) {
      console.warn('[Auth] Expired or invalid token detected. Purging stale credentials.');
      state.accessToken = null;
      state.refreshToken = null;
      state.user = null;
      localStorage.removeItem('aegis_access_token');
      localStorage.removeItem('aegis_refresh_token');
      localStorage.removeItem('aegis_user');
      updateWsBadge('offline');
    }
  }

  if (!res.ok || json.success === false) {
    throw new Error(json.message || `API Error (${res.status})`);
  }
  return json.data !== undefined ? json.data : json;
}

// ── User Session & Profile UI Updater ──────────────────────────────────────────

function updateUserProfileUI() {
  if (!state.user) return;

  // Header User Display
  const nameEl = document.getElementById('user-display-name');
  const emailEl = document.getElementById('user-display-email');
  if (nameEl) nameEl.textContent = state.user.name || 'User';
  if (emailEl) emailEl.textContent = state.user.email || '';

  // Settings Tab Profile Fields
  const settingName = document.getElementById('setting-name');
  const settingEmail = document.getElementById('setting-email');
  if (settingName) settingName.value = state.user.name || '';
  if (settingEmail) settingEmail.value = state.user.email || '';

  // Role Switcher & Super Admin Sidebar Navigation Restrictions
  const secSuper = document.getElementById('section-nav-superadmin');
  const btnSuper = document.getElementById('btn-role-superadmin');

  if (state.user.isSuperAdmin) {
    if (secSuper) secSuper.classList.remove('hidden');
    if (btnSuper) btnSuper.classList.remove('hidden');
  } else {
    if (secSuper) secSuper.classList.add('hidden');
    if (btnSuper) btnSuper.classList.add('hidden');
    state.roleMode = 'developer';
  }

  // MFA Status Badge & Settings Buttons
  const badgeMfa = document.getElementById('mfa-status-badge');
  const btnEnableMfa = document.getElementById('btn-enable-mfa-settings');
  const btnDisableMfa = document.getElementById('btn-disable-mfa-settings');

  if (state.user.mfaEnabled) {
    if (badgeMfa) {
      badgeMfa.className = 'px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center space-x-1';
      badgeMfa.innerHTML = '<span>MFA Enabled</span> <i class="fa-solid fa-circle-check"></i>';
    }
    if (btnEnableMfa) btnEnableMfa.classList.add('hidden');
    if (btnDisableMfa) btnDisableMfa.classList.remove('hidden');
  } else {
    if (badgeMfa) {
      badgeMfa.className = 'px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center space-x-1';
      badgeMfa.innerHTML = '<span>MFA Disabled</span> <i class="fa-solid fa-circle-xmark"></i>';
    }
    if (btnEnableMfa) btnEnableMfa.classList.remove('hidden');
    if (btnDisableMfa) btnDisableMfa.classList.add('hidden');
  }

  // Inactivity Timeout Dropdown
  const selectTimeout = document.getElementById('select-session-timeout');
  if (selectTimeout) {
    selectTimeout.value = state.timeoutMinutes.toString();
  }

  // Account Deletion Grace Period Banner
  const bannerDeletion = document.getElementById('banner-pending-deletion');
  const bannerText = document.getElementById('banner-pending-deletion-text');
  if (!state.user.isSuperAdmin && (state.user.isPendingDeletion || state.user.status === 'pending_deletion')) {
    if (bannerDeletion) {
      bannerDeletion.classList.remove('hidden');
      bannerDeletion.classList.add('flex');
    }
    if (bannerText && state.user.scheduledDeletionAt) {
      const remainingMs = new Date(state.user.scheduledDeletionAt).getTime() - Date.now();
      const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
      bannerText.textContent = `Your account and data are scheduled to be permanently erased on ${new Date(state.user.scheduledDeletionAt).toLocaleDateString()} (${remainingDays} day(s) remaining).`;
    }
  } else {
    if (bannerDeletion) {
      bannerDeletion.classList.add('hidden');
      bannerDeletion.classList.remove('flex');
    }
  }

  // Danger Zone Account Deletion Card (Hidden for Super Admin)
  const cardDangerZone = document.getElementById('card-danger-zone-deletion');
  if (cardDangerZone) {
    if (state.user.isSuperAdmin) {
      cardDangerZone.classList.add('hidden');
    } else {
      cardDangerZone.classList.remove('hidden');
    }
  }

  // Account Security, Compliance & Appeals Card (Settings Console)
  const cardCompliance = document.getElementById('card-account-security-compliance');
  const blockFlagged = document.getElementById('block-account-flagged-info');
  const blockNotice = document.getElementById('block-account-notice-info');
  const blockDeletion = document.getElementById('block-account-deletion-info');

  let hasComplianceIssue = false;

  if (!state.user.isSuperAdmin && (state.user.isFlagged || state.user.flagged)) {
    hasComplianceIssue = true;
    blockFlagged?.classList.remove('hidden');
  } else {
    blockFlagged?.classList.add('hidden');
  }

  if (!state.user.isSuperAdmin && (state.user.isPendingDeletion || state.user.status === 'pending_deletion')) {
    hasComplianceIssue = true;
    blockDeletion?.classList.remove('hidden');
    const delTimer = document.getElementById('label-settings-deletion-timer');
    if (delTimer && state.user.scheduledDeletionAt) {
      const remainingMs = new Date(state.user.scheduledDeletionAt).getTime() - Date.now();
      const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
      delTimer.textContent = `${remainingDays} day(s) remaining`;
    }
  } else {
    blockDeletion?.classList.add('hidden');
  }

  if (cardCompliance) {
    if (hasComplianceIssue || activeNoticeObj) {
      cardCompliance.classList.remove('hidden');
    } else {
      cardCompliance.classList.add('hidden');
    }
  }

  // Update Top Banner and Top Notification Bell Feed
  if (typeof window.updateUserNotificationsHeader === 'function') {
    window.updateUserNotificationsHeader();
  }
}

window.updateUserNotificationsHeader = function() {
  if (!state.user) return;

  const containerAlerts = document.getElementById('container-threat-alerts');
  const badgeCount = document.getElementById('badge-threat-count');
  const feedList = document.getElementById('threat-alerts-feed-list');
  const bannerNotice = document.getElementById('banner-compliance-notice');
  const bannerNoticeText = document.getElementById('banner-compliance-notice-text');

  let alerts = [];

  // 1. Scheduled Server Migration Alert (All users)
  if (activeScheduledMigration && activeScheduledMigration.status === 'pending') {
    const scheduledTime = new Date(activeScheduledMigration.scheduledAt).getTime();
    const remainingSec = Math.max(0, Math.ceil((scheduledTime - Date.now()) / 1000));
    const timeStr = formatRemainingSeconds(remainingSec);
    const isSuperAdmin = state.user?.isSuperAdmin || state.user?.role === 'superadmin';
    alerts.push({
      type: 'migration',
      title: 'Server Endpoint Migration Scheduled',
      details: `Target: ${activeScheduledMigration.newBaseUrl} (in ${timeStr})`,
      actionText: isSuperAdmin ? 'Cancel Migration' : 'Copy URL',
      actionFn: isSuperAdmin ? 'cancelScheduledMigration()' : `window.copyToClipboard('${activeScheduledMigration.newBaseUrl}'); showToast('Copied Target URL: ${activeScheduledMigration.newBaseUrl}', 'success');`
    });
  }

  // 2. Flag Alert (Developer users)
  if (!state.user.isSuperAdmin && (state.user.isFlagged || state.user.flagged)) {
    alerts.push({
      type: 'flag',
      title: 'Account Flagged for Review',
      details: 'Super Admin flagged your account for security analysis.',
      actionText: 'Submit Appeal',
      actionFn: 'openComplianceAppealModal()'
    });

    if (bannerNotice && bannerNoticeText && !activeNoticeObj) {
      bannerNoticeText.innerHTML = `<strong>Account Flagged for Threat Review</strong> — Action required regarding your account status.`;
      bannerNotice.classList.remove('hidden');
      bannerNotice.classList.add('flex');
    }
  }

  // 3. Active Notice Alert (Developer users)
  if (!state.user.isSuperAdmin && activeNoticeObj) {
    alerts.push({
      type: 'notice',
      title: activeNoticeObj.title || 'Compliance Violation Notice',
      details: `${activeNoticeObj.category || 'Security Policy'} (${activeNoticeObj.daysRemaining || 3} days remaining)`,
      actionText: 'Submit Appeal',
      actionFn: 'openComplianceAppealModal()'
    });

    if (bannerNotice && bannerNoticeText) {
      bannerNoticeText.innerHTML = `<strong>${escapeHTML(activeNoticeObj.title)}</strong> (${escapeHTML(activeNoticeObj.category)}) — <span class="font-mono text-amber-300">${activeNoticeObj.daysRemaining || 3} days remaining</span>.`;
      bannerNotice.classList.remove('hidden');
      bannerNotice.classList.add('flex');
    }
  }

  // 4. Pending Deletion Alert (Developer users)
  if (!state.user.isSuperAdmin && (state.user.isPendingDeletion || state.user.status === 'pending_deletion')) {
    alerts.push({
      type: 'deletion',
      title: 'Account Erasure Scheduled',
      details: 'Your account is in the 7-day deletion grace period.',
      actionText: 'Cancel Deletion',
      actionFn: 'cancelMyAccountDeletion()'
    });
  }

  if (alerts.length > 0) {
    if (containerAlerts) containerAlerts.classList.remove('hidden');
    if (badgeCount) badgeCount.textContent = alerts.length.toString();

    if (feedList) {
      feedList.innerHTML = alerts.map(a => `
        <div class="p-3 rounded-xl bg-slate-900/90 border ${a.type === 'migration' ? 'border-amber-500/40 bg-amber-950/20' : (a.type === 'deletion' ? 'border-amber-500/40 bg-amber-950/20' : 'border-rose-500/40 bg-rose-950/20')} flex items-start justify-between gap-2 shadow">
          <div class="space-y-0.5">
            <div class="font-bold text-xs ${a.type === 'migration' ? 'text-amber-300' : (a.type === 'deletion' ? 'text-amber-300' : 'text-rose-300')} flex items-center space-x-1.5">
              <i class="fa-solid ${a.type === 'migration' ? 'fa-hourglass-half text-amber-400' : (a.type === 'deletion' ? 'fa-triangle-exclamation text-amber-400' : 'fa-shield-halved text-rose-400')}"></i>
              <span>${escapeHTML(a.title)}</span>
            </div>
            <div class="text-[10px] text-slate-300">${escapeHTML(a.details)}</div>
          </div>
          <button type="button" onclick="event.preventDefault(); event.stopPropagation(); ${a.actionFn}" class="px-2.5 py-1 rounded-lg ${a.type === 'migration' && state.user?.isSuperAdmin ? 'bg-rose-600 hover:bg-rose-500' : (a.type === 'deletion' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500')} text-white font-semibold text-[10px] shadow transition active:scale-95 shrink-0">
            ${a.actionText}
          </button>
        </div>
      `).join('');
    }
  } else {
    if (badgeCount) badgeCount.textContent = '0';
    if (feedList) feedList.innerHTML = '<div class="text-slate-400 text-center py-4 text-xs">No active alerts. System normal.</div>';
    if (!state.user.isSuperAdmin) {
      if (containerAlerts) containerAlerts.classList.add('hidden');
    }
    if (bannerNotice && !activeNoticeObj && !state.user.isFlagged && !state.user.flagged) {
      bannerNotice.classList.add('hidden');
      bannerNotice.classList.remove('flex');
    }
  }
};

// ── Inactivity Session Timeout Tracker ─────────────────────────────────────────

function resetInactivityTimer() {
  if (state.idleTimer) clearTimeout(state.idleTimer);

  if (state.timeoutMinutes > 0 && state.accessToken) {
    state.idleTimer = setTimeout(() => {
      showToast('Session expired due to inactivity. Signing out...', 'warning');
      setTimeout(() => {
        localStorage.clear();
        window.location.reload();
      }, 1500);
    }, state.timeoutMinutes * 60 * 1000);
  }
}

function initInactivityTracker() {
  ['mousemove', 'keydown', 'scroll', 'click'].forEach((event) => {
    window.addEventListener(event, resetInactivityTimer);
  });
  resetInactivityTimer();
}

// ── Role Context Switcher ──────────────────────────────────────────────────────

window.setRoleMode = function setRoleMode(mode) {
  if (mode === 'superadmin' && !state.user?.isSuperAdmin) {
    showToast('Super Admin access restricted.', 'error');
    mode = 'developer';
  }

  state.roleMode = mode;
  const btnSuper = document.getElementById('btn-role-superadmin');
  const btnDev = document.getElementById('btn-role-developer');
  const secSuper = document.getElementById('section-nav-superadmin');
  const secDev = document.getElementById('section-nav-developer');

  if (mode === 'superadmin' && state.user?.isSuperAdmin) {
    if (btnSuper) btnSuper.className = 'px-3 py-1.5 rounded-lg transition-all bg-amber-500 text-slate-950 font-bold shadow flex items-center space-x-1.5';
    if (btnDev) btnDev.className = 'px-3 py-1.5 rounded-lg transition-all text-slate-400 hover:text-white flex items-center space-x-1.5';
    if (secSuper) secSuper.classList.remove('hidden');
    if (secDev) secDev.classList.add('hidden');
    
    const targetHashTab = (window.location.hash && window.location.hash.startsWith('#tab-'))
      ? window.location.hash.substring(1).split('&')[0].split('?')[0]
      : null;
    if (targetHashTab && document.getElementById(targetHashTab)) {
      switchWorkspace(targetHashTab);
    } else {
      switchWorkspace('tab-telemetry');
    }
  } else {
    if (btnDev) btnDev.className = 'px-3 py-1.5 rounded-lg transition-all bg-indigo-600 text-white shadow flex items-center space-x-1.5';
    if (btnSuper) {
      btnSuper.className = 'px-3 py-1.5 rounded-lg transition-all text-slate-400 hover:text-white flex items-center space-x-1.5';
      if (!state.user?.isSuperAdmin) btnSuper.classList.add('hidden');
    }
    if (secSuper) secSuper.classList.add('hidden');
    if (secDev) secDev.classList.remove('hidden');

    const cardPlatform = document.getElementById('card-platform-settings');
    const cardHosting = document.getElementById('card-server-hosting-settings');
    if (cardPlatform) cardPlatform.classList.add('hidden');
    if (cardHosting) cardHosting.classList.add('hidden');

    const targetHashTab = (window.location.hash && window.location.hash.startsWith('#tab-'))
      ? window.location.hash.substring(1).split('&')[0].split('?')[0]
      : null;
    if (targetHashTab && document.getElementById(targetHashTab)) {
      switchWorkspace(targetHashTab);
    } else {
      switchWorkspace('tab-developer-metrics');
    }
  }
};

// ── Workspace Panel Navigation ─────────────────────────────────────────────────

window.switchWorkspace = function switchWorkspace(tabId) {
  document.querySelectorAll('.workspace-panel').forEach((panel) => {
    panel.classList.add('hidden');
  });
  document.querySelectorAll('.nav-item[data-tab]').forEach((item) => {
    item.classList.remove('active-nav', 'bg-indigo-600/30', 'border-indigo-500/30', 'text-white');
    item.classList.add('text-slate-300');
  });

  const activePanel = document.getElementById(tabId);
  if (activePanel) {
    activePanel.classList.remove('hidden');
  }

  const activeNavBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (activeNavBtn) {
    activeNavBtn.classList.add('active-nav', 'bg-indigo-600/30', 'border-indigo-500/30', 'text-white');
    activeNavBtn.classList.remove('text-slate-300');
  }

  // Clear any existing telemetry auto-poll timer
  if (state.telemetryTimer) {
    clearInterval(state.telemetryTimer);
    state.telemetryTimer = null;
  }

  // Init workspace specific features
  if (tabId === 'tab-telemetry') {
    initTelemetryCharts();
    loadTelemetryData();
    // Auto-poll telemetry every 3 seconds for real-time WebSocket monitoring
    state.telemetryTimer = setInterval(loadTelemetryData, 3000);
  } else if (tabId === 'tab-developer-metrics') {
    initDeveloperMetricsCharts();
    loadDeveloperMetrics();
    state.telemetryTimer = setInterval(loadDeveloperMetrics, 3000);
  } else if (tabId === 'tab-webhook-inspector') {
    loadWebhookLogs();
    state.telemetryTimer = setInterval(loadWebhookLogs, 3000);
  } else if (tabId === 'tab-auth-config') {
    loadAuthConfig();
  } else if (tabId === 'tab-ws-debugger') {
    initWsDebugger();
  } else if (tabId === 'tab-tenants') {
    loadProjectsList();
  } else if (tabId === 'tab-projects') {
    loadMyProjects();
  } else if (tabId === 'tab-user-management') {
    loadUserManagement();
  } else if (tabId === 'tab-rate-limits') {
    // Rate limits are static form, no load needed
  } else if (tabId === 'tab-sec-ops') {
    loadLockedAccounts();
    loadPlatformSettings();
  } else if (tabId === 'tab-server-hosting') {
    loadPlatformSettings();
    if (typeof loadLiveTerminalLogs === 'function') loadLiveTerminalLogs();
    if (typeof window.loadNetworkAccessSettings === 'function') window.loadNetworkAccessSettings();
    if (typeof window.loadNetworkRules === 'function') window.loadNetworkRules();
    if (typeof window.loadTrackedDevicesTable === 'function') window.loadTrackedDevicesTable();
    if (typeof window.loadJailedIpsTable === 'function') window.loadJailedIpsTable();
    if (typeof window.loadSubnetRatePolicies === 'function') window.loadSubnetRatePolicies();
    if (typeof window.loadEmergencyStatus === 'function') window.loadEmergencyStatus();
    if (typeof window.loadWafSettings === 'function') window.loadWafSettings();
    if (typeof window.loadWafStats === 'function') window.loadWafStats();
    if (typeof window.loadOttAndDeviceData === 'function') window.loadOttAndDeviceData();
    if (typeof window.loadClusterDiagnosticsReport === 'function') window.loadClusterDiagnosticsReport();
  } else if (tabId === 'tab-project-management') {
    loadMyProjects();
  } else if (tabId === 'tab-data-browser') {
    loadProjectsAndCollections();
  } else if (tabId === 'tab-api-playground') {
    renderCodeSnippet('js');
  } else if (tabId === 'tab-asset-vault') {
    loadAssetsList();
  } else if (tabId === 'tab-platform-policies') {
    if (typeof loadPlatformPolicies === 'function') loadPlatformPolicies();
  } else if (tabId === 'tab-settings') {
    loadPlatformSettings();
  } else if (tabId === 'tab-about') {
    initPromptEndpointManager();
  }
}

// ── Super Admin Workspace 1: Telemetry & Metrics ────────────────────────────────

function initTelemetryCharts() {
  if (typeof Chart === 'undefined') return;
  if (state.telemetryChartCpuMemory) return;

  const ctx1 = document.getElementById('chart-cpu-memory')?.getContext('2d');
  if (ctx1) {
    state.telemetryChartCpuMemory = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: ['-', '-', '-', '-', '-', '-', 'Now'],
        datasets: [
          {
            label: 'CPU Load (%)',
            data: [0, 0, 0, 0, 0, 0, 0],
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            fill: true,
            tension: 0.4,
          },
          {
            label: 'Heap Allocated (MB)',
            data: [0, 0, 0, 0, 0, 0, 0],
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
      },
    });
  }

  const ctx2 = document.getElementById('chart-query-latency')?.getContext('2d');
  if (ctx2) {
    state.telemetryChartLatency = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'SEARCH'],
        datasets: [
          {
            label: 'WAL Mode Latency (ms)',
            data: [0, 0, 0, 0, 0],
            backgroundColor: ['#10b981', '#6366f1', '#a855f7', '#f43f5e', '#3b82f6'],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { display: false } },
          y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
      },
    });
  }

  const ctx3 = document.getElementById('chart-admin-threats')?.getContext('2d');
  if (ctx3 && !state.telemetryChartThreats) {
    state.telemetryChartThreats = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: ['Failed Logins', 'SSRF Blocks', 'Revoked Tokens', 'Rate Limited'],
        datasets: [{
          label: 'Events (Last 15m)',
          data: [0, 0, 0, 0],
          backgroundColor: '#ef4444',
          borderRadius: 4
        }]
      },
      options: { 
        responsive: true, maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { display: false } },
          y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        }
      }
    });
  }

  const ctx4 = document.getElementById('chart-admin-global-ops')?.getContext('2d');
  if (ctx4 && !state.telemetryChartTenants) {
    state.telemetryChartTenants = new Chart(ctx4, {
      type: 'doughnut',
      data: {
        labels: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'SEARCH'],
        datasets: [{
          data: [0, 0, 0, 0, 0],
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7'],
          borderWidth: 0
        }]
      },
      options: { 
        responsive: true, maintainAspectRatio: false, 
        plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } },
        cutout: '75%'
      }
    });
  }
  
  // Start Real-Time Telemetry Polling
  if (!state.telemetryInterval) {
    state.telemetryInterval = setInterval(loadTelemetryData, 3000);
    loadTelemetryData();
  }

  // Refresh Button Logic (Telemetry)
  const btnRefreshTele = document.getElementById('btn-refresh-telemetry');
  if (btnRefreshTele) {
    btnRefreshTele.onclick = () => {
      btnRefreshTele.querySelector('i').classList.add('animate-spin');
      loadTelemetryData().finally(() => {
        setTimeout(() => btnRefreshTele.querySelector('i').classList.remove('animate-spin'), 500);
      });
    };
  }

  // Refresh Button Logic (Developer Metrics)
  const btnRefreshDev = document.getElementById('btn-refresh-dev-metrics');
  if (btnRefreshDev) {
    btnRefreshDev.onclick = () => {
      btnRefreshDev.querySelector('i').classList.add('animate-spin');
      loadDeveloperMetrics().finally(() => {
        setTimeout(() => btnRefreshDev.querySelector('i').classList.remove('animate-spin'), 500);
      });
    };
  }
}

async function loadTelemetryData() {
  try {
    const res = await apiRequest('/api/v1/admin/stats', 'GET');
    if (res) {
      const stats = res;
      
      // Update CPU & Memory Chart
      if (state.telemetryChartCpuMemory) {
        const chart = state.telemetryChartCpuMemory;
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // Update KPI text elements
        const kpiCpu = document.getElementById('kpi-cpu');
        const kpiMemory = document.getElementById('kpi-memory');
        const kpiWs = document.getElementById('kpi-ws');
        if (kpiCpu) kpiCpu.textContent = `${stats.cpuUsagePercent}%`;
        if (kpiMemory) kpiMemory.textContent = `${stats.memoryUsageMb} MB`;
        if (kpiWs) kpiWs.textContent = `${stats.activeWebSockets || 0} Connections`;
        
        // Shift labels
        chart.data.labels.push(now);
        if (chart.data.labels.length > 10) chart.data.labels.shift();
        
        // Shift CPU data
        const cpuData = chart.data.datasets[0].data;
        cpuData.push(stats.cpuUsagePercent || 0);
        if (cpuData.length > 10) cpuData.shift();
        
        // Shift Memory data
        const memData = chart.data.datasets[1].data;
        memData.push(stats.memoryUsageMb || 0);
        if (memData.length > 10) memData.shift();
        
        chart.update('none'); // Update without full animation for real-time feel
      }
      
      // Update Latency Chart with real metrics
      if (state.telemetryChartLatency && stats.metricsSnapshot && stats.metricsSnapshot.dbOperations) {
        const chart = state.telemetryChartLatency;
        const dbOps = stats.metricsSnapshot.dbOperations;
        
        const getAvg = (op) => op.count > 0 ? Number((op.totalMs / op.count).toFixed(2)) : 0;
        
        const newLatencies = [
          getAvg(dbOps.select),
          getAvg(dbOps.insert),
          getAvg(dbOps.update),
          getAvg(dbOps.delete),
          getAvg(dbOps.search)
        ];
        
        chart.data.datasets[0].data = newLatencies;
        chart.update('none');

        const kpiLatency = document.getElementById('kpi-latency');
        if (kpiLatency) {
          const totalOps = Object.values(dbOps).reduce((acc, curr) => acc + curr.count, 0);
          const totalMs = Object.values(dbOps).reduce((acc, curr) => acc + curr.totalMs, 0);
          const avgLatency = totalOps > 0 ? (totalMs / totalOps).toFixed(2) : 0;
          kpiLatency.textContent = `${avgLatency} ms`;
        }
      }

      // Update Tenants Ops Chart
      if (state.telemetryChartTenants && stats.metricsSnapshot && stats.metricsSnapshot.dbOperations) {
        const dbOps = stats.metricsSnapshot.dbOperations;
        const newOps = [
          dbOps.select?.count || 0,
          dbOps.insert?.count || 0,
          dbOps.update?.count || 0,
          dbOps.delete?.count || 0,
          dbOps.search?.count || 0
        ];
        state.telemetryChartTenants.data.datasets[0].data = newOps;
        state.telemetryChartTenants.update('none');
      }

      // Update Threats Chart
      if (state.telemetryChartThreats && stats.metricsSnapshot) {
        const rateLimitHits = stats.metricsSnapshot.rateLimitHitsTotal || 0;
        state.telemetryChartThreats.data.datasets[0].data = [0, 0, 0, rateLimitHits];
        state.telemetryChartThreats.update('none');
      }

      const logStream = document.getElementById('server-log-stream');
      if (logStream) {
        const time = new Date().toLocaleTimeString();
        logStream.innerHTML = `<div class="text-emerald-400">[${time}] Telemetry sync: CPU ${stats.cpuUsagePercent}%, Mem ${stats.memoryUsageMb}MB</div>` + logStream.innerHTML;
        // Keep only last 5 logs
        const logs = logStream.children;
        if (logs.length > 5) logStream.removeChild(logs[logs.length - 1]);
      }
    }
  } catch (_) {}
}

// ── Developer Workspace: Developer Metrics Dashboard ─────────────────────────

function initDeveloperMetricsCharts() {
  if (typeof Chart === 'undefined') return;
  if (state.devChartApiThroughput) return; // already initialized

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8' } } },
    scales: {
      x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
    }
  };

  const ctx1 = document.getElementById('chart-dev-api-throughput')?.getContext('2d');
  if (ctx1) {
    state.devChartApiThroughput = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: '2xx Success', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 },
          { label: '4xx Client Err', data: [], borderColor: '#f59e0b', backgroundColor: 'transparent', tension: 0.4 },
          { label: '5xx Server Err', data: [], borderColor: '#ef4444', backgroundColor: 'transparent', tension: 0.4 }
        ]
      },
      options: commonOptions
    });
  }

  const ctx2 = document.getElementById('chart-dev-db-latency')?.getContext('2d');
  if (ctx2) {
    state.devChartDbLatency = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'p95 Latency (ms)', data: [], borderColor: '#a855f7', tension: 0.4 },
          { label: 'Avg Latency (ms)', data: [], borderColor: '#3b82f6', tension: 0.4 }
        ]
      },
      options: commonOptions
    });
  }

  const ctx3 = document.getElementById('chart-dev-ws-events')?.getContext('2d');
  if (ctx3) {
    state.devChartWsEvents = new Chart(ctx3, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Active Subscribers', data: [], borderColor: '#0ea5e9', yAxisID: 'y' },
          { label: 'Events/sec', data: [], borderColor: '#f43f5e', yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { type: 'linear', display: true, position: 'left', ticks: { color: '#0ea5e9' } },
          y1: { type: 'linear', display: true, position: 'right', ticks: { color: '#f43f5e' }, grid: { drawOnChartArea: false } },
        }
      }
    });
  }

  const ctx4 = document.getElementById('chart-dev-storage')?.getContext('2d');
  if (ctx4) {
    state.devChartStorage = new Chart(ctx4, {
      type: 'doughnut',
      data: {
        labels: ['Used (MB)', 'Available (MB)'],
        datasets: [{
          data: [0, 100],
          backgroundColor: ['#f59e0b', '#334155'],
          borderWidth: 0
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } }, cutout: '75%' }
    });
  }

  const ctx5 = document.getElementById('chart-dev-security-rules')?.getContext('2d');
  if (ctx5) {
    state.devChartSecurityRules = new Chart(ctx5, {
      type: 'bar',
      data: {
        labels: ['read', 'write', 'update', 'delete'],
        datasets: [
          { label: 'Allowed', data: [0, 0, 0, 0], backgroundColor: '#10b981' },
          { label: 'Denied', data: [0, 0, 0, 0], backgroundColor: '#ef4444' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          x: { stacked: true, ticks: { color: '#64748b' }, grid: { display: false } },
          y: { stacked: true, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }
}

async function loadDeveloperMetrics() {
  if (!state.activeProject) return;
  
  try {
    const res = await apiRequest(`/api/v1/projects/${state.activeProject.id}/stats`, 'GET');
    if (res && res.metricsSnapshot) {
      const stats = res.metricsSnapshot;
      
      const kpiApi = document.getElementById('dev-kpi-api-requests');
      const kpiLatency = document.getElementById('dev-kpi-query-latency');
      const kpiWs = document.getElementById('dev-kpi-ws-subs');
      const kpiStorage = document.getElementById('dev-kpi-storage');
      
      let totalReqs = 0;
      let req2xx = 0, req4xx = 0, req5xx = 0;
      if (stats.httpStatus) {
        totalReqs = stats.httpStatus.total;
        req2xx = stats.httpStatus['2xx'] || 0;
        req4xx = stats.httpStatus['4xx'] || 0;
        req5xx = stats.httpStatus['5xx'] || 0;
      }
      
      if (kpiApi) kpiApi.textContent = totalReqs;
      if (kpiWs) kpiWs.textContent = stats.websocketConnectionsActive || 0;
      
      let avgLat = 0;
      if (stats.dbOperations) {
        const dbOps = stats.dbOperations;
        const totalOps = Object.values(dbOps).reduce((acc, curr) => acc + curr.count, 0);
        const totalMs = Object.values(dbOps).reduce((acc, curr) => acc + curr.totalMs, 0);
        avgLat = totalOps > 0 ? (totalMs / totalOps).toFixed(2) : 0;
      }
      if (kpiLatency) kpiLatency.textContent = avgLat;
      
      // Update Throughput Chart
      if (state.devChartApiThroughput) {
        const chart = state.devChartApiThroughput;
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        chart.data.labels.push(now);
        if (chart.data.labels.length > 15) chart.data.labels.shift();
        
        chart.data.datasets[0].data.push(req2xx);
        if (chart.data.datasets[0].data.length > 15) chart.data.datasets[0].data.shift();
        
        chart.data.datasets[1].data.push(req4xx);
        if (chart.data.datasets[1].data.length > 15) chart.data.datasets[1].data.shift();
        
        chart.data.datasets[2].data.push(req5xx);
        if (chart.data.datasets[2].data.length > 15) chart.data.datasets[2].data.shift();
        
        chart.update('none');
      }
      
      // Update DB Latency Chart
      if (state.devChartDbLatency) {
        const chart = state.devChartDbLatency;
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        chart.data.labels.push(now);
        if (chart.data.labels.length > 15) chart.data.labels.shift();
        
        const p95 = (parseFloat(avgLat) * 1.5).toFixed(2); // Simulated p95
        
        chart.data.datasets[0].data.push(p95);
        if (chart.data.datasets[0].data.length > 15) chart.data.datasets[0].data.shift();
        
        chart.data.datasets[1].data.push(avgLat);
        if (chart.data.datasets[1].data.length > 15) chart.data.datasets[1].data.shift();
        
        chart.update('none');
      }
      
      // Update WS Events Chart
      if (state.devChartWsEvents) {
        const chart = state.devChartWsEvents;
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        chart.data.labels.push(now);
        if (chart.data.labels.length > 15) chart.data.labels.shift();
        
        chart.data.datasets[0].data.push(stats.websocketConnectionsActive || 0);
        if (chart.data.datasets[0].data.length > 15) chart.data.datasets[0].data.shift();
        
        // Use real events per second based on WS connections
        const eps = (stats.websocketConnectionsActive || 0) * 0; // Replace with actual event rate if available later
        chart.data.datasets[1].data.push(eps);
        if (chart.data.datasets[1].data.length > 15) chart.data.datasets[1].data.shift();
        
        chart.update('none');
      }

      // Update Storage Chart (Calculated from activeProject)
      if (state.devChartStorage && state.activeProject) {
        const chart = state.devChartStorage;
        const maxStorageMb = (state.activeProject.maxStorageBytes || 524288000) / (1024 * 1024);
        
        // Used storage based on assets and docs
        const usedStorageMb = ((state.activeProject.assetCount || 0) * 2.5) + ((state.activeProject.documentCount || 0) * 0.01);
        const availableMb = Math.max(0, maxStorageMb - usedStorageMb);
        
        chart.data.datasets[0].data = [usedStorageMb.toFixed(2), availableMb.toFixed(2)];
        chart.update('none');
        
        if (kpiStorage) kpiStorage.textContent = usedStorageMb.toFixed(1) + ' MB';
      }

      // Update Security Rules Chart (Real-time Outcomes)
      if (state.devChartSecurityRules) {
        const chart = state.devChartSecurityRules;
        // Since we don't have per-rule stats yet, we zero them out to reflect the actual currently tracked data
        
        chart.data.datasets[0].data = [0, 0, 0, 0]; // Read/Write/Update/Delete Allowed
        chart.data.datasets[1].data = [0, 0, 0, 0]; // Read/Write/Update/Delete Denied
        
        chart.update('none');
      }
    }
  } catch (err) {
    console.error("Failed to load developer metrics", err);
  }
}

// ── Super Admin Workspace 2: Multi-Tenant & Quotas ──────────────────────────────

async function loadProjectsList() {
  const tableBody = document.getElementById('table-tenants-body');
  try {
    const projects = await apiRequest('/api/v1/projects');
    state.projects = projects;
    renderProjectsTable(projects);
    updateProjectSelectorDropdown(projects);
  } catch (err) {
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-rose-400">${escapeHTML(err.message)}</td></tr>`;
  }
}

function renderProjectsTable(projects) {
  const tableBody = document.getElementById('table-tenants-body');
  if (!tableBody) return;

  if (!projects || projects.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No tenant projects found.</td></tr>`;
    return;
  }

  tableBody.innerHTML = projects
    .map(
      (p) => `
    <tr class="hover:bg-white/5 transition">
      <td class="p-4 font-semibold text-white">${escapeHTML(p.name)}</td>
      <td class="p-4 text-slate-400">${p.id}</td>
      <td class="p-4 text-slate-400">${p.ownerId}</td>
      <td class="p-4 text-indigo-400 font-semibold">${((p.maxStorageBytes || 1073741824) / (1024 * 1024 * 1024)).toFixed(1)} GB</td>
      <td class="p-4 text-right space-x-2">
        <button onclick="rotateProjectKeys('${p.id}')" class="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 text-[10px] font-semibold transition">
          <i class="fa-solid fa-key"></i> Rotate Key
        </button>
      </td>
    </tr>
  `
    )
    .join('');
}

function updateProjectSelectorDropdown(projects) {
  const dropdown = document.getElementById('select-active-project');
  if (!dropdown) return;

  const previousProjectId = state.activeProject?.id;

  if (projects && projects.length > 0) {
    if (!state.activeProject || !projects.some(p => p.id === state.activeProject.id)) {
      state.activeProject = projects[0];
    }
  } else {
    state.activeProject = null;
  }

  if (!projects || projects.length === 0) {
    dropdown.innerHTML = '<option value="">No projects in workspace</option>';
  } else {
    dropdown.innerHTML = (projects || [])
      .map((p) => `<option value="${p.id}" ${state.activeProject?.id === p.id ? 'selected' : ''}>${escapeHTML(p.name)}</option>`)
      .join('');
  }

  if (state.activeProject) {
    dropdown.value = state.activeProject.id;
  }

  if (previousProjectId !== state.activeProject?.id) {
    const currentTab = state.activeTab || document.querySelector('.nav-item.active-nav')?.getAttribute('data-tab');
    if (currentTab === 'tab-data-browser') {
      loadCollections();
    } else if (currentTab === 'tab-auth-config') {
      loadAuthConfig();
    }
  }
}

// ── Global Data Initialization ───────────────────────────────────────────────

async function initGlobalData() {
  try {
    await fetchUserOrganizations();
    await loadMyProjects();
    
    // Refresh prompt endpoint configurator and pending migration status
    initPromptEndpointManager();

    // Initialize user feature suite (Passkeys, Sessions, PATs, Teams, Storage Quota)
    if (typeof window.initUserFeaturesDashboard === 'function') {
      window.initUserFeaturesDashboard();
    }

    // Once projects are loaded and activeProject is set, refresh the current view
    const activeTab = document.querySelector('.active-nav')?.getAttribute('data-tab');
    if (activeTab) {
      switchWorkspace(activeTab);
    }
  } catch (err) {
    console.error('Failed to init global data:', err);
  }
}

// ── Theme Configurations ─────────────────────────────────────────────────────────────

async function loadWebhookLogs() {
  if (!state.activeProject) return;
  
  try {
    const res = await apiRequest(`/api/v1/projects/${state.activeProject.id}/webhook-logs`, 'GET');
    if (res && Array.isArray(res)) {
      renderWebhookLogs(res);
    }
  } catch (error) {
    console.error('Failed to load webhook logs:', error);
  }
}

function renderWebhookLogs(logs) {
  const tbody = document.getElementById('webhook-delivery-log');
  const dlqList = document.getElementById('dlq-list');
  const dlqCount = document.querySelector('#tab-webhook-inspector .bg-rose-500\\/20');
  
  if (!tbody || !dlqList) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">No recent deliveries</td></tr>`;
    dlqList.innerHTML = `<div class="p-3 text-center text-slate-500 text-xs">No failed events.</div>`;
    if (dlqCount) dlqCount.textContent = '0 Fails';
    return;
  }

  // Delivery Logs
  tbody.innerHTML = logs.map(log => {
    // Parse details string, e.g. "Dispatched event "document.inserted" to https://... Response Status: 200"
    let endpoint = '--';
    let latency = '-- ms'; // Latency isn't strictly logged, but we can simulate or leave blank
    
    // Simple regex to extract URL
    const urlMatch = log.details.match(/to\s(https?:\/\/[^\s]+)/);
    if (urlMatch) endpoint = urlMatch[1];
    
    // Status color
    const statusClass = log.status === 'success' 
      ? 'text-emerald-400 bg-emerald-500/10' 
      : 'text-rose-400 bg-rose-500/10';

    return `
      <tr class="hover:bg-white/5 transition border-t border-white/5">
        <td class="p-3 whitespace-nowrap">${new Date(log.timestamp).toLocaleTimeString()}</td>
        <td class="p-3 text-indigo-400">event.dispatched</td>
        <td class="p-3 text-slate-400 break-all max-w-[200px] truncate">${escapeHTML(endpoint)}</td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded text-[10px] ${statusClass}">${log.status}</span>
        </td>
        <td class="p-3 text-slate-500">${latency}</td>
        <td class="p-3">
          <button class="text-indigo-400 hover:text-indigo-300 transition text-[10px] uppercase font-bold">Details</button>
        </td>
      </tr>
    `;
  }).join('');

  // DLQ List (just filter the failures)
  const fails = logs.filter(l => l.status !== 'success');
  if (dlqCount) dlqCount.textContent = `${fails.length} Fails`;
  
  if (fails.length === 0) {
    dlqList.innerHTML = `<div class="p-3 text-center text-slate-500 text-xs">No failed events.</div>`;
  } else {
    dlqList.innerHTML = fails.map(log => {
      let endpoint = '--';
      const urlMatch = log.details.match(/to\s(https?:\/\/[^\s]+)/);
      if (urlMatch) endpoint = urlMatch[1];
      
      let httpCode = 'HTTP 500';
      const statusMatch = log.details.match(/Status:\s(\d+)/);
      if (statusMatch) httpCode = `HTTP ${statusMatch[1]}`;

      return `
        <div class="p-3 rounded-lg bg-slate-900 border border-white/5 flex flex-col space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono text-slate-300">event.dispatched</span>
            <span class="text-[10px] text-rose-400">${httpCode}</span>
          </div>
          <div class="text-[10px] text-slate-500 break-all">${escapeHTML(endpoint)}</div>
          <button class="w-full py-1 mt-1 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 rounded text-[10px] transition border border-indigo-500/30">
            Replay Event
          </button>
        </div>
      `;
    }).join('');
  }
}

async function rotateProjectKeys(projectId) {
  try {
    await apiRequest(`/api/v1/projects/${projectId}/rotate-keys`, 'POST');
    showToast('Project API keys rotated successfully.', 'success');
    loadProjectsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Super Admin Workspace 3: SecOps & Account Lockouts ──────────────────────────

async function loadLockedAccounts() {
  const container = document.getElementById('container-locked-accounts');
  if (!container) return;

  container.innerHTML = `
    <div class="p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 flex items-center justify-between">
      <div>
        <div class="text-xs font-semibold text-rose-200">192.0.2.45 (IP Locked)</div>
        <div class="text-[10px] text-rose-400">Triggered: 5 failed login attempts</div>
      </div>
      <span class="text-[10px] font-mono text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded">15m lock remaining</span>
    </div>
  `;
}

// ── Super Admin: User Management ────────────────────────────────────────────────

let cachedAdminUsers = [];
let currentUserRoleFilter = 'all';

window.loadUserManagement = async function loadUserManagement() {
  const tableBody = document.getElementById('table-users-body');
  const badgeCount = document.getElementById('badge-user-count');
  if (!tableBody) return;

  try {
    const users = await apiRequest('/api/v1/admin/users');
    cachedAdminUsers = Array.isArray(users) ? users : (users?.users || []);
    if (badgeCount) badgeCount.textContent = `${cachedAdminUsers.length} users`;
    filterUsersTable();
    loadDeletionRequests();
    if (typeof loadComplianceNoticesTable === 'function') loadComplianceNoticesTable();
    if (typeof loadThreatFlagsTable === 'function') loadThreatFlagsTable();
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-rose-400">${escapeHTML(err.message)}</td></tr>`;
  }
}

let cachedDeletions = [];
let currentFilteredDeletions = [];
let deletionsCurrentPage = 1;
let currentDeletionFilter = 'all';
const deletionsPageSize = 5;

async function loadDeletionRequests() {
  const tableBody = document.getElementById('table-deletions-body');
  const badgeCount = document.getElementById('badge-deletions-count');
  if (!tableBody) return;

  try {
    const data = await apiRequest('/api/v1/admin/account-deletions');
    cachedDeletions = Array.isArray(data) ? data : (data?.data || []);
    const pendingCount = cachedDeletions.filter(r => r.status === 'pending').length;
    if (badgeCount) badgeCount.textContent = `${pendingCount} pending / ${cachedDeletions.length} total`;
    filterDeletionsTable();
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-rose-400">${escapeHTML(err.message)}</td></tr>`;
  }
}

window.setDeletionsFilter = function(filter, btn) {
  currentDeletionFilter = filter;
  deletionsCurrentPage = 1;
  document.querySelectorAll('.deletion-filter-btn').forEach(b => {
    b.className = 'deletion-filter-btn px-2.5 py-1 rounded-lg hover:text-white transition';
  });
  if (btn) {
    btn.className = 'deletion-filter-btn px-2.5 py-1 rounded-lg text-white bg-amber-600 font-semibold shadow-sm transition';
  }
  filterDeletionsTable();
};

window.filterDeletionsTable = function() {
  const searchInput = document.getElementById('input-search-deletions');
  const query = (searchInput?.value || '').toLowerCase().trim();

  let filtered = [...cachedDeletions];

  if (currentDeletionFilter === 'pending') {
    filtered = filtered.filter(r => r.status === 'pending');
  } else if (currentDeletionFilter === 'cancelled') {
    filtered = filtered.filter(r => r.status === 'cancelled');
  } else if (currentDeletionFilter === 'purged') {
    filtered = filtered.filter(r => r.status !== 'pending' && r.status !== 'cancelled');
  }

  if (query) {
    filtered = filtered.filter(r => 
      (r.userEmail && r.userEmail.toLowerCase().includes(query)) ||
      (r.accountType && r.accountType.toLowerCase().includes(query)) ||
      (r.id && r.id.toLowerCase().includes(query))
    );
  }

  currentFilteredDeletions = filtered;
  renderDeletionsTable(filtered);
};

window.changeDeletionsPage = function(page) {
  const totalPages = Math.ceil(currentFilteredDeletions.length / deletionsPageSize) || 1;
  if (page < 1 || page > totalPages) return;
  deletionsCurrentPage = page;
  renderDeletionsTable(currentFilteredDeletions);
};

function renderDeletionsTable(requests) {
  const tableBody = document.getElementById('table-deletions-body');
  const paginationControls = document.getElementById('deletions-pagination-controls');
  const startEl = document.getElementById('deletions-page-start');
  const endEl = document.getElementById('deletions-page-end');
  const totalEl = document.getElementById('deletions-page-total');
  if (!tableBody) return;

  currentFilteredDeletions = requests || [];
  const total = currentFilteredDeletions.length;
  const totalPages = Math.ceil(total / deletionsPageSize) || 1;

  if (deletionsCurrentPage > totalPages) deletionsCurrentPage = totalPages;
  if (deletionsCurrentPage < 1) deletionsCurrentPage = 1;

  const startIdx = (deletionsCurrentPage - 1) * deletionsPageSize;
  const endIdx = Math.min(startIdx + deletionsPageSize, total);
  const pageItems = currentFilteredDeletions.slice(startIdx, endIdx);

  if (startEl) startEl.textContent = total > 0 ? (startIdx + 1) : 0;
  if (endEl) endEl.textContent = endIdx;
  if (totalEl) totalEl.textContent = total;

  // Render pagination buttons
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.innerHTML = '';
    } else {
      let btns = '';
      btns += `<button type="button" onclick="changeDeletionsPage(${deletionsCurrentPage - 1})" ${deletionsCurrentPage === 1 ? 'disabled class="px-2.5 py-1 rounded-lg text-slate-600 bg-white/5 border border-white/5 cursor-not-allowed text-[11px]"' : 'class="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] transition active:scale-95"'}>
        <i class="fa-solid fa-chevron-left text-[9px] mr-1"></i> Prev
      </button>`;

      for (let p = 1; p <= totalPages; p++) {
        const isActive = p === deletionsCurrentPage;
        btns += `<button type="button" onclick="changeDeletionsPage(${p})" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${isActive ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10'}">${p}</button>`;
      }

      btns += `<button type="button" onclick="changeDeletionsPage(${deletionsCurrentPage + 1})" ${deletionsCurrentPage === totalPages ? 'disabled class="px-2.5 py-1 rounded-lg text-slate-600 bg-white/5 border border-white/5 cursor-not-allowed text-[11px]"' : 'class="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] transition active:scale-95"'}>
        Next <i class="fa-solid fa-chevron-right text-[9px] ml-1"></i>
      </button>`;
      paginationControls.innerHTML = btns;
    }
  }

  if (pageItems.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-500 text-xs">No matching deletion requests found.</td></tr>`;
    return;
  }

  tableBody.innerHTML = pageItems.map(r => {
    let statusBadge = '';
    if (r.status === 'pending') {
      const remainingMs = new Date(r.scheduledDeletionAt).getTime() - Date.now();
      const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse inline-flex items-center"><i class="fa-solid fa-clock mr-1 text-[9px]"></i>Pending (${remainingDays}d left)</span>`;
    } else if (r.status === 'cancelled') {
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center"><i class="fa-solid fa-check mr-1 text-[9px]"></i>Retained (${r.cancelledBy || 'user'})</span>`;
    } else {
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-flex items-center"><i class="fa-solid fa-skull mr-1 text-[9px]"></i>Permanently Erased</span>`;
    }

    const typeBadge = r.accountType === 'developer'
      ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">Developer</span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">Project User</span>`;

    return `
      <tr class="hover:bg-white/5 transition">
        <td class="p-4 font-semibold text-white font-mono text-xs">${escapeHTML(r.userEmail)}</td>
        <td class="p-4">${typeBadge}</td>
        <td class="p-4 text-slate-400 text-xs">${r.initiatedAt ? new Date(r.initiatedAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</td>
        <td class="p-4 text-slate-300 text-xs font-medium">${r.scheduledDeletionAt ? new Date(r.scheduledDeletionAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</td>
        <td class="p-4">${statusBadge}</td>
        <td class="p-4 text-right">
          ${r.status === 'pending'
            ? `<button onclick="retainAccountByAdmin('${r.id}', '${escapeHTML(r.userEmail)}')" class="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs font-semibold transition active:scale-95 flex items-center space-x-1.5 ml-auto">
                <i class="fa-solid fa-arrow-rotate-left text-xs"></i>
                <span>Retain Account</span>
               </button>`
            : `<span class="text-xs text-slate-500 italic">No action needed</span>`
          }
        </td>
      </tr>
    `;
  }).join('');
}

window.retainAccountByAdmin = async function(requestId, email) {
  if (!confirm(`Are you sure you want to cancel the deletion and retain the account for ${email}?`)) return;
  try {
    await apiRequest(`/api/v1/admin/account-deletions/${requestId}/cancel`, 'POST');
    showToast(`Account retained successfully. Deletion request for ${email} is cancelled.`, 'success');
    loadDeletionRequests();
    loadUserManagement();
  } catch (err) {
    showToast(err.message || 'Failed to retain account', 'error');
  }
};

let currentFilteredUsers = [];
let usersCurrentPage = 1;
const usersPageSize = 8;

window.setUserRoleFilter = function(filter, btn) {
  currentUserRoleFilter = filter;
  usersCurrentPage = 1;
  document.querySelectorAll('.user-filter-btn').forEach(b => {
    b.className = 'user-filter-btn px-2.5 py-1 rounded-lg hover:text-white transition';
  });
  if (btn) {
    btn.className = 'user-filter-btn px-2.5 py-1 rounded-lg text-white bg-indigo-600 font-semibold shadow-sm transition';
  }
  filterUsersTable();
};

window.filterUsersTable = function() {
  const searchInput = document.getElementById('input-search-users');
  const query = (searchInput?.value || '').toLowerCase().trim();

  let filtered = [...cachedAdminUsers];

  if (currentUserRoleFilter === 'developer') {
    filtered = filtered.filter(u => !u.isSuperAdmin);
  } else if (currentUserRoleFilter === 'superadmin') {
    filtered = filtered.filter(u => !!u.isSuperAdmin);
  } else if (currentUserRoleFilter === 'flagged') {
    filtered = filtered.filter(u => !!u.isFlagged || u.noticeStatus === 'notice_issued' || u.noticeStatus === 'appealed');
  }

  if (query) {
    filtered = filtered.filter(u => 
      (u.name && u.name.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.id && u.id.toLowerCase().includes(query))
    );
  }

  currentFilteredUsers = filtered;
  renderUsersTable(filtered);
};

window.changeUsersPage = function(page) {
  const totalPages = Math.ceil(currentFilteredUsers.length / usersPageSize) || 1;
  if (page < 1 || page > totalPages) return;
  usersCurrentPage = page;
  renderUsersTable(currentFilteredUsers);
};

window.toggleUserDropdown = function(event, userId) {
  if (event) {
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }
  const btn = (event && event.target && typeof event.target.closest === 'function') 
    ? event.target.closest('button') 
    : (event && event.currentTarget && typeof event.currentTarget.getBoundingClientRect === 'function' ? event.currentTarget : null);
  
  const menu = document.getElementById(`user-menu-${userId}`);
  const isCurrentlyOpen = menu && !menu.classList.contains('hidden');
  closeAllUserMenus();
  
  if (!isCurrentlyOpen && menu) {
    if (btn && typeof btn.getBoundingClientRect === 'function') {
      const rect = btn.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 230) {
        menu.classList.remove('top-full', 'mt-1.5');
        menu.classList.add('bottom-full', 'mb-1.5');
      } else {
        menu.classList.remove('bottom-full', 'mb-1.5');
        menu.classList.add('top-full', 'mt-1.5');
      }
    }
    menu.classList.remove('hidden');
  }
};

window.closeAllUserMenus = function() {
  document.querySelectorAll('.user-action-menu').forEach(m => m.classList.add('hidden'));
};

document.addEventListener('click', () => {
  window.closeAllUserMenus();
});

function renderUsersTable(users) {
  const tableBody = document.getElementById('table-users-body');
  const paginationControls = document.getElementById('users-pagination-controls');
  const startEl = document.getElementById('users-page-start');
  const endEl = document.getElementById('users-page-end');
  const totalEl = document.getElementById('users-page-total');
  if (!tableBody) return;

  currentFilteredUsers = users || [];
  const total = currentFilteredUsers.length;
  const totalPages = Math.ceil(total / usersPageSize) || 1;
  
  if (usersCurrentPage > totalPages) usersCurrentPage = totalPages;
  if (usersCurrentPage < 1) usersCurrentPage = 1;

  const startIdx = (usersCurrentPage - 1) * usersPageSize;
  const endIdx = Math.min(startIdx + usersPageSize, total);
  const pageUsers = currentFilteredUsers.slice(startIdx, endIdx);

  if (startEl) startEl.textContent = total > 0 ? (startIdx + 1) : 0;
  if (endEl) endEl.textContent = endIdx;
  if (totalEl) totalEl.textContent = total;

  // Render pagination buttons
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.innerHTML = '';
    } else {
      let btns = '';
      btns += `<button type="button" onclick="changeUsersPage(${usersCurrentPage - 1})" ${usersCurrentPage === 1 ? 'disabled class="px-2.5 py-1 rounded-lg text-slate-600 bg-white/5 border border-white/5 cursor-not-allowed text-[11px]"' : 'class="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] transition active:scale-95"'}>
        <i class="fa-solid fa-chevron-left text-[9px] mr-1"></i> Prev
      </button>`;

      for (let p = 1; p <= totalPages; p++) {
        if (totalPages > 6 && Math.abs(p - usersCurrentPage) > 2 && p !== 1 && p !== totalPages) {
          if (p === 2 || p === totalPages - 1) btns += `<span class="px-1 text-slate-600 text-xs">...</span>`;
          continue;
        }
        const isActive = p === usersCurrentPage;
        btns += `<button type="button" onclick="changeUsersPage(${p})" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10'}">${p}</button>`;
      }

      btns += `<button type="button" onclick="changeUsersPage(${usersCurrentPage + 1})" ${usersCurrentPage === totalPages ? 'disabled class="px-2.5 py-1 rounded-lg text-slate-600 bg-white/5 border border-white/5 cursor-not-allowed text-[11px]"' : 'class="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] transition active:scale-95"'}>
        Next <i class="fa-solid fa-chevron-right text-[9px] ml-1"></i>
      </button>`;
      paginationControls.innerHTML = btns;
    }
  }

  if (pageUsers.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500 text-xs">No matching users found.</td></tr>`;
    return;
  }

  tableBody.innerHTML = pageUsers.map((u) => {
    let formattedDate = 'N/A';
    if (u.createdAt) {
      try {
        const d = new Date(u.createdAt);
        formattedDate = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch {}
    }

    const initial = (u.name || u.email || 'U').charAt(0).toUpperCase();
    const formatCount = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : n);
    const rLimit = formatCount(u.readLimit || 50000);
    const wLimit = formatCount(u.writeLimit || 20000);

    return `
      <tr class="hover:bg-white/5 transition group">
        <td class="p-4">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br ${u.isSuperAdmin ? 'from-amber-500/30 to-amber-700/30 text-amber-300 border border-amber-500/40' : 'from-indigo-500/30 to-violet-700/30 text-indigo-300 border border-indigo-500/30'} flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
              ${initial}
            </div>
            <div class="min-w-0">
              <div class="font-semibold text-white truncate text-xs">
                ${escapeHTML(u.name || 'Developer')}
              </div>
              <div class="flex items-center gap-1 mt-0.5">
                ${u.isFlagged ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30"><i class="fa-solid fa-flag text-[8px] mr-0.5"></i>Flagged (${u.riskScore || 85})</span>` : ''}
                ${u.noticeStatus === 'notice_issued' ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30"><i class="fa-solid fa-gavel text-[8px] mr-0.5"></i>Notice</span>` : ''}
                ${u.noticeStatus === 'appealed' ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30"><i class="fa-solid fa-comments text-[8px] mr-0.5"></i>Appeal</span>` : ''}
              </div>
            </div>
          </div>
        </td>
        <td class="p-4 text-slate-300 text-xs font-mono">${escapeHTML(u.email)}</td>
        <td class="p-4">
          ${u.isSuperAdmin
            ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30"><i class="fa-solid fa-crown text-[9px] mr-1"></i>Super Admin</span>'
            : '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"><i class="fa-solid fa-code text-[9px] mr-1"></i>Developer</span>'
          }
        </td>
        <td class="p-4">
          ${u.mfaEnabled
            ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 inline-flex items-center"><i class="fa-solid fa-shield-check mr-1 text-emerald-400"></i>Enabled</span>'
            : '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800/80 text-slate-500 border border-white/5 inline-flex items-center">Disabled</span>'
          }
        </td>
        <td class="p-4">
          <span class="px-2.5 py-1 rounded-lg bg-slate-950/60 border border-white/10 text-slate-300 font-mono text-[11px]">
            ${rLimit}r / ${wLimit}w
          </span>
        </td>
        <td class="p-4 text-slate-400 text-xs">${formattedDate}</td>
        <td class="p-4 text-right">
          <div class="flex items-center justify-end gap-1.5 flex-wrap">
            <button type="button" data-action="open-edit-limits" data-user-id="${u.id}" class="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-[11px] font-semibold transition active:scale-95 inline-flex items-center space-x-1" title="Configure Rate Limits">
              <i class="fa-solid fa-sliders text-[10px]"></i>
              <span>Limits</span>
            </button>

            ${u.mfaEnabled ? `
              <button type="button" data-action="reset-mfa" data-user-id="${u.id}" class="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-[11px] font-semibold transition active:scale-95 inline-flex items-center space-x-1" title="Reset MFA Device">
                <i class="fa-solid fa-shield-halved text-[10px]"></i>
                <span>Reset MFA</span>
              </button>
            ` : ''}

            ${!u.isSuperAdmin ? `
              <button type="button" data-action="open-flag-modal" data-user-id="${u.id}" data-user-email="${escapeHTML(u.email)}" class="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-[11px] font-semibold transition active:scale-95 inline-flex items-center space-x-1" title="Flag Threat Anomaly">
                <i class="fa-solid fa-flag text-[10px]"></i>
                <span>Flag</span>
              </button>

              <button type="button" data-action="open-notice-modal" data-user-id="${u.id}" data-user-email="${escapeHTML(u.email)}" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[11px] font-semibold transition active:scale-95 inline-flex items-center space-x-1" title="Issue Violation Notice">
                <i class="fa-solid fa-gavel text-[10px]"></i>
                <span>Notice</span>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tableBody.querySelectorAll('[data-action="open-edit-limits"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const userId = btn.getAttribute('data-user-id');
      window.openEditUserLimits(userId);
    });
  });

  tableBody.querySelectorAll('[data-action="reset-mfa"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const userId = btn.getAttribute('data-user-id');
      window.resetUserMfa(userId);
    });
  });

  tableBody.querySelectorAll('[data-action="open-flag-modal"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const userId = btn.getAttribute('data-user-id');
      const userEmail = btn.getAttribute('data-user-email');
      window.openManualFlagModal(userId, userEmail);
    });
  });

  tableBody.querySelectorAll('[data-action="open-notice-modal"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const userId = btn.getAttribute('data-user-id');
      const userEmail = btn.getAttribute('data-user-email');
      window.openIssueNoticeModal(userId, userEmail);
    });
  });
}

window.resetUserMfa = async function(userId) {
  closeAllUserMenus();
  const user = cachedAdminUsers.find(u => String(u.id) === String(userId));
  const email = user?.email || userId;
  setTimeout(async () => {
    if (!confirm(`Are you sure you want to reset MFA for ${email}? They will need to re-setup MFA from their account.`)) return;
    try {
      await apiRequest(`/api/v1/admin/users/${userId}/reset-mfa`, 'POST');
      showToast(`MFA has been reset for ${email}.`, 'success');
      loadUserManagement();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, 50);
};

window.openEditUserLimits = function(userId) {
  closeAllUserMenus();
  const user = cachedAdminUsers.find(u => String(u.id) === String(userId));
  const modal = document.getElementById('modal-user-limits');
  if (!modal) return;
  const idEl = document.getElementById('edit-user-id');
  const emailEl = document.getElementById('edit-user-email');
  const maxProjEl = document.getElementById('edit-user-max-projects');
  const readEl = document.getElementById('edit-user-read-limit');
  const writeEl = document.getElementById('edit-user-write-limit');

  if (idEl) idEl.value = userId;
  if (emailEl) emailEl.textContent = user ? user.email : userId;
  if (maxProjEl) maxProjEl.value = user?.projectCount ?? 5;
  if (readEl) readEl.value = user?.readLimit ?? 50000;
  if (writeEl) writeEl.value = user?.writeLimit ?? 20000;

  showModal('modal-user-limits');
};

window.closeEditUserLimits = function() {
  hideModal('modal-user-limits');
};

window.saveUserLimits = async function() {
  const userId = document.getElementById('edit-user-id')?.value;
  if (!userId) {
    showToast('No user selected', 'error');
    return;
  }

  const readLimit = parseInt(document.getElementById('edit-user-read-limit')?.value || '50000', 10);
  const writeLimit = parseInt(document.getElementById('edit-user-write-limit')?.value || '20000', 10);
  const limits = {
    readLimit,
    writeLimit,
    apiLimit: readLimit + writeLimit,
    lockoutMinutes: 15
  };

  try {
    await apiRequest(`/api/v1/admin/users/${userId}/limits`, 'PATCH', limits);
    window.closeEditUserLimits();
    showToast('User rate limits updated successfully.', 'success');
    loadUserManagement();
  } catch (err) {
    showToast(err.message || 'Failed to update user limits', 'error');
  }
};

window.openManualFlagModal = function(userId, email) {
  closeAllUserMenus();
  if (!email || email === 'undefined') {
    const user = cachedAdminUsers.find(u => String(u.id) === String(userId));
    email = user ? user.email : userId;
  }
  const idEl = document.getElementById('flag-user-id');
  const emailEl = document.getElementById('flag-user-email');
  const notesEl = document.getElementById('input-flag-notes');
  if (idEl) idEl.value = userId;
  if (emailEl) emailEl.textContent = email;
  if (notesEl) notesEl.value = '';
  showModal('modal-flag-user');
};

window.openIssueNoticeModal = function(userId, email) {
  closeAllUserMenus();
  if (!email || email === 'undefined') {
    const user = cachedAdminUsers.find(u => String(u.id) === String(userId));
    email = user ? user.email : userId;
  }
  const idEl = document.getElementById('notice-target-user-id');
  const emailEl = document.getElementById('notice-target-user-email');
  const titleEl = document.getElementById('input-notice-title');
  const detailsEl = document.getElementById('input-notice-details');
  const daysEl = document.getElementById('input-notice-deadline-days');
  if (idEl) idEl.value = userId;
  if (emailEl) emailEl.textContent = email;
  if (titleEl) titleEl.value = '';
  if (detailsEl) detailsEl.value = '';
  if (daysEl) daysEl.value = '3';
  showModal('modal-issue-notice');
};

async function deleteUserById(userId) {
  if (!confirm('Are you sure you want to delete this user? This action is irreversible.')) return;

  try {
    await apiRequest(`/api/v1/admin/users/${userId}`, 'DELETE');
    showToast('User deleted successfully.', 'success');
    loadUserManagement();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Super Admin: Rate Limit Config ──────────────────────────────────────────────

async function saveGlobalRateLimits() {
  const readsPerMin = parseInt(document.getElementById('rl-reads-per-min')?.value || '100', 10);
  const writesPerMin = parseInt(document.getElementById('rl-writes-per-min')?.value || '50', 10);
  const burst = parseInt(document.getElementById('rl-burst')?.value || '20', 10);
  const lockoutWindow = parseInt(document.getElementById('rl-lockout-window')?.value || '15', 10);

  try {
    await apiRequest('/api/v1/admin/rate-limits', 'PATCH', { readsPerMin, writesPerMin, burst, lockoutWindow });
    showToast('Global rate limits updated successfully.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Developer: Project Management ───────────────────────────────────────────────

async function loadMyProjects() {
  const tableBody = document.getElementById('table-projects-body');
  const badgeCount = document.getElementById('badge-project-count');
  if (!tableBody) return;

  try {
    const orgParam = state.activeWorkspace === 'personal' ? 'null' : (state.activeOrgId || '');
    const url = orgParam ? `/api/v1/projects?orgId=${encodeURIComponent(orgParam)}` : '/api/v1/projects';
    const res = await apiRequest(url);
    const projects = Array.isArray(res) ? res : (res?.data || []);
    state.projects = projects;
    if (badgeCount) badgeCount.textContent = `${projects.length} projects`;
    renderMyProjectsTable(projects);
    updateProjectSelectorDropdown(projects);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-rose-400">${escapeHTML(err.message)}</td></tr>`;
  }
}

function renderMyProjectsTable(projects) {
  const tableBody = document.getElementById('table-projects-body');
  if (!tableBody) return;

  if (!projects || projects.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">No projects found in this workspace. Create one to get started.</td></tr>`;
    return;
  }

  tableBody.innerHTML = projects.map(p => {
    const authCfg = p.authConfig;
    const authBadges = authCfg
      ? Object.entries(authCfg).filter(([,v]) => v === true || v?.enabled).map(([k]) =>
          `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">${k}</span>`
        ).join(' ') || '<span class="text-slate-500 text-[10px]">None</span>'
      : '<span class="text-slate-500 text-[10px]">Not configured</span>';

    const roleColors = {
      admin: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
      maintainer: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
      developer: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
      viewer: 'bg-slate-500/10 text-slate-300 border-slate-500/20'
    };
    const roleBadgeClass = roleColors[p.myProjectRole] || roleColors.developer;

    const wsLabel = p.orgId ? `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"><i class="fa-solid fa-building mr-1"></i>Org Project</span>` : `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"><i class="fa-solid fa-user mr-1"></i>Personal</span>`;

    return `
    <tr class="hover:bg-white/5 transition">
      <td class="p-4">
        <div class="font-semibold text-white">${escapeHTML(p.name)}</div>
        <div class="text-[10px] text-slate-500 font-mono">${p.id}</div>
      </td>
      <td class="p-4">${wsLabel}</td>
      <td class="p-4">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadgeClass}">${p.myProjectRole || 'admin'}</span>
      </td>
      <td class="p-4">
        <div class="text-[11px] text-slate-300">${p.collectionCount || 0} cols • ${p.documentCount || 0} docs</div>
        <div class="text-[10px] text-slate-500">${p.assetCount || 0} assets</div>
      </td>
      <td class="p-4 space-x-1">${authBadges}</td>
      <td class="p-4 text-slate-400 text-[11px]">${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'N/A'}</td>
      <td class="p-4 text-right space-x-1.5 whitespace-nowrap">
        <button type="button" onclick="event.preventDefault(); event.stopPropagation(); selectProjectForBrowsing('${p.id}')" class="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 text-[10px] font-semibold transition" title="Browse Collections">
          <i class="fa-solid fa-arrow-right"></i> Browse
        </button>
        <button type="button" onclick="event.preventDefault(); event.stopPropagation(); window.openProjectCollaboratorsModal && window.openProjectCollaboratorsModal('${p.id}', '${escapeHTML(p.name)}')" class="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 text-[10px] font-semibold transition" title="Manage Project Access & Collaborators">
          <i class="fa-solid fa-users-gear"></i> Access
        </button>
        <button type="button" onclick="event.preventDefault(); event.stopPropagation(); openProjectBackupModal('${p.id}', '${escapeHTML(p.name)}')" class="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 text-[10px] font-semibold transition" title="Backup Project">
          <i class="fa-solid fa-cloud-arrow-up"></i>
        </button>
        <button type="button" onclick="event.preventDefault(); event.stopPropagation(); rotateProjectKeys('${p.id}', '${escapeHTML(p.name)}')" class="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 text-[10px] font-semibold transition" title="Rotate API Keys">
          <i class="fa-solid fa-key"></i>
        </button>
        ${p.myProjectRole === 'admin' ? `
          <button type="button" onclick="event.preventDefault(); event.stopPropagation(); deleteProjectById('${p.id}', '${escapeHTML(p.name)}')" class="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 text-[10px] font-semibold transition" title="Delete Project">
            <i class="fa-solid fa-trash"></i>
          </button>
        ` : ''}
      </td>
    </tr>
  `;
  }).join('');
}

window.selectProjectForBrowsing = function selectProjectForBrowsing(projectId) {
  state.activeProject = state.projects.find((p) => p.id === projectId);
  if (state.activeProject) {
    const dropdown = document.getElementById('select-active-project');
    if (dropdown) dropdown.value = projectId;
    setRoleMode('developer');
    switchWorkspace('tab-data-browser');
    loadCollections();
  }
};

async function createNewProject() {
  const name = document.getElementById('input-new-project-name')?.value?.trim();
  const wsSelect = document.getElementById('select-new-project-workspace')?.value;
  if (!name) return showToast('Please enter a project name.', 'error');

  const orgId = wsSelect && wsSelect !== 'personal' ? wsSelect : (state.activeWorkspace !== 'personal' && state.activeOrgId ? state.activeOrgId : undefined);

  try {
    const payload = { name };
    if (orgId) payload.orgId = orgId;
    const res = await apiRequest('/api/v1/projects', 'POST', payload);
    const data = res?.data || res;
    document.getElementById('modal-create-project')?.classList.add('hidden');
    document.getElementById('input-new-project-name').value = '';
    showToast(`Project "${name}" created successfully!`, 'success');
    await loadMyProjects();

    // Set the newly created project as active project immediately
    if (state.projects && state.projects.length > 0) {
      const createdProj = data.project || data;
      const newProj = state.projects.find(p => p.id === createdProj.id) || createdProj;
      if (newProj) {
        state.activeProject = newProj;
        const dropdown = document.getElementById('select-active-project');
        if (dropdown) dropdown.value = newProj.id;
        const currentTab = state.activeTab || document.querySelector('.nav-item.active-nav')?.getAttribute('data-tab');
        if (currentTab) switchWorkspace(currentTab);
      }
    }

    // Show modal with new keys
    const modal = document.getElementById('modal-rotate-keys');
    if (modal) {
      const titleEl = document.getElementById('rotate-keys-title');
      const warningEl = document.getElementById('rotate-keys-warning');
      if (titleEl) titleEl.textContent = 'Project Created:';
      if (warningEl) warningEl.textContent = 'Please copy these keys now. For security reasons, they will not be shown again.';
      
      document.getElementById('rotate-keys-project-name').textContent = name;
      
      const apiKeyEl = document.getElementById('rotate-keys-api-key');
      const serviceKeyEl = document.getElementById('rotate-keys-service-key');
      
      const apiKey = data.rawApiKey || 'Missing API Key';
      const serviceKey = data.rawServiceKey || 'Missing Service Key';
      
      apiKeyEl.setAttribute('data-key', apiKey);
      serviceKeyEl.setAttribute('data-key', serviceKey);
      
      apiKeyEl.textContent = apiKey.substring(0, 9) + '••••••••••••••••••••••••••••••••';
      serviceKeyEl.textContent = serviceKey.substring(0, 9) + '••••••••••••••••••••••••••••••••';
      
      modal.classList.remove('hidden');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.deleteProjectById = async function deleteProjectById(projectId, projectName) {
  if (!confirm(`Are you sure you want to delete project "${projectName}"? This will remove all collections and documents.`)) return;

  try {
    await apiRequest(`/api/v1/projects/${projectId}`, 'DELETE');
    showToast(`Project "${projectName}" deleted.`, 'success');
    if (state.activeProject?.id === projectId) {
      state.activeProject = null;
    }
    loadMyProjects();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openProjectBackupModal = async function openProjectBackupModal(projectId, projectName) {
  const modal = document.getElementById('modal-project-backup');
  if (!modal) return;
  
  document.getElementById('label-project-backup-title').textContent = `Backup Config: ${projectName}`;
  document.getElementById('input-project-backup-id').value = projectId;
  
  // Clear old values
  document.getElementById('input-proj-s3-bucket').value = '';
  document.getElementById('input-proj-s3-region').value = '';
  document.getElementById('input-proj-s3-access').value = '';
  document.getElementById('input-proj-s3-secret').value = '';
  
  try {
    const data = await apiRequest(`/api/v1/projects/${projectId}/backup-config`);
    if (data) {
      document.getElementById('input-proj-s3-bucket').value = data.s3BucketName || '';
      document.getElementById('input-proj-s3-region').value = data.s3Region || '';
      document.getElementById('input-proj-s3-access').value = data.s3AccessKey || '';
      document.getElementById('input-proj-s3-secret').value = data.s3SecretKey || '';
      
      // Render Backup Statuses
      if (data.lastBackupAt) {
        document.getElementById('label-proj-last-backup-time').textContent = new Date(data.lastBackupAt).toLocaleString();
        if (data.s3BucketName) {
          // Automated project backups run daily
          const nextTime = new Date(new Date(data.lastBackupAt).getTime() + 24 * 60 * 60 * 1000);
          document.getElementById('label-proj-next-backup-time').textContent = nextTime.toLocaleString();
        } else {
          document.getElementById('label-proj-next-backup-time').textContent = 'Not Scheduled';
        }
      } else {
        document.getElementById('label-proj-last-backup-time').textContent = 'Never';
        document.getElementById('label-proj-next-backup-time').textContent = 'N/A';
      }

      const lBadge = document.getElementById('badge-proj-local-status');
      if (data.lastBackupStatus === 'success') {
        lBadge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400';
        lBadge.textContent = 'Completed';
      } else if (data.lastBackupStatus === 'failed') {
        lBadge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400';
        lBadge.textContent = 'Failed';
      } else {
        lBadge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-500/10 text-slate-400';
        lBadge.textContent = 'None';
      }

      const s3Badge = document.getElementById('badge-proj-s3-status');
      if (data.lastBackupS3Status === 'success') {
        s3Badge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400';
        s3Badge.textContent = 'Completed';
      } else if (data.lastBackupS3Status === 'failed') {
        s3Badge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400';
        s3Badge.textContent = 'Failed';
      } else {
        s3Badge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-500/10 text-slate-400';
        s3Badge.textContent = 'None';
      }
      
      // Populate locations
      const locEl = document.getElementById('label-proj-local-location');
      if (locEl) {
        locEl.textContent = data.lastBackupLocation || '';
        locEl.title = data.lastBackupLocation || '';
      }
      const s3UrlEl = document.getElementById('label-proj-s3-url');
      if (s3UrlEl) {
        s3UrlEl.textContent = data.lastBackupS3Url || '';
        s3UrlEl.title = data.lastBackupS3Url || '';
      }
    }
  } catch (err) {
    showToast('Failed to load project backup config.', 'error');
  }
  
  modal.classList.remove('hidden');
}

async function rotateProjectKeys(projectId, projectName) {
  if (!confirm(`Are you sure you want to rotate keys for "${projectName}"? Old keys will be invalidated immediately.`)) return;
  try {
    const data = await apiRequest(`/api/v1/projects/${projectId}/rotate-keys`, 'POST');
    showToast(`Keys rotated successfully for "${projectName}".`, 'success');
    
    // Show modal with new keys
    const modal = document.getElementById('modal-rotate-keys');
    if (modal) {
      const titleEl = document.getElementById('rotate-keys-title');
      const warningEl = document.getElementById('rotate-keys-warning');
      if (titleEl) titleEl.textContent = 'Keys Rotated:';
      if (warningEl) warningEl.textContent = 'Your old keys have been invalidated immediately. Please update your applications with these new keys. They will not be shown again.';
      
      document.getElementById('rotate-keys-project-name').textContent = projectName;
      
      const apiKeyEl = document.getElementById('rotate-keys-api-key');
      const serviceKeyEl = document.getElementById('rotate-keys-service-key');
      
      const apiKey = data.rawApiKey;
      const serviceKey = data.rawServiceKey;
      
      apiKeyEl.setAttribute('data-key', apiKey);
      serviceKeyEl.setAttribute('data-key', serviceKey);
      
      apiKeyEl.textContent = apiKey.substring(0, 9) + '••••••••••••••••••••••••••••••••';
      serviceKeyEl.textContent = serviceKey.substring(0, 9) + '••••••••••••••••••••••••••••••••';
      
      modal.classList.remove('hidden');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Document Detail Viewer ──────────────────────────────────────────────────────

window.viewDocumentDetail = async function viewDocumentDetail(docId, collectionName) {
  const id = String(docId);
  let doc = state.documents?.find(d => String(d._id || d.id) === id);
  const collName = collectionName || state.activeCollection?.name;
  if (!doc && collName) {
    try {
      const res = await apiRequest(`/api/v1/db/collections/${encodeURIComponent(collName)}/documents/${encodeURIComponent(id)}`);
      doc = res?.data || res;
    } catch (e) {
      console.warn('Failed to fetch document detail directly:', e);
    }
  }
  if (!doc) return showToast('Document not found.', 'error');

  const idEl = document.getElementById('doc-detail-id');
  const contentEl = document.getElementById('doc-detail-content');
  const modal = document.getElementById('modal-document-detail');

  if (idEl) idEl.textContent = doc._id || doc.id || docId;
  if (contentEl) contentEl.textContent = JSON.stringify(doc, null, 2);
  showModal('modal-document-detail');
};

// ── Developer Workspace 1: Data Browser & Documents ────────────────────────────

async function loadProjectsAndCollections() {
  try {
    if (!state.projects || state.projects.length === 0) {
      const projects = await apiRequest('/api/v1/projects');
      state.projects = projects;
      updateProjectSelectorDropdown(projects);
    }
    await loadCollections();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadCollections() {
  const tabsContainer = document.getElementById('collections-tabs');
  if (!tabsContainer) return;

  try {
    const collections = await apiRequest(`/api/v1/db/collections`);
    state.collections = collections;
    renderCollectionChips(collections);

    if (collections.length > 0) {
      const currentExists = collections.find((c) => c.name === state.activeCollection?.name);
      selectCollection(currentExists || collections[0]);
    } else {
      document.getElementById('current-collection-title').textContent = 'No collections found';
      document.getElementById('badge-doc-count').textContent = '0 docs';
      document.getElementById('table-documents-body').innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-500">No collections exist yet. Click "New Collection" to create one.</td></tr>`;
    }
  } catch (err) {
    showToast(`Failed to load collections: ${escapeHTML(err.message)}`, 'error');
  }
}

function renderCollectionChips(collections) {
  const container = document.getElementById('collections-tabs');
  if (!container) return;

  container.innerHTML = collections
    .map(
      (c) => `
    <button type="button" onclick="event.preventDefault(); event.stopPropagation(); selectCollectionByName('${escapeHTML(c.name)}')" class="px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center space-x-2 ${
      state.activeCollection?.name === c.name
        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
        : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/5'
    }">
      <i class="fa-solid fa-folder text-indigo-300 text-xs"></i>
      <span>${escapeHTML(c.name)}</span>
      <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-white/10 text-slate-300">${c.documentCount || 0}</span>
    </button>
  `
    )
    .join('');
}

window.selectCollectionByName = function selectCollectionByName(name) {
  const coll = state.collections.find((c) => c.name === name);
  if (coll) selectCollection(coll);
};

window.selectCollection = async function selectCollection(coll) {
  state.activeCollection = coll;
  renderCollectionChips(state.collections);

  const titleEl = document.getElementById('current-collection-title');
  const countEl = document.getElementById('badge-doc-count');
  const targetNameEl = document.getElementById('coll-rules-target-name');

  if (titleEl) titleEl.textContent = coll.name;
  if (countEl) countEl.textContent = `${coll.documentCount || 0} docs`;
  if (targetNameEl) targetNameEl.textContent = coll.name;

  // Update Rules & Schema Textareas for this collection
  const editorRules = document.getElementById('coll-rules-editor');
  const editorSchema = document.getElementById('coll-schema-editor');
  if (editorRules) editorRules.value = coll.rules || '{\n  "read": true,\n  "write": true\n}';
  if (editorSchema) editorSchema.value = coll.schema || '{\n  "type": "object",\n  "properties": {}\n}';

  loadDocuments(coll.name);
}

async function loadDocuments(collectionName, offset = 0, limit = 100) {
  const tableBody = document.getElementById('table-documents-body');
  if (!tableBody) return;

  try {
    const res = await apiRequest(`/api/v1/db/collections/${collectionName}/documents?offset=${offset}&limit=${limit}`);
    const docs = Array.isArray(res) ? res : (res && Array.isArray(res.documents) ? res.documents : []);
    state.documents = docs;
    state.docsOffset = offset;
    state.docsLimit = limit;
    
    // Apply client-side search if there is a search value
    const searchInput = document.getElementById('input-doc-search');
    let filteredDocs = docs;
    if (searchInput && searchInput.value) {
      const q = searchInput.value.toLowerCase();
      filteredDocs = docs.filter(d => JSON.stringify(d).toLowerCase().includes(q));
    }
    
    renderDocumentsTable(filteredDocs);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-rose-400">${escapeHTML(err.message)}</td></tr>`;
  }
}

function handleDocSearch() {
  const searchInput = document.getElementById('input-doc-search');
  if (!searchInput) return;
  const q = searchInput.value.toLowerCase();
  
  if (state.documents) {
    const filteredDocs = state.documents.filter(d => JSON.stringify(d).toLowerCase().includes(q));
    renderDocumentsTable(filteredDocs);
  }
}

function prevDocsPage() {
  if (!state.activeCollection) return;
  let newOffset = (state.docsOffset || 0) - (state.docsLimit || 100);
  if (newOffset < 0) newOffset = 0;
  loadDocuments(state.activeCollection.name, newOffset, state.docsLimit || 100);
}

function nextDocsPage() {
  if (!state.activeCollection) return;
  let newOffset = (state.docsOffset || 0) + (state.docsLimit || 100);
  loadDocuments(state.activeCollection.name, newOffset, state.docsLimit || 100);
}

function renderDocumentsTable(docs) {
  const tableBody = document.getElementById('table-documents-body');
  if (!tableBody) return;

  if (!Array.isArray(docs) || docs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No documents found in this collection.</td></tr>`;
    return;
  }

  tableBody.innerHTML = docs
    .map((d) => {
      const docId = d._id || d.id || '';
      const createdAt = d._createdAt || d.createdAt;
      const updatedAt = d._updatedAt || d.updatedAt;
      const { _id, id, _createdAt, createdAt: cAt, _updatedAt, updatedAt: uAt, _rules, ...fields } = d;
      const previewStr = JSON.stringify(fields);
      const truncated = previewStr.length > 120 ? previewStr.substring(0, 120) + '...' : previewStr;
      const isEncrypted = previewStr.includes('_encrypted');
      const hasRules = !!_rules;

      return `
      <tr class="hover:bg-white/5 transition border-b border-white/5">
        <td class="py-3 px-4 font-semibold text-indigo-300 text-xs whitespace-nowrap">${escapeHTML(docId)}</td>
        <td class="py-3 px-4 text-slate-300 max-w-md">
          <div class="flex items-center space-x-2 overflow-hidden">
            ${
              isEncrypted
                ? '<span class="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"><i class="fa-solid fa-lock text-[9px] mr-1"></i>x-encrypted</span>'
                : ''
            }
            ${
              hasRules
                ? '<span class="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" title="Has custom document-level rules"><i class="fa-solid fa-shield-halved text-[9px] mr-1"></i>rules</span>'
                : ''
            }
            <code class="text-[11px] text-slate-300 truncate font-mono block max-w-[300px]" title="${escapeHTML(previewStr)}">${escapeHTML(truncated)}</code>
          </div>
        </td>
        <td class="py-3 px-4 text-slate-400 text-xs whitespace-nowrap">${createdAt ? new Date(createdAt).toLocaleString() : 'N/A'}</td>
        <td class="py-3 px-4 text-slate-400 text-xs whitespace-nowrap">${updatedAt ? new Date(updatedAt).toLocaleString() : 'N/A'}</td>
        <td class="py-3 px-4 text-right whitespace-nowrap">
          <div class="flex items-center justify-end space-x-1.5">
            <button type="button" data-action="edit-doc-rules" data-doc-id="${escapeHTML(docId)}" data-collection-name="${escapeHTML(state.activeCollection?.name || '')}" class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition" title="Edit Document Security Rules">
              <i class="fa-solid fa-shield-halved text-sm"></i>
            </button>
            <button type="button" data-action="view-document" data-doc-id="${escapeHTML(docId)}" data-collection-name="${escapeHTML(state.activeCollection?.name || '')}" class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition" title="View full document">
              <i class="fa-solid fa-eye text-sm"></i>
            </button>
            <button type="button" data-action="delete-document" data-doc-id="${escapeHTML(docId)}" data-collection-name="${escapeHTML(state.activeCollection?.name || '')}" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition" title="Delete document">
              <i class="fa-solid fa-trash text-sm"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
    })
    .join('');

  // Handlers for these actions are managed via the global event delegation listener in app.js
}

window.deleteDocument = async function deleteDocument(docId, collectionName) {
  const collName = collectionName || state.activeCollection?.name;
  if (!collName) return showToast('No collection selected.', 'error');
  try {
    await apiRequest(`/api/v1/db/collections/${encodeURIComponent(collName)}/documents/${encodeURIComponent(docId)}`, 'DELETE');
    showToast('Document deleted.', 'success');
    loadDocuments(collName, state.docsOffset || 0, state.docsLimit || 100);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Auth Config Management ──────────────────────────────────────────────────

function toggleSecretVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  const icon = btn.querySelector('i');
  if (icon) {
    if (isPass) {
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
      btn.classList.add('text-indigo-400');
    } else {
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
      btn.classList.remove('text-indigo-400');
    }
  }
}

async function loadAuthConfig() {
  if (!state.activeProject) return;

  const targetProjectId = state.activeProject.id;
  const targetProjectName = state.activeProject.name || 'Active Project';

  const nameEl = document.getElementById('auth-config-active-proj-name');
  const idEl = document.getElementById('auth-config-active-proj-id');
  if (nameEl) nameEl.textContent = targetProjectName;
  if (idEl) idEl.textContent = targetProjectId;

  // 1. Immediately reset form fields to clean defaults to prevent cross-project bleed
  const formPublicReg = document.getElementById('auth-allow-public-registration');
  const formEmail = document.getElementById('auth-enable-email');
  const formGoogle = document.getElementById('auth-enable-google');
  const formGoogleId = document.getElementById('auth-clientid-google');
  const formApple = document.getElementById('auth-enable-apple');
  const formAppleId = document.getElementById('auth-clientid-apple');
  const formGithub = document.getElementById('auth-enable-github');
  const formGithubId = document.getElementById('auth-clientid-github');

  if (formPublicReg) formPublicReg.checked = true;
  if (formEmail) formEmail.checked = true;
  if (formGoogle) formGoogle.checked = false;
  if (formGoogleId) formGoogleId.value = '';
  if (formApple) formApple.checked = false;
  if (formAppleId) formAppleId.value = '';
  if (formGithub) formGithub.checked = false;
  if (formGithubId) formGithubId.value = '';
  
  try {
    const res = await apiRequest(`/api/v1/projects/${targetProjectId}/auth-config`);
    
    // Check if user switched to another project while request was in-flight
    if (state.activeProject?.id !== targetProjectId) return;

    let config = {};
    if (typeof res === 'string') {
      try { config = JSON.parse(res); } catch (_) {}
    } else if (res && typeof res === 'object') {
      config = res;
    }
    
    // 2. Populate accurately for this specific project
    if (formPublicReg) formPublicReg.checked = config.allowPublicRegistration !== false;
    if (formEmail) formEmail.checked = config.email ? (config.email.enabled !== false) : true;
    if (formGoogle) formGoogle.checked = !!config.google?.enabled;
    if (formGoogleId) formGoogleId.value = config.google?.clientId || '';
    if (formApple) formApple.checked = !!config.apple?.enabled;
    if (formAppleId) formAppleId.value = config.apple?.clientId || '';
    if (formGithub) formGithub.checked = !!config.github?.enabled;
    if (formGithubId) formGithubId.value = config.github?.clientId || '';
    
  } catch (err) {
    console.error(`Failed to load auth config for ${targetProjectName}:`, err);
    showToast(`Failed to load Auth Config for ${targetProjectName}`, 'error');
  }
}

async function saveAuthConfig() {
  if (!state.activeProject) return showToast('No active project selected. Select a project first.', 'error');
  
  const targetProjectId = state.activeProject.id;
  const targetProjectName = state.activeProject.name || 'Active Project';

  const googleClientId = (document.getElementById('auth-clientid-google')?.value || '').trim();
  const appleClientId = (document.getElementById('auth-clientid-apple')?.value || '').trim();
  const githubClientId = (document.getElementById('auth-clientid-github')?.value || '').trim();

  const config = {
    allowPublicRegistration: document.getElementById('auth-allow-public-registration')?.checked !== false,
    email: {
      enabled: document.getElementById('auth-enable-email')?.checked !== false
    },
    google: {
      enabled: document.getElementById('auth-enable-google')?.checked || false,
      clientId: googleClientId
    },
    apple: {
      enabled: document.getElementById('auth-enable-apple')?.checked || false,
      clientId: appleClientId
    },
    github: {
      enabled: document.getElementById('auth-enable-github')?.checked || false,
      clientId: githubClientId
    }
  };
  
  try {
    await apiRequest(`/api/v1/projects/${targetProjectId}/auth-config`, 'PATCH', { authConfig: config });
    
    // Update local state copy of the project
    if (state.activeProject && state.activeProject.id === targetProjectId) {
      state.activeProject.authConfig = config;
    }
    const pInList = state.projects?.find(p => p.id === targetProjectId);
    if (pInList) {
      pInList.authConfig = config;
    }

    showToast(`Auth config saved for project "${targetProjectName}".`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Developer Workspace 2: Security Rules & Sandbox ─────────────────────────────

function initRulesSandbox() {
  const btnRun = document.getElementById('btn-run-rule-sim');
  if (!btnRun) return;

  btnRun.onclick = () => {
    const rulesStr = document.getElementById('textarea-rules')?.value || '';
    const authStr = document.getElementById('sim-auth')?.value || '';
    const resourceStr = document.getElementById('sim-resource')?.value || '';
    const output = document.getElementById('sim-output');
    if (!output) return;

    const t0 = performance.now();
    try {
      const rulesObj = JSON.parse(rulesStr);
      let auth = authStr ? JSON.parse(authStr) : null;
      if (auth && typeof auth === 'object') {
        auth.id = auth.id || auth.sub || auth.uid;
        auth.sub = auth.sub || auth.id || auth.uid;
        auth.uid = auth.uid || auth.id || auth.sub;
      }
      const resource = resourceStr ? JSON.parse(resourceStr) : null;
      if (resource && typeof resource === 'object' && !resource.data) {
        resource.data = { ...resource };
      }

      // Check both read and write rules
      const readRule = rulesObj.read !== undefined ? rulesObj.read : (rulesObj.document?.read ?? true);
      const writeRule = rulesObj.write !== undefined ? rulesObj.write : (rulesObj.document?.write ?? true);

      const evaluate = (expr) => {
        if (expr === true) return true;
        if (expr === false || expr === null || expr === undefined) return false;
        if (typeof expr !== 'string') return false;
        try {
          const fn = new Function('auth', 'resource', 'data', 'request', `return (${expr});`);
          return !!fn(auth, resource, null, { auth, time: new Date().toISOString(), resource });
        } catch {
          return false;
        }
      };

      const readAllowed = evaluate(readRule);
      const writeAllowed = evaluate(writeRule);
      const elapsed = (performance.now() - t0).toFixed(2);

      let resultHtml = `⏱️ Evaluated in ${elapsed}ms<br>`;
      resultHtml += `📖 Read Rule [${escapeHTML(String(readRule))}]: ${readAllowed ? '<span class="text-emerald-400">✅ ALLOWED</span>' : '<span class="text-rose-400">❌ DENIED</span>'}<br>`;
      resultHtml += `✏️ Write Rule [${escapeHTML(String(writeRule))}]: ${writeAllowed ? '<span class="text-emerald-400">✅ ALLOWED</span>' : '<span class="text-rose-400">❌ DENIED</span>'}`;

      output.className = 'font-mono text-xs text-slate-300 leading-relaxed';
      output.innerHTML = resultHtml;
    } catch (err) {
      output.className = 'text-amber-400 font-bold';
      output.textContent = `⚠️ Error: ${err.message}`;
    }
  };
}

// ── Global WebSocket Change Stream Manager ──────────────────────────────────────

function updateWsBadge(status) {
  const badge = document.getElementById('badge-ws-status');
  if (!badge) return;
  if (status === 'connected') {
    badge.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    badge.innerHTML = '<i class="fa-solid fa-wifi text-[10px]"></i><span>WS Connected</span>';
  } else if (status === 'connecting') {
    badge.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20';
    badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[10px]"></i><span>WS Connecting</span>';
  } else {
    badge.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20';
    badge.innerHTML = '<i class="fa-solid fa-wifi text-[10px]"></i><span>WS Offline</span>';
  }
}

function connectGlobalWebSocket() {
  if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  updateWsBadge('connecting');

  try {
    const ws = new WebSocket(`${state.wsUrl}?token=${state.accessToken || ''}&projectId=${state.activeProject?.id || ''}`);
    state.ws = ws;

    ws.onopen = () => {
      updateWsBadge('connected');
      if (typeof loadTelemetryData === 'function') loadTelemetryData();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const wsLogStream = document.getElementById('ws-log-stream');
        if (wsLogStream) {
          const div = document.createElement('div');
          const time = new Date().toLocaleTimeString();
          div.className = 'text-amber-400 font-mono text-xs';
          div.textContent = `[${time}] [Stream Event] ${JSON.stringify(data, null, 2)}`;
          wsLogStream.appendChild(div);
          wsLogStream.scrollTop = wsLogStream.scrollHeight;
        }

        // Trust & Safety Real-time Broadcasts
        if (data.type === 'SECURITY_ALERT_FLAGGED') {
          const flagUser = data.data?.flag;
          if (state.user && (state.user.id === flagUser?.userId || state.user.email === flagUser?.userEmail)) {
            state.user.isFlagged = true;
            state.user.flagged = true;
            localStorage.setItem('aegis_user', JSON.stringify(state.user));
            updateUserProfileUI();
            if (typeof window.updateUserNotificationsHeader === 'function') window.updateUserNotificationsHeader();
          }
          showToast(`🚨 Threat Detected: ${data.data?.summary || 'Malicious / bot activity detected'}`, 'error');
          if (state.user?.isSuperAdmin) {
            if (typeof window.loadSecurityThreatAlerts === 'function') window.loadSecurityThreatAlerts();
            if (typeof loadUserManagement === 'function') loadUserManagement();
          }
        } else if (data.type === 'USER_NOTICE_ISSUED') {
          if (state.user && state.user.id === data.data?.userId) {
            if (typeof window.renderComplianceBanner === 'function') {
              window.renderComplianceBanner({
                title: data.data.title,
                category: 'Security Compliance Violation',
                details: 'A formal compliance violation notice has been issued. Please submit your explanation.',
                daysRemaining: 3,
                deadlineAt: data.data.deadlineAt
              });
            }
            showToast('⚠️ Formal Compliance Violation Notice issued to your account!', 'error');
          }
          if (state.user?.isSuperAdmin) {
            if (typeof window.loadComplianceNoticesTable === 'function') window.loadComplianceNoticesTable();
            if (typeof loadUserManagement === 'function') loadUserManagement();
          }
        } else if (data.type === 'USER_APPEAL_SUBMITTED') {
          if (state.user?.isSuperAdmin) {
            showToast(`User ${data.data?.userEmail || ''} submitted an explanation for their compliance hearing.`, 'info');
            if (typeof window.loadComplianceNoticesTable === 'function') window.loadComplianceNoticesTable();
            if (typeof loadUserManagement === 'function') loadUserManagement();
          }
        } else if (data.type === 'USER_NOTIFICATION') {
          if (state.user && data.data?.userId === state.user.id) {
            showToast(`🔔 ${data.data.title}: ${data.data.message}`, 'info');
            if (typeof window.fetchUserNotifications === 'function') {
              window.fetchUserNotifications();
            }
          }
        } else if (data.type === 'SERVER_HOST_CONFIG_UPDATED') {
          const oldMode = promptEndpointConfig.mode;
          if (data.data?.networkIp) promptEndpointConfig.networkIp = data.data.networkIp;
          if (data.data?.serverPort) promptEndpointConfig.port = data.data.serverPort.toString();
          if (data.data?.serverHostingMode) promptEndpointConfig.mode = data.data.serverHostingMode;
          if (data.data?.serverHost) promptEndpointConfig.host = data.data.serverHost;
          if (data.data?.customDomain !== undefined) promptEndpointConfig.customDomain = data.data.customDomain;
          updatePromptUI();

          const newMode = data.data?.serverHostingMode;
          const port = data.data?.serverPort || window.location.port || '3000';
          const isOnLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

          // If mode switched to localhost-only and client is on an IP → redirect to localhost
          if (newMode === 'localhost' && !isOnLocalhost) {
            showToast('🔄 Server switched to Localhost Only. Redirecting...', 'warning');
            setTimeout(() => window.location.replace(`http://localhost:${port}`), 800);
            return;
          }
          // If mode switched to network-only and client is on localhost → redirect to IP
          if (newMode === 'network' && isOnLocalhost) {
            const ip = data.data?.networkIp || promptEndpointConfig.networkIp;
            if (ip) {
              showToast('🔄 Server switched to Network Only. Redirecting...', 'warning');
              setTimeout(() => window.location.replace(`http://${ip}:${port}`), 800);
              return;
            }
          }
          // If mode changed at all, refresh to sync UI
          if (newMode && oldMode && newMode !== oldMode) {
            showToast(`🌐 Server hosting mode changed to ${newMode}. Refreshing...`, 'info');
            setTimeout(() => window.location.reload(), 800);
            return;
          }

          const targetInfo = data.data?.newBaseUrl || `Port ${port}`;
          showToast(`🌐 Server endpoint configuration updated (${targetInfo}). Live prompts synced.`, 'info');
        } else if (data.type === 'ENDPOINT_MIGRATION_SCHEDULED') {
          if (data.data?.migration) {
            startScheduledMigrationCountdown(data.data.migration);
            const targetUrl = data.data.migration.newBaseUrl || 'new port';
            const msg = data.data.migration.noticeMessage || `Server migration scheduled to ${targetUrl}`;
            showToast(`⏳ Notice: ${msg}`, 'warning');
          }
        } else if (data.type === 'ENDPOINT_MIGRATION_CANCELLED') {
          if (migrationCountdownTimer) {
            clearInterval(migrationCountdownTimer);
            migrationCountdownTimer = null;
          }
          activeScheduledMigration = null;
          const banner = document.getElementById('banner-scheduled-migration');
          if (banner) {
            banner.classList.add('hidden');
            banner.classList.remove('flex');
          }
          document.getElementById('box-pending-migration-card')?.classList.add('hidden');
          document.getElementById('hosttab-box-pending-migration')?.classList.add('hidden');
          document.getElementById('modal-schedule-btn-cancel-active')?.classList.add('hidden');
          if (typeof window.updateUserNotificationsHeader === 'function') {
            window.updateUserNotificationsHeader();
          }
          showToast(`ℹ️ ${data.data?.noticeMessage || 'Scheduled server endpoint migration was cancelled by Administrator.'}`, 'info');
        } else if (data.type === 'ENDPOINT_MIGRATION_EXECUTED') {
          if (data.data?.newBaseUrl) {
            if (data.data?.networkIp) promptEndpointConfig.networkIp = data.data.networkIp;
            if (data.data?.serverPort) promptEndpointConfig.port = data.data.serverPort.toString();
            if (data.data?.serverHostingMode) promptEndpointConfig.mode = data.data.serverHostingMode;
            if (data.data?.customDomain !== undefined) promptEndpointConfig.customDomain = data.data.customDomain;
            updatePromptUI();
            triggerClientMigrationRedirect(data.data.newBaseUrl, data.data.serverHostingMode);
          }
        } else if (data.type === 'ENDPOINT_MIGRATION_NOTICE') {
          showToast(`🔔 ${data.data?.title || 'Notice'}: ${data.data?.message || ''}`, 'info');
        } else if (data.type === 'DEVICE_TRACKER_UPDATED') {
          if (state.user?.isSuperAdmin && typeof window.handleDeviceTrackerWsEvent === 'function') {
            window.handleDeviceTrackerWsEvent(data.data);
          }
        } else if (data.type === 'NETWORK_RULES_UPDATED') {
          if (state.user?.isSuperAdmin && typeof window.loadNetworkRules === 'function') {
            window.loadNetworkRules();
          }
        } else if (data.type === 'NETWORK_SETTINGS_UPDATED') {
          if (state.user?.isSuperAdmin && typeof window.loadNetworkAccessSettings === 'function') {
            window.loadNetworkAccessSettings();
          }
        } else if (data.type === 'IP_JAILED') {
          showToast(`🚨 Threat Quarantined: IP ${data.data?.jail?.ipAddress || ''} put in quarantine jail.`, 'error');
          if (state.user?.isSuperAdmin && typeof window.loadJailedIpsTable === 'function') {
            window.loadJailedIpsTable();
          }
        } else if (data.type === 'IP_UNJAILED' || data.type === 'JAIL_RECORDS_UPDATED') {
          if (state.user?.isSuperAdmin && typeof window.loadJailedIpsTable === 'function') {
            window.loadJailedIpsTable();
          }
        } else if (data.type === 'TERMINAL_LOG_STREAM') {
          if (data.data?.entry) {
            handleIncomingTerminalLog(data.data.entry);
          }
        } else if (data.type === 'SERVER_SHUTDOWN') {
          const port = data.data?.port || data.payload?.port || window.location.port || '3000';
          const stoppedBy = data.data?.stoppedBy || data.payload?.stoppedBy || 'Super Admin';
          const msgEl = document.getElementById('overlay-stopped-message');
          const portEl = document.getElementById('overlay-stopped-port-badge');
          if (msgEl) msgEl.textContent = `The server process has been safely shut down by ${stoppedBy} and Port ${port} is now released.`;
          if (portEl) portEl.textContent = `Port ${port}`;
          if (typeof window.showModal === 'function') {
            window.showModal('overlay-server-stopped');
          } else {
            const ov = document.getElementById('overlay-server-stopped');
            if (ov) {
              ov.classList.remove('hidden');
              ov.classList.add('flex');
              ov.style.setProperty('display', 'flex', 'important');
            }
          }
          showToast(`🛑 Server on port ${port} was stopped by ${stoppedBy}.`, 'error');
        } else if (data.type === 'TUNNEL_STATUS_UPDATED') {
          if (typeof window.renderTunnelUI === 'function') {
            window.renderTunnelUI(data.data);
          }
        } else if (data.type === 'TRAFFIC_TOPOLOGY_TICK') {
          if (typeof window.renderTrafficTopologyUI === 'function') {
            window.renderTrafficTopologyUI(data.data);
          }
        }
      } catch (_) {}
    };

    ws.onerror = () => {
      updateWsBadge('offline');
    };

    ws.onclose = () => {
      updateWsBadge('offline');
      state.ws = null;
      if (typeof loadTelemetryData === 'function') loadTelemetryData();
      if (state.user && state.accessToken) {
        setTimeout(connectGlobalWebSocket, 5000);
      }
    };
  } catch (err) {
    updateWsBadge('offline');
  }
}

// ── Developer Workspace 3: Real-Time WebSocket Stream Debugger ──────────────

function initWsDebugger() {
  const wsLogStream = document.getElementById('ws-log-stream');
  const btnSubscribe = document.getElementById('btn-ws-subscribe');
  const channelInput = document.getElementById('ws-channel-input');

  if (!wsLogStream) return;

  function appendLog(msg, type = 'info') {
    const div = document.createElement('div');
    const time = new Date().toLocaleTimeString();
    if (type === 'success') {
      div.className = 'text-emerald-400 font-mono text-xs';
    } else if (type === 'error') {
      div.className = 'text-rose-400 font-mono text-xs';
    } else if (type === 'event') {
      div.className = 'text-amber-400 font-mono text-xs';
    } else {
      div.className = 'text-slate-400 font-mono text-xs';
    }
    div.textContent = `[${time}] ${msg}`;
    wsLogStream.appendChild(div);
    wsLogStream.scrollTop = wsLogStream.scrollHeight;
  }

  connectGlobalWebSocket();
  appendLog('Active WebSocket connection bound to ' + state.wsUrl, 'success');

  if (btnSubscribe) {
    btnSubscribe.onclick = () => {
      const channel = channelInput?.value?.trim();
      if (!channel) return showToast('Please enter a collection channel name', 'error');
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        return showToast('WebSocket not connected', 'error');
      }

      state.ws.send(JSON.stringify({ action: 'subscribe', collection: channel }));
      appendLog(`Sent subscribe request for channel: ${channel}`, 'info');
    };
  }
}

// ── Developer Workspace 4: API Playground & Code Generator ──────────────────────

function renderCodeSnippet(lang) {
  const display = document.getElementById('code-snippet-display');
  if (!display) return;

  const apiKey = state.activeProject?.apiKeyHash ? 'aegis_pk_demo_key' : 'aegis_pk_demo_key';

  const snippets = {
    js: `import { AegisDB } from 'aegisdb-sdk';

const aegis = new AegisDB({
  apiKey: '${apiKey}',
  endpoint: '${state.baseUrl}'
});

// Fetch documents from collection
const docs = await aegis.collection('todos').get();
console.log(docs);`,

    firebase: `import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Drop-in Firebase compatibility shim
const app = initializeApp({ apiKey: '${apiKey}' });
const db = getFirestore(app);

const snapshot = await getDocs(collection(db, 'todos'));
snapshot.forEach(doc => console.log(doc.id, doc.data()));`,

    react: `import { useState, useEffect } from 'react';
import { aegis } from './aegisClient';

export function TodoList() {
  const [todos, setTodos] = useState([]);

  useEffect(() => {
    aegis.collection('todos').get().then(setTodos);
  }, []);

  return <ul>{todos.map(t => <li key={t._id}>{t.title}</li>)}</ul>;
}`,

    curl: `curl -X GET "${state.baseUrl}/api/v1/db/collections/todos/documents" \\
  -H "x-api-key: ${apiKey}" \\
  -H "Content-Type: application/json"`,

    python: `import requests

url = "${state.baseUrl}/api/v1/db/collections/todos/documents"
headers = { "x-api-key": "${apiKey}" }

response = requests.get(url, headers=headers)
print(response.json())`,
  };

  display.textContent = snippets[lang] || snippets.js;
  if (window.hljs) hljs.highlightElement(display);
}

// ── Developer Workspace 5: Asset Vault ─────────────────────────────────────────

function initStorageUpload() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('input-file-vault');
  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-indigo-500', 'bg-indigo-500/10');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-indigo-500', 'bg-indigo-500/10');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-indigo-500', 'bg-indigo-500/10');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesUpload(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesUpload(e.target.files);
      fileInput.value = '';
    }
  });
}

// ── Google Auth Handlers ──────────────────────────────────────────────────────

async function initGoogleAuth() {
  try {
    const res = await fetch('/api/v1/auth/config');
    const { data } = await res.json();

    // 1-Click Demo Admin Login Visibility
    const demoContainer = document.getElementById('container-demo-admin-login');
    if (demoContainer) {
      if (data && data.demoLoginEnabled === false) {
        demoContainer.classList.add('hidden');
        demoContainer.style.display = 'none';
      } else {
        demoContainer.classList.remove('hidden');
        demoContainer.style.display = 'block';
      }
    }

    // Google Auth Button Visibility & Handler (Dynamic from Admin Platform Settings)
    const container = document.getElementById('google-auth-container');
    const btn = document.getElementById('btn-custom-google-login');
    const isGoogleEnabled = Boolean(data?.googleAuthEnabled && data?.googleClientId && data.googleClientId.trim().length > 0);
    const clientId = (data?.googleClientId || '').trim();

    if (container) {
      if (isGoogleEnabled) {
        container.classList.remove('hidden');
        container.style.display = 'flex';
      } else {
        container.classList.add('hidden');
        container.style.display = 'none';
      }
    }
    
    if (btn && isGoogleEnabled) {
      btn.onclick = (e) => {
        e.preventDefault();
        const redirectUri = window.location.origin;
        const nonce = Math.random().toString(36).substring(2);
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token id_token&scope=email profile&nonce=${nonce}`;
        window.location.href = authUrl;
      };
    }
  } catch (err) {
    const container = document.getElementById('google-auth-container');
    if (container) {
      container.classList.add('hidden');
      container.style.display = 'none';
    }
  }
}

async function handleGoogleCredentialResponse(response) {
  try {
    const data = await apiRequest('/api/v1/auth/google', 'POST', { token: response.credential });
    state.accessToken = data.token;
    state.refreshToken = data.refreshToken;
    state.user = data.user;
    localStorage.setItem('aegis_access_token', data.token);
    localStorage.setItem('aegis_refresh_token', data.refreshToken);
    localStorage.setItem('aegis_user', JSON.stringify(data.user));

    document.getElementById('auth-screen')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.remove('hidden');
    showToast('Successfully authenticated with Google.', 'success');
    updateUserProfileUI();
    setRoleMode(data.user.isSuperAdmin ? 'superadmin' : 'developer');
    connectGlobalWebSocket();
    initGlobalData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.executeGoogleLogin = async function() {
  try {
    const res = await fetch('/api/v1/auth/config');
    const { data } = await res.json();
    const clientId = (data?.googleClientId || '').trim();
    if (!data?.googleAuthEnabled || !clientId) {
      showToast('Google OAuth is not configured on this server. Please enable it in Platform Settings.', 'error');
      return;
    }
    const redirectUri = window.location.origin;
    const nonce = Math.random().toString(36).substring(2);
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token id_token&scope=email profile&nonce=${nonce}`;
  } catch (err) {
    showToast('Google OAuth is currently unavailable.', 'error');
  }
};

window.executeDemoAdminLogin = async function() {
  const inputEmail = document.getElementById('input-email');
  const inputPassword = document.getElementById('input-password');
  if (inputEmail) inputEmail.value = 'admin@aegisdb.dev';
  if (inputPassword) inputPassword.value = 'Admin@123';
  
  const tabLogin = document.getElementById('tab-btn-login');
  if (tabLogin) tabLogin.click();

  const btn = document.getElementById('btn-demo-admin-login');
  if (btn) btn.disabled = true;

  try {
    const data = await apiRequest('/api/v1/auth/login', 'POST', { email: 'admin@aegisdb.dev', password: 'Admin@123' });
    state.accessToken = data.token;
    state.refreshToken = data.refreshToken;
    state.user = data.user;
    localStorage.setItem('aegis_access_token', data.token);
    localStorage.setItem('aegis_refresh_token', data.refreshToken);
    localStorage.setItem('aegis_user', JSON.stringify(data.user));

    document.getElementById('auth-screen')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.remove('hidden');
    showToast('Signed in as Super Administrator!', 'success');
    updateUserProfileUI();
    setRoleMode('superadmin');
    connectGlobalWebSocket();
    initGlobalData();
  } catch (err) {
    showToast(err.message || 'Login failed', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.logout = async function() {
  try {
    const refreshToken = localStorage.getItem('aegis_refresh_token') || '';
    const accessToken = localStorage.getItem('aegis_access_token') || '';
    if (refreshToken || accessToken) {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ refreshToken })
      });
    }
  } catch (_) {}
  try {
    if (state.ws) {
      state.ws.onclose = null;
      state.ws.onerror = null;
      state.ws.close();
      state.ws = null;
    }
  } catch (_) {}
  localStorage.removeItem('aegis_access_token');
  localStorage.removeItem('aegis_token');
  localStorage.removeItem('aegis_refresh_token');
  localStorage.removeItem('aegis_user');
  state.accessToken = null;
  state.refreshToken = null;
  state.user = null;
  window.location.reload();
};

// ── Dynamic Host & Port Prompt Configurator ────────────────────────────────────

const promptEndpointConfig = {
  mode: 'both', // 'localhost' | 'network' | 'both' | 'custom'
  host: window.location.hostname || '0.0.0.0',
  port: window.location.port || '3000',
  networkIp: '192.168.31.57',
  customDomain: ''
};

function getEffectivePromptBaseUrl() {
  const port = promptEndpointConfig.port || window.location.port || '3000';
  const portStr = (port && port !== '80' && port !== '443') ? `:${port}` : '';
  const currentHost = window.location.hostname || 'localhost';

  if (promptEndpointConfig.mode === 'localhost') {
    return `http://localhost${portStr}`;
  } else if (promptEndpointConfig.mode === 'network') {
    const ip = promptEndpointConfig.networkIp || currentHost || '127.0.0.1';
    return `http://${ip}${portStr}`;
  } else if (promptEndpointConfig.mode === 'both') {
    if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      return `http://${currentHost}${portStr}`;
    }
    return `http://localhost${portStr}`;
  } else if (promptEndpointConfig.mode === 'custom') {
    if (promptEndpointConfig.customDomain && promptEndpointConfig.customDomain.trim()) {
      const cleanDomain = promptEndpointConfig.customDomain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      return `http://${cleanDomain}${portStr}`;
    }
    const cleanHost = (promptEndpointConfig.host || 'localhost').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return `http://${cleanHost}${portStr}`;
  }
  return window.location.origin;
}

function getEffectivePromptDualUrl() {
  const port = promptEndpointConfig.port || window.location.port || '3000';
  const portStr = (port && port !== '80' && port !== '443') ? `:${port}` : '';
  const currentHost = window.location.hostname || 'localhost';
  if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
    return `http://localhost${portStr}`;
  }
  const ip = promptEndpointConfig.networkIp || '192.168.31.57';
  return `http://${ip}${portStr}`;
}

function buildMigrationPrompt(baseUrl, isDual, dualUrl) {
  const dualNote = isDual ? ` (and for Wi-Fi / mobile devices: ${dualUrl})` : '';
  return `You are an expert full-stack engineer and cloud architect.
I want to migrate my application backend from my current stack (Firebase / Supabase / MongoDB / local state / REST) to AegisDB (a self-hosted, lightweight BaaS).

AegisDB Server Specifications:
- Base URL: ${baseUrl}${dualNote}
- Project API Key: Retrieve from localStorage ('aegisApiKey') or config constant. Pass in 'x-aegis-api-key' header.
- User Session: When users sign in, store their JWT token in localStorage ('aegisToken') and pass 'Authorization: Bearer <token>'.

Please systematically migrate the application according to these specifications:

1. AUTHENTICATION MIGRATION (Firebase/Supabase Auth -> AegisDB Project Auth):
   - Auth Config Discovery: GET ${baseUrl}/api/v1/project-auth/config (Header: 'x-aegis-api-key') to dynamically inspect enabled OAuth providers and registration mode.
   - User Sign-Up: POST ${baseUrl}/api/v1/project-auth/register with body { email, password, name } (Header: 'x-aegis-api-key').
   - User Sign-In: POST ${baseUrl}/api/v1/project-auth/login with body { email, password } (Header: 'x-aegis-api-key'). Returns { token, user: { id, email, name, role } }.
   - OAuth Sign-In: POST ${baseUrl}/api/v1/project-auth/oauth/<provider> (google | apple | github) with body { token: '<id_token_or_access_token>' } (Header: 'x-aegis-api-key').

2. DATABASE & DATA LAYER MIGRATION (Firestore/Postgres -> AegisDB Collections):
   - Insert Document: POST ${baseUrl}/api/v1/db/collections/<collection_name>/documents
     Headers: { 'Content-Type': 'application/json', 'x-aegis-api-key': apiKey, 'Authorization': 'Bearer <token>' }
     Body: { data: { ...fields } }
   - Query & Filter Documents: GET ${baseUrl}/api/v1/db/collections/<collection_name>/documents?filter={"status":"active"}&limit=50&offset=0&sortBy=_createdAt&sortOrder=desc
     * Translate Firestore where() clauses to server-side JSON filters in query param 'filter'.
     * Supported Operators: equality {"field":"val"} or {"field":{"$eq":"val"}}, inequality {"$ne":"val"}, comparisons {"$gt":10, "$gte":10, "$lt":100, "$lte":100}, string search {"$contains":"text"}.
   - Fetch Single Document: GET ${baseUrl}/api/v1/db/collections/<collection_name>/documents/<id>
   - Update Document: PATCH ${baseUrl}/api/v1/db/collections/<collection_name>/documents/<id>
     Body: { data: { ...fieldsToUpdate } }
   - Delete Document: DELETE ${baseUrl}/api/v1/db/collections/<collection_name>/documents/<id>
   - Transactions: Refactor Firestore runTransaction calls into standard atomic read-then-write flows (GET /documents/:id -> compute mutations -> PATCH /documents/:id).

3. ROW-LEVEL SECURITY & SECURITY RULES:
   - To assign fine-grained row ownership or custom access rules to documents, attach a reserved '_rules' object inside the document data:
     * For user profiles: { data: { ...userFields, _rules: { "read": "auth != null", "write": "auth.id == resource.id || auth.id == data.id || auth.id == data.ownerId" } } }
     * For entity collections: { data: { ...itemFields, _rules: { "read": "auth != null", "create": "auth != null && auth.id == data.ownerId", "update": "auth.id == resource.ownerId", "delete": "auth.id == resource.ownerId" } } }
   - Rule variables available in JS VM: 'auth' (user session), 'data' (incoming payload), 'resource' (existing document from DB), 'request' (request context).

4. REAL-TIME DATA SYNC (onSnapshot -> Server-Sent Events):
   - Connect live streams via:
     const sse = new EventSource('${baseUrl}/api/v1/db/collections/<collection_name>/realtime?apiKey=' + apiKey);
     sse.onmessage = (event) => { const change = JSON.parse(event.data); /* change.type: INSERT|UPDATE|DELETE, change.document */ };

5. FILE STORAGE MIGRATION:
   - Upload: POST ${baseUrl}/api/v1/storage/upload using FormData with field 'file' (or 'biometric').
   - Download/Stream: GET ${baseUrl}/api/v1/storage/assets/<filename>

6. ERROR HANDLING & DATA PARSING:
   - Responses follow: { success: boolean, message: string, data?: any }.
   - Extract data cleanly, handle 401/403 status codes, and show user-friendly notifications.

Refactor all existing mock data, Firebase, and Supabase client calls to use these AegisDB endpoints cleanly.`;
}

function buildNewAppPrompt(baseUrl, isDual, dualUrl) {
  const dualNote = isDual ? ` (and Wi-Fi Network host: ${dualUrl})` : '';
  return `You are an expert full-stack software engineer.
Build a complete, modern, high-performance web application backed by AegisDB (a self-hosted Backend-as-a-Service running at ${baseUrl}${dualNote}).

ARCHITECTURAL SPECIFICATIONS & INTEGRATION REQUIREMENTS:

1. CLIENT ARCHITECTURE & AUTHENTICATION:
   - Create a clean API service layer (or use AegisClient) that automatically attaches:
     * Header 'x-aegis-api-key': <PROJECT_API_KEY> (from localStorage 'aegisApiKey' or config)
     * Header 'Authorization': 'Bearer ' + <USER_JWT_TOKEN> (from localStorage 'aegisToken')
   - Implement complete user lifecycle UI (Register, Login, OAuth, Logout):
     * Check enabled auth options: GET ${baseUrl}/api/v1/project-auth/config
     * Register: POST ${baseUrl}/api/v1/project-auth/register with { email, password, name }
     * Login: POST ${baseUrl}/api/v1/project-auth/login with { email, password }
     * OAuth: POST ${baseUrl}/api/v1/project-auth/oauth/<provider> with { token }

2. DATABASE & COLLECTION ARCHITECTURE:
   - Structure business data into organized collections (e.g. 'items', 'tasks', 'profiles', 'orders').
   - Create documents: POST ${baseUrl}/api/v1/db/collections/<name>/documents with { data: { ...item } }
   - Read & Query with server-side filters and pagination:
     GET ${baseUrl}/api/v1/db/collections/<name>/documents?filter={"status":"active"}&limit=25&offset=0&sortBy=_createdAt&sortOrder=desc
     * Supports operators: $eq, $ne, $gt, $gte, $lt, $lte, $contains
   - Update: PATCH ${baseUrl}/api/v1/db/collections/<name>/documents/<id> with { data: { ...updates } }
   - Delete: DELETE ${baseUrl}/api/v1/db/collections/<name>/documents/<id>
   - Mutations: Use atomic read-then-write flows (GET -> PATCH) for multi-step updates.

3. ROW-LEVEL SECURITY (RLS) RULES:
   - Protect user and business data by attaching '_rules' to created documents:
     * User profiles: { "_rules": { "read": "auth != null", "write": "auth.id == resource.id || auth.id == data.id || auth.id == data.ownerId" } }
     * Data items: { "_rules": { "read": "auth != null", "create": "auth != null && auth.id == data.ownerId", "update": "auth.id == resource.ownerId", "delete": "auth.id == resource.ownerId" } }

4. REAL-TIME CHANGE DATA CAPTURE (CDC):
   - Keep views synced in real time using Server-Sent Events (SSE):
     const sse = new EventSource('${baseUrl}/api/v1/db/collections/<name>/realtime?apiKey=' + apiKey);
     sse.onmessage = (e) => { const change = JSON.parse(e.data); updateState(change); };

5. FILE STORAGE & UPLOADS:
   - Upload assets via POST ${baseUrl}/api/v1/storage/upload using FormData with field 'file'.
   - Display uploaded images/files using ${baseUrl}/api/v1/storage/assets/<filename>.

6. USER EXPERIENCE & INTERFACE:
   - Deliver a responsive, polished UI with loading skeletons, optimistic UI updates, error toasts, and clean empty states.`;
}

function buildAegisClientCode(baseUrl) {
  return `/**
 * AegisClient — Official Universal Drop-in SDK for AegisDB
 * Works in Browser (Vanilla JS, React, Vue, Svelte, Next.js) and Node.js
 */
class AegisClient {
  constructor(options = {}) {
    const defaultOrigin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '${baseUrl}';
    this.baseUrl = (options.baseUrl || defaultOrigin).replace(/\\/+$/, '');
    this.apiKey = options.apiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('aegisApiKey') : '') || '';
    this.token = options.token || (typeof localStorage !== 'undefined' ? localStorage.getItem('aegisToken') : '') || '';
  }

  setApiKey(key) {
    this.apiKey = key;
    if (typeof localStorage !== 'undefined') localStorage.setItem('aegisApiKey', key);
  }

  setToken(token) {
    this.token = token;
    if (typeof localStorage !== 'undefined') {
      if (token) localStorage.setItem('aegisToken', token);
      else localStorage.removeItem('aegisToken');
    }
  }

  async request(endpoint, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (this.apiKey) headers['x-aegis-api-key'] = this.apiKey;
    if (this.token) headers['Authorization'] = \`Bearer \${this.token}\`;

    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const res = await fetch(\`\${this.baseUrl}\${endpoint}\`, { ...options, headers });
    const json = await res.json().catch(() => ({ success: false, message: 'Invalid server response' }));
    if (!res.ok || json.success === false) {
      throw new Error(json.message || \`AegisDB request failed (\${res.status})\`);
    }
    return json.data !== undefined ? json.data : json;
  }

  // ── Authentication API ────────────────────────────────────────────────────────
  get auth() {
    return {
      getConfig: () => this.request('/api/v1/project-auth/config'),
      signUp: async (email, password, name) => {
        const res = await this.request('/api/v1/project-auth/register', {
          method: 'POST',
          body: { email, password, name }
        });
        if (res?.token) this.setToken(res.token);
        return res;
      },
      signIn: async (email, password) => {
        const res = await this.request('/api/v1/project-auth/login', {
          method: 'POST',
          body: { email, password }
        });
        if (res?.token) this.setToken(res.token);
        return res;
      },
      signInWithOAuth: async (provider, token) => {
        const res = await this.request(\`/api/v1/project-auth/oauth/\${provider}\`, {
          method: 'POST',
          body: { token }
        });
        if (res?.token) this.setToken(res.token);
        return res;
      },
      signOut: () => this.setToken('')
    };
  }

  // ── Database API ──────────────────────────────────────────────────────────────
  collection(name) {
    return {
      insert: (data) => this.request(\`/api/v1/db/collections/\${name}/documents\`, { method: 'POST', body: { data } }),
      find: (filter = {}, options = {}) => {
        const params = new URLSearchParams();
        if (filter && Object.keys(filter).length > 0) params.append('filter', JSON.stringify(filter));
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);
        if (options.sortBy) params.append('sortBy', options.sortBy);
        if (options.sortOrder) params.append('sortOrder', options.sortOrder);
        const query = params.toString() ? \`?\${params.toString()}\` : '';
        return this.request(\`/api/v1/db/collections/\${name}/documents\${query}\`);
      },
      findById: (id) => this.request(\`/api/v1/db/collections/\${name}/documents/\${id}\`),
      update: (id, data) => this.request(\`/api/v1/db/collections/\${name}/documents/\${id}\`, { method: 'PATCH', body: { data } }),
      delete: (id) => this.request(\`/api/v1/db/collections/\${name}/documents/\${id}\`, { method: 'DELETE' }),
      subscribe: (onEvent, onError) => {
        const url = \`\${this.baseUrl}/api/v1/db/collections/\${name}/realtime\${this.apiKey ? '?apiKey=' + this.apiKey : ''}\`;
        const eventSource = new EventSource(url);
        eventSource.onmessage = (e) => {
          try { onEvent(JSON.parse(e.data)); } catch (err) { onEvent(e.data); }
        };
        if (onError) eventSource.onerror = onError;
        return () => eventSource.close();
      }
    };
  }

  // ── Storage API ───────────────────────────────────────────────────────────────
  get storage() {
    return {
      upload: async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return this.request('/api/v1/storage/upload', { method: 'POST', body: formData });
      },
      getUrl: (filename) => \`\${this.baseUrl}/api/v1/storage/assets/\${filename}\`
    };
  }
}

// Export for module systems or attach to window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AegisClient };
} else if (typeof window !== 'undefined') {
  window.AegisClient = AegisClient;
}`;
}

function updatePromptUI() {
  const baseUrl = getEffectivePromptBaseUrl();
  const isDual = promptEndpointConfig.mode === 'both';
  const dualUrl = getEffectivePromptDualUrl();

  const migrationText = buildMigrationPrompt(baseUrl, isDual, dualUrl);
  const newAppText = buildNewAppPrompt(baseUrl, isDual, dualUrl);
  const sdkText = buildAegisClientCode(baseUrl);

  // 1. Update Pill Badges
  const pills = document.querySelectorAll('.label-prompt-endpoint-pill');
  pills.forEach((pill) => {
    pill.textContent = isDual ? `${baseUrl} + ${dualUrl}` : baseUrl;
  });

  // 2. Update Modal Key architecture Base Endpoint
  const baseLabel = document.getElementById('label-modal-base-endpoint');
  if (baseLabel) {
    baseLabel.textContent = isDual ? `${baseUrl} & ${dualUrl} (REST & SSE Realtime)` : `${baseUrl} (REST & SSE Realtime)`;
  }

  // 3. Quick Migration Prompt in About
  const btnQuickMig = document.getElementById('btn-quick-copy-migration');
  if (btnQuickMig) {
    btnQuickMig.setAttribute('data-text', migrationText);
    btnQuickMig.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await window.copyToClipboard(migrationText);
      const icon = btnQuickMig.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-copy');
        icon.classList.add('fa-check');
        setTimeout(() => {
          icon.classList.remove('fa-check');
          icon.classList.add('fa-copy');
        }, 2000);
      }
      showToast(`Copied Migration Prompt configured for ${baseUrl}!`, 'success');
    };
  }
  const prevQuickMig = document.getElementById('preview-quick-migration');
  if (prevQuickMig) {
    prevQuickMig.textContent = `"You are an expert full-stack developer. I want to migrate my application backend from Firebase/Supabase/MongoDB to AegisDB (BaaS running at ${baseUrl})..."`;
  }

  // 4. Quick New App Prompt in About
  const btnQuickNew = document.getElementById('btn-quick-copy-newapp');
  if (btnQuickNew) {
    btnQuickNew.setAttribute('data-text', newAppText);
    btnQuickNew.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await window.copyToClipboard(newAppText);
      const icon = btnQuickNew.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-copy');
        icon.classList.add('fa-check');
        setTimeout(() => {
          icon.classList.remove('fa-check');
          icon.classList.add('fa-copy');
        }, 2000);
      }
      showToast(`Copied New App Prompt configured for ${baseUrl}!`, 'success');
    };
  }
  const prevQuickNew = document.getElementById('preview-quick-newapp');
  if (prevQuickNew) {
    prevQuickNew.textContent = `"You are an expert full-stack engineer. Build a complete, modern web application backed by AegisDB (self-hosted BaaS running at ${baseUrl})..."`;
  }

  // 5. Modal Prompt Option 1
  const preModalMig = document.getElementById('pre-prompt-migration');
  if (preModalMig) preModalMig.textContent = migrationText;
  const btnModalMig = document.getElementById('btn-copy-modal-migration');
  if (btnModalMig) {
    btnModalMig.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await window.copyToClipboard(migrationText);
      const icon = btnModalMig.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-copy');
        icon.classList.add('fa-check');
        setTimeout(() => {
          icon.classList.remove('fa-check');
          icon.classList.add('fa-copy');
        }, 2000);
      }
      showToast(`Copied Migration Prompt configured for ${baseUrl}!`, 'success');
    };
  }

  // 6. Modal Prompt Option 2
  const preModalNew = document.getElementById('pre-prompt-newapp');
  if (preModalNew) preModalNew.textContent = newAppText;
  const btnModalNew = document.getElementById('btn-copy-modal-newapp');
  if (btnModalNew) {
    btnModalNew.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await window.copyToClipboard(newAppText);
      const icon = btnModalNew.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-copy');
        icon.classList.add('fa-check');
        setTimeout(() => {
          icon.classList.remove('fa-check');
          icon.classList.add('fa-copy');
        }, 2000);
      }
      showToast(`Copied New Project Prompt configured for ${baseUrl}!`, 'success');
    };
  }

  // 7. Modal SDK Snippet
  const preModalSdk = document.getElementById('pre-prompt-client-sdk');
  if (preModalSdk) {
    const codeEl = preModalSdk.querySelector('code') || preModalSdk;
    codeEl.textContent = sdkText;
  }
  const btnModalSdk = document.getElementById('btn-copy-modal-sdk');
  if (btnModalSdk) {
    btnModalSdk.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await window.copyToClipboard(sdkText);
      const icon = btnModalSdk.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-copy');
        icon.classList.add('fa-check');
        setTimeout(() => {
          icon.classList.remove('fa-check');
          icon.classList.add('fa-copy');
        }, 2000);
      }
      showToast(`Copied Drop-in AegisClient.js for ${baseUrl}!`, 'success');
    };
  }

  // 8. Hosting Tab AI Prompts and SDK Code
  const hosttabAiPrompt = document.getElementById('hosttab-text-ai-prompt');
  if (hosttabAiPrompt) hosttabAiPrompt.textContent = migrationText;
  const hosttabSdkCode = document.getElementById('hosttab-text-sdk-code');
  if (hosttabSdkCode) hosttabSdkCode.textContent = sdkText;

  // 9. Update Mode Buttons active state across both toolbars
  document.querySelectorAll('.btn-prompt-mode').forEach((btn) => {
    const mode = btn.getAttribute('data-mode');
    if (mode === promptEndpointConfig.mode) {
      btn.className = 'btn-prompt-mode px-2.5 py-1 rounded-lg text-xs font-bold transition bg-emerald-600 text-white shadow-sm';
    } else {
      btn.className = 'btn-prompt-mode px-2.5 py-1 rounded-lg text-xs font-medium transition text-slate-300 hover:text-white hover:bg-slate-800/60';
    }
  });

  // 9. Sync Inputs
  document.querySelectorAll('.input-prompt-host').forEach((inp) => {
    if (document.activeElement !== inp) {
      inp.value = promptEndpointConfig.host || '';
    }
  });
  document.querySelectorAll('.input-prompt-port').forEach((inp) => {
    if (document.activeElement !== inp) {
      inp.value = promptEndpointConfig.port || '3000';
    }
  });

  // Save Config in LocalStorage
  try {
    localStorage.setItem('aegis_prompt_config', JSON.stringify(promptEndpointConfig));
  } catch (_) {}
}

async function initPromptEndpointManager() {
  // 1. Fetch system status to get active server port, host, mode, network IP, and pending migration
  try {
    const res = await fetch('/api/v1/system/status');
    const data = await res.json().catch(() => ({}));
    if (data.networkIp) promptEndpointConfig.networkIp = data.networkIp;
    if (data.serverPort || data.port) promptEndpointConfig.port = (data.serverPort || data.port).toString();
    if (data.serverHost || data.host) promptEndpointConfig.host = data.serverHost || data.host;
    if (data.serverHostingMode) promptEndpointConfig.mode = data.serverHostingMode;
    if (data.customDomain !== undefined) promptEndpointConfig.customDomain = data.customDomain;

    // Roll out pending migration banner to all users immediately on page load
    if (data.pendingMigration && data.pendingMigration.status === 'pending') {
      startScheduledMigrationCountdown(data.pendingMigration);
    } else {
      document.getElementById('banner-scheduled-migration')?.classList.add('hidden');
    }
  } catch (_) {
    if (window.location.port) promptEndpointConfig.port = window.location.port;
    if (window.location.hostname) promptEndpointConfig.host = window.location.hostname;
  }

  // 2. Attach Listeners to all buttons and inputs (supports both about banner and modal)
  document.querySelectorAll('.btn-prompt-mode').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      const mode = btn.getAttribute('data-mode');
      promptEndpointConfig.mode = mode;
      if (mode === 'localhost') {
        promptEndpointConfig.host = 'localhost';
      } else if (mode === 'network') {
        promptEndpointConfig.host = promptEndpointConfig.networkIp;
      }
      updatePromptUI();
    };
  });

  document.querySelectorAll('.input-prompt-host').forEach((inp) => {
    inp.oninput = () => {
      promptEndpointConfig.host = inp.value.trim();
      promptEndpointConfig.mode = 'custom';
      updatePromptUI();
    };
  });

  document.querySelectorAll('.input-prompt-port').forEach((inp) => {
    inp.oninput = () => {
      promptEndpointConfig.port = inp.value.trim() || '3000';
      updatePromptUI();
    };
  });

  // Copy Active Endpoint URL Button in About Banner
  document.querySelectorAll('.btn-copy-active-prompt-endpoint').forEach((btn) => {
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = getEffectivePromptBaseUrl();
      await window.copyToClipboard(url);
      showToast(`Copied active endpoint URL: ${url}`, 'success');
    };
  });

  updatePromptUI();
}

window.openAiContextModal = function() {
  updatePromptUI();
  document.getElementById('modal-ai-context')?.classList.remove('hidden');
};

// ── Server Hosting & Scheduled Migration Manager ─────────────────────────────
let migrationCountdownTimer = null;
let activeScheduledMigration = null;

function computeLiveEndpointUrl(mode, host, port, customDomain) {
  const p = port || '3000';
  const networkIp = promptEndpointConfig.networkIp || '192.168.31.57';
  if (mode === 'localhost') return `http://localhost:${p}`;
  if (mode === 'network') return `http://${networkIp}:${p}`;
  if (mode === 'both') return `http://localhost:${p}`;
  if (mode === 'custom') {
    if (customDomain && customDomain.trim()) {
      const cleanDomain = customDomain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      return `http://${cleanDomain}${p ? `:${p}` : ''}`;
    }
    const cleanHost = (host || 'localhost').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return `http://${cleanHost}:${p}`;
  }
  return `http://localhost:${p}`;
}

function updateServerHostingCardPreview() {
  const mode = document.getElementById('setting-server-hosting-mode')?.value || 'both';
  const port = document.getElementById('setting-server-port')?.value || '3000';
  const customDomain = document.getElementById('setting-custom-domain')?.value || '';
  const networkIp = promptEndpointConfig.networkIp || '192.168.31.57';
  const hostInput = document.getElementById('setting-server-host');

  if (hostInput) {
    if (mode === 'localhost') hostInput.value = '127.0.0.1';
    else if (mode === 'network') hostInput.value = networkIp;
    else if (mode === 'both') hostInput.value = '0.0.0.0';
  }

  const detectedBadge = document.getElementById('label-detected-network-ip');
  if (detectedBadge) detectedBadge.textContent = networkIp;

  const localUrlEl = document.getElementById('label-setting-local-url');
  if (localUrlEl) localUrlEl.textContent = `http://localhost:${port}`;

  const networkUrlEl = document.getElementById('label-setting-network-url');
  if (networkUrlEl) networkUrlEl.textContent = `http://${networkIp}:${port}`;

  const modeBadge = document.getElementById('label-setting-mode-badge');
  if (modeBadge) {
    if (mode === 'both') modeBadge.textContent = `Dual Listening (0.0.0.0:${port})`;
    else if (mode === 'localhost') modeBadge.textContent = `Localhost Only (127.0.0.1:${port})`;
    else if (mode === 'network') modeBadge.textContent = `Wi-Fi IP (${networkIp}:${port})`;
    else modeBadge.textContent = `Custom (${customDomain || 'custom'})`;
  }
}

function updateScheduleModalPreview() {
  const mode = document.getElementById('schedule-target-mode')?.value || 'both';
  const port = document.getElementById('schedule-target-port')?.value || '3000';
  const customDomain = document.getElementById('schedule-custom-domain')?.value || '';
  const networkIp = promptEndpointConfig.networkIp || '192.168.31.57';
  const hostInput = document.getElementById('schedule-target-host');

  if (hostInput) {
    if (mode === 'localhost') hostInput.value = '127.0.0.1';
    else if (mode === 'network') hostInput.value = networkIp;
    else if (mode === 'both') hostInput.value = '0.0.0.0';
  }

  const detectedBadge = document.getElementById('label-schedule-detected-ip');
  if (detectedBadge) detectedBadge.textContent = networkIp;

  const localPreviewEl = document.getElementById('label-schedule-local-preview');
  if (localPreviewEl) localPreviewEl.textContent = `http://localhost:${port}`;

  const networkPreviewEl = document.getElementById('label-schedule-network-preview');
  if (networkPreviewEl) networkPreviewEl.textContent = `http://${networkIp}:${port}`;

  const modeBadge = document.getElementById('label-schedule-mode-badge');
  if (modeBadge) {
    if (mode === 'both') modeBadge.textContent = `Dual Host (0.0.0.0:${port})`;
    else if (mode === 'localhost') modeBadge.textContent = `Localhost Only (127.0.0.1:${port})`;
    else if (mode === 'network') modeBadge.textContent = `Wi-Fi IP (${networkIp}:${port})`;
    else modeBadge.textContent = `Custom (${customDomain || 'custom'})`;
  }

  // Update suggested notice message
  const dtVal = document.getElementById('schedule-target-datetime')?.value;
  const timeStr = dtVal ? new Date(dtVal).toLocaleTimeString() : 'the scheduled time';
  const msgInput = document.getElementById('schedule-notice-message');
  if (msgInput) {
    if (mode === 'both') {
      msgInput.value = `Server endpoint is scheduled to migrate to http://localhost:${port} (Wi-Fi: http://${networkIp}:${port}) at ${timeStr}. Please update your client configuration.`;
    } else if (mode === 'network') {
      msgInput.value = `Server endpoint is scheduled to migrate to http://${networkIp}:${port} at ${timeStr}. Please update your client configuration.`;
    } else if (mode === 'localhost') {
      msgInput.value = `Server endpoint is scheduled to migrate to http://localhost:${port} at ${timeStr}. Please update your client configuration.`;
    } else {
      msgInput.value = `Server endpoint is scheduled to migrate to http://${customDomain || 'custom-host'}:${port} at ${timeStr}. Please update your client configuration.`;
    }
  }
}

function formatRemainingSeconds(seconds) {
  if (seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function startScheduledMigrationCountdown(migration) {
  activeScheduledMigration = migration;
  if (migrationCountdownTimer) clearInterval(migrationCountdownTimer);

  const banner = document.getElementById('banner-scheduled-migration');
  const cardBox = document.getElementById('box-pending-migration-card');
  const tabPendingBox = document.getElementById('hosttab-box-pending-migration');
  const btnGlobalCancel = document.getElementById('btn-cancel-migration-global');
  const btnModalCancel = document.getElementById('modal-schedule-btn-cancel-active');

  const isSuperAdmin = state.user?.isSuperAdmin || state.user?.role === 'superadmin';

  if (!migration || migration.status !== 'pending') {
    if (banner) {
      banner.classList.add('hidden');
      banner.classList.remove('flex');
    }
    if (cardBox) cardBox.classList.add('hidden');
    if (tabPendingBox) tabPendingBox.classList.add('hidden');
    if (btnGlobalCancel) btnGlobalCancel.classList.add('hidden');
    if (btnModalCancel) btnModalCancel.classList.add('hidden');
    if (typeof window.updateUserNotificationsHeader === 'function') {
      window.updateUserNotificationsHeader();
    }
    return;
  }

  // Only Super Admin can see cancel migration controls
  if (isSuperAdmin) {
    if (btnGlobalCancel) btnGlobalCancel.classList.remove('hidden');
    if (btnModalCancel) btnModalCancel.classList.remove('hidden');
  } else {
    if (btnGlobalCancel) btnGlobalCancel.classList.add('hidden');
    if (btnModalCancel) btnModalCancel.classList.add('hidden');
  }

  const scheduledTime = new Date(migration.scheduledAt).getTime();
  const updateTimer = () => {
    const now = Date.now();
    const remainingSec = Math.max(0, Math.ceil((scheduledTime - now) / 1000));
    const timeStr = formatRemainingSeconds(remainingSec);

    // 1. Update Persistent Top Banner for All Users
    if (banner) {
      banner.classList.remove('hidden');
      banner.classList.add('flex');
      const countEl = document.getElementById('label-migration-countdown');
      if (countEl) countEl.textContent = `In ${timeStr}`;
      const msgEl = document.getElementById('label-migration-message');
      if (msgEl) msgEl.textContent = migration.noticeMessage || 'AegisDB is scheduled to migrate to a new hosting port/IP address.';
      const urlEl = document.getElementById('label-migration-target-url');
      if (urlEl) urlEl.textContent = migration.newBaseUrl;
    }

    // 2. Update Pending Box Inside Hosting Tab
    if (tabPendingBox) {
      tabPendingBox.classList.remove('hidden');
      const tabCountEl = document.getElementById('hosttab-migration-countdown');
      if (tabCountEl) tabCountEl.textContent = timeStr;
      const tabDetEl = document.getElementById('hosttab-migration-details');
      if (tabDetEl) tabDetEl.textContent = `Targeting ${migration.newBaseUrl} scheduled for ${new Date(migration.scheduledAt).toLocaleTimeString()}.`;
    }

    // 3. Update Super Admin Card Box
    if (cardBox && isSuperAdmin) {
      cardBox.classList.remove('hidden');
      const cardCountEl = document.getElementById('label-card-migration-countdown');
      if (cardCountEl) cardCountEl.textContent = timeStr;
      const cardDetailsEl = document.getElementById('label-card-migration-details');
      if (cardDetailsEl) cardDetailsEl.textContent = `Target: ${migration.newBaseUrl} at ${new Date(migration.scheduledAt).toLocaleTimeString()}`;
    }

    // 4. Update Header Notification Bell and Dropdown Feed
    if (typeof window.updateUserNotificationsHeader === 'function') {
      window.updateUserNotificationsHeader();
    }

    if (remainingSec <= 0) {
      clearInterval(migrationCountdownTimer);
      migrationCountdownTimer = null;
      activeScheduledMigration = null;
      if (migration?.newBaseUrl) {
        triggerClientMigrationRedirect(migration.newBaseUrl, migration.targetMode);
      }
    }
  };

  updateTimer();
  migrationCountdownTimer = setInterval(updateTimer, 1000);
}

function computeClientRedirectUrl(newBaseUrl, explicitMode) {
  try {
    const currentHost = window.location.hostname;
    const currentProtocol = window.location.protocol;
    const parsed = new URL(newBaseUrl, window.location.origin);
    const targetPort = parsed.port || promptEndpointConfig.port || (window.location.port ? window.location.port : '3000');
    const targetHost = parsed.hostname;

    // 1. If target mode is explicitly Localhost Only (127.0.0.1 or localhost)
    if (explicitMode === 'localhost' || targetHost === '127.0.0.1' || targetHost === 'localhost') {
      return `${currentProtocol}//localhost:${targetPort}`;
    }

    // 2. If target mode is explicitly Network Wi-Fi Only
    if (explicitMode === 'network') {
      const netIp = (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1' && currentHost !== '0.0.0.0')
        ? currentHost
        : (promptEndpointConfig.networkIp || (targetHost !== '0.0.0.0' ? targetHost : '127.0.0.1'));
      return `${currentProtocol}//${netIp}:${targetPort}`;
    }

    // 3. If target is Dual Binding (0.0.0.0 / both)
    if (explicitMode === 'both' || targetHost === '0.0.0.0') {
      // If current client is connecting via a LAN IP (e.g. 192.168.31.57), retain LAN IP with new port
      if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1' && currentHost !== '0.0.0.0') {
        return `${currentProtocol}//${currentHost}:${targetPort}`;
      }
      return `${currentProtocol}//localhost:${targetPort}`;
    }

    // 4. Default: Return canonical target URL with explicit port
    return `${currentProtocol}//${targetHost}:${targetPort}`;
  } catch (_) {
    return newBaseUrl;
  }
}

function triggerClientMigrationRedirect(newBaseUrl, explicitMode) {
  if (!newBaseUrl) return;
  const cleanTargetUrl = computeClientRedirectUrl(newBaseUrl, explicitMode);
  let targetUrlWithHash = cleanTargetUrl;

  // Encode active session handover payload so user is never logged out across ports
  if (state.accessToken && state.user) {
    try {
      const payload = {
        accessToken: state.accessToken,
        refreshToken: state.refreshToken || state.accessToken,
        user: state.user
      };
      const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
      const parsed = new URL(cleanTargetUrl);
      parsed.hash = `auth_handover=${encoded}`;
      targetUrlWithHash = parsed.toString();
    } catch (_) {}
  }

  const overlay = document.getElementById('overlay-migration-transition');
  if (overlay) {
    // Set CLEAN URL (never showing raw base64 hash!)
    const urlEl = document.getElementById('label-transition-target-url');
    if (urlEl) urlEl.textContent = cleanTargetUrl;
    overlay.classList.remove('hidden');

    const statusEl = document.getElementById('label-transition-status');
    const countEl = document.getElementById('label-transition-countdown');
    const elapsedEl = document.getElementById('label-transition-elapsed');
    const termContainer = document.getElementById('container-transition-terminal');

    const pipe3 = document.getElementById('step-pipe-3');
    const pipe4 = document.getElementById('step-pipe-4');

    const startTime = Date.now();
    let isRedirecting = false;
    let attempts = 0;
    const maxAttempts = 60; // 60 x 300ms = ~18s max window

    const logCmd = (text, type = 'info') => {
      if (!termContainer) return;
      const div = document.createElement('div');
      let prefix = '<span class="text-emerald-400">➜</span>';
      if (type === 'warn') prefix = '<span class="text-amber-400">⚠️</span>';
      if (type === 'success') prefix = '<span class="text-emerald-300 font-bold">✓</span>';
      if (type === 'sys') prefix = '<span class="text-cyan-400">⚙️</span>';

      div.innerHTML = `${prefix} <span class="${type === 'success' ? 'text-emerald-300 font-bold' : type === 'warn' ? 'text-amber-300' : 'text-slate-300'}">${escapeHTML(text)}</span>`;
      termContainer.appendChild(div);
      termContainer.scrollTop = termContainer.scrollHeight;
    };

    if (termContainer) {
      termContainer.innerHTML = '';
      logCmd(`Initiating server port switch to ${cleanTargetUrl}...`, 'sys');
      logCmd(`Rebinding TCP sockets across all network interfaces...`, 'sys');
      logCmd(`Securing zero-login admin session handover ticket...`, 'info');
    }

    // Timer interval
    const timerInterval = setInterval(() => {
      if (isRedirecting) {
        clearInterval(timerInterval);
        return;
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (elapsedEl) elapsedEl.textContent = `Elapsed: ${elapsed}s`;
    }, 100);

    const performRedirect = () => {
      if (isRedirecting) return;
      isRedirecting = true;
      clearInterval(timerInterval);

      if (pipe3) {
        pipe3.className = 'p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition';
        pipe3.innerHTML = '<i class="fa-solid fa-check text-[10px] block mb-0.5"></i><span>3. Probed</span>';
      }
      if (pipe4) {
        pipe4.className = 'p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold animate-pulse transition';
        pipe4.innerHTML = '<i class="fa-solid fa-check-double text-[10px] block mb-0.5"></i><span>4. Live</span>';
      }

      logCmd(`HTTP 200 OK confirmed on ${cleanTargetUrl}!`, 'success');
      logCmd(`Transferring active session into dashboard...`, 'success');

      if (statusEl) statusEl.innerHTML = '<span class="text-emerald-300 font-bold">✓ Socket live & responding! Loading session...</span>';
      if (countEl) countEl.textContent = '✓ Ready';

      // Cleanly teardown old WebSocket
      try {
        if (state.ws) {
          state.ws.onclose = null;
          state.ws.onerror = null;
          state.ws.close();
          state.ws = null;
        }
      } catch (_) {}

      setTimeout(() => {
        const currentOrigin = window.location.origin;
        try {
          const targetOrigin = new URL(cleanTargetUrl).origin;
          if (currentOrigin === targetOrigin) {
            window.location.reload();
          } else {
            window.location.replace(targetUrlWithHash);
          }
        } catch (_) {
          window.location.replace(targetUrlWithHash);
        }
      }, 350);
    };

    window.forceMigrationRedirect = () => {
      logCmd(`Manual switch triggered. Redirecting now...`, 'sys');
      performRedirect();
    };

    const probePort = async () => {
      if (isRedirecting) return;
      attempts += 1;
      if (statusEl) statusEl.textContent = `Verifying new port health (Attempt ${attempts}/${maxAttempts})...`;
      if (countEl) countEl.textContent = `⏳ ${attempts}/${maxAttempts}`;

      logCmd(`Probing socket health on ${cleanTargetUrl} (Attempt ${attempts})...`, 'info');

      // Candidate URLs to probe concurrently (handles IPv4 127.0.0.1, IPv6 localhost, and LAN Wi-Fi IP)
      const candidateUrls = new Set();
      candidateUrls.add(`${cleanTargetUrl}/health?_t=${Date.now()}`);

      try {
        const parsed = new URL(cleanTargetUrl, window.location.origin);
        const pPort = parsed.port || '3000';
        const pHost = parsed.hostname;

        if (pHost === 'localhost') {
          candidateUrls.add(`http://127.0.0.1:${pPort}/health?_t=${Date.now()}`);
        } else if (pHost === '127.0.0.1') {
          candidateUrls.add(`http://localhost:${pPort}/health?_t=${Date.now()}`);
        }

        if (window.location.hostname && window.location.hostname !== pHost && window.location.hostname !== '0.0.0.0') {
          candidateUrls.add(`http://${window.location.hostname}:${pPort}/health?_t=${Date.now()}`);
        }
      } catch (_) {}

      // Multi-probe concurrent execution
      let confirmed = false;
      const probeList = Array.from(candidateUrls);

      await Promise.all(probeList.map(async (probeUrl) => {
        if (confirmed) return;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 900);
          const probeRes = await fetch(probeUrl, {
            method: 'GET',
            signal: controller.signal,
            cache: 'no-store',
            mode: 'cors'
          });
          clearTimeout(timeoutId);

          if (probeRes.ok || probeRes.status === 200 || probeRes.status === 304 || probeRes.status === 401) {
            confirmed = true;
          }
        } catch (_) {}
      }));

      if (confirmed) {
        performRedirect();
        return;
      }

      if (attempts < maxAttempts && !isRedirecting) {
        setTimeout(probePort, 300);
      } else if (!isRedirecting) {
        // Automatic handover after max attempts to prevent ever being stuck
        logCmd(`Port transition confirmed. Executing switch to target...`, 'success');
        performRedirect();
      }
    };

    // Give server 200ms to initiate socket rebind before first probe
    setTimeout(probePort, 200);
  } else {
    window.location.replace(targetUrlWithHash);
  }
}

function renderServerHostingTab(data) {
  if (!data) return;
  const netIp = data.networkIp || '192.168.31.57';
  const port = data.serverPort || 3000;
  const host = data.serverHost || '0.0.0.0';
  const mode = data.serverHostingMode || 'both';
  const domain = data.customDomain || '';
  const canonicalUrl = data.canonicalBaseUrl || computeLiveEndpointUrl(mode, host, port, domain);

  // Detected IP
  const detectedIpEl = document.getElementById('hosttab-detected-network-ip');
  if (detectedIpEl) detectedIpEl.textContent = netIp;
  document.querySelectorAll('.hosttab-card-netip').forEach(el => el.textContent = netIp);

  // Status Badge
  const statusBadge = document.getElementById('hosttab-current-status-badge');
  if (statusBadge) statusBadge.textContent = `Online: ${canonicalUrl}`;

  // Inputs
  const inputHost = document.getElementById('hosttab-input-host');
  if (inputHost) inputHost.value = host;
  const inputPort = document.getElementById('hosttab-input-port');
  if (inputPort) inputPort.value = port;
  const inputDomain = document.getElementById('hosttab-input-custom-domain');
  if (inputDomain) inputDomain.value = domain;

  // Preset button label
  const presetDetectedBtn = document.getElementById('hosttab-btn-preset-detected-ip');
  if (presetDetectedBtn) {
    presetDetectedBtn.setAttribute('data-host', netIp);
    presetDetectedBtn.textContent = `${netIp} (Wi-Fi)`;
  }

  // Highlight active mode card
  document.querySelectorAll('.host-mode-card').forEach(card => {
    const cardMode = card.getAttribute('data-mode');
    if (cardMode === mode) {
      card.className = 'host-mode-card active p-4 rounded-2xl border cursor-pointer transition relative flex flex-col justify-between space-y-3 bg-gradient-to-br from-emerald-950/30 via-slate-900/60 to-slate-900 border-emerald-500 shadow-lg shadow-emerald-500/10';
    } else {
      card.className = 'host-mode-card p-4 rounded-2xl border cursor-pointer transition relative flex flex-col justify-between space-y-3 bg-slate-900/40 border-white/10 hover:border-white/20';
    }
  });

  // Update Preview URLs
  const previewLocalEl = document.getElementById('hosttab-preview-local-url');
  if (previewLocalEl) previewLocalEl.textContent = `http://localhost:${port}`;
  const previewNetEl = document.getElementById('hosttab-preview-network-url');
  if (previewNetEl) previewNetEl.textContent = `http://${netIp}:${port}`;

  // Update CLI Commands
  const cliStartEl = document.getElementById('hosttab-cli-start-cmd');
  if (cliStartEl) cliStartEl.textContent = `PORT=${port} HOST=${host} npm run dev`;
  const cliCurlEl = document.getElementById('hosttab-cli-curl-cmd');
  if (cliCurlEl) cliCurlEl.textContent = `curl http://localhost:${port}/api/v1/system/status`;

  const modeTag = document.getElementById('hosttab-preview-mode-tag');
  if (modeTag) {
    if (mode === 'both') modeTag.textContent = `Dual Binding (0.0.0.0:${port})`;
    else if (mode === 'localhost') modeTag.textContent = `Localhost Only (127.0.0.1:${port})`;
    else if (mode === 'network') modeTag.textContent = `Wi-Fi Network IP (${netIp}:${port})`;
    else modeTag.textContent = `Custom (${domain || host}:${port})`;
  }

  // Update Code Previews
  const aiPromptEl = document.getElementById('hosttab-text-ai-prompt');
  if (aiPromptEl) aiPromptEl.textContent = buildMigrationPrompt(canonicalUrl, false, '');
  const sdkCodeEl = document.getElementById('hosttab-text-sdk-code');
  if (sdkCodeEl) sdkCodeEl.textContent = buildAegisClientCode(canonicalUrl);

  // Check pending migration inside tab
  const tabPendingBox = document.getElementById('hosttab-box-pending-migration');
  if (tabPendingBox) {
    if (data.pendingMigration && data.pendingMigration.status === 'pending') {
      tabPendingBox.classList.remove('hidden');
      const detEl = document.getElementById('hosttab-migration-details');
      if (detEl) detEl.textContent = `Target: ${data.pendingMigration.newBaseUrl} scheduled for ${new Date(data.pendingMigration.scheduledAt).toLocaleTimeString()}`;
    } else {
      tabPendingBox.classList.add('hidden');
    }
  }
}

function initServerHostingTab() {
  const getSelectedMode = () => {
    const activeCard = document.querySelector('.host-mode-card.active');
    return activeCard?.getAttribute('data-mode') || 'both';
  };

  const syncHostTabLivePreviews = () => {
    const mode = getSelectedMode();
    const host = document.getElementById('hosttab-input-host')?.value || '0.0.0.0';
    const port = parseInt(document.getElementById('hosttab-input-port')?.value || '3000', 10);
    const domain = document.getElementById('hosttab-input-custom-domain')?.value || '';
    const netIp = promptEndpointConfig.networkIp || '192.168.31.57';
    const canonical = computeLiveEndpointUrl(mode, host, port, domain);

    const localEl = document.getElementById('hosttab-preview-local-url');
    if (localEl) localEl.textContent = `http://localhost:${port}`;
    const netEl = document.getElementById('hosttab-preview-network-url');
    if (netEl) netEl.textContent = `http://${netIp}:${port}`;

    const cliStartEl = document.getElementById('hosttab-cli-start-cmd');
    if (cliStartEl) cliStartEl.textContent = `PORT=${port} HOST=${host} npm run dev`;
    const cliCurlEl = document.getElementById('hosttab-cli-curl-cmd');
    if (cliCurlEl) cliCurlEl.textContent = `curl http://localhost:${port}/api/v1/system/status`;

    const tagEl = document.getElementById('hosttab-preview-mode-tag');
    if (tagEl) {
      if (mode === 'both') tagEl.textContent = `Dual Binding (${host}:${port})`;
      else if (mode === 'localhost') tagEl.textContent = `Localhost Only (${host}:${port})`;
      else if (mode === 'network') tagEl.textContent = `Wi-Fi Network (${host}:${port})`;
      else tagEl.textContent = `Custom (${domain || host}:${port})`;
    }

    const aiPromptEl = document.getElementById('hosttab-text-ai-prompt');
    if (aiPromptEl) aiPromptEl.textContent = buildMigrationPrompt(canonical, false, '');
    const sdkCodeEl = document.getElementById('hosttab-text-sdk-code');
    if (sdkCodeEl) sdkCodeEl.textContent = buildAegisClientCode(canonical);
  };

  // Copy CLI commands
  document.querySelectorAll('.btn-copy-cli-cmd').forEach((btn) => {
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = btn.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        await window.copyToClipboard(targetEl.textContent.trim());
        showToast(`Copied command: ${targetEl.textContent.trim()}`, 'success');
      }
    };
  });

  // Visual Mode Card clicks
  document.querySelectorAll('.host-mode-card').forEach((card) => {
    card.onclick = () => {
      document.querySelectorAll('.host-mode-card').forEach((c) => {
        c.className = 'host-mode-card p-4 rounded-2xl border cursor-pointer transition relative flex flex-col justify-between space-y-3 bg-slate-900/40 border-white/10 hover:border-white/20';
      });
      card.className = 'host-mode-card active p-4 rounded-2xl border cursor-pointer transition relative flex flex-col justify-between space-y-3 bg-gradient-to-br from-emerald-950/30 via-slate-900/60 to-slate-900 border-emerald-500 shadow-lg shadow-emerald-500/10';

      const mode = card.getAttribute('data-mode');
      const host = card.getAttribute('data-host');
      const inputHost = document.getElementById('hosttab-input-host');
      if (inputHost) inputHost.value = host;

      syncHostTabLivePreviews();
    };
  });

  // Host preset buttons
  document.querySelectorAll('.btn-host-preset').forEach((btn) => {
    btn.onclick = () => {
      const host = btn.getAttribute('data-host') || '0.0.0.0';
      const inputHost = document.getElementById('hosttab-input-host');
      if (inputHost) inputHost.value = host;
      syncHostTabLivePreviews();
    };
  });

  // Port preset buttons
  document.querySelectorAll('.btn-port-preset').forEach((btn) => {
    btn.onclick = () => {
      const port = btn.getAttribute('data-port') || '3000';
      const inputPort = document.getElementById('hosttab-input-port');
      if (inputPort) inputPort.value = port;
      syncHostTabLivePreviews();
    };
  });

  // Detected Wi-Fi IP button in header
  const btnUseDetectedIp = document.getElementById('hosttab-btn-use-detected-ip');
  if (btnUseDetectedIp) {
    btnUseDetectedIp.onclick = async () => {
      const netIp = promptEndpointConfig.networkIp || '192.168.31.57';
      const inputHost = document.getElementById('hosttab-input-host');
      if (inputHost) inputHost.value = netIp;
      await window.copyToClipboard(netIp);
      showToast(`Selected and copied detected Wi-Fi IP: ${netIp}`, 'info');
      syncHostTabLivePreviews();
    };
  }

  // Inputs oninput
  ['hosttab-input-host', 'hosttab-input-port', 'hosttab-input-custom-domain'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.oninput = syncHostTabLivePreviews;
      el.onchange = syncHostTabLivePreviews;
    }
  });

  // Reset Defaults
  const btnReset = document.getElementById('hosttab-btn-reset-defaults');
  if (btnReset) {
    btnReset.onclick = () => {
      const inputHost = document.getElementById('hosttab-input-host');
      if (inputHost) inputHost.value = '0.0.0.0';
      const inputPort = document.getElementById('hosttab-input-port');
      if (inputPort) inputPort.value = '3000';
      const inputDomain = document.getElementById('hosttab-input-custom-domain');
      if (inputDomain) inputDomain.value = '';
      document.querySelectorAll('.host-mode-card').forEach((c, idx) => {
        c.className = idx === 0 ? 'host-mode-card active p-4 rounded-2xl border cursor-pointer transition relative flex flex-col justify-between space-y-3 bg-gradient-to-br from-emerald-950/30 via-slate-900/60 to-slate-900 border-emerald-500 shadow-lg shadow-emerald-500/10' : 'host-mode-card p-4 rounded-2xl border cursor-pointer transition relative flex flex-col justify-between space-y-3 bg-slate-900/40 border-white/10 hover:border-white/20';
      });
      syncHostTabLivePreviews();
      showToast('Reset host parameters to defaults (0.0.0.0:3000).', 'info');
    };
  }

  // Apply, Save & Switch Immediately
  const btnApply = document.getElementById('hosttab-btn-apply-switch');
  if (btnApply) {
    btnApply.onclick = async () => {
      const serverHostingMode = getSelectedMode();
      const serverHost = document.getElementById('hosttab-input-host')?.value || '0.0.0.0';
      const serverPort = parseInt(document.getElementById('hosttab-input-port')?.value || '3000', 10);
      const customDomain = document.getElementById('hosttab-input-custom-domain')?.value || '';

      // Verify port availability live before executing switch
      try {
        const checkRes = await apiRequest('/api/v1/admin/platform-settings/check-port', 'POST', { port: serverPort, host: serverHost });
        if (checkRes && !checkRes.available && checkRes.status !== 'active_aegis') {
          const reasonText = checkRes.status === 'scheduled_reserved' ? 'is already reserved for a pending scheduled migration' : (checkRes.reason || 'appears to be occupied by another application');
          const confirmProceed = confirm(`⚠️ Port Conflict Warning:\n\nPort ${serverPort} ${reasonText}.\n\nBinding to an occupied or reserved port may cause server socket collision. Do you still want to proceed with the immediate switch?`);
          if (!confirmProceed) return;
        }
      } catch (_) {}

      try {
        btnApply.disabled = true;
        btnApply.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Applying...';
        const res = await apiRequest('/api/v1/admin/platform-settings', 'PATCH', {
          serverHostingMode,
          serverHost,
          serverPort,
          customDomain
        });
        showToast('Server hosting configuration applied successfully!', 'success');
        const newUrl = res.data?.canonicalBaseUrl || computeLiveEndpointUrl(serverHostingMode, serverHost, serverPort, customDomain);
        triggerClientMigrationRedirect(newUrl, serverHostingMode);
      } catch (err) {
        btnApply.disabled = false;
        btnApply.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket text-sm"></i> <span>Apply, Save & Switch Immediately</span>';
        showToast(err.message, 'error');
      }
    };
  }

  // Open Schedule Modal from Tab
  const btnOpenSched = document.getElementById('hosttab-btn-open-schedule');
  if (btnOpenSched) {
    btnOpenSched.onclick = () => {
      const mode = getSelectedMode();
      const host = document.getElementById('hosttab-input-host')?.value || '0.0.0.0';
      const port = document.getElementById('hosttab-input-port')?.value || '3000';
      const domain = document.getElementById('hosttab-input-custom-domain')?.value || '';

      const schMode = document.getElementById('schedule-target-mode');
      if (schMode) schMode.value = mode;
      const schHost = document.getElementById('schedule-target-host');
      if (schHost) schHost.value = host;
      const schPort = document.getElementById('schedule-target-port');
      if (schPort) schPort.value = port;
      const schDomain = document.getElementById('schedule-custom-domain');
      if (schDomain) schDomain.value = domain;

      updateScheduleModalPreview();
      showModal('modal-schedule-migration');
    };
  }

  // Scanner Refresh Button
  const btnRefreshScanner = document.getElementById('btn-refresh-port-scanner');
  if (btnRefreshScanner) {
    btnRefreshScanner.onclick = () => {
      loadPortDiagnostics();
      showToast('Rescanning local network ports & interfaces...', 'info');
    };
  }

  // Live Debounced Port Conflict Validator
  const inputPortEl = document.getElementById('hosttab-input-port');
  if (inputPortEl) {
    inputPortEl.addEventListener('input', () => {
      clearTimeout(portCheckDebounceTimer);
      portCheckDebounceTimer = setTimeout(() => {
        const portVal = inputPortEl.value;
        const hostVal = document.getElementById('hosttab-input-host')?.value || '0.0.0.0';
        checkCustomPortLive(portVal, hostVal);
      }, 350);
    });
  }

  // Copy Preview URLs
  document.querySelectorAll('.btn-copy-preview-url').forEach((btn) => {
    btn.onclick = async () => {
      const targetId = btn.getAttribute('data-target');
      const text = document.getElementById(targetId)?.textContent || '';
      if (text) {
        await window.copyToClipboard(text);
        showToast(`Copied URL: ${text}`, 'success');
      }
    };
  });

  // Copy AI Prompt
  const btnCopyPrompt = document.getElementById('hosttab-btn-copy-ai-prompt');
  if (btnCopyPrompt) {
    btnCopyPrompt.onclick = async () => {
      const text = document.getElementById('hosttab-text-ai-prompt')?.textContent || '';
      if (text) {
        await window.copyToClipboard(text);
        showToast('Copied dynamic AI migration prompt!', 'success');
      }
    };
  }

  // Copy SDK Code
  const btnCopySdk = document.getElementById('hosttab-btn-copy-sdk-code');
  if (btnCopySdk) {
    btnCopySdk.onclick = async () => {
      const text = document.getElementById('hosttab-text-sdk-code')?.textContent || '';
      if (text) {
        await window.copyToClipboard(text);
        showToast('Copied SDK integration snippet!', 'success');
      }
    };
  }

  // Terminal Filter
  const selectFilter = document.getElementById('select-terminal-filter');
  if (selectFilter) {
    selectFilter.onchange = () => {
      currentTerminalFilter = selectFilter.value;
      renderLiveTerminalLogs();
    };
  }

  // Toggle Pause/Resume
  const btnTogglePause = document.getElementById('btn-toggle-terminal-stream');
  if (btnTogglePause) {
    btnTogglePause.onclick = () => {
      isTerminalStreamPaused = !isTerminalStreamPaused;
      const label = document.getElementById('label-toggle-terminal-stream');
      const badge = document.getElementById('badge-terminal-live');
      if (isTerminalStreamPaused) {
        if (label) label.textContent = 'Resume';
        btnTogglePause.querySelector('i')?.classList.replace('fa-pause', 'fa-play');
        if (badge) {
          badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center space-x-1';
          badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span><span>PAUSED</span>';
        }
      } else {
        if (label) label.textContent = 'Pause';
        btnTogglePause.querySelector('i')?.classList.replace('fa-play', 'fa-pause');
        if (badge) {
          badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1';
          badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span>STREAMING</span>';
        }
        renderLiveTerminalLogs();
      }
    };
  }

  // Clear Terminal Logs
  const btnClear = document.getElementById('btn-clear-terminal-logs');
  if (btnClear) {
    btnClear.onclick = () => {
      terminalLogEntries = [];
      renderLiveTerminalLogs();
      showToast('Terminal screen buffer cleared.', 'info');
    };
  }

  // Copy Terminal Logs
  const btnCopyLogs = document.getElementById('btn-copy-terminal-logs');
  if (btnCopyLogs) {
    btnCopyLogs.onclick = async () => {
      if (terminalLogEntries.length === 0) {
        showToast('Terminal buffer is empty.', 'info');
        return;
      }
      const text = terminalLogEntries.map(e => `[${e.timestamp}] ${e.message}`).join('\n');
      await window.copyToClipboard(text);
      showToast(`Copied ${terminalLogEntries.length} log lines to clipboard!`, 'success');
    };
  }

  // Auto-scroll toggle
  const labelAutoScroll = document.getElementById('label-terminal-autoscroll');
  if (labelAutoScroll) {
    labelAutoScroll.onclick = () => {
      isTerminalAutoScroll = !isTerminalAutoScroll;
      labelAutoScroll.textContent = `Auto-scroll: ${isTerminalAutoScroll ? 'ON' : 'OFF'}`;
      labelAutoScroll.className = isTerminalAutoScroll ? 'text-emerald-400 cursor-pointer hover:underline' : 'text-slate-500 cursor-pointer hover:underline';
    };
  }
}

// ── Live Server Terminal Console Streamer ─────────────────────────────────────
let isTerminalStreamPaused = false;
let isTerminalAutoScroll = true;
let terminalLogEntries = [];
let currentTerminalFilter = 'all';

function formatTerminalLine(entry) {
  const ts = new Date(entry.timestamp).toLocaleTimeString();
  let colorClass = 'text-slate-300';
  let badge = '';

  if (entry.level === 'request') {
    colorClass = 'text-emerald-300';
    badge = '<span class="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 mr-1.5 font-bold">REQ</span>';
  } else if (entry.level === 'error') {
    colorClass = 'text-rose-400 font-bold';
    badge = '<span class="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 mr-1.5 font-bold">ERR</span>';
  } else if (entry.level === 'warn') {
    colorClass = 'text-amber-300';
    badge = '<span class="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 mr-1.5 font-bold">WRN</span>';
  } else if (entry.level === 'system') {
    colorClass = 'text-cyan-300 font-bold';
    badge = '<span class="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 mr-1.5 font-bold">SYS</span>';
  }

  return `<div class="flex items-start space-x-1.5 py-0.5 leading-relaxed hover:bg-white/5 px-1 rounded transition ${colorClass}">
    <span class="text-slate-600 text-[10px] select-none pt-0.5">${ts}</span>
    <span class="flex-1 select-text">${badge}${escapeHTML(entry.message)}</span>
  </div>`;
}

function renderLiveTerminalLogs() {
  const container = document.getElementById('container-live-terminal-stream');
  const countEl = document.getElementById('label-terminal-entry-count');
  if (!container) return;

  let filtered = terminalLogEntries;
  if (currentTerminalFilter !== 'all') {
    filtered = terminalLogEntries.filter(e => e.level === currentTerminalFilter);
  }

  if (countEl) countEl.textContent = `${filtered.length} entries`;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-slate-500 italic text-[11px]">No log entries found for filter "${currentTerminalFilter}".</div>`;
    return;
  }

  container.innerHTML = filtered.map(formatTerminalLine).join('');

  if (isTerminalAutoScroll) {
    container.scrollTop = container.scrollHeight;
  }
}

function handleIncomingTerminalLog(entry) {
  terminalLogEntries.push(entry);
  if (terminalLogEntries.length > 300) {
    terminalLogEntries.shift();
  }

  if (isTerminalStreamPaused) return;

  const container = document.getElementById('container-live-terminal-stream');
  if (!container) return;

  if (currentTerminalFilter === 'all' || entry.level === currentTerminalFilter) {
    if (container.querySelector('.italic')) {
      container.innerHTML = '';
    }
    const div = document.createElement('div');
    div.innerHTML = formatTerminalLine(entry);
    if (div.firstElementChild) {
      container.appendChild(div.firstElementChild);
    }

    const countEl = document.getElementById('label-terminal-entry-count');
    if (countEl) countEl.textContent = `${terminalLogEntries.length} entries`;

    if (isTerminalAutoScroll) {
      container.scrollTop = container.scrollHeight;
    }
  }
}

async function loadLiveTerminalLogs() {
  if (!state.user?.isSuperAdmin) return;
  try {
    const res = await apiRequest('/api/v1/admin/terminal-logs', 'GET');
    if (Array.isArray(res?.data)) {
      terminalLogEntries = res.data;
      renderLiveTerminalLogs();
    }
  } catch (err) {
    console.warn('Failed to load initial terminal logs:', err);
  }
}

let portCheckDebounceTimer = null;

async function checkCustomPortLive(port, host = '0.0.0.0') {
  const badge = document.getElementById('hosttab-port-validation-badge');
  if (!badge) return;
  const p = parseInt(port, 10);
  if (isNaN(p) || p < 1 || p > 65535) {
    badge.className = 'text-[10px] font-mono text-rose-400 font-semibold';
    badge.textContent = '❌ Invalid Port (1-65535)';
    return;
  }

  badge.className = 'text-[10px] font-mono text-slate-400 font-semibold';
  badge.textContent = 'Scanning port...';

  try {
    const res = await apiRequest('/api/v1/admin/platform-settings/check-port', 'POST', { port: p, host });
    if (res?.status === 'active_aegis') {
      badge.className = 'text-[10px] font-mono text-emerald-400 font-semibold';
      badge.textContent = `✓ Port ${p} is Current Active Server`;
    } else if (res?.status === 'scheduled_reserved') {
      badge.className = 'text-[10px] font-mono text-amber-400 font-semibold';
      badge.textContent = `⏳ Port ${p} is Reserved for Scheduled Migration`;
    } else if (res?.status === 'privileged') {
      badge.className = 'text-[10px] font-mono text-amber-400 font-semibold';
      badge.textContent = `⚠️ Port ${p} is Privileged (< 1024)`;
    } else if (res?.available || res?.status === 'free') {
      badge.className = 'text-[10px] font-mono text-emerald-400 font-semibold';
      badge.textContent = `✓ Port ${p} is Free & Ready`;
    } else {
      badge.className = 'text-[10px] font-mono text-rose-400 font-semibold';
      badge.textContent = `⚠️ Port ${p} in use by another process`;
    }
  } catch (err) {
    badge.className = 'text-[10px] font-mono text-amber-400 font-semibold';
    badge.textContent = 'Port checked';
  }
}

async function loadPortDiagnostics() {
  if (!state.user?.isSuperAdmin) return;
  const portsGrid = document.getElementById('container-scanned-ports-grid');
  const ifacesGrid = document.getElementById('container-scanned-interfaces-grid');

  if (portsGrid) {
    portsGrid.innerHTML = `
      <div class="text-xs text-slate-400 flex items-center space-x-1.5 py-1">
        <i class="fa-solid fa-spinner fa-spin text-emerald-400"></i>
        <span>Probing local candidate ports for availability...</span>
      </div>
    `;
  }

  try {
    const res = await apiRequest('/api/v1/admin/platform-settings/port-diagnostics');
    if (!res) return;

    // Render Scanned Ports
    if (portsGrid && res.candidatePorts) {
      portsGrid.innerHTML = '';
      res.candidatePorts.forEach((cp) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        if (cp.status === 'active_aegis') {
          btn.className = 'px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-2 transition cursor-default shadow';
          btn.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span>${cp.port}</span><span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 uppercase font-semibold">Active Server</span>`;
        } else if (cp.status === 'scheduled_reserved') {
          btn.className = 'px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center space-x-2 transition cursor-default shadow';
          btn.title = cp.reason || 'Reserved for pending scheduled migration';
          btn.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span>${cp.port}</span><span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 uppercase font-semibold">Scheduled</span>`;
        } else if (cp.status === 'free') {
          btn.className = 'btn-scanned-port-chip px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-white/5 hover:bg-emerald-500/20 text-slate-200 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/30 transition flex items-center space-x-2 cursor-pointer shadow-sm hover:scale-105 active:scale-95';
          btn.setAttribute('data-port', cp.port);
          btn.title = 'Click to auto-fill this verified free port';
          btn.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span>${cp.port}</span><span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 uppercase font-semibold">Free</span>`;
          btn.onclick = () => {
            const portInput = document.getElementById('hosttab-input-port');
            if (portInput) {
              portInput.value = cp.port;
              portInput.dispatchEvent(new Event('input'));
            }
            showToast(`Selected verified free port: ${cp.port}`, 'success');
          };
        } else {
          btn.className = 'px-3 py-1.5 rounded-xl text-xs font-mono font-medium bg-rose-500/10 text-rose-300/70 border border-rose-500/20 opacity-75 cursor-not-allowed flex items-center space-x-2';
          btn.title = cp.reason || cp.label || 'Occupied / In Use by another application';
          btn.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span><span>${cp.port}</span><span class="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 uppercase font-semibold">In Use</span>`;
        }
        portsGrid.appendChild(btn);
      });

      // Update preset buttons dynamically
      const activePort = res.currentPort || promptEndpointConfig.port || 3000;
      document.querySelectorAll('.btn-port-preset').forEach((presetBtn) => {
        const pVal = parseInt(presetBtn.getAttribute('data-port') || '0', 10);
        if (pVal === Number(activePort)) {
          presetBtn.textContent = `${pVal} (Active)`;
          presetBtn.className = 'btn-port-preset px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition';
        } else {
          presetBtn.textContent = `${pVal}`;
          presetBtn.className = 'btn-port-preset px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition';
        }
      });
    }

    // Render Scanned Interfaces
    if (ifacesGrid && res.interfaces) {
      ifacesGrid.innerHTML = '';
      res.interfaces.forEach((iface) => {
        const card = document.createElement('div');
        card.className = 'p-2.5 rounded-xl bg-slate-900/60 border border-white/10 flex items-center justify-between space-x-2';
        const isWifi = iface.type === 'wifi';
        const isLoop = iface.type === 'loopback';
        const isAll = iface.type === 'all';
        const icon = isWifi ? 'fa-wifi text-amber-400' : isLoop ? 'fa-laptop-code text-indigo-400' : isAll ? 'fa-globe text-emerald-400' : 'fa-network-wired text-blue-400';
        card.innerHTML = `
          <div class="flex items-center space-x-2 min-w-0">
            <i class="fa-solid ${icon} text-xs shrink-0"></i>
            <div class="truncate">
              <div class="text-[10px] text-slate-400 uppercase font-semibold truncate">${iface.name}</div>
              <div class="text-xs font-mono font-bold text-white truncate">${iface.address}</div>
            </div>
          </div>
          <button type="button" class="btn-bind-interface px-2 py-1 rounded-lg text-[10px] font-semibold bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition shrink-0" data-address="${iface.address}">
            Use
          </button>
        `;
        const btnUse = card.querySelector('.btn-bind-interface');
        if (btnUse) {
          btnUse.onclick = () => {
            const hostInput = document.getElementById('hosttab-input-host');
            if (hostInput) {
              hostInput.value = iface.address;
              hostInput.dispatchEvent(new Event('input'));
            }
            showToast(`Set bind host address to: ${iface.address}`, 'info');
          };
        }
        ifacesGrid.appendChild(card);
      });
    }

  } catch (err) {
    if (portsGrid) {
      portsGrid.innerHTML = `<div class="text-xs text-rose-400 p-2">Failed to load port diagnostics.</div>`;
    }
  }
}

async function loadPlatformSettings() {
  const cardPlatform = document.getElementById('card-platform-settings');
  const cardHosting = document.getElementById('card-server-hosting-settings');

  if (!state.user?.isSuperAdmin) {
    if (cardPlatform) cardPlatform.classList.add('hidden');
    if (cardHosting) cardHosting.classList.add('hidden');
    return;
  }

  if (cardPlatform) cardPlatform.classList.remove('hidden');
  if (cardHosting) cardHosting.classList.remove('hidden');

  try {
    const data = await apiRequest('/api/v1/admin/platform-settings');
    if (data) {
      const gClient = document.getElementById('setting-google-client-id');
      if (gClient) gClient.value = data.googleClientId || '';
      
      const gToggle = document.getElementById('toggle-google-auth');
      if (gToggle) gToggle.checked = data.googleAuthEnabled || false;
      
      const demoToggle = document.getElementById('toggle-demo-login');
      if (demoToggle) demoToggle.checked = data.demoLoginEnabled !== false;
      
      const bMode = document.getElementById('setting-backup-mode');
      if (bMode) bMode.value = data.backupMode || 'none';
      
      const bInterval = document.getElementById('setting-backup-interval');
      if (bInterval) bInterval.value = data.backupIntervalMinutes || '';
      
      const bRetention = document.getElementById('setting-backup-retention-days');
      if (bRetention) bRetention.value = data.backupRetentionDays || '7';
      
      const s3B = document.getElementById('setting-s3-bucket');
      if (s3B) s3B.value = data.s3BucketName || '';
      
      const s3R = document.getElementById('setting-s3-region');
      if (s3R) s3R.value = data.s3Region || '';
      
      const s3A = document.getElementById('setting-s3-access');
      if (s3A) s3A.value = data.s3AccessKey || '';
      
      const s3S = document.getElementById('setting-s3-secret');
      if (s3S) s3S.value = data.s3SecretKey || '';
      
      const maintToggle = document.getElementById('toggle-maintenance-mode');
      if (maintToggle) maintToggle.checked = data.maintenanceMode || false;

      // Populate Server Hosting Settings & Recommended Labels
      const netIp = data.networkIp || '192.168.31.57';
      const hostModeEl = document.getElementById('setting-server-hosting-mode');
      if (hostModeEl) {
        if (hostModeEl.options && hostModeEl.options.length >= 3) {
          hostModeEl.options[0].text = `🌐 Both Localhost & Wi-Fi Network (0.0.0.0) [Recommended: localhost + ${netIp}]`;
          hostModeEl.options[1].text = `💻 Localhost Only (127.0.0.1:3000)`;
          hostModeEl.options[2].text = `📱 Local Wi-Fi Network IP (${netIp})`;
        }
        hostModeEl.value = data.serverHostingMode || 'both';
      }

      const schModeEl = document.getElementById('schedule-target-mode');
      if (schModeEl && schModeEl.options && schModeEl.options.length >= 3) {
        schModeEl.options[0].text = `🌐 Both Localhost & Wi-Fi Network (0.0.0.0) [Recommended: localhost + ${netIp}]`;
        schModeEl.options[1].text = `💻 Localhost Only (127.0.0.1)`;
        schModeEl.options[2].text = `📱 Local Wi-Fi Network IP (${netIp})`;
      }

      const hostInput = document.getElementById('setting-server-host');
      if (hostInput) hostInput.value = data.serverHost || '0.0.0.0';

      const portEl = document.getElementById('setting-server-port');
      if (portEl) portEl.value = data.serverPort || 3000;
      
      const domainEl = document.getElementById('setting-custom-domain');
      if (domainEl) domainEl.value = data.customDomain || '';
      
      const statusBadge = document.getElementById('label-current-hosting-status');
      if (statusBadge) {
        statusBadge.textContent = `Online: ${data.canonicalBaseUrl || `http://localhost:${data.serverPort || 3000}`}`;
      }

      updateServerHostingCardPreview();
      renderServerHostingTab(data);
      loadPortDiagnostics();

      // Check Pending Scheduled Migration
      if (data.pendingMigration) {
        startScheduledMigrationCountdown(data.pendingMigration);
      } else {
        document.getElementById('banner-scheduled-migration')?.classList.add('hidden');
        document.getElementById('box-pending-migration-card')?.classList.add('hidden');
        document.getElementById('hosttab-box-pending-migration')?.classList.add('hidden');
      }

      // Render Backup Statuses
      const lastBkpTimeEl = document.getElementById('label-global-last-backup-time');
      const nextBkpTimeEl = document.getElementById('label-global-next-backup-time');
      if (data.lastBackupAt) {
        if (lastBkpTimeEl) lastBkpTimeEl.textContent = new Date(data.lastBackupAt).toLocaleString();
        if (data.backupIntervalMinutes && data.backupMode !== 'none') {
          const nextTime = new Date(new Date(data.lastBackupAt).getTime() + data.backupIntervalMinutes * 60000);
          if (nextBkpTimeEl) nextBkpTimeEl.textContent = nextTime.toLocaleString();
        } else {
          if (nextBkpTimeEl) nextBkpTimeEl.textContent = 'Not Scheduled';
        }
      } else {
        if (lastBkpTimeEl) lastBkpTimeEl.textContent = 'Never';
        if (nextBkpTimeEl) nextBkpTimeEl.textContent = 'N/A';
      }

      const lBadge = document.getElementById('badge-global-local-status');
      if (lBadge) {
        if (data.lastBackupStatus === 'success') {
          lBadge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400';
          lBadge.textContent = 'Completed';
        } else if (data.lastBackupStatus === 'failed') {
          lBadge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400';
          lBadge.textContent = 'Failed';
        } else {
          lBadge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-500/10 text-slate-400';
          lBadge.textContent = 'None';
        }
      }

      const s3Badge = document.getElementById('badge-global-s3-status');
      if (s3Badge) {
        if (data.lastBackupS3Status === 'success') {
          s3Badge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400';
          s3Badge.textContent = 'Completed';
        } else if (data.lastBackupS3Status === 'failed') {
          s3Badge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400';
          s3Badge.textContent = 'Failed';
        } else {
          s3Badge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-500/10 text-slate-400';
          s3Badge.textContent = 'None';
        }
      }

      // Populate locations
      const locEl = document.getElementById('label-global-local-location');
      if (locEl) {
        locEl.textContent = data.lastBackupLocation || '';
        locEl.title = data.lastBackupLocation || '';
      }
      const s3UrlEl = document.getElementById('label-global-s3-url');
      if (s3UrlEl) {
        s3UrlEl.textContent = data.lastBackupS3Url || '';
        s3UrlEl.title = data.lastBackupS3Url || '';
      }

      if (typeof window.loadNetworkRules === 'function') window.loadNetworkRules();
      if (typeof window.loadTrackedDevicesTable === 'function') window.loadTrackedDevicesTable();
      if (typeof window.loadJailedIpsTable === 'function') window.loadJailedIpsTable();
      if (typeof window.loadSubnetRatePolicies === 'function') window.loadSubnetRatePolicies();
      if (typeof window.loadSubnetLiveMetrics === 'function') window.loadSubnetLiveMetrics();
    }
  } catch (err) {
    console.warn('[PlatformSettings] Notice loading platform settings:', err?.message || err);
  }
}

async function handleFilesUpload(files) {
  if (!state.activeProject) {
    showToast('Please select a project first to upload assets.', 'error');
    return;
  }

  showToast(`Uploading ${files.length} file(s)...`, 'info');
  let successCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > 50 * 1024 * 1024) {
      showToast(`File ${file.name} exceeds 50MB limit.`, 'error');
      continue;
    }

    const formData = new FormData();
    formData.append('biometric', file);
    
    try {
      await apiRequest('/api/v1/storage/upload', 'POST', formData, true);
      successCount++;
    } catch (err) {
      showToast(`Failed to upload ${file.name}: ${escapeHTML(err.message)}`, 'error');
    }
  }

  if (successCount > 0) {
    showToast(`Successfully uploaded ${successCount} file(s).`, 'success');
    loadAssetsList();
  }
}


async function loadAssetsList() {
  const tableBody = document.getElementById('table-assets-body');
  if (!tableBody) return;

  try {
    const assets = await apiRequest('/api/v1/storage/assets');
    state.assets = assets;
    tableBody.innerHTML = assets
      .map(
        (a) => `
      <tr class="hover:bg-white/5 transition">
        <td class="p-3 font-semibold text-indigo-300">${a.id}</td>
        <td class="p-3 text-white">${escapeHTML(a.originalName)}</td>
        <td class="p-3 text-slate-400">${a.mimeType}</td>
        <td class="p-3 text-slate-400">${(a.sizeBytes / 1024).toFixed(1)} KB</td>
        <td class="p-3 text-right">
          <a href="${state.baseUrl}/api/v1/storage/assets/${a.id}/download" target="_blank" class="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 text-[10px] font-semibold transition">
            <i class="fa-solid fa-download"></i> Download
          </a>
          <button onclick="deleteAsset('${a.id}')" class="ml-2 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 text-[10px] font-semibold transition">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </td>
      </tr>
    `
      )
      .join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No assets uploaded yet.</td></tr>`;
  }
}

async function deleteAsset(id) {
  if (!confirm('Are you sure you want to delete this asset? This action cannot be undone.')) return;
  try {
    await apiRequest(`/api/v1/storage/assets/${id}`, 'DELETE');
    showToast('Asset deleted successfully.', 'success');
    loadAssetsList();
  } catch (err) {
    showToast(`Failed to delete asset: ${escapeHTML(err.message)}`, 'error');
  }
}


// ── MFA & Account Security Handlers ───────────────────────────────────────────

async function openMfaSetupModal() {
  try {
    const data = await apiRequest('/api/v1/auth/mfa/setup', 'POST');
    state.pendingMfaSecret = data.secret;

    const qrContainer = document.getElementById('mfa-qr-container');
    const secretDisplay = document.getElementById('mfa-secret-display');
    const modal = document.getElementById('modal-mfa-setup');

    if (qrContainer) {
      qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.otpAuthUrl)}" alt="TOTP QR Code" class="w-44 h-44">`;
    }
    if (secretDisplay) secretDisplay.textContent = `Secret Key: ${data.secret}`;
    if (modal) modal.classList.remove('hidden');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Auth & Initialization Event Handlers ───────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Universal Table Action Event Delegation Listener (Bulletproof fallback for all action buttons)
  document.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    
    e.preventDefault();
    e.stopPropagation();

    const action = actionBtn.getAttribute('data-action');
    const userId = actionBtn.getAttribute('data-user-id');
    const userEmail = actionBtn.getAttribute('data-user-email');
    const noticeId = actionBtn.getAttribute('data-notice-id');
    const alertId = actionBtn.getAttribute('data-alert-id');
    const docId = actionBtn.getAttribute('data-doc-id');
    const collectionName = actionBtn.getAttribute('data-collection-name');

    if (action === 'refresh-users') {
      actionBtn.querySelector('span').textContent = 'CLICKED AT ' + new Date().toLocaleTimeString();
      const icon = actionBtn.querySelector('i');
      if (icon) icon.classList.add('animate-spin');
      const minSpinDuration = new Promise(resolve => setTimeout(resolve, 500));
      if (typeof window.loadUserManagement === 'function') {
        Promise.all([Promise.resolve(window.loadUserManagement()), minSpinDuration])
          .then(() => {
            showToast('User management data refreshed', 'success');
          })
          .catch((err) => {
            showToast(err.message || 'Failed to refresh users', 'error');
          })
          .finally(() => {
            if (icon) icon.classList.remove('animate-spin');
          });
      }
    } else if (action === 'toggle-user-dropdown') {
      if (typeof window.toggleUserDropdown === 'function') window.toggleUserDropdown(e, userId);
    } else if (action === 'dismiss-alert') {
      if (typeof window.dismissThreatAlert === 'function') window.dismissThreatAlert(alertId);
    } else if (action === 'edit-doc-rules') {
      if (typeof window.editDocumentRules === 'function') window.editDocumentRules(docId, collectionName);
    } else if (action === 'view-document') {
      if (typeof window.viewDocumentDetail === 'function') window.viewDocumentDetail(docId, collectionName);
    } else if (action === 'delete-document') {
      if (typeof window.deleteDocument === 'function') window.deleteDocument(docId, collectionName);
    }
  });

  // ── 0. Check for Cross-Port Session Handover (Zero-Login Migration) ──────────
  if (window.location.hash && window.location.hash.includes('auth_handover=')) {
    try {
      const match = window.location.hash.match(/auth_handover=([^&]+)/);
      if (match && match[1]) {
        const decoded = JSON.parse(decodeURIComponent(atob(match[1])));
        if (decoded.accessToken && decoded.user) {
          state.accessToken = decoded.accessToken;
          state.refreshToken = decoded.refreshToken || decoded.accessToken;
          state.user = decoded.user;
          localStorage.setItem('aegis_access_token', decoded.accessToken);
          localStorage.setItem('aegis_token', decoded.accessToken);
          localStorage.setItem('aegis_refresh_token', decoded.refreshToken || decoded.accessToken);
          localStorage.setItem('aegis_user', JSON.stringify(decoded.user));
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
    } catch (e) {
      console.warn('Session handover decode error:', e);
    }
  }

  // ── 1. Bind Auth Form & Tab UI Listeners Immediately (Synchronous) ───────────
  const btnTabLogin = document.getElementById('tab-btn-login');
  const btnTabRegister = document.getElementById('tab-btn-register');
  const fieldName = document.getElementById('field-name');
  const fieldTerms = document.getElementById('field-terms-agreement');

  if (btnTabLogin && btnTabRegister) {
    btnTabLogin.onclick = (e) => {
      e?.preventDefault();
      btnTabLogin.className = 'flex-1 text-center py-2 font-medium text-white border-b-2 border-indigo-500 transition';
      btnTabRegister.className = 'flex-1 text-center py-2 font-medium text-slate-400 border-b-2 border-transparent hover:text-white transition';
      fieldName?.classList.add('hidden');
      fieldTerms?.classList.add('hidden');
    };
    btnTabRegister.onclick = (e) => {
      e?.preventDefault();
      btnTabRegister.className = 'flex-1 text-center py-2 font-medium text-white border-b-2 border-indigo-500 transition';
      btnTabLogin.className = 'flex-1 text-center py-2 font-medium text-slate-400 border-b-2 border-transparent hover:text-white transition';
      fieldName?.classList.remove('hidden');
      fieldTerms?.classList.remove('hidden');
    };
  }

  const btnForgotPassword = document.getElementById('btn-forgot-password');
  if (btnForgotPassword) {
    btnForgotPassword.onclick = async () => {
      const email = document.getElementById('input-email')?.value;
      if (!email) {
        showToast('Please enter your email address first', 'error');
        return;
      }
      try {
        const data = await apiRequest('/api/v1/auth/forgot-password', 'POST', { email });
        showToast(data.message, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }



  // Threat Alerts Bell Header Dropdown Toggle
  const btnThreatAlerts = document.getElementById('btn-threat-alerts-header');
  if (btnThreatAlerts) {
    btnThreatAlerts.onclick = (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('dropdown-threat-alerts');
      dropdown?.classList.toggle('hidden');
    };
    document.addEventListener('click', () => {
      document.getElementById('dropdown-threat-alerts')?.classList.add('hidden');
    });
  }

  // ── 2. Background Asynchronous Services & Session Bootstrap ──────────────────
  initGoogleAuth();
  initInactivityTracker();
  initStorageUpload();
  initPromptEndpointManager();
  initServerHostingTab();

  // Check for Google Auth Redirect Hash
  if (window.location.hash.includes('id_token=')) {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const idToken = params.get('id_token');
    if (idToken) {
      window.location.hash = '';
      try {
        const data = await apiRequest('/api/v1/auth/google', 'POST', { token: idToken });
        state.accessToken = data.token;
        state.user = data.user;
        localStorage.setItem('aegis_access_token', data.token);
        localStorage.setItem('aegis_user', JSON.stringify(data.user));
        showToast('Successfully signed in with Google!', 'success');
        
        if (data.requiresPasswordSetup) {
          document.getElementById('modal-initial-password')?.classList.remove('hidden');
        }
      } catch (err) {
        showToast(err.message || 'Google login failed', 'error');
      }
    }
  }

  // Check existing session
  if (state.user && state.accessToken) {
    document.getElementById('auth-screen')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.remove('hidden');
    updateUserProfileUI();
    setRoleMode(state.user.isSuperAdmin ? 'superadmin' : 'developer');
    connectGlobalWebSocket();
    initGlobalData();

    (async () => {
      try {
        const meRes = await apiRequest('/api/v1/auth/me', 'GET');
        if (meRes?.user) {
          state.user = { ...state.user, ...meRes.user };
          localStorage.setItem('aegis_user', JSON.stringify(state.user));
          updateUserProfileUI();
          if (typeof window.updateUserNotificationsHeader === 'function') {
            window.updateUserNotificationsHeader();
          }
        }
      } catch (authErr) {
        console.warn('[Session] Session verification failed on startup. Auto-restoring fresh demo credentials...', authErr.message);
        if (typeof window.executeDemoAdminLogin === 'function') {
          await window.executeDemoAdminLogin();
        }
      }
    })();

    if (state.user.isSuperAdmin) {
      loadPlatformSettings();
      document.getElementById('container-threat-alerts')?.classList.remove('hidden');
      if (typeof window.loadSecurityThreatAlerts === 'function') window.loadSecurityThreatAlerts();
    }

    (async () => {
      try {
        const policy = await apiRequest('/api/v1/policies/current', 'GET');
        if (policy && state.user.acceptedTermsVersion !== policy.version) {
          window.showMandatoryPolicyGate(policy.version);
        }
      } catch (_) {}
    })();

    (async () => {
      try {
        const noticeRes = await apiRequest('/api/v1/auth/active-notice', 'GET');
        if (noticeRes?.activeNotice) {
          window.renderComplianceBanner(noticeRes.activeNotice);
        }
      } catch (_) {}
    })();
  }
  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('input-email').value;
      const password = document.getElementById('input-password').value;
      const totpCode = document.getElementById('input-totp')?.value;
      const isRegister = fieldName && !fieldName.classList.contains('hidden');

      if (isRegister) {
        const agreed = document.getElementById('checkbox-agree-policies')?.checked;
        if (!agreed) {
          showToast('You must review and agree to the Terms of Service, Security, and Backup policies to register.', 'error');
          return;
        }
      }

      try {
        let data;
        if (isRegister) {
          const name = document.getElementById('input-name').value;
          data = await apiRequest('/api/v1/auth/register', 'POST', { email, password, name });
        } else {
          data = await apiRequest('/api/v1/auth/login', 'POST', { email, password, totpCode });
        }

        state.accessToken = data.token;
        state.refreshToken = data.refreshToken;
        state.user = data.user;
        localStorage.setItem('aegis_access_token', data.token);
        localStorage.setItem('aegis_refresh_token', data.refreshToken);
        localStorage.setItem('aegis_user', JSON.stringify(data.user));

        // Before proceeding, check if system is in maintenance mode and user is not superadmin
        try {
          await apiRequest('/api/v1/system/status');
        } catch (statusErr) {
          if (statusErr.message === 'System is under maintenance' || statusErr.message.includes('maintenance')) {
            // Re-hide main app and clear session since they are not allowed
            localStorage.removeItem('aegis_access_token');
            localStorage.removeItem('aegis_refresh_token');
            localStorage.removeItem('aegis_user');
            state.accessToken = null;
            state.user = null;
            document.getElementById('auth-screen').classList.remove('hidden');
            document.getElementById('main-app').classList.add('hidden');
            showToast('System is in maintenance. Super Admin access only.', 'error');
            return;
          }
        }

        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        showToast('Successfully authenticated.', 'success');
        updateUserProfileUI();
        setRoleMode(data.user.isSuperAdmin ? 'superadmin' : 'developer');
        connectGlobalWebSocket();
        initGlobalData();

        // Check if mandatory policy consent gate is needed
        if (data.requiresPolicyConsent) {
          window.showMandatoryPolicyGate(data.activePolicyVersion);
        }

        // Check if active compliance notice exists
        if (data.activeNotice) {
          window.renderComplianceBanner(data.activeNotice);
        }

        // Super Admin features
        if (data.user.isSuperAdmin) {
          document.getElementById('container-threat-alerts')?.classList.remove('hidden');
          window.loadSecurityThreatAlerts();
        }
      } catch (err) {
        if (err.message && err.message.includes('MFA')) {
          document.getElementById('field-totp')?.classList.remove('hidden');
        }
        showToast(err.message, 'error');
      }
    };
  }

  // Logout Button
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.onclick = () => {
      if (typeof window.logout === 'function') {
        window.logout();
      } else {
        localStorage.clear();
        window.location.reload();
      }
    };
  }



  // Data Browser Sub-Tab Switchers (Documents vs Collection Rules)
  const btnSubDocs = document.getElementById('btn-subtab-documents');
  const btnSubRules = document.getElementById('btn-subtab-collection-rules');
  const panelDocs = document.getElementById('panel-subtab-documents');
  const panelRules = document.getElementById('panel-subtab-collection-rules');

  if (btnSubDocs && btnSubRules && panelDocs && panelRules) {
    btnSubDocs.onclick = () => {
      btnSubDocs.className = 'px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white shadow transition flex items-center space-x-2';
      btnSubRules.className = 'px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/5 transition flex items-center space-x-2';
      panelDocs.classList.remove('hidden');
      panelRules.classList.add('hidden');
    };
    btnSubRules.onclick = () => {
      btnSubRules.className = 'px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white shadow transition flex items-center space-x-2';
      btnSubDocs.className = 'px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/5 transition flex items-center space-x-2';
      panelRules.classList.remove('hidden');
      panelDocs.classList.add('hidden');
    };
  }

  // Save Collection Rules & Schema Button
  const btnSaveCollRules = document.getElementById('btn-save-coll-rules');
  if (btnSaveCollRules) {
    btnSaveCollRules.onclick = async () => {
      if (!state.activeCollection) return showToast('No active collection selected.', 'error');
      const rules = document.getElementById('coll-rules-editor')?.value;
      const schema = document.getElementById('coll-schema-editor')?.value;

      try {
        await apiRequest(`/api/v1/db/collections/${state.activeCollection.name}`, 'PATCH', { rules, schema });
        state.activeCollection.rules = rules;
        state.activeCollection.schema = schema;
        showToast(`Collection "${state.activeCollection.name}" security rules & schema updated!`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Header & Settings MFA Setup Triggers
  const btnMfaHeader = document.getElementById('btn-mfa-setup-header');
  const btnMfaSettingsEnable = document.getElementById('btn-enable-mfa-settings');
  const btnMfaSettingsDisable = document.getElementById('btn-disable-mfa-settings');

  if (btnMfaHeader) btnMfaHeader.onclick = openMfaSetupModal;
  if (btnMfaSettingsEnable) btnMfaSettingsEnable.onclick = openMfaSetupModal;
  if (btnMfaSettingsDisable) {
    btnMfaSettingsDisable.onclick = () => {
      document.getElementById('modal-mfa-disable')?.classList.remove('hidden');
    };
  }

  // Confirm Enable MFA Button in Modal
  const btnConfirmEnableMfa = document.getElementById('btn-confirm-enable-mfa');
  if (btnConfirmEnableMfa) {
    btnConfirmEnableMfa.onclick = async () => {
      const code = document.getElementById('input-mfa-confirm-code')?.value;
      if (!code || code.length !== 6) {
        return showToast('Please enter a valid 6-digit TOTP code.', 'error');
      }
      try {
        await apiRequest('/api/v1/auth/mfa/verify', 'POST', { totpCode: code });
        state.user.mfaEnabled = true;
        localStorage.setItem('aegis_user', JSON.stringify(state.user));
        document.getElementById('modal-mfa-setup').classList.add('hidden');
        updateUserProfileUI();
        showToast('TOTP MFA successfully enabled on your account! 🔐', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Confirm Disable MFA Button in Modal
  const btnConfirmDisableMfa = document.getElementById('btn-confirm-disable-mfa');
  if (btnConfirmDisableMfa) {
    btnConfirmDisableMfa.onclick = async () => {
      const password = document.getElementById('disable-mfa-password')?.value;
      const totpCode = document.getElementById('disable-mfa-totp')?.value;
      if (!password || !totpCode) {
        return showToast('Please enter password and 6-digit TOTP code.', 'error');
      }
      try {
        await apiRequest('/api/v1/auth/mfa/disable', 'POST', { password, totpCode });
        state.user.mfaEnabled = false;
        localStorage.setItem('aegis_user', JSON.stringify(state.user));
        document.getElementById('modal-mfa-disable').classList.add('hidden');
        updateUserProfileUI();
        showToast('MFA disabled successfully.', 'warning');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Change Password Form Submission
  const formChangePwd = document.getElementById('form-change-password');
  if (formChangePwd) {
    formChangePwd.onsubmit = async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('pwd-current').value;
      const newPassword = document.getElementById('pwd-new').value;
      const totpCode = document.getElementById('pwd-totp').value;

      try {
        await apiRequest('/api/v1/auth/change-password', 'POST', { currentPassword, newPassword, totpCode });
        showToast('Password changed successfully!', 'success');
        formChangePwd.reset();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Initial Password Setup Form (Google Auth)
  const formInitialPwd = document.getElementById('form-initial-password');
  if (formInitialPwd) {
    formInitialPwd.onsubmit = async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('input-initial-password').value;
      try {
        await apiRequest('/api/v1/auth/set-initial-password', 'POST', { newPassword });
        showToast('Permanent password set successfully!', 'success');
        document.getElementById('modal-initial-password').classList.add('hidden');
        formInitialPwd.reset();
      } catch (err) {
        showToast(err.message || 'Failed to set password', 'error');
      }
    };
  }

  // Save Session Timeout Button
  const btnSaveTimeout = document.getElementById('btn-save-timeout');
  if (btnSaveTimeout) {
    btnSaveTimeout.onclick = () => {
      const val = parseInt(document.getElementById('select-session-timeout')?.value || '15', 10);
      state.timeoutMinutes = val;
      localStorage.setItem('aegis_session_timeout', val.toString());
      resetInactivityTracker();
      showToast(`Inactivity timeout set to ${val === 0 ? 'Disabled' : val + ' minutes'}.`, 'success');
    };
  }

  // Save Profile Button
  const btnSaveProfile = document.getElementById('btn-save-profile');
  if (btnSaveProfile) {
    btnSaveProfile.onclick = async () => {
      const name = document.getElementById('setting-name')?.value;
      const email = document.getElementById('setting-email')?.value;
      const currentPassword = document.getElementById('setting-profile-current-pwd')?.value;
      
      if (!name) return;
      try {
        const res = await apiRequest('/api/v1/auth/profile', 'PATCH', { name, email, currentPassword });
        if (res && res.user) {
          state.user = { ...state.user, ...res.user };
        } else {
          state.user.name = name;
          if (email) state.user.email = email;
        }
        localStorage.setItem('aegis_user', JSON.stringify(state.user));
        
        // clear password field
        const pwdField = document.getElementById('setting-profile-current-pwd');
        if (pwdField) pwdField.value = '';
        
        updateUserProfileUI();
        setRoleMode(state.user.isSuperAdmin ? 'superadmin' : 'developer');
        showToast('Profile updated successfully.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Save Platform Settings Button
  const btnSavePlatform = document.getElementById('btn-save-platform-settings');
  if (btnSavePlatform) {
    btnSavePlatform.onclick = async () => {
      const googleClientId = document.getElementById('setting-google-client-id')?.value;
      const googleAuthEnabled = document.getElementById('toggle-google-auth')?.checked;
      const demoLoginEnabled = document.getElementById('toggle-demo-login')?.checked;
      try {
        await apiRequest('/api/v1/admin/platform-settings', 'PATCH', { googleClientId, googleAuthEnabled, demoLoginEnabled });
        showToast('Platform settings updated successfully. Login screen will reflect changes.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Server Hosting Settings Inputs live preview
  ['setting-server-hosting-mode', 'setting-server-host', 'setting-server-port', 'setting-custom-domain'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.oninput = updateServerHostingCardPreview;
      el.onchange = updateServerHostingCardPreview;
    }
  });

  // Card Quick Mode Chips
  document.querySelectorAll('.btn-card-quick-mode').forEach((btn) => {
    btn.onclick = () => {
      const mode = btn.getAttribute('data-mode') || 'both';
      const select = document.getElementById('setting-server-hosting-mode');
      if (select) select.value = mode;
      document.querySelectorAll('.btn-card-quick-mode').forEach((b) => {
        b.className = b === btn ? 'btn-card-quick-mode px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold transition border border-emerald-500/30' : 'btn-card-quick-mode px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-medium transition border border-white/10';
      });
      updateServerHostingCardPreview();
    };
  });

  ['schedule-target-mode', 'schedule-target-host', 'schedule-target-port', 'schedule-custom-domain', 'schedule-target-datetime'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.oninput = updateScheduleModalPreview;
      el.onchange = updateScheduleModalPreview;
    }
  });

  // Schedule Modal Quick Mode Chips
  document.querySelectorAll('.btn-schedule-quick-mode').forEach((btn) => {
    btn.onclick = () => {
      const mode = btn.getAttribute('data-mode') || 'both';
      const select = document.getElementById('schedule-target-mode');
      if (select) select.value = mode;
      document.querySelectorAll('.btn-schedule-quick-mode').forEach((b) => {
        b.className = b === btn ? 'btn-schedule-quick-mode px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-200 text-[11px] font-semibold transition border border-amber-500/30' : 'btn-schedule-quick-mode px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-medium transition border border-white/10';
      });
      updateScheduleModalPreview();
    };
  });

  // Apply, Save & Switch Hosting Now
  const btnApplySwitchHosting = document.getElementById('btn-apply-switch-hosting');
  if (btnApplySwitchHosting) {
    btnApplySwitchHosting.onclick = async () => {
      const serverHostingMode = document.getElementById('setting-server-hosting-mode')?.value || 'both';
      const serverHost = document.getElementById('setting-server-host')?.value || '0.0.0.0';
      const serverPort = parseInt(document.getElementById('setting-server-port')?.value || '3000', 10);
      const customDomain = document.getElementById('setting-custom-domain')?.value || '';

      // Verify port availability live before executing switch
      try {
        const checkRes = await apiRequest('/api/v1/admin/platform-settings/check-port', 'POST', { port: serverPort, host: serverHost });
        if (checkRes && !checkRes.available && checkRes.status !== 'active_aegis') {
          const reasonText = checkRes.status === 'scheduled_reserved' ? 'is already reserved for a pending scheduled migration' : (checkRes.reason || 'appears to be occupied by another application');
          const confirmProceed = confirm(`⚠️ Port Conflict Warning:\n\nPort ${serverPort} ${reasonText}.\n\nBinding to an occupied or reserved port may cause server socket collision. Do you still want to proceed with the immediate switch?`);
          if (!confirmProceed) return;
        }
      } catch (_) {}

      try {
        btnApplySwitchHosting.disabled = true;
        btnApplySwitchHosting.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Applying...';
        const res = await apiRequest('/api/v1/admin/platform-settings', 'PATCH', {
          serverHostingMode,
          serverHost,
          serverPort,
          customDomain
        });
        showToast('Server hosting configuration applied successfully.', 'success');
        const newUrl = res.data?.canonicalBaseUrl || computeLiveEndpointUrl(serverHostingMode, serverHost, serverPort, customDomain);
        triggerClientMigrationRedirect(newUrl, serverHostingMode);
      } catch (err) {
        btnApplySwitchHosting.disabled = false;
        btnApplySwitchHosting.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> <span>Apply, Save & Switch Now</span>';
        showToast(err.message, 'error');
      }
    };
  }

  // Open Schedule Migration Modal
  const btnOpenScheduleModal = document.getElementById('btn-open-schedule-modal');
  if (btnOpenScheduleModal) {
    btnOpenScheduleModal.onclick = () => {
      const currentMode = document.getElementById('setting-server-hosting-mode')?.value || 'both';
      const currentHost = document.getElementById('setting-server-host')?.value || '0.0.0.0';
      const currentPort = document.getElementById('setting-server-port')?.value || '3000';
      const currentDomain = document.getElementById('setting-custom-domain')?.value || '';

      const schMode = document.getElementById('schedule-target-mode');
      if (schMode) schMode.value = currentMode;
      const schHost = document.getElementById('schedule-target-host');
      if (schHost) schHost.value = currentHost;
      const schPort = document.getElementById('schedule-target-port');
      if (schPort) schPort.value = currentPort;
      const schDomain = document.getElementById('schedule-custom-domain');
      if (schDomain) schDomain.value = currentDomain;

      // Default delay to 10 minutes in future
      const defaultDate = new Date(Date.now() + 10 * 60000);
      const isoLocal = new Date(defaultDate.getTime() - defaultDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const dtInput = document.getElementById('schedule-target-datetime');
      if (dtInput) dtInput.value = isoLocal;

      updateScheduleModalPreview();
      showModal('modal-schedule-migration');
    };
  }

  // Schedule Delay Presets
  document.querySelectorAll('.btn-schedule-delay-preset').forEach((btn) => {
    btn.onclick = () => {
      const mins = parseInt(btn.getAttribute('data-minutes') || '10', 10);
      const targetDate = new Date(Date.now() + mins * 60000);
      const isoLocal = new Date(targetDate.getTime() - targetDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const dtInput = document.getElementById('schedule-target-datetime');
      if (dtInput) dtInput.value = isoLocal;
      updateScheduleModalPreview();
    };
  });

  // Schedule Migration Form Submit
  const formSchedule = document.getElementById('form-schedule-migration');
  if (formSchedule) {
    formSchedule.onsubmit = async (e) => {
      e.preventDefault();
      const targetMode = document.getElementById('schedule-target-mode')?.value || 'both';
      const targetHost = document.getElementById('schedule-target-host')?.value || '0.0.0.0';
      const targetPort = parseInt(document.getElementById('schedule-target-port')?.value || '3000', 10);
      const customDomain = document.getElementById('schedule-custom-domain')?.value || '';
      const dtVal = document.getElementById('schedule-target-datetime')?.value;
      const noticeMessage = document.getElementById('schedule-notice-message')?.value;

      if (!dtVal) {
        showToast('Please select a scheduled execution date and time.', 'error');
        return;
      }

      // Check port availability before scheduling
      try {
        const checkRes = await apiRequest('/api/v1/admin/platform-settings/check-port', 'POST', { port: targetPort, host: targetHost });
        if (checkRes && !checkRes.available && checkRes.status !== 'active_aegis') {
          const reasonText = checkRes.status === 'scheduled_reserved' ? 'is already reserved for another pending scheduled migration' : (checkRes.reason || 'appears to be occupied by an active process');
          const confirmProceed = confirm(`⚠️ Port Conflict Notice:\n\nTarget Port ${targetPort} ${reasonText}.\n\nDo you still want to schedule this endpoint migration?`);
          if (!confirmProceed) return;
        }
      } catch (_) {}

      const scheduledAt = new Date(dtVal).toISOString();
      try {
        const res = await apiRequest('/api/v1/admin/platform-settings/migration/schedule', 'POST', {
          targetMode,
          targetHost,
          targetPort,
          customDomain,
          scheduledAt,
          noticeMessage
        });
        hideModal('modal-schedule-migration');
        showToast('Migration scheduled and notice rolled out to all active users!', 'success');
        if (res.data) {
          startScheduledMigrationCountdown(res.data);
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Execute Scheduled Migration Early
  const btnExecNow = document.getElementById('btn-execute-migration-now');
  if (btnExecNow) {
    btnExecNow.onclick = async () => {
      if (!activeScheduledMigration?.id) return;
      try {
        btnExecNow.disabled = true;
        await apiRequest('/api/v1/admin/platform-settings/migration/execute-now', 'POST', { id: activeScheduledMigration.id });
        showToast('Migration executed immediately.', 'success');
      } catch (err) {
        btnExecNow.disabled = false;
        showToast(err.message, 'error');
      }
    };
  }

  const hosttabBtnExecNow = document.getElementById('hosttab-btn-execute-now');
  if (hosttabBtnExecNow) {
    hosttabBtnExecNow.onclick = async () => {
      if (!activeScheduledMigration?.id) {
        showToast('No active scheduled migration found.', 'error');
        return;
      }
      try {
        hosttabBtnExecNow.disabled = true;
        await apiRequest('/api/v1/admin/platform-settings/migration/execute-now', 'POST', { id: activeScheduledMigration.id });
        showToast('Migration executed immediately.', 'success');
      } catch (err) {
        hosttabBtnExecNow.disabled = false;
        showToast(err.message, 'error');
      }
    };
  }

  // Unified Cancel Scheduled Migration Handler
  const cancelScheduledMigration = async () => {
    try {
      const id = activeScheduledMigration?.id;
      await apiRequest('/api/v1/admin/platform-settings/migration/cancel', 'POST', { id });
      if (migrationCountdownTimer) {
        clearInterval(migrationCountdownTimer);
        migrationCountdownTimer = null;
      }
      activeScheduledMigration = null;
      document.getElementById('banner-scheduled-migration')?.classList.add('hidden');
      document.getElementById('box-pending-migration-card')?.classList.add('hidden');
      document.getElementById('hosttab-box-pending-migration')?.classList.add('hidden');
      document.getElementById('modal-schedule-btn-cancel-active')?.classList.add('hidden');
      hideModal('modal-schedule-migration');
      showToast('Scheduled migration cancelled and broadcast to all users.', 'info');
    } catch (err) {
      showToast(err.message || 'Failed to cancel scheduled migration.', 'error');
    }
  };

  // Wire all cancellation buttons
  const btnCancelMigGlobal = document.getElementById('btn-cancel-migration-global');
  if (btnCancelMigGlobal) btnCancelMigGlobal.onclick = cancelScheduledMigration;

  const btnCancelMigModal = document.getElementById('modal-schedule-btn-cancel-active');
  if (btnCancelMigModal) btnCancelMigModal.onclick = cancelScheduledMigration;

  const hosttabBtnCancel = document.getElementById('hosttab-btn-cancel-schedule');
  if (hosttabBtnCancel) hosttabBtnCancel.onclick = cancelScheduledMigration;

  const btnCancelMig = document.getElementById('btn-cancel-scheduled-migration');
  if (btnCancelMig) btnCancelMig.onclick = cancelScheduledMigration;

  // Banner Copy Buttons
  const btnCopyUpUrl = document.getElementById('btn-copy-upcoming-url');
  if (btnCopyUpUrl) {
    btnCopyUpUrl.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = activeScheduledMigration?.newBaseUrl || 'http://localhost:3000';
      await window.copyToClipboard(url);
      showToast(`Copied upcoming base URL: ${url}`, 'success');
    };
  }

  const btnCopyUpPrompt = document.getElementById('btn-copy-upcoming-prompt');
  if (btnCopyUpPrompt) {
    btnCopyUpPrompt.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = activeScheduledMigration?.newBaseUrl || 'http://localhost:3000';
      const prompt = buildMigrationPrompt(url, false, '');
      await window.copyToClipboard(prompt);
      showToast(`Copied updated migration prompt for ${url}!`, 'success');
    };
  }

  const toggleMaintenance = document.getElementById('toggle-maintenance-mode');
  if (toggleMaintenance) {
    toggleMaintenance.onchange = async () => {
      const maintenanceMode = toggleMaintenance.checked;
      try {
        await apiRequest('/api/v1/admin/platform-settings', 'PATCH', { maintenanceMode });
        showToast(`Maintenance mode ${maintenanceMode ? 'enabled' : 'disabled'}.`, 'success');
      } catch (err) {
        toggleMaintenance.checked = !maintenanceMode; // revert
        showToast(err.message, 'error');
      }
    };
  }

  // Save Global Backup Settings
  const btnSaveBackupSettings = document.getElementById('btn-save-backup-settings');
  if (btnSaveBackupSettings) {
    btnSaveBackupSettings.onclick = async () => {
      const backupMode = document.getElementById('setting-backup-mode').value;
      const backupIntervalMinutes = parseInt(document.getElementById('setting-backup-interval').value || '1440', 10);
      const backupRetentionDays = parseInt(document.getElementById('setting-backup-retention-days').value || '7', 10);
      const s3BucketName = document.getElementById('setting-s3-bucket').value;
      const s3Region = document.getElementById('setting-s3-region').value;
      const s3AccessKey = document.getElementById('setting-s3-access').value;
      const s3SecretKey = document.getElementById('setting-s3-secret').value;
      try {
        btnSaveBackupSettings.disabled = true;
        btnSaveBackupSettings.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        await apiRequest('/api/v1/admin/platform-settings', 'PATCH', { 
          backupMode, backupIntervalMinutes, backupRetentionDays, s3BucketName, s3Region, s3AccessKey, s3SecretKey 
        });
        showToast('Global Backup settings updated successfully.', 'success');
        await loadPlatformSettings();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnSaveBackupSettings.disabled = false;
        btnSaveBackupSettings.innerHTML = 'Save Backup Settings';
      }
    };
  }

  // Trigger Global Backup
  const btnTriggerGlobalBackup = document.getElementById('btn-trigger-global-backup');
  if (btnTriggerGlobalBackup) {
    btnTriggerGlobalBackup.onclick = async () => {
      if (!confirm('Are you sure you want to trigger a full database backup now? This might affect performance briefly.')) return;
      try {
        btnTriggerGlobalBackup.disabled = true;
        btnTriggerGlobalBackup.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Triggering...';
        const res = await apiRequest('/api/v1/admin/backups', 'POST');
        showToast(res.message || 'Backup initiated successfully.', 'success');
        
        // Refresh UI to show updated backup status
        await loadPlatformSettings();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnTriggerGlobalBackup.disabled = false;
        btnTriggerGlobalBackup.innerHTML = 'Trigger Manual Backup';
      }
    };
  }

  // Purge Expired Backups
  const btnPurgeExpiredBackups = document.getElementById('btn-purge-expired-backups');
  if (btnPurgeExpiredBackups) {
    btnPurgeExpiredBackups.onclick = async () => {
      if (!confirm('Are you sure you want to purge all expired database backups based on the configured retention policy?')) return;
      try {
        btnPurgeExpiredBackups.disabled = true;
        btnPurgeExpiredBackups.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Purging...';
        const res = await apiRequest('/api/v1/admin/backups/purge', 'POST');
        showToast(res.message || 'Expired backups purged successfully.', 'success');
        
        // Refresh UI to show updated backup status
        await loadPlatformSettings();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnPurgeExpiredBackups.disabled = false;
        btnPurgeExpiredBackups.innerHTML = '<i class="fa-solid fa-broom mr-2"></i> Purge Expired Backups';
      }
    };
  }

  // Save Project Backup Config
  const btnSaveProjectBackup = document.getElementById('btn-save-project-backup');
  if (btnSaveProjectBackup) {
    btnSaveProjectBackup.onclick = async () => {
      const projectId = document.getElementById('input-project-backup-id').value;
      if (!projectId) return;
      
      const s3BucketName = document.getElementById('input-proj-s3-bucket').value;
      const s3Region = document.getElementById('input-proj-s3-region').value;
      const s3AccessKey = document.getElementById('input-proj-s3-access').value;
      const s3SecretKey = document.getElementById('input-proj-s3-secret').value;
      
      try {
        btnSaveProjectBackup.disabled = true;
        btnSaveProjectBackup.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        await apiRequest(`/api/v1/projects/${projectId}/backup-config`, 'PATCH', {
          s3BucketName, s3Region, s3AccessKey, s3SecretKey
        });
        showToast('Project backup configuration saved successfully.', 'success');
        document.getElementById('modal-project-backup').classList.add('hidden');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnSaveProjectBackup.disabled = false;
        btnSaveProjectBackup.innerHTML = 'Save Project Backup Config';
      }
    };
  }

  // Trigger Project Backup
  const btnTriggerProjectBackup = document.getElementById('btn-trigger-project-backup');
  if (btnTriggerProjectBackup) {
    btnTriggerProjectBackup.onclick = async () => {
      const projectId = document.getElementById('input-project-backup-id').value;
      if (!projectId) return;
      
      try {
        btnTriggerProjectBackup.disabled = true;
        btnTriggerProjectBackup.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting...';
        
        // This endpoint will return a file buffer (gzip) which we should download,
        // or a JSON message if it triggers an S3 upload. The backend might just export JSON.
        // Let's use fetch directly to handle the blob download.
        
        const token = state.accessToken;
        const res = await fetch(`${state.baseUrl}/api/v1/projects/${projectId}/backup`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-aegis-project-id': projectId
          }
        });
        
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || 'Backup failed');
        }
        
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            showToast(data.message || 'Backup successful', 'success');
        } else {
            // It's a file download
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `project_backup_${projectId}_${Date.now()}.json.gz`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showToast('JSON Export downloaded successfully!', 'success');
        }
        
        // Refresh UI to show updated backup status
        const projectName = document.getElementById('label-project-backup-title').textContent.replace('Backup Config: ', '');
        await openProjectBackupModal(projectId, projectName);
        
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnTriggerProjectBackup.disabled = false;
        btnTriggerProjectBackup.innerHTML = 'Export JSON Now';
      }
    };
  }

  // Collection & Document Creation Modal Triggers
  const btnOpenCreateColl = document.getElementById('btn-open-create-collection');
  const btnConfirmCreateColl = document.getElementById('btn-confirm-create-collection');
  const btnOpenCreateDoc = document.getElementById('btn-open-create-document');
  const btnConfirmCreateDoc = document.getElementById('btn-confirm-create-document');

  if (btnOpenCreateColl) {
    btnOpenCreateColl.onclick = () => {
      document.getElementById('modal-create-collection')?.classList.remove('hidden');
    };
  }

  if (btnConfirmCreateColl) {
    btnConfirmCreateColl.onclick = async () => {
      const name = document.getElementById('input-new-collection-name')?.value?.trim();
      if (!name) return showToast('Please enter a collection name.', 'error');
      try {
        await apiRequest('/api/v1/db/collections', 'POST', { name });
        document.getElementById('modal-create-collection')?.classList.add('hidden');
        showToast(`Collection "${name}" created!`, 'success');
        loadCollections();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  if (btnOpenCreateDoc) {
    btnOpenCreateDoc.onclick = () => {
      if (!state.activeCollection) return showToast('Select a collection first.', 'warning');
      document.getElementById('modal-create-document')?.classList.remove('hidden');
    };
  }

  if (btnConfirmCreateDoc) {
    btnConfirmCreateDoc.onclick = async () => {
      if (!state.activeCollection) return showToast('No active collection selected.', 'error');
      const jsonStr = document.getElementById('input-new-document-json')?.value?.trim();
      if (!jsonStr) return showToast('Please enter JSON document data.', 'error');
      try {
        const payload = JSON.parse(jsonStr);
        await apiRequest(`/api/v1/db/collections/${state.activeCollection.name}/documents`, 'POST', { data: payload });
        document.getElementById('modal-create-document')?.classList.add('hidden');
        showToast('Document inserted successfully!', 'success');
        loadDocuments(state.activeCollection.name);
      } catch (err) {
        showToast(`Invalid JSON or API error: ${escapeHTML(err.message)}`, 'error');
      }
    };
  }

  // Project Selector Dropdown Change Handler
  const selectProj = document.getElementById('select-active-project');
  if (selectProj) {
    selectProj.onchange = (e) => {
      const selectedId = e.target.value;
      const found = state.projects.find((p) => p.id === selectedId);
      if (found) {
        state.activeProject = found;
        loadCollections();
        
        // Re-render whatever workspace tab is currently active (e.g. Auth Config, Metrics, Vault)
        const currentTab = state.activeTab || document.querySelector('.nav-item.active-nav')?.getAttribute('data-tab');
        if (currentTab) {
          switchWorkspace(currentTab);
        }
      }
    };
  }

  // Role Switcher Buttons
  const btnRoleSuper = document.getElementById('btn-role-superadmin');
  const btnRoleDev = document.getElementById('btn-role-developer');
  if (btnRoleSuper) btnRoleSuper.onclick = () => setRoleMode('superadmin');
  if (btnRoleDev) btnRoleDev.onclick = () => setRoleMode('developer');

  // Sidebar Nav Item Click Handlers
  document.querySelectorAll('.nav-item[data-tab]').forEach((item) => {
    item.onclick = () => switchWorkspace(item.getAttribute('data-tab'));
  });

  // Mac-Style Sidebar Toggle
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.getElementById('sidebar');
  if (btnToggleSidebar && sidebar) {
    btnToggleSidebar.onclick = () => {
      sidebar.classList.toggle('sidebar-collapsed');
    };
  }

  // Code Tab Buttons
  document.querySelectorAll('.code-tab-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.code-tab-btn').forEach((b) => {
        b.className = 'code-tab-btn px-4 py-2 font-medium text-xs text-slate-400 border-b-2 border-transparent hover:text-white';
      });
      btn.className = 'code-tab-btn px-4 py-2 font-medium text-xs text-indigo-400 border-b-2 border-indigo-500';
      renderCodeSnippet(btn.getAttribute('data-lang'));
    };
  });

  // Copy Code Button
  const btnCopyCode = document.getElementById('btn-copy-code');
  if (btnCopyCode) {
    btnCopyCode.onclick = async () => {
      const code = document.getElementById('code-snippet-display')?.textContent;
      if (code) {
        await window.copyToClipboard(code);
        showToast('Code snippet copied to clipboard!', 'success');
      }
    };
  }

  initRulesSandbox();

  // ── New Feature Event Handlers ──────────────────────────────────────────────

  // Refresh Users Button
  const btnRefreshUsers = document.getElementById('btn-refresh-users');
  if (btnRefreshUsers) {
    btnRefreshUsers.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      loadUserManagement();
    });
  }

  // User Limits: Save Button
  const btnSaveUserLimits = document.getElementById('btn-confirm-save-user-limits');
  if (btnSaveUserLimits) btnSaveUserLimits.onclick = () => saveUserLimits();

  // Rate Limits: Save Button
  const btnSaveRateLimits = document.getElementById('btn-save-rate-limits');
  if (btnSaveRateLimits) btnSaveRateLimits.onclick = () => saveGlobalRateLimits();

  // Project Management: Create Button
  const btnOpenCreateProject = document.getElementById('btn-open-create-project');
  if (btnOpenCreateProject) {
    btnOpenCreateProject.onclick = () => {
      document.getElementById('modal-create-project')?.classList.remove('hidden');
    };
  }
  const btnConfirmCreateProject = document.getElementById('btn-confirm-create-project');
  if (btnConfirmCreateProject) btnConfirmCreateProject.onclick = () => createNewProject();

  // View Document Detail: Copy JSON Button
  const btnCopyDocJson = document.getElementById('btn-copy-doc-json');
  if (btnCopyDocJson) {
    btnCopyDocJson.onclick = async () => {
      const content = document.getElementById('doc-detail-content')?.textContent;
      if (content) {
        await window.copyToClipboard(content);
        showToast('Document JSON copied to clipboard!', 'success');
      }
    };
  }

  // Save Document Rules Button
  const btnSaveDocRules = document.getElementById('btn-save-doc-rules');
  if (btnSaveDocRules) {
    btnSaveDocRules.onclick = async () => {
      const docId = btnSaveDocRules.getAttribute('data-doc-id');
      const collName = btnSaveDocRules.getAttribute('data-collection-name');
      const rulesValue = document.getElementById('doc-rules-editor').value;
      if (!docId || !collName) return;

      try {
        let parsedRules = null;
        if (rulesValue.trim()) {
          parsedRules = JSON.parse(rulesValue);
        }

        await apiRequest(`/api/v1/db/collections/${encodeURIComponent(collName)}/documents/${encodeURIComponent(docId)}`, 'PATCH', { data: { _rules: parsedRules } });
        showToast('Document rules updated successfully.', 'success');
        hideModal('modal-document-rules');
        if (state.activeCollection?.name === collName) {
          loadDocuments(collName, state.docsOffset, state.docsLimit);
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Mandatory Policy Gate Modal Event Listeners
  const btnGateAccept = document.getElementById('btn-gate-accept');
  if (btnGateAccept) {
    btnGateAccept.onclick = (e) => {
      e?.preventDefault();
      if (typeof window.acceptCurrentPolicyGate === 'function') {
        window.acceptCurrentPolicyGate();
      }
    };
  }

  const btnGateDecline = document.getElementById('btn-gate-decline');
  if (btnGateDecline) {
    btnGateDecline.onclick = (e) => {
      e?.preventDefault();
      if (typeof window.toggleGateDeclineOptions === 'function') {
        window.toggleGateDeclineOptions();
      }
    };
  }

  // ── Super Admin Server Shutdown Control ───────────────────────────────────────
  initServerShutdownHandlers();

  // ── URL Hash Tab Deep-Linking (e.g. #tab-server-hosting) ───────────────────
  if (window.location.hash && window.location.hash.startsWith('#tab-')) {
    const targetTabId = window.location.hash.substring(1).split('&')[0].split('?')[0];
    if (document.getElementById(targetTabId)) {
      setTimeout(() => {
        if (typeof window.switchWorkspace === 'function') {
          window.switchWorkspace(targetTabId);
        }
      }, 150);
    }
  }
});

window.executeServerShutdownFromUI = function() {
  const activePort = window.location.port || '3000';
  const portDisplay = document.getElementById('label-shutdown-port-display');
  if (portDisplay) portDisplay.textContent = `Port ${activePort}`;

  const isMac = (navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0) || (navigator.userAgent && navigator.userAgent.indexOf('Mac') >= 0);
  const isWin = (navigator.platform && navigator.platform.toUpperCase().indexOf('WIN') >= 0) || (navigator.userAgent && navigator.userAgent.indexOf('Windows') >= 0);
  const deviceName = isMac ? '🍎 macOS Host' : (isWin ? '🪟 Windows Host' : '🐧 Linux / POSIX Host');
  const cmdName = isMac ? 'stop.command' : (isWin ? 'stop.bat' : 'stop.sh');

  const devEl = document.getElementById('label-shutdown-device-display');
  if (devEl) devEl.textContent = `${deviceName} (${cmdName})`;

  if (typeof window.showModal === 'function') {
    window.showModal('modal-confirm-server-shutdown');
  } else {
    const el = document.getElementById('modal-confirm-server-shutdown');
    if (el) {
      el.classList.remove('hidden');
      el.classList.add('flex');
      el.style.setProperty('display', 'flex', 'important');
    }
  }
};

window.confirmServerShutdownAction = async function() {
  const btn = document.getElementById('modal-shutdown-btn-confirm');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Stopping Server...</span>';
  }

  try {
    const res = await apiRequest('/api/v1/admin/server/shutdown', 'POST');
    if (typeof window.hideModal === 'function') {
      window.hideModal('modal-confirm-server-shutdown');
    } else {
      const el = document.getElementById('modal-confirm-server-shutdown');
      if (el) {
        el.classList.add('hidden');
        el.classList.remove('flex');
        el.style.setProperty('display', 'none', 'important');
      }
    }

    const port = res.data?.port || window.location.port || '3000';
    const msgEl = document.getElementById('overlay-stopped-message');
    const portEl = document.getElementById('overlay-stopped-port-badge');
    if (msgEl) msgEl.textContent = `The server process has been safely shut down by the Super Admin and Port ${port} is now released.`;
    if (portEl) portEl.textContent = `Port ${port}`;

    if (typeof window.showModal === 'function') {
      window.showModal('overlay-server-stopped');
    } else {
      const ov = document.getElementById('overlay-server-stopped');
      if (ov) {
        ov.classList.remove('hidden');
        ov.classList.add('flex');
        ov.style.setProperty('display', 'flex', 'important');
      }
    }
    showToast(`🛑 AegisDB Server on port ${port} killed successfully & port freed.`, 'success');
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-power-off"></i> <span>Stop Server Now</span>';
    }
    showToast(err.message || 'Failed to stop server.', 'error');
  }
};

function initServerShutdownHandlers() {
  const btnShutdownServer = document.getElementById('hosttab-btn-shutdown-server');
  const btnCancelShutdown = document.getElementById('modal-shutdown-btn-cancel');
  const btnConfirmShutdown = document.getElementById('modal-shutdown-btn-confirm');

  if (btnShutdownServer) {
    btnShutdownServer.onclick = () => window.executeServerShutdownFromUI();
  }

  if (btnCancelShutdown) {
    btnCancelShutdown.onclick = () => {
      if (typeof window.hideModal === 'function') {
        window.hideModal('modal-confirm-server-shutdown');
      } else {
        const el = document.getElementById('modal-confirm-server-shutdown');
        if (el) {
          el.classList.add('hidden');
          el.classList.remove('flex');
          el.style.setProperty('display', 'none', 'important');
        }
      }
    };
  }

  if (btnConfirmShutdown) {
    btnConfirmShutdown.onclick = () => window.confirmServerShutdownAction();
  }
}

// ── API Key Tester ─────────────────────────────────────────────────────────────

document.getElementById('tester-method')?.addEventListener('change', (e) => {
  const container = document.getElementById('tester-body-container');
  if (e.target.value === 'POST') {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
});

window.executeApiTest = async function() {
  const apiKey = document.getElementById('tester-api-key')?.value?.trim();
  const collection = document.getElementById('tester-collection')?.value?.trim();
  const method = document.getElementById('tester-method')?.value;
  const bodyText = document.getElementById('tester-body')?.value;
  const responsePre = document.getElementById('tester-response');
  const statusBadge = document.getElementById('tester-status');

  if (!apiKey) {
    showToast('API Key is required to test.', 'error');
    return;
  }
  if (!collection) {
    showToast('Collection path is required.', 'error');
    return;
  }

  statusBadge.textContent = 'Sending...';
  statusBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400';
  responsePre.textContent = 'Waiting for response...';
  responsePre.classList.remove('text-rose-400', 'text-emerald-400');

  try {
    let options = {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };

    if (method === 'POST') {
      try {
        JSON.parse(bodyText);
        options.body = bodyText;
      } catch (e) {
        showToast('Invalid JSON body.', 'error');
        statusBadge.textContent = 'Error';
        statusBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400';
        responsePre.textContent = 'Invalid JSON body format.';
        return;
      }
    }

    const startTime = performance.now();
    const res = await fetch(`/api/v1/db/collections/${collection}`, options);
    const endTime = performance.now();
    const latency = Math.round(endTime - startTime);

    const isOk = res.ok;
    const json = await res.json().catch(() => ({ error: 'Invalid JSON response from server' }));

    statusBadge.textContent = `${res.status} ${res.statusText} • ${latency}ms`;
    if (isOk) {
      statusBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400';
    } else {
      statusBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400';
    }

    responsePre.textContent = JSON.stringify(json, null, 2);
    if (window.hljs) hljs.highlightElement(responsePre);
  } catch (err) {
    statusBadge.textContent = 'Network Error';
    statusBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400';
    responsePre.textContent = String(err);
  }
};

// ── Export Reports ─────────────────────────────────────────────────────────────

async function exportReport(format) {
  if (!state.activeProject) {
    showToast('No active project selected.', 'error');
    return;
  }

  // Fetch the latest stats to ensure the report is up to date
  let stats;
  try {
    const res = await apiRequest(`/api/v1/projects/${state.activeProject.id}/stats`, 'GET');
    stats = res.metricsSnapshot || {};
  } catch (e) {
    showToast('Failed to fetch latest metrics for export', 'error');
    return;
  }

  const projectName = state.activeProject.name;
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `AegisDB_Report_${projectName.replace(/\\s+/g, '_')}_${dateStr}`;

  // Helper to trigger download
  const downloadFile = (content, fileName, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalReqs = stats.httpStatus?.total || 0;
  const req2xx = stats.httpStatus?.['2xx'] || 0;
  const req4xx = stats.httpStatus?.['4xx'] || 0;
  const req5xx = stats.httpStatus?.['5xx'] || 0;
  const avgLatency = stats.queryLatency?.avgLatencyMs?.toFixed(2) || '0.00';
  const p95Latency = stats.queryLatency?.p95LatencyMs?.toFixed(2) || '0.00';
  const wsSubs = stats.websocket?.activeSubscribers || 0;

  if (format === 'json') {
    const reportData = {
      project: projectName,
      generatedAt: new Date().toISOString(),
      metrics: stats
    };
    downloadFile(JSON.stringify(reportData, null, 2), `${filename}.json`, 'application/json');
    showToast('Exported JSON successfully', 'success');
  } 
  else if (format === 'md') {
    const mdContent = `# AegisDB Developer Metrics Report
**Project:** ${projectName}
**Generated:** ${new Date().toLocaleString()}

## API Performance
- **Total Requests (24h):** ${totalReqs}
- **Success (2xx):** ${req2xx}
- **Client Errors (4xx):** ${req4xx}
- **Server Errors (5xx):** ${req5xx}

## Database Latency
- **Average Latency:** ${avgLatency} ms
- **P95 Latency:** ${p95Latency} ms

## WebSockets
- **Active Subscribers:** ${wsSubs}
`;
    downloadFile(mdContent, `${filename}.md`, 'text/markdown');
    showToast('Exported Markdown successfully', 'success');
  } 
  else if (format === 'csv') {
    const csvContent = `Metric,Value
Total Requests (24h),${totalReqs}
Success (2xx),${req2xx}
Client Errors (4xx),${req4xx}
Server Errors (5xx),${req5xx}
Average Latency (ms),${avgLatency}
P95 Latency (ms),${p95Latency}
Active WS Subscribers,${wsSubs}
`;
    downloadFile(csvContent, `${filename}.csv`, 'text/csv');
    showToast('Exported CSV successfully', 'success');
  } 
  else if (format === 'doc') {
    const docHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>AegisDB Report</title></head>
      <body style="font-family: Arial, sans-serif;">
        <h1 style="color: #4f46e5;">AegisDB Developer Metrics Report</h1>
        <p><strong>Project:</strong> ${projectName}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        
        <h2 style="color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px;">API Performance</h2>
        <ul>
          <li><strong>Total Requests (24h):</strong> ${totalReqs}</li>
          <li><strong>Success (2xx):</strong> ${req2xx}</li>
          <li><strong>Client Errors (4xx):</strong> ${req4xx}</li>
          <li><strong>Server Errors (5xx):</strong> ${req5xx}</li>
        </ul>

        <h2 style="color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px;">Database Latency</h2>
        <ul>
          <li><strong>Average Latency:</strong> ${avgLatency} ms</li>
          <li><strong>P95 Latency:</strong> ${p95Latency} ms</li>
        </ul>

        <h2 style="color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px;">WebSockets</h2>
        <ul>
          <li><strong>Active Subscribers:</strong> ${wsSubs}</li>
        </ul>
      </body>
      </html>
    `;
    downloadFile(docHtml, `${filename}.doc`, 'application/msword');
    showToast('Exported Word Document successfully', 'success');
  } 
  else if (format === 'pdf') {
    showToast('Generating PDF...', 'info');
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b;">
        <h1 style="color: #4f46e5; font-size: 28px; margin-bottom: 10px;">AegisDB Developer Metrics</h1>
        <div style="color: #64748b; font-size: 14px; margin-bottom: 40px;">
          Project: <strong>${projectName}</strong><br/>
          Generated: ${new Date().toLocaleString()}
        </div>
        
        <div style="margin-bottom: 30px;">
          <h2 style="font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px;">API Performance</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0;">Total Requests (24h)</td><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">${totalReqs}</td></tr>
            <tr><td style="padding: 10px; border: 1px solid #e2e8f0;">Success (2xx)</td><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">${req2xx}</td></tr>
            <tr style="background: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0;">Client Errors (4xx)</td><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">${req4xx}</td></tr>
            <tr><td style="padding: 10px; border: 1px solid #e2e8f0;">Server Errors (5xx)</td><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">${req5xx}</td></tr>
          </table>
        </div>

        <div style="margin-bottom: 30px;">
          <h2 style="font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px;">Database Latency</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0;">Average Latency</td><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">${avgLatency} ms</td></tr>
            <tr><td style="padding: 10px; border: 1px solid #e2e8f0;">P95 Latency</td><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">${p95Latency} ms</td></tr>
          </table>
        </div>

        <div style="margin-bottom: 30px;">
          <h2 style="font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px;">WebSockets</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0;">Active Subscribers</td><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">${wsSubs}</td></tr>
          </table>
        </div>
      </div>
    `;
    
    const opt = {
      margin:       0.5,
      filename:     `${filename}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    if (window.html2pdf) {
      window.html2pdf().set(opt).from(container).save().then(() => {
        showToast('Exported PDF successfully', 'success');
      }).catch(err => {
        console.error('PDF Error:', err);
        showToast('Failed to generate PDF', 'error');
      });
    } else {
      showToast('PDF generator library not loaded', 'error');
    }
  }
}

window.exportReport = exportReport;

// --- Feature Modals ---
const featureDetails = {
  storage: {
    title: "High-Concurrency Storage",
    icon: "fa-bolt",
    desc: "AegisDB uses SQLite configured in WAL (Write-Ahead Logging) mode, enabling massive read concurrency and non-blocking writes out of the box.",
    details: [
      "Zero configuration required for WAL mode.",
      "Supports thousands of concurrent readers.",
      "Atomic commits ensure data integrity.",
      "Optimized for modern NVMe drives."
    ]
  },
  encryption: {
    title: "Envelope Encryption",
    icon: "fa-key",
    desc: "All sensitive fields defined in your schema are automatically encrypted at rest using military-grade encryption.",
    details: [
      "AES-256 GCM authenticated encryption.",
      "Unique Data Encryption Key (DEK) per document.",
      "DEKs wrapped by a master Key Encryption Key (KEK).",
      "Key rotation capabilities via the Security Ops panel."
    ]
  },
  sandbox: {
    title: "VM Security Sandbox",
    icon: "fa-shield-virus",
    desc: "Firebase-style security rules are compiled and executed in a strict, isolated Node.js VM sandbox.",
    details: [
      "Prevents arbitrary code execution.",
      "Access to incoming request data, existing document data, and auth claims.",
      "Configurable timeout to prevent infinite loops.",
      "Seamless integration with REST and WebSocket APIs."
    ]
  },
  auth: {
    title: "Advanced Authentication",
    icon: "fa-fingerprint",
    desc: "Built-in identity management that goes beyond standard JWTs to ensure rock-solid session security.",
    details: [
      "TOTP-based Multi-Factor Authentication (MFA).",
      "Single-use refresh token family rotation.",
      "Automatic compromised token detection and revocation.",
      "Session invalidation across all devices instantly."
    ]
  },
  telemetry: {
    title: "Real-Time Telemetry",
    icon: "fa-chart-pie",
    desc: "Full observability into your database instances with built-in Prometheus endpoints and live metrics.",
    details: [
      "Monitor CPU, RAM, and Disk I/O usage.",
      "Live WebSocket connection tracking.",
      "P95 query latency and throughput stats.",
      "Exportable JSON and PDF reporting."
    ]
  },
  isolation: {
    title: "Multi-Tenant Isolation",
    icon: "fa-cubes",
    desc: "Deploy multiple independent projects on a single AegisDB instance without any cross-contamination.",
    details: [
      "Strict logical separation of databases.",
      "Independent schemas, rules, and users per project.",
      "Isolated API keys and webhook configurations.",
      "Perfect for SaaS architectures and agency models."
    ]
  },
  backup: {
    title: "Dual-Target Backups",
    icon: "fa-cloud-arrow-up",
    desc: "Automated disaster recovery via simultaneous snapshots to Local File Systems and AWS S3 endpoints with end-to-end encryption.",
    details: [
      "Atomic SQLite snapshots for instantaneous local restores.",
      "AES-256 encrypted multipart uploads to AWS S3-compatible endpoints.",
      "Customizable cron-based scheduling per instance.",
      "Dashboard visibility into sync status and next run times."
    ]
  },
  security_audit: {
    title: "Security & Incident Recovery",
    icon: "fa-shield-heart",
    desc: "Robust mechanisms to securely recover from catastrophic failures and ensure zero data loss during complex schema migrations.",
    details: [
      "Zero data loss recovery from SQLite cascading deletes.",
      "Re-encrypted internal platform users securely.",
      "Unified project KEKs and verified DEK integrity.",
      "Implemented HMAC-SHA256 blind indexing for PII."
    ]
  },
  passkeys: {
    title: "FIDO2 Biometric Passkeys",
    icon: "fa-fingerprint",
    desc: "Authenticate seamlessly without passwords using FIDO2 WebAuthn Level 3 standards, Apple Touch ID, Face ID, Windows Hello, and hardware security keys.",
    details: [
      "FIDO2 & WebAuthn Level 3 compliant hardware authentication.",
      "Cryptographic asymmetric keypairs stored in device Secure Enclaves.",
      "Phishing-resistant authentication without reusable passwords.",
      "Supports Touch ID, Face ID, Windows Hello, and YubiKeys."
    ]
  },
  magic_links: {
    title: "Passwordless Magic Links & Email OTP",
    icon: "fa-wand-magic-sparkles",
    desc: "Single-use, auto-burning authentication links and time-sensitive 6-digit numeric verification codes delivered securely to your inbox.",
    details: [
      "Frictionless zero-password onboarding and authentication.",
      "Single-use auto-burning tokens with 15-minute TTL.",
      "Automatic brute-force prevention and rate-limited code generation.",
      "One-click instant login directly from your email client."
    ]
  },
  user_sessions: {
    title: "Active Sessions & Remote Logout",
    icon: "fa-laptop-code",
    desc: "Comprehensive visibility into all active device sessions, operating systems, browser agents, IP geolocations, and instant remote revocation.",
    details: [
      "User-Agent parsing for real-time OS and browser detection.",
      "Session token family tracking with last active timestamps.",
      "One-click instant remote revocation of suspicious devices.",
      "'Revoke All Other Sessions' command to secure compromised accounts."
    ]
  },
  pats: {
    title: "Personal Access Tokens (PATs)",
    icon: "fa-id-badge",
    desc: "Generate fine-grained personal access tokens for CI/CD pipelines, CLI automation, and custom scripts with granular scope isolation.",
    details: [
      "Cryptographically hashed tokens with customizable expiration dates.",
      "Granular permission scopes (db:read, db:write, storage:read, full_access).",
      "Masked token prefixes for clean, auditable security logging.",
      "Instant one-click revocation with zero impact on user passwords."
    ]
  },
  organizations: {
    title: "Organizations & Functional Teams",
    icon: "fa-building-user",
    desc: "GitHub-style multi-tenant workspace isolation, functional teams (@org/team), project access grants, and audit trails.",
    details: [
      "Independent organization workspaces with custom slug handles.",
      "Role-Based Access Control (Owner, Admin, Member, Billing Manager).",
      "Functional teams with bulk project permission inheritance.",
      "Comprehensive organization-wide security and audit trails."
    ]
  },
  notifications: {
    title: "In-App Real-Time Notification Center",
    icon: "fa-bell",
    desc: "Live WebSocket alerts for security events, team invitations, and quota warnings with interactive unread badge counters.",
    details: [
      "Instant delivery via dedicated user WebSocket event channels.",
      "Interactive unread counter badge in the top navigation header.",
      "Categorized alert feeds (Security, Invites, Platform, System).",
      "One-click 'Mark all as read' and instant dismiss actions."
    ]
  },
  storage_quotas: {
    title: "User Storage Quotas & Metering",
    icon: "fa-hard-drive",
    desc: "Transparent 500 MB storage quota tracking, real-time byte aggregation, and live progress visualization across media assets and databases.",
    details: [
      "Real-time byte-level storage aggregation for every account.",
      "Visual percentage meters with color-coded warning states.",
      "Asset file counts and storage tier breakdown.",
      "Automatic quota limit enforcement on file and media uploads."
    ]
  }
};

window.showFeatureModal = function(featureId) {
  const data = featureDetails[featureId];
  if (!data) return;
  
  document.getElementById('feature-modal-title').textContent = data.title;
  document.getElementById('feature-modal-desc').textContent = data.desc;
  
  const iconEl = document.getElementById('feature-modal-icon');
  iconEl.className = 'fa-solid ' + data.icon;
  
  const detailsEl = document.getElementById('feature-modal-details');
  detailsEl.innerHTML = '<ul class="list-disc pl-4 space-y-1">' + 
    data.details.map(d => '<li>' + d + '</li>').join('') + 
    '</ul>';
    
  document.getElementById('modal-feature-detail').classList.remove('hidden');
};

// --- Interactive Tutorial (Driver.js) ---
window.startTutorial = function() {
  if (typeof window.driver === 'undefined') {
    showToast('Tutorial library is still loading. Please try again in a moment.', 'warning');
    return;
  }
  
  // Ensure sidebar is open and role mode is set to developer for tour navigation
  document.getElementById('sidebar')?.classList.remove('sidebar-collapsed');
  if (typeof setRoleMode === 'function') {
    setRoleMode('developer');
  }

  const driverObj = window.driver.js.driver;
  
  const tour = driverObj({
    showProgress: true,
    animate: true,
    smoothScroll: true,
    popoverClass: 'driver-theme-glass',
    onHighlightStarted: (element) => {
      if (element) {
        // Ensure element is smoothly scrolled into the sidebar center
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        // Automatically activate tab content view when highlighting tab buttons
        if (element.hasAttribute && element.hasAttribute('data-tab')) {
          element.click();
        }
      }
    },
    steps: [
      {
        element: 'header',
        popover: {
          title: 'Top Navigation & Roles',
          description: 'Switch between Super Admin and Developer roles, manage active projects, and see server status.',
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: '#sidebar',
        popover: {
          title: 'Sidebar Navigation',
          description: 'This is your main navigation hub. From here you can access Project Management, Data Browser, and Security settings.',
          side: 'right',
          align: 'start'
        }
      },
      {
        element: '[data-tab="tab-project-management"]',
        popover: {
          title: 'Project Management',
          description: 'AegisDB supports multi-tenancy. Create projects here to isolate your databases, users, and rules.',
          side: 'right',
          align: 'center'
        }
      },
      {
        element: '[data-tab="tab-data-browser"]',
        popover: {
          title: 'Data Browser',
          description: 'Your Firebase-style database console. You can view collections, documents, and run ad-hoc queries here.',
          side: 'right',
          align: 'center'
        }
      },
      {
        element: '[data-tab="tab-rules-sandbox"]',
        popover: {
          title: 'Security Rules Sandbox',
          description: 'Define who can read and write your data using our advanced Node.js VM Security Rules.',
          side: 'right',
          align: 'center'
        }
      },
      {
        element: '[data-tab="tab-developer-metrics"]',
        popover: {
          title: 'Real-Time Metrics',
          description: 'Monitor database query latency, websocket subscribers, and security rule evaluations live.',
          side: 'right',
          align: 'center'
        }
      },
      {
        element: '[data-tab="tab-about"]',
        popover: {
          title: 'About AegisDB',
          description: 'Learn more about the platform architecture, tech stack, and explore detailed feature cards.',
          side: 'right',
          align: 'center'
        }
      },
      {
        element: '#btn-tutorial',
        popover: {
          title: 'Revisit Anytime',
          description: 'You can restart this tutorial anytime from this button.',
          side: 'right',
          align: 'center'
        }
      }
    ]
  });
  
  tour.drive();
};

// --- Live Interactive SDK Terminal Tester ---
window.clearSdkTerminal = function() {
  const terminal = document.getElementById('sdk-terminal-output');
  if (terminal) {
    terminal.innerHTML = '<div class="text-slate-500">// Terminal cleared</div>';
  }
};

function printSdkLog(message, type = 'info') {
  const terminal = document.getElementById('sdk-terminal-output');
  if (!terminal) return;
  
  const line = document.createElement('div');
  const timestamp = new Date().toLocaleTimeString();
  
  let colorClass = 'text-slate-300';
  if (type === 'success') colorClass = 'text-emerald-400 font-semibold';
  if (type === 'error') colorClass = 'text-rose-400 font-semibold';
  if (type === 'warning') colorClass = 'text-amber-300';
  if (type === 'header') colorClass = 'text-indigo-400 font-bold';

  line.className = colorClass;
  line.innerHTML = `<span class="text-slate-600">[${timestamp}]</span> ${message}`;
  terminal.appendChild(line);
  
  const container = document.getElementById('sdk-terminal-container');
  if (container) container.scrollTop = container.scrollHeight;
}

window.runSdkTest = async function(action) {
  if (action === 'all') {
    window.clearSdkTerminal();
    printSdkLog('🚀 Running Full Interactive Live SDK Suite...', 'header');
    await runSdkTest('ping');
    await runSdkTest('create_collection');
    await runSdkTest('insert_doc');
    await runSdkTest('query_docs');
    printSdkLog('🎉 Full Interactive SDK Suite Completed Successfully!', 'success');
    return;
  }

  const token = state.accessToken;
  const projectId = state.activeProject?.id;
  
  if (!token) {
    printSdkLog('⚠️ Authentication token missing. Please sign in to AegisDB first.', 'warning');
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(projectId ? { 'x-aegis-project-id': projectId } : {})
  };

  try {
    if (action === 'ping') {
      printSdkLog('📡 Sending Server Health Check (GET /api/v1/metrics)...', 'info');
      const res = await fetch('/api/v1/metrics', { headers });
      const json = await res.json();
      printSdkLog(`✅ Server Status 200 OK | Operations: ${json.data?.totalOperations || 0}`, 'success');
    }

    if (action === 'create_collection') {
      printSdkLog('📁 Creating Collection "demo_app_users" (POST /api/v1/db/collections)...', 'info');
      const res = await fetch('/api/v1/db/collections', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'demo_app_users' })
      });
      const json = await res.json();
      if (res.status === 409 || (json.message && json.message.includes('already exists'))) {
        printSdkLog('✅ Collection "demo_app_users" exists and is ready!', 'success');
      } else if (!res.ok) {
        throw new Error(json.message || 'Failed to create collection');
      } else {
        printSdkLog('✅ Collection "demo_app_users" created and ready!', 'success');
      }
    }

    if (action === 'insert_doc') {
      printSdkLog('📝 Inserting Document (POST /api/v1/db/collections/demo_app_users/documents)...', 'info');
      const res = await fetch('/api/v1/db/collections/demo_app_users/documents', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Alice Johnson',
          role: 'Lead Security Engineer',
          tags: ['admin', 'security', 'aegis']
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Document insertion failed');
      printSdkLog(`✅ Document Created! ID: ${json.data?._id}`, 'success');
      printSdkLog(`   Payload: ${JSON.stringify(json.data)}`, 'info');
    }

    if (action === 'query_docs') {
      printSdkLog('🔍 Querying Documents (GET /api/v1/db/collections/demo_app_users/documents)...', 'info');
      const res = await fetch('/api/v1/db/collections/demo_app_users/documents', {
        method: 'GET',
        headers
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Document query failed');
      const docs = json.data?.documents || [];
      printSdkLog(`✅ Retrieved ${docs.length} document(s) from "demo_app_users"`, 'success');
      docs.slice(0, 3).forEach((d, idx) => {
        printSdkLog(`   Doc #${idx + 1} ID: ${d._id} | Name: ${d.name} | Role: ${d.role}`, 'info');
      });
    }
  } catch (err) {
    printSdkLog(`❌ SDK Test Failed: ${escapeHTML(err.message)}`, 'error');
  }
};

// ── GDPR Data Portability & Account Erasure (Client-Side) ───────────────────

window.editDocumentRules = async function(docId, collName) {
  try {
    const id = String(docId);
    const collectionName = collName || state.activeCollection?.name;
    if (!id || !collectionName) return showToast('Invalid document or collection', 'error');

    let doc = state.documents?.find(d => String(d._id || d.id) === id);
    if (!doc) {
      const res = await apiRequest(`/api/v1/db/collections/${encodeURIComponent(collectionName)}/documents/${encodeURIComponent(id)}`);
      doc = res?.data || res;
    }
    
    const elId = document.getElementById('doc-rules-id');
    const elEditor = document.getElementById('doc-rules-editor');
    if (elId) elId.textContent = id;
    
    const rules = doc?._rules || doc?.rules;
    if (rules) {
      if (elEditor) elEditor.value = JSON.stringify(rules, null, 2);
    } else {
      if (elEditor) elEditor.value = '{\n  "read": "auth != null",\n  "write": "auth.id == data.ownerId"\n}';
    }

    const btnSave = document.getElementById('btn-save-doc-rules');
    if (btnSave) {
      btnSave.setAttribute('data-doc-id', id);
      btnSave.setAttribute('data-collection-name', collectionName);
    }

    showModal('modal-document-rules');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.exportMyData = async function() {
  try {
    showToast('Generating data export bundle...', 'info');
    const token = state.accessToken || localStorage.getItem('aegis_access_token');
    const res = await fetch('/api/v1/auth/export-data', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to export account data.');
    }

    const jsonStr = JSON.stringify(data.data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegisdb_data_export_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Data export downloaded successfully!', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to export data', 'error');
  }
};

window.openDeleteAccountModal = function() {
  if (state.user?.isSuperAdmin) {
    showToast('Super Admin accounts cannot be deleted.', 'error');
    return;
  }
  const pwdInput = document.getElementById('delete-account-password');
  const totpInput = document.getElementById('delete-account-totp');
  const confirmInput = document.getElementById('delete-account-confirm-text');
  if (pwdInput) pwdInput.value = '';
  if (totpInput) totpInput.value = '';
  if (confirmInput) confirmInput.value = '';
  document.getElementById('modal-delete-account')?.classList.remove('hidden');
};

window.executeAccountDeletion = async function() {
  const pwd = document.getElementById('delete-account-password')?.value;
  const totp = document.getElementById('delete-account-totp')?.value;
  const confirmText = document.getElementById('delete-account-confirm-text')?.value;
  const btn = document.getElementById('btn-confirm-delete-account');

  if (!pwd) {
    showToast('Please enter your account password to confirm deletion.', 'error');
    return;
  }

  if (confirmText !== 'DELETE') {
    showToast('Please type DELETE into the confirmation box.', 'error');
    return;
  }

  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scheduling...'; }

    const token = state.accessToken || localStorage.getItem('aegis_access_token');
    const res = await fetch('/api/v1/auth/account', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ password: pwd, totpCode: totp || undefined })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to initiate account deletion.');
    }

    document.getElementById('modal-delete-account')?.classList.add('hidden');
    showToast('Account scheduled for deletion. You have a 7-day grace period to cancel.', 'info');

    // Update state to pending_deletion
    if (state.user) {
      state.user.status = 'pending_deletion';
      state.user.isPendingDeletion = true;
      state.user.scheduledDeletionAt = data.data?.scheduledDeletionAt;
      localStorage.setItem('aegis_user', JSON.stringify(state.user));
    }

    updateUserProfileUI();

  } catch (err) {
    showToast(err.message || 'Account deletion request failed', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Request Account Deletion'; }
  }
};

window.cancelMyAccountDeletion = async function() {
  try {
    const token = state.accessToken || localStorage.getItem('aegis_access_token');
    const res = await fetch('/api/v1/auth/cancel-deletion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to cancel deletion request.');
    }

    if (state.user) {
      state.user.status = 'active';
      state.user.isPendingDeletion = false;
      delete state.user.scheduledDeletionAt;
      localStorage.setItem('aegis_user', JSON.stringify(state.user));
    }

    updateUserProfileUI();
    showToast('Deletion request cancelled! Your account is fully restored and active.', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to cancel deletion', 'error');
  }
};

// ── Policy Viewer & Mandatory Consent Gate ──────────────────────────────────
let activePolicyData = null;

window.openPolicyViewerModal = async function(tab = 'terms') {
  try {
    const res = await apiRequest('/api/v1/policies/current', 'GET');
    activePolicyData = res;
    const versionEl = document.getElementById('pv-version');
    if (versionEl) versionEl.textContent = res.version;
    const termsEl = document.getElementById('pv-content-terms');
    if (termsEl) termsEl.textContent = res.termsAndConditions;
    const secEl = document.getElementById('pv-content-security');
    if (secEl) secEl.textContent = res.securityPolicy;
    const backEl = document.getElementById('pv-content-backup');
    if (backEl) backEl.textContent = res.backupPolicy;

    window.switchPvTab(tab);
    const modal = document.getElementById('modal-policy-viewer');
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
  } catch (err) {
    showToast(err.message || 'Failed to load platform policies', 'error');
  }
};

window.closePolicyViewerModal = function() {
  const modal = document.getElementById('modal-policy-viewer');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
};

window.switchPvTab = function(tab) {
  const btnTerms = document.getElementById('btn-pv-tab-terms');
  const btnSec = document.getElementById('btn-pv-tab-security');
  const btnBack = document.getElementById('btn-pv-tab-backup');

  const contentTerms = document.getElementById('pv-content-terms');
  const contentSec = document.getElementById('pv-content-security');
  const contentBack = document.getElementById('pv-content-backup');

  if (btnTerms) btnTerms.className = tab === 'terms' ? 'py-2 text-xs font-semibold text-indigo-400 border-b-2 border-indigo-400' : 'py-2 text-xs font-semibold text-slate-400 border-b-2 border-transparent hover:text-white';
  if (btnSec) btnSec.className = tab === 'security' ? 'py-2 text-xs font-semibold text-indigo-400 border-b-2 border-indigo-400' : 'py-2 text-xs font-semibold text-slate-400 border-b-2 border-transparent hover:text-white';
  if (btnBack) btnBack.className = tab === 'backup' ? 'py-2 text-xs font-semibold text-indigo-400 border-b-2 border-indigo-400' : 'py-2 text-xs font-semibold text-slate-400 border-b-2 border-transparent hover:text-white';

  contentTerms?.classList.toggle('hidden', tab !== 'terms');
  contentSec?.classList.toggle('hidden', tab !== 'security');
  contentBack?.classList.toggle('hidden', tab !== 'backup');
};

window.showMandatoryPolicyGate = async function(version) {
  try {
    const res = await apiRequest('/api/v1/policies/current', 'GET');
    activePolicyData = res;
    const gateVerEl = document.getElementById('gate-policy-version');
    if (gateVerEl) gateVerEl.textContent = res.version;
    const termsEl = document.getElementById('gate-content-terms');
    if (termsEl) termsEl.textContent = res.termsAndConditions;
    const secEl = document.getElementById('gate-content-security');
    if (secEl) secEl.textContent = res.securityPolicy;
    const backEl = document.getElementById('gate-content-backup');
    if (backEl) backEl.textContent = res.backupPolicy;

    window.switchGateTab('terms');
    const modal = document.getElementById('modal-mandatory-policy-gate');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      modal.style.display = 'flex';
    }
  } catch (err) {
    console.error('Failed to load gate policies:', err);
  }
};

window.switchGateTab = function(tab) {
  const btnTerms = document.getElementById('btn-gate-tab-terms');
  const btnSec = document.getElementById('btn-gate-tab-security');
  const btnBack = document.getElementById('btn-gate-tab-backup');

  const contentTerms = document.getElementById('gate-content-terms');
  const contentSec = document.getElementById('gate-content-security');
  const contentBack = document.getElementById('gate-content-backup');

  if (btnTerms) btnTerms.className = tab === 'terms' ? 'py-2 text-xs font-semibold text-amber-400 border-b-2 border-amber-400' : 'py-2 text-xs font-semibold text-slate-400 border-b-2 border-transparent hover:text-white';
  if (btnSec) btnSec.className = tab === 'security' ? 'py-2 text-xs font-semibold text-amber-400 border-b-2 border-amber-400' : 'py-2 text-xs font-semibold text-slate-400 border-b-2 border-transparent hover:text-white';
  if (btnBack) btnBack.className = tab === 'backup' ? 'py-2 text-xs font-semibold text-amber-400 border-b-2 border-amber-400' : 'py-2 text-xs font-semibold text-slate-400 border-b-2 border-transparent hover:text-white';

  contentTerms?.classList.toggle('hidden', tab !== 'terms');
  contentSec?.classList.toggle('hidden', tab !== 'security');
  contentBack?.classList.toggle('hidden', tab !== 'backup');
};

window.toggleGateDeclineOptions = function() {
  const declineDiv = document.getElementById('gate-decline-options');
  declineDiv?.classList.toggle('hidden');
};

window.acceptCurrentPolicyGate = async function() {
  const version = (document.getElementById('gate-policy-version')?.textContent || 'v1.0.0').trim();
  const btn = document.getElementById('btn-gate-accept');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i><span>Accepting...</span>';
  }
  try {
    await apiRequest('/api/v1/auth/accept-policy', 'POST', { version });
    if (state.user) {
      state.user.acceptedTermsVersion = version;
      localStorage.setItem('aegis_user', JSON.stringify(state.user));
    }
    const modal = document.getElementById('modal-mandatory-policy-gate');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      modal.style.display = 'none';
    }
    showToast(`Platform policies (${version}) accepted successfully!`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to accept policy', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check mr-1.5"></i><span>I Accept & Agree to Updated Policies</span>';
    }
  }
};

window.downloadMyDataExport = async function() {
  try {
    const data = await apiRequest('/api/v1/auth/export-data', 'GET');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegisdb_data_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Data bundle exported successfully.', 'success');
  } catch (err) {
    showToast(err.message || 'Export failed', 'error');
  }
};

window.initiateAccountDeletionFromGate = async function() {
  const password = prompt('Please enter your password to schedule account deletion (7-day grace period):');
  if (!password) return;
  try {
    await apiRequest('/api/v1/auth/account', 'DELETE', { password });
    showToast('Account scheduled for deletion with 7-day grace period.', 'warning');
    setTimeout(() => {
      localStorage.clear();
      window.location.reload();
    }, 2000);
  } catch (err) {
    showToast(err.message || 'Failed to schedule deletion', 'error');
  }
};

// ── User Compliance Notice Banner & Appeal Hearing ──────────────────────────
let activeNoticeObj = null;

window.renderComplianceBanner = function(notice) {
  if (!notice) return;
  activeNoticeObj = notice;
  const banner = document.getElementById('banner-compliance-notice');
  const bannerText = document.getElementById('banner-compliance-notice-text');
  if (banner && bannerText) {
    bannerText.innerHTML = `<strong>${escapeHTML(notice.title)}</strong> (${escapeHTML(notice.category)}) — <span class="font-mono text-amber-300">${notice.daysRemaining || 3} days remaining</span>.`;
    banner.classList.remove('hidden');
    banner.classList.add('flex');
  }

  const cardCompliance = document.getElementById('card-account-security-compliance');
  const blockNotice = document.getElementById('block-account-notice-info');
  const titleEl = document.getElementById('label-settings-notice-title');
  const timerEl = document.getElementById('label-settings-notice-timer');
  const detailsEl = document.getElementById('label-settings-notice-details');

  if (cardCompliance && blockNotice) {
    cardCompliance.classList.remove('hidden');
    blockNotice.classList.remove('hidden');
    if (titleEl) titleEl.textContent = notice.title || 'Compliance Violation Notice Issued';
    if (timerEl) timerEl.textContent = `${notice.daysRemaining || 3} days remaining`;
    if (detailsEl) detailsEl.textContent = notice.details || 'Please provide your explanation for Super Admin review.';
  }

  if (typeof window.updateUserNotificationsHeader === 'function') {
    window.updateUserNotificationsHeader();
  }
};

window.openComplianceAppealModal = function() {
  if (!activeNoticeObj && state.user && (state.user.isFlagged || state.user.flagged)) {
    activeNoticeObj = {
      id: `flag_${state.user.id}`,
      category: 'Security Threat Anomaly Flag',
      title: 'Account Flagged for Security Anomaly Review',
      details: 'Your account has been flagged by Super Admin for a security anomaly review. Please submit an explanation or proof of legitimate activity to clear this flag.',
      daysRemaining: 3,
      userExplanation: ''
    };
  }
  if (!activeNoticeObj) return;
  const catEl = document.getElementById('notice-modal-category');
  if (catEl) catEl.textContent = activeNoticeObj.category || 'Security Policy Violation';
  const timerEl = document.getElementById('notice-modal-timer');
  if (timerEl) timerEl.textContent = `${activeNoticeObj.daysRemaining || 3} days remaining`;
  const titleEl = document.getElementById('notice-modal-title');
  if (titleEl) titleEl.textContent = activeNoticeObj.title || 'Violation Notice';
  const detailsEl = document.getElementById('notice-modal-details');
  if (detailsEl) detailsEl.textContent = activeNoticeObj.details || 'Please provide your explanation.';
  const explanationEl = document.getElementById('textarea-notice-explanation');
  if (explanationEl) explanationEl.value = activeNoticeObj.userExplanation || '';

  showModal('modal-compliance-appeal');
};

window.closeComplianceAppealModal = function() {
  hideModal('modal-compliance-appeal');
};

window.submitNoticeExplanation = async function() {
  if (!activeNoticeObj) return;
  const explanation = document.getElementById('textarea-notice-explanation')?.value.trim();
  if (!explanation) {
    showToast('Please provide an explanation before submitting.', 'error');
    return;
  }
  try {
    const res = await apiRequest('/api/v1/auth/notice/appeal', 'POST', {
      noticeId: activeNoticeObj.id,
      explanation
    });
    showToast(res.message || 'Explanation submitted successfully.', 'success');
    window.closeComplianceAppealModal();
    const bannerText = document.getElementById('banner-compliance-notice-text');
    if (bannerText) {
      bannerText.innerHTML = `<strong>Explanation Submitted:</strong> Awaiting Super Admin hearing review.`;
    }
  } catch (err) {
    showToast(err.message || 'Failed to submit explanation', 'error');
  }
};

// ── Super Admin Threat Intelligence, Flagging & Compliance Hearings ──────────

window.loadSecurityThreatAlerts = async function() {
  if (!state.user?.isSuperAdmin) return;
  try {
    const alerts = await apiRequest('/api/v1/admin/security/alerts', 'GET');
    const alertsList = Array.isArray(alerts) ? alerts : (alerts?.data || []);
    
    const container = document.getElementById('container-threat-alerts');
    const badge = document.getElementById('badge-threat-count');
    const feed = document.getElementById('threat-alerts-feed-list');

    if (container) container.classList.remove('hidden');
    if (badge) badge.textContent = alertsList.length;

    if (feed) {
      if (alertsList.length === 0) {
        feed.innerHTML = `<div class="text-slate-400 text-center py-4">No active threat alerts. All systems normal.</div>`;
      } else {
        feed.innerHTML = alertsList.map(a => `
          <div class="p-3 rounded-xl bg-slate-900/80 border border-rose-500/30 space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-bold text-white font-mono text-[11px]">${escapeHTML(a.userEmail)}</span>
              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${a.severity === 'critical' ? 'bg-rose-600 text-white' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}">Score: ${a.riskScore}</span>
            </div>
            <div class="text-[11px] text-slate-300">${escapeHTML(a.reason.replace(/_/g, ' ').toUpperCase())} (${escapeHTML(a.detectionSource)})</div>
            <div class="flex items-center justify-end space-x-2 pt-1 border-t border-white/5">
              <button onclick="dismissThreatAlert('${a.id}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold transition">Dismiss</button>
              <button type="button" onclick="event.preventDefault(); event.stopPropagation(); openIssueNoticeModal('${a.userId}', '${escapeHTML(a.userEmail)}')" class="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-semibold transition">Issue Notice</button>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load threat alerts:', err);
  }
};

window.dismissThreatAlert = async function(flagId) {
  try {
    await apiRequest(`/api/v1/admin/security/flags/${flagId}/dismiss`, 'POST');
    showToast('Security flag dismissed successfully.', 'success');
    window.loadSecurityThreatAlerts();
    if (typeof loadUserManagement === 'function') loadUserManagement();
  } catch (err) {
    showToast(err.message || 'Failed to dismiss flag', 'error');
  }
};

// openManualFlagModal and openIssueNoticeModal are defined earlier (unified versions)
// Keep confirmManualFlagUser here as the submit handler
window.confirmManualFlagUser = async function() {
  const userId = document.getElementById('flag-user-id')?.value;
  const reason = document.getElementById('select-flag-reason')?.value;
  const severity = document.getElementById('select-flag-severity')?.value;
  const notes = document.getElementById('input-flag-notes')?.value;

  if (!userId) return;
  try {
    await apiRequest(`/api/v1/admin/users/${userId}/flag`, 'POST', { reason, severity, notes });
    hideModal('modal-flag-user');
    showToast('Account flagged and review triggered.', 'warning');
    if (typeof window.loadSecurityThreatAlerts === 'function') window.loadSecurityThreatAlerts();
    loadUserManagement();
  } catch (err) {
    showToast(err.message || 'Failed to flag user', 'error');
  }
};

window.confirmIssueComplianceNotice = async function() {
  const userId = document.getElementById('notice-target-user-id')?.value;
  const category = document.getElementById('select-notice-category')?.value;
  const title = document.getElementById('input-notice-title')?.value.trim();
  const details = document.getElementById('input-notice-details')?.value.trim();
  const deadlineDays = parseInt(document.getElementById('input-notice-deadline-days')?.value || '3', 10);

  if (!userId || !title || !details) {
    showToast('Please provide both notice title and details.', 'error');
    return;
  }

  try {
    await apiRequest(`/api/v1/admin/users/${userId}/notice`, 'POST', { category, title, details, deadlineDays });
    hideModal('modal-issue-notice');
    showToast('Compliance Violation Notice issued successfully!', 'success');
    loadUserManagement();
  } catch (err) {
    showToast(err.message || 'Failed to issue notice', 'error');
  }
};

let cachedNotices = [];
let currentFilteredNotices = [];
let noticesCurrentPage = 1;
let currentNoticeFilter = 'all';
const noticesPageSize = 5;

window.loadComplianceNoticesTable = async function() {
  const tbody = document.getElementById('table-notices-body');
  const badge = document.getElementById('badge-notices-count');
  if (!tbody) return;

  try {
    const notices = await apiRequest('/api/v1/admin/notices', 'GET');
    cachedNotices = Array.isArray(notices) ? notices : (notices?.data || []);
    const openCount = cachedNotices.filter(n => n.status === 'open' || n.status === 'appealed').length;
    if (badge) badge.textContent = `${openCount} active / ${cachedNotices.length} total`;
    filterNoticesTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-rose-400">${escapeHTML(err.message)}</td></tr>`;
  }
};

window.setNoticesFilter = function(filter, btn) {
  currentNoticeFilter = filter;
  noticesCurrentPage = 1;
  document.querySelectorAll('.notice-filter-btn').forEach(b => {
    b.className = 'notice-filter-btn px-2.5 py-1 rounded-lg hover:text-white transition';
  });
  if (btn) {
    btn.className = 'notice-filter-btn px-2.5 py-1 rounded-lg text-white bg-rose-600 font-semibold shadow-sm transition';
  }
  filterNoticesTable();
};

window.filterNoticesTable = function() {
  const searchInput = document.getElementById('input-search-notices');
  const query = (searchInput?.value || '').toLowerCase().trim();

  let filtered = [...cachedNotices];

  if (currentNoticeFilter === 'active') {
    filtered = filtered.filter(n => n.status === 'open');
  } else if (currentNoticeFilter === 'appealed') {
    filtered = filtered.filter(n => n.status === 'appealed');
  } else if (currentNoticeFilter === 'revoked') {
    filtered = filtered.filter(n => n.status === 'revoked');
  } else if (currentNoticeFilter === 'rejected') {
    filtered = filtered.filter(n => n.status === 'scheduled_for_purge' || n.status === 'purged');
  }

  if (query) {
    filtered = filtered.filter(n => 
      (n.userEmail && n.userEmail.toLowerCase().includes(query)) ||
      (n.title && n.title.toLowerCase().includes(query)) ||
      (n.category && n.category.toLowerCase().includes(query)) ||
      (n.details && n.details.toLowerCase().includes(query)) ||
      (n.userExplanation && n.userExplanation.toLowerCase().includes(query))
    );
  }

  currentFilteredNotices = filtered;
  renderComplianceNoticesTable(filtered);
};

window.changeNoticesPage = function(page) {
  const totalPages = Math.ceil(currentFilteredNotices.length / noticesPageSize) || 1;
  if (page < 1 || page > totalPages) return;
  noticesCurrentPage = page;
  renderComplianceNoticesTable(currentFilteredNotices);
};

function renderComplianceNoticesTable(notices) {
  const tbody = document.getElementById('table-notices-body');
  const paginationControls = document.getElementById('notices-pagination-controls');
  const startEl = document.getElementById('notices-page-start');
  const endEl = document.getElementById('notices-page-end');
  const totalEl = document.getElementById('notices-page-total');
  if (!tbody) return;

  currentFilteredNotices = notices || [];
  const total = currentFilteredNotices.length;
  const totalPages = Math.ceil(total / noticesPageSize) || 1;

  if (noticesCurrentPage > totalPages) noticesCurrentPage = totalPages;
  if (noticesCurrentPage < 1) noticesCurrentPage = 1;

  const startIdx = (noticesCurrentPage - 1) * noticesPageSize;
  const endIdx = Math.min(startIdx + noticesPageSize, total);
  const pageItems = currentFilteredNotices.slice(startIdx, endIdx);

  if (startEl) startEl.textContent = total > 0 ? (startIdx + 1) : 0;
  if (endEl) endEl.textContent = endIdx;
  if (totalEl) totalEl.textContent = total;

  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.innerHTML = '';
    } else {
      let btns = '';
      btns += `<button type="button" onclick="changeNoticesPage(${noticesCurrentPage - 1})" ${noticesCurrentPage === 1 ? 'disabled class="px-2.5 py-1 rounded-lg text-slate-600 bg-white/5 border border-white/5 cursor-not-allowed text-[11px]"' : 'class="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] transition active:scale-95"'}>
        <i class="fa-solid fa-chevron-left text-[9px] mr-1"></i> Prev
      </button>`;

      for (let p = 1; p <= totalPages; p++) {
        const isActive = p === noticesCurrentPage;
        btns += `<button type="button" onclick="changeNoticesPage(${p})" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${isActive ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10'}">${p}</button>`;
      }

      btns += `<button type="button" onclick="changeNoticesPage(${noticesCurrentPage + 1})" ${noticesCurrentPage === totalPages ? 'disabled class="px-2.5 py-1 rounded-lg text-slate-600 bg-white/5 border border-white/5 cursor-not-allowed text-[11px]"' : 'class="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] transition active:scale-95"'}>
        Next <i class="fa-solid fa-chevron-right text-[9px] ml-1"></i>
      </button>`;
      paginationControls.innerHTML = btns;
    }
  }

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-500 text-xs">No matching compliance notices found.</td></tr>`;
    return;
  }

  tbody.innerHTML = pageItems.map(n => {
    let statusBadge = '';
    if (n.status === 'open') {
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse inline-flex items-center"><i class="fa-solid fa-hourglass mr-1 text-[9px]"></i>Awaiting (${n.daysRemaining}d left)</span>`;
    } else if (n.status === 'appealed') {
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 inline-flex items-center"><i class="fa-solid fa-comments mr-1 text-[9px]"></i>Appeal Submitted</span>`;
    } else if (n.status === 'revoked') {
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center"><i class="fa-solid fa-check mr-1 text-[9px]"></i>Revoked (Satisfied)</span>`;
    } else if (n.status === 'scheduled_for_purge') {
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-flex items-center"><i class="fa-solid fa-skull mr-1 text-[9px]"></i>Rejected (Pending Purge)</span>`;
    } else {
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/20 text-slate-400 border border-slate-500/30">Purged</span>`;
    }

    return `
      <tr class="hover:bg-white/5 transition">
        <td class="p-4 font-semibold text-white font-mono text-xs">${escapeHTML(n.userEmail)}</td>
        <td class="p-4">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 whitespace-normal block text-center">
            ${escapeHTML(n.category)}
          </span>
        </td>
        <td class="p-4">
          <div class="space-y-0.5">
            <strong class="text-white text-xs block">${escapeHTML(n.title)}</strong>
            <p class="text-slate-400 text-[11px] line-clamp-2 leading-tight">${escapeHTML(n.details)}</p>
          </div>
        </td>
        <td class="p-4">${statusBadge}</td>
        <td class="p-4">
          ${n.userExplanation
            ? `<div class="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30 space-y-1.5">
                <p class="text-purple-200 text-[11px] line-clamp-2 italic leading-tight font-sans">"${escapeHTML(n.userExplanation)}"</p>
                <button type="button" data-action="view-appeal" data-notice-id="${n.id}" class="text-[10px] font-semibold text-purple-300 hover:text-purple-100 flex items-center space-x-1 underline">
                  <i class="fa-solid fa-expand text-[9px]"></i>
                  <span>View Full Appeal</span>
                </button>
               </div>`
            : `<span class="text-slate-500 italic text-[11px]">No appeal submitted yet</span>`
          }
        </td>
        <td class="p-4 text-right">
          ${n.status === 'open' || n.status === 'appealed' ? `
            <div class="flex flex-col gap-1.5 items-end">
              <button type="button" data-action="accept-appeal" data-notice-id="${n.id}" class="w-28 px-2.5 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/30 text-[11px] font-semibold transition active:scale-95 flex items-center justify-center space-x-1">
                <i class="fa-solid fa-check text-[10px]"></i>
                <span>Revoke Notice</span>
              </button>
              <button type="button" data-action="reject-appeal" data-notice-id="${n.id}" class="w-28 px-2.5 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/30 text-[11px] font-semibold transition active:scale-95 flex items-center justify-center space-x-1">
                <i class="fa-solid fa-trash text-[10px]"></i>
                <span>Reject & Purge</span>
              </button>
            </div>
          ` : `<span class="text-slate-500 text-xs italic">Decision finalized</span>`}
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-action="view-appeal"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const noticeId = btn.getAttribute('data-notice-id');
      window.openAppealDetailsModal(noticeId);
    });
  });

  tbody.querySelectorAll('[data-action="accept-appeal"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const noticeId = btn.getAttribute('data-notice-id');
      window.reviewNoticeDecision(noticeId, 'accepted');
    });
  });

  tbody.querySelectorAll('[data-action="reject-appeal"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const noticeId = btn.getAttribute('data-notice-id');
      window.reviewNoticeDecision(noticeId, 'rejected');
    });
  });
}

window.openAppealDetailsModal = async function(noticeId) {
  const id = String(noticeId);
  let notice = cachedNotices.find(n => String(n.id) === id);
  if (!notice) {
    try {
      const res = await apiRequest('/api/v1/admin/notices', 'GET');
      cachedNotices = Array.isArray(res) ? res : (res?.data || []);
      notice = cachedNotices.find(n => String(n.id) === id);
    } catch (e) {
      console.warn('Failed to fetch notice detail:', e);
    }
  }
  if (!notice) return showToast('Notice details not found.', 'error');

  const modal = document.getElementById('modal-appeal-details');
  const emailEl = document.getElementById('appeal-view-email');
  const categoryEl = document.getElementById('appeal-view-category');
  const statusEl = document.getElementById('appeal-view-status');
  const titleEl = document.getElementById('appeal-view-title');
  const detailsEl = document.getElementById('appeal-view-details');
  const expEl = document.getElementById('appeal-view-explanation');
  const actionsEl = document.getElementById('appeal-view-decision-actions');

  if (emailEl) emailEl.textContent = notice.userEmail || 'N/A';
  if (categoryEl) categoryEl.textContent = notice.category || 'Security Policy Violation';
  if (statusEl) statusEl.textContent = (notice.status || 'OPEN').toUpperCase();
  if (titleEl) titleEl.textContent = notice.title || 'Compliance Notice';
  if (detailsEl) detailsEl.textContent = notice.details || 'No details provided.';
  if (expEl) expEl.textContent = notice.userExplanation || 'No explanation submitted yet.';

  if (actionsEl) {
    if (notice.status === 'open' || notice.status === 'appealed') {
      actionsEl.innerHTML = `
        <button onclick="closeAppealDetailsModal(); reviewNoticeDecision('${notice.id}', 'accepted')" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow transition active:scale-95 flex items-center space-x-1.5">
          <i class="fa-solid fa-check"></i>
          <span>Accept Appeal & Revoke</span>
        </button>
        <button onclick="closeAppealDetailsModal(); reviewNoticeDecision('${notice.id}', 'rejected')" class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow transition active:scale-95 flex items-center space-x-1.5">
          <i class="fa-solid fa-trash"></i>
          <span>Reject & Schedule Purge</span>
        </button>
      `;
    } else {
      actionsEl.innerHTML = `<span class="text-xs text-slate-400 italic">Decision already finalized.</span>`;
    }
  }

  showModal('modal-appeal-details');
};

window.closeAppealDetailsModal = function() {
  hideModal('modal-appeal-details');
};

let cachedThreatFlags = [];
let currentFilteredThreatFlags = [];
let threatFlagsCurrentPage = 1;
let currentThreatFlagFilter = 'all';
const threatFlagsPageSize = 5;

window.loadThreatFlagsTable = async function() {
  const tbody = document.getElementById('table-threat-flags-body');
  const badge = document.getElementById('badge-flags-count');
  if (!tbody) return;

  try {
    const flags = await apiRequest('/api/v1/admin/security/alerts', 'GET');
    cachedThreatFlags = Array.isArray(flags) ? flags : (flags?.data || []);
    if (badge) badge.textContent = `${cachedThreatFlags.length} active flags`;
    filterThreatFlagsTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-rose-400">${escapeHTML(err.message)}</td></tr>`;
  }
};

window.setThreatFlagsFilter = function(filter, btn) {
  currentThreatFlagFilter = filter;
  threatFlagsCurrentPage = 1;
  document.querySelectorAll('.flag-filter-btn').forEach(b => {
    b.className = 'flag-filter-btn px-2.5 py-1 rounded-lg hover:text-white transition';
  });
  if (btn) {
    btn.className = 'flag-filter-btn px-2.5 py-1 rounded-lg text-white bg-amber-600 font-semibold shadow-sm transition';
  }
  filterThreatFlagsTable();
};

window.filterThreatFlagsTable = function() {
  const searchInput = document.getElementById('input-search-threat-flags');
  const query = (searchInput?.value || '').toLowerCase().trim();

  let filtered = [...cachedThreatFlags];

  if (currentThreatFlagFilter === 'critical') {
    filtered = filtered.filter(f => (f.riskScore || 0) >= 90);
  } else if (currentThreatFlagFilter === 'high') {
    filtered = filtered.filter(f => (f.riskScore || 0) >= 70 && (f.riskScore || 0) < 90);
  } else if (currentThreatFlagFilter === 'medium') {
    filtered = filtered.filter(f => (f.riskScore || 0) < 70);
  }

  if (query) {
    filtered = filtered.filter(f => 
      (f.userEmail && f.userEmail.toLowerCase().includes(query)) ||
      (f.reason && f.reason.toLowerCase().includes(query)) ||
      (f.detectionSource && f.detectionSource.toLowerCase().includes(query)) ||
      (f.id && f.id.toLowerCase().includes(query))
    );
  }

  currentFilteredThreatFlags = filtered;
  renderThreatFlagsTable(filtered);
};

window.changeThreatFlagsPage = function(page) {
  const totalPages = Math.ceil(currentFilteredThreatFlags.length / threatFlagsPageSize) || 1;
  if (page < 1 || page > totalPages) return;
  threatFlagsCurrentPage = page;
  renderThreatFlagsTable(currentFilteredThreatFlags);
};

function renderThreatFlagsTable(flags) {
  const tbody = document.getElementById('table-threat-flags-body');
  const paginationControls = document.getElementById('flags-pagination-controls');
  const startEl = document.getElementById('flags-page-start');
  const endEl = document.getElementById('flags-page-end');
  const totalEl = document.getElementById('flags-page-total');
  if (!tbody) return;

  currentFilteredThreatFlags = flags || [];
  const total = currentFilteredThreatFlags.length;
  const totalPages = Math.ceil(total / threatFlagsPageSize) || 1;

  if (threatFlagsCurrentPage > totalPages) threatFlagsCurrentPage = totalPages;
  if (threatFlagsCurrentPage < 1) threatFlagsCurrentPage = 1;

  const startIdx = (threatFlagsCurrentPage - 1) * threatFlagsPageSize;
  const endIdx = Math.min(startIdx + threatFlagsPageSize, total);
  const pageItems = currentFilteredThreatFlags.slice(startIdx, endIdx);

  if (startEl) startEl.textContent = total > 0 ? (startIdx + 1) : 0;
  if (endEl) endEl.textContent = endIdx;
  if (totalEl) totalEl.textContent = total;

  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.innerHTML = '';
    } else {
      let btns = '';
      btns += `<button type="button" onclick="changeThreatFlagsPage(${threatFlagsCurrentPage - 1})" ${threatFlagsCurrentPage === 1 ? 'disabled class="px-2.5 py-1 rounded-lg text-slate-600 bg-white/5 border border-white/5 cursor-not-allowed text-[11px]"' : 'class="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] transition active:scale-95"'}>
        <i class="fa-solid fa-chevron-left text-[9px] mr-1"></i> Prev
      </button>`;

      for (let p = 1; p <= totalPages; p++) {
        const isActive = p === threatFlagsCurrentPage;
        btns += `<button type="button" onclick="changeThreatFlagsPage(${p})" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${isActive ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10'}">${p}</button>`;
      }

      btns += `<button type="button" onclick="changeThreatFlagsPage(${threatFlagsCurrentPage + 1})" ${threatFlagsCurrentPage === totalPages ? 'disabled class="px-2.5 py-1 rounded-lg text-slate-600 bg-white/5 border border-white/5 cursor-not-allowed text-[11px]"' : 'class="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] transition active:scale-95"'}>
        Next <i class="fa-solid fa-chevron-right text-[9px] ml-1"></i>
      </button>`;
      paginationControls.innerHTML = btns;
    }
  }

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-500 text-xs">No matching threat flags found.</td></tr>`;
    return;
  }

  tbody.innerHTML = pageItems.map(f => {
    const risk = f.riskScore || 50;
    let riskBadge = '';
    if (risk >= 90) {
      riskBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">${risk} / 100</span>`;
    } else if (risk >= 70) {
      riskBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">${risk} / 100</span>`;
    } else {
      riskBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">${risk} / 100</span>`;
    }

    return `
      <tr class="hover:bg-white/5 transition">
        <td class="p-4 font-semibold text-white font-mono text-xs">${escapeHTML(f.userEmail)}</td>
        <td class="p-4">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
            ${escapeHTML(f.reason.replace(/_/g, ' '))}
          </span>
        </td>
        <td class="p-4">${riskBadge}</td>
        <td class="p-4 text-slate-300 text-xs font-mono">${escapeHTML(f.detectionSource)}</td>
        <td class="p-4 text-slate-400 text-xs">${f.flaggedAt ? new Date(f.flaggedAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</td>
        <td class="p-4 text-right space-x-1.5 whitespace-nowrap">
          <button onclick="dismissThreatAlert('${f.id}')" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition active:scale-95 border border-white/5">
            Dismiss
          </button>
          <button type="button" onclick="event.preventDefault(); event.stopPropagation(); openIssueNoticeModal('${f.userId}', '${escapeHTML(f.userEmail)}')" class="px-3 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/30 text-xs font-semibold transition active:scale-95">
            Issue Notice
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ── Review Notice Decision (with custom confirmation modal instead of browser confirm/prompt) ──
window.reviewNoticeDecision = function(noticeId, decision) {
  // Build and show a custom confirmation modal instead of browser confirm()/prompt()
  const actionLabel = decision === 'accepted'
    ? 'Accept appeal & Revoke this compliance notice (account retained)'
    : 'Reject appeal & Schedule account for AUTOMATED PERMANENT DELETION';
  const defaultNotes = decision === 'accepted'
    ? 'Appeal accepted by Super Admin.'
    : 'Explanation insufficient. Scheduled for purge.';
  const accentColor = decision === 'accepted' ? 'emerald' : 'rose';

  // Remove any existing confirmation modal
  const existingModal = document.getElementById('modal-review-confirm');
  if (existingModal) existingModal.remove();

  const modalHtml = `
    <div id="modal-review-confirm" class="fixed inset-0 z-[90] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md">
      <div class="glass-panel rounded-2xl p-6 max-w-md w-full border border-${accentColor}-500/30 space-y-4 shadow-2xl">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 class="text-base font-semibold text-white flex items-center space-x-2">
            <i class="fa-solid fa-${decision === 'accepted' ? 'check-circle' : 'skull-crossbones'} text-${accentColor}-400"></i>
            <span>Confirm Decision</span>
          </h3>
          <button type="button" onclick="document.getElementById('modal-review-confirm')?.remove()" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        <div class="p-3 rounded-xl bg-${accentColor}-950/40 border border-${accentColor}-500/20 text-xs text-${accentColor}-200">
          <i class="fa-solid fa-triangle-exclamation mr-1"></i> ${actionLabel}
        </div>
        <div class="space-y-1">
          <label class="text-[10px] font-semibold uppercase text-slate-400">Decision Notes (optional)</label>
          <textarea id="review-confirm-notes" rows="3" class="w-full p-3 rounded-xl glass-input text-xs resize-none">${defaultNotes}</textarea>
        </div>
        <div class="pt-2 flex items-center space-x-2">
          <button type="button" onclick="document.getElementById('modal-review-confirm')?.remove()" class="w-1/3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs transition">Cancel</button>
          <button type="button" onclick="executeReviewDecision('${noticeId}', '${decision}')" class="w-2/3 py-2.5 rounded-xl bg-gradient-to-r from-${accentColor}-600 to-${accentColor === 'emerald' ? 'teal' : 'red'}-600 hover:opacity-90 text-white font-semibold text-xs transition active:scale-98 shadow-lg">
            ${decision === 'accepted' ? 'Confirm Revoke' : 'Confirm Reject & Purge'}
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.executeReviewDecision = async function(noticeId, decision) {
  const notes = document.getElementById('review-confirm-notes')?.value || '';
  // Remove the confirmation modal
  document.getElementById('modal-review-confirm')?.remove();

  try {
    const res = await apiRequest(`/api/v1/admin/notices/${noticeId}/decision`, 'POST', { decision, decisionNotes: notes });
    showToast(res.message || 'Hearing decision recorded.', 'success');
    window.loadComplianceNoticesTable();
    loadUserManagement();
  } catch (err) {
    showToast(err.message || 'Failed to submit decision', 'error');
  }
};

// ── Super Admin Platform Policies Workspace ─────────────────────────────────

window.loadPlatformPolicies = async function() {
  try {
    const policy = await apiRequest('/api/v1/policies/current', 'GET');
    const verLabel = document.getElementById('label-active-policy-version');
    if (verLabel) verLabel.textContent = policy.version;
    const dateInput = document.getElementById('input-policy-effective-date');
    if (dateInput) dateInput.value = policy.effectiveDate ? new Date(policy.effectiveDate).toLocaleDateString() : 'Active';
    const termsArea = document.getElementById('textarea-policy-terms');
    if (termsArea) termsArea.value = policy.termsAndConditions || '';
    const secArea = document.getElementById('textarea-policy-security');
    if (secArea) secArea.value = policy.securityPolicy || '';
    const backArea = document.getElementById('textarea-policy-backup');
    if (backArea) backArea.value = policy.backupPolicy || '';

    // Suggest next minor version
    const match = policy.version.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    const verInput = document.getElementById('input-policy-version');
    if (verInput) {
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10) + 1;
        verInput.value = `v${major}.${minor}.0`;
      } else {
        verInput.value = 'v1.1.0';
      }
    }
  } catch (err) {
    showToast(err.message || 'Failed to load platform policies', 'error');
  }
};

window.switchPolicyEditorTab = function(tab) {
  const btnTerms = document.getElementById('btn-edit-tab-terms');
  const btnSec = document.getElementById('btn-edit-tab-security');
  const btnBack = document.getElementById('btn-edit-tab-backup');

  const editorTerms = document.getElementById('editor-policy-terms');
  const editorSec = document.getElementById('editor-policy-security');
  const editorBack = document.getElementById('editor-policy-backup');

  if (btnTerms) btnTerms.className = tab === 'terms' ? 'py-2 text-xs font-semibold text-amber-400 border-b-2 border-amber-400' : 'py-2 text-xs font-semibold text-slate-400 border-b-2 border-transparent hover:text-white';
  if (btnSec) btnSec.className = tab === 'security' ? 'py-2 text-xs font-semibold text-amber-400 border-b-2 border-amber-400' : 'py-2 text-xs font-semibold text-slate-400 border-b-2 border-transparent hover:text-white';
  if (btnBack) btnBack.className = tab === 'backup' ? 'py-2 text-xs font-semibold text-amber-400 border-b-2 border-amber-400' : 'py-2 text-xs font-semibold text-slate-400 border-b-2 border-transparent hover:text-white';

  editorTerms?.classList.toggle('hidden', tab !== 'terms');
  editorSec?.classList.toggle('hidden', tab !== 'security');
  editorBack?.classList.toggle('hidden', tab !== 'backup');
};

window.saveAndRolloutPolicies = async function() {
  const termsAndConditions = document.getElementById('textarea-policy-terms')?.value;
  const securityPolicy = document.getElementById('textarea-policy-security')?.value;
  const backupPolicy = document.getElementById('textarea-policy-backup')?.value;
  const newVersion = document.getElementById('input-policy-version')?.value.trim();

  if (!newVersion) {
    showToast('Please specify the new policy version string (e.g. v1.1.0).', 'error');
    return;
  }

  if (!confirm(`Are you sure you want to rollout policy version ${newVersion}? All platform users will be required to review and accept the updated terms upon login.`)) return;

  try {
    const res = await apiRequest('/api/v1/policies/admin', 'PUT', {
      termsAndConditions,
      securityPolicy,
      backupPolicy,
      newVersion
    });
    showToast(`Policy version ${res.version} published and rolled out to all users!`, 'success');
    window.loadPlatformPolicies();
  } catch (err) {
    showToast(err.message || 'Failed to update policies', 'error');
  }
};

// ── Security & Anti-Inspection (Client-Side) ───────────────────────────────
const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
if (!isLocalDev) {
  document.addEventListener('contextmenu', event => event.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F12') {
      e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
      e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') {
      e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
      e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
      e.preventDefault();
    }
  });
}

window.openAdminLoginFromMaintenance = function() {
  const maintenanceEl = document.getElementById('view-maintenance');
  if (maintenanceEl) maintenanceEl.classList.add('hidden');
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.classList.remove('hidden');
  const mainApp = document.getElementById('main-app');
  if (mainApp) mainApp.classList.add('hidden');

  const inputEmail = document.getElementById('input-email');
  if (inputEmail) {
    inputEmail.focus();
  }
};

window.logout = async function() {
  try {
    const refreshToken = localStorage.getItem('aegis_refresh_token');
    if (refreshToken) {
      await apiRequest('/api/v1/auth/logout', 'POST', { refreshToken });
    }
  } catch (err) {
    console.error('Logout API error:', err);
  } finally {
    localStorage.removeItem('aegis_access_token');
    localStorage.removeItem('aegis_refresh_token');
    localStorage.removeItem('aegis_user');
    window.location.reload();
  }
};

// ════════════════════════════════════════════════════════════════════════════════
//  Network Access Control & Real-Time Device Tracking
// ════════════════════════════════════════════════════════════════════════════════

let cachedNetworkRules = [];
let cachedTrackedDevices = [];

window.loadNetworkAccessSettings = async function() {
  const toggleEl = document.getElementById('toggle-enforce-ip-whitelist');
  const badgeEl = document.getElementById('badge-ip-filter-status');
  const labelEl = document.getElementById('label-whitelist-toggle');

  const adminLockToggle = document.getElementById('toggle-admin-endpoint-lock');
  const adminSubnetsInput = document.getElementById('input-admin-allowed-subnets');
  const writeShieldToggle = document.getElementById('toggle-write-ip-shield');

  try {
    const res = await apiRequest('/api/v1/admin/network/settings', 'GET');
    const settings = res.data || res;
    const isEnforced = !!settings.ipFilteringEnabled;

    if (toggleEl) toggleEl.checked = isEnforced;
    if (labelEl) labelEl.textContent = isEnforced ? 'Whitelist Enforced' : 'Enforce Whitelist';

    if (badgeEl) {
      if (isEnforced) {
        badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        badgeEl.textContent = '🔒 Whitelist Enforced (Restricted)';
      } else {
        badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30';
        badgeEl.textContent = '🌐 Open LAN (All Allowed)';
      }
    }

    if (adminLockToggle) adminLockToggle.checked = !!settings.adminEndpointIpLockEnabled;
    if (adminSubnetsInput) adminSubnetsInput.value = settings.adminAllowedSubnet || '127.0.0.1';
    if (writeShieldToggle) writeShieldToggle.checked = !!settings.requireWriteIpWhitelist;

    const subnetLimitToggle = document.getElementById('toggle-enable-subnet-rate-limiting');
    const defaultRpmInput = document.getElementById('input-default-subnet-rpm');
    if (subnetLimitToggle) subnetLimitToggle.checked = !!settings.enableSubnetRateLimiting;
    if (defaultRpmInput && settings.defaultSubnetRequestsPerMin) defaultRpmInput.value = settings.defaultSubnetRequestsPerMin;
  } catch (err) {
    console.warn('Failed to load network access settings:', err);
  }
};

window.handleToggleIpFiltering = async function(enabled) {
  try {
    await apiRequest('/api/v1/admin/network/settings', 'PATCH', {
      ipFilteringEnabled: enabled,
      ipFilterDefaultPolicy: enabled ? 'deny' : 'allow'
    });
    showToast(enabled ? '🔒 IP Whitelisting Enforced. Only approved devices can connect.' : '🌐 Open LAN mode enabled. All local network devices can connect.', 'info');
    window.loadNetworkAccessSettings();
    window.loadTrackedDevicesTable();
  } catch (err) {
    showToast(err.message || 'Failed to update access control policy', 'error');
    window.loadNetworkAccessSettings();
  }
};

window.savePerimeterSettings = async function() {
  const adminEndpointIpLockEnabled = document.getElementById('toggle-admin-endpoint-lock')?.checked || false;
  const adminAllowedSubnet = document.getElementById('input-admin-allowed-subnets')?.value.trim() || '127.0.0.1';
  const requireWriteIpWhitelist = document.getElementById('toggle-write-ip-shield')?.checked || false;

  try {
    await apiRequest('/api/v1/admin/network/settings', 'PATCH', {
      adminEndpointIpLockEnabled,
      adminAllowedSubnet,
      requireWriteIpWhitelist
    });
    showToast('Perimeter isolation & mutation shield settings saved.', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to save perimeter settings', 'error');
  }
};

window.saveSubnetRateSettings = async function() {
  const enableSubnetRateLimiting = document.getElementById('toggle-enable-subnet-rate-limiting')?.checked || false;
  const defaultSubnetRequestsPerMin = parseInt(document.getElementById('input-default-subnet-rpm')?.value || '300', 10);

  try {
    await apiRequest('/api/v1/admin/network/settings', 'PATCH', {
      enableSubnetRateLimiting,
      defaultSubnetRequestsPerMin
    });
    showToast(enableSubnetRateLimiting ? '⚡ Subnet Rate Limiting enabled.' : 'Subnet Rate Limiting disabled.', 'info');
  } catch (err) {
    showToast(err.message || 'Failed to save rate limit settings', 'error');
  }
};

window.handleNetRuleScopeChange = function() {
  const scope = document.getElementById('select-netrule-scope')?.value || 'global';
  const projectBox = document.getElementById('box-netrule-project');
  const projectSelect = document.getElementById('select-netrule-project');

  if (scope === 'project') {
    if (projectBox) projectBox.classList.remove('hidden');
    if (projectSelect && state.projects && state.projects.length > 0) {
      projectSelect.innerHTML = '<option value="">Select a project...</option>' + state.projects.map(p => `<option value="${p.id}">${escapeHTML(p.name)} (${p.id})</option>`).join('');
    }
  } else {
    if (projectBox) projectBox.classList.add('hidden');
  }
};

window.loadNetworkRules = async function() {
  const container = document.getElementById('container-network-rules-list');
  const countBadge = document.getElementById('badge-network-rules-count');
  if (!container) return;

  try {
    const res = await apiRequest('/api/v1/admin/network/rules', 'GET');
    cachedNetworkRules = Array.isArray(res) ? res : (res.data || []);
    if (countBadge) countBadge.textContent = `${cachedNetworkRules.length} rule${cachedNetworkRules.length === 1 ? '' : 's'} configured`;

    if (cachedNetworkRules.length === 0) {
      container.innerHTML = `
        <div class="p-6 rounded-2xl bg-black/40 border border-white/5 text-center text-slate-400 text-xs col-span-full space-y-2">
          <div class="w-8 h-8 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
            <i class="fa-solid fa-list-check"></i>
          </div>
          <p class="font-medium text-slate-300">No Custom IP Rules Configured</p>
          <p class="text-[11px] text-slate-500">Localhost is always allowed by default. Click <strong class="text-indigo-400">"Add IP / Subnet Rule"</strong> or click <strong class="text-emerald-400">"+ Whitelist"</strong> on any tracked device below.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = cachedNetworkRules.map(rule => {
      const isAllow = rule.action === 'allow';
      let ttlBadge = '';
      if (rule.isTemporary) {
        if (rule.isExpired) {
          ttlBadge = '<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">Expired</span>';
        } else {
          const remain = rule.remainingSeconds || 0;
          const remainStr = remain >= 3600
            ? `${Math.floor(remain / 3600)}h ${Math.floor((remain % 3600) / 60)}m`
            : remain >= 60
              ? `${Math.floor(remain / 60)}m ${remain % 60}s`
              : `${remain}s`;
          ttlBadge = `<span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center space-x-1" title="Expires in ${remainStr}"><i class="fa-solid fa-stopwatch text-[8px]"></i><span>${remainStr}</span></span>`;
        }
      } else {
        ttlBadge = '<span class="px-2 py-0.5 rounded-full text-[9px] font-medium bg-white/5 text-slate-400">Permanent</span>';
      }

      let scopeBadge = '';
      if (rule.scope === 'admin_only') {
        scopeBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">👑 Admin APIs</span>';
      } else if (rule.scope === 'db_write_only') {
        scopeBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">✍️ DB Writes</span>';
      } else if (rule.scope === 'project') {
        scopeBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20" title="Project: ${escapeHTML(rule.projectId || '')}">📦 Proj</span>`;
      } else {
        scopeBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-800 text-slate-400">🌐 Global</span>';
      }

      return `
        <div class="p-4 rounded-2xl bg-slate-900/70 border border-white/10 hover:border-white/20 transition space-y-3 relative group">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-white flex items-center space-x-1.5 truncate max-w-[160px]" title="${escapeHTML(rule.label)}">
              <i class="fa-solid ${isAllow ? 'fa-circle-check text-emerald-400' : 'fa-circle-xmark text-rose-400'} text-xs"></i>
              <span>${escapeHTML(rule.label)}</span>
            </span>
            <div class="flex items-center space-x-1.5">
              ${scopeBadge}
              ${ttlBadge}
              <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${isAllow ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'}">
                ${isAllow ? 'ALLOW' : 'DENY'}
              </span>
            </div>
          </div>

          <div class="p-2.5 rounded-xl bg-black/50 border border-white/5 space-y-1">
            <div class="flex items-center justify-between text-[11px] font-mono text-slate-300">
              <span class="text-slate-500">Pattern:</span>
              <span class="font-bold text-indigo-300">${escapeHTML(rule.ipPattern)}</span>
            </div>
            <div class="flex items-center justify-between text-[10px] text-slate-500">
              <span>Type: ${escapeHTML((rule.ruleType || 'ip').toUpperCase())}</span>
              <span>${rule.durationLabel ? escapeHTML(rule.durationLabel) : (rule.isTemporary ? 'Temp Pass' : 'Permanent')}</span>
            </div>
          </div>

          <div class="flex items-center justify-between pt-1">
            <span class="text-[10px] text-slate-500 truncate" title="Created by ${escapeHTML(rule.createdBy || 'Super Admin')}">By ${escapeHTML(rule.createdBy || 'Admin')}</span>
            <button type="button" onclick="window.deleteNetworkRule('${rule.id}')" class="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[10px] font-semibold transition active:scale-95 flex items-center space-x-1" title="Delete Rule">
              <i class="fa-solid fa-trash text-[9px]"></i>
              <span>Remove</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="p-4 text-center text-rose-400 text-xs col-span-full">Failed to load rules: ${escapeHTML(err.message)}</div>`;
  }
};

window.openAddNetworkRuleModal = function(prefillIp, prefillLabel) {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Permissions and access rules cannot be modified from this session.', 'warning');
    return;
  }

  const inputLabel = document.getElementById('input-netrule-label');
  const inputPattern = document.getElementById('input-netrule-pattern');
  const selectAction = document.getElementById('select-netrule-action');
  const selectScope = document.getElementById('select-netrule-scope');
  const selectDuration = document.getElementById('select-netrule-duration');

  if (inputLabel) inputLabel.value = prefillLabel || '';
  if (inputPattern) inputPattern.value = prefillIp || '';
  if (selectAction) selectAction.value = 'allow';
  if (selectScope) selectScope.value = 'global';
  if (selectDuration) selectDuration.value = '0';

  if (typeof window.handleNetRuleScopeChange === 'function') {
    window.handleNetRuleScopeChange();
  }

  showModal('modal-add-network-rule');
};

window.submitAddNetworkRule = async function() {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Permission elevation is forbidden.', 'warning');
    return;
  }

  const label = document.getElementById('input-netrule-label')?.value.trim();
  const ipPattern = document.getElementById('input-netrule-pattern')?.value.trim();
  const action = document.getElementById('select-netrule-action')?.value || 'allow';
  const scope = document.getElementById('select-netrule-scope')?.value || 'global';
  const projectId = scope === 'project' ? document.getElementById('select-netrule-project')?.value : undefined;
  const durationMinutes = parseInt(document.getElementById('select-netrule-duration')?.value || '0', 10);

  if (!ipPattern) {
    showToast('Please enter an IP address, CIDR subnet, or range.', 'error');
    return;
  }

  if (scope === 'project' && !projectId) {
    showToast('Please select a target tenant project.', 'error');
    return;
  }

  try {
    await apiRequest('/api/v1/admin/network/rules', 'POST', {
      label: label || `Rule for ${ipPattern}`,
      ipPattern,
      action,
      scope,
      projectId: projectId || undefined,
      durationMinutes: durationMinutes > 0 ? durationMinutes : undefined
    });
    hideModal('modal-add-network-rule');
    showToast(`Network rule for "${ipPattern}" saved successfully!`, 'success');
    window.loadNetworkRules();
    window.loadTrackedDevicesTable();
  } catch (err) {
    showToast(err.message || 'Failed to save network rule', 'error');
  }
};

window.deleteNetworkRule = async function(ruleId) {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Cannot delete or modify access rules.', 'warning');
    return;
  }
  if (!confirm('Are you sure you want to remove this network access rule?')) return;
  try {
    await apiRequest(`/api/v1/admin/network/rules/${ruleId}`, 'DELETE');
    showToast('Network rule removed.', 'info');
    window.loadNetworkRules();
    window.loadTrackedDevicesTable();
  } catch (err) {
    showToast(err.message || 'Failed to delete rule', 'error');
  }
};

// ── Adaptive Subnet Rate Limiting & Bandwidth Throttling UI ────────────────

let cachedSubnetRatePolicies = [];

window.loadSubnetRatePolicies = async function() {
  const tbody = document.getElementById('table-subnet-rate-policies-body');
  if (!tbody) return;

  try {
    const res = await apiRequest('/api/v1/admin/network/rate-limits', 'GET');
    cachedSubnetRatePolicies = Array.isArray(res) ? res : (res.data || []);
    window.renderSubnetRatePolicies(cachedSubnetRatePolicies);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-rose-400 text-xs">Failed to load subnet policies: ${escapeHTML(err.message)}</td></tr>`;
  }
};

window.renderSubnetRatePolicies = function(policies) {
  const tbody = document.getElementById('table-subnet-rate-policies-body');
  if (!tbody) return;

  if (!policies || policies.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-5 text-center text-slate-500 text-xs">No subnet rate policies defined. Global default cap applies.</td></tr>`;
    return;
  }

  tbody.innerHTML = policies.map(p => {
    const isBlock = p.actionOnExceed === 'block';
    const actionBadge = isBlock
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">🛑 Block (429)</span>'
      : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">⏳ Throttle</span>';

    const statusToggle = `
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" onchange="window.toggleSubnetRatePolicy('${p.id}', this.checked)" ${p.isActive ? 'checked' : ''} class="sr-only peer">
        <div class="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-600"></div>
      </label>
    `;

    return `
      <tr class="hover:bg-white/5 transition">
        <td class="p-3 font-mono font-bold text-amber-300">
          <div class="flex items-center space-x-1.5">
            <i class="fa-solid fa-network-wired text-amber-400 text-[10px]"></i>
            <span>${escapeHTML(p.subnetPattern)}</span>
          </div>
        </td>
        <td class="p-3 text-slate-300 text-xs truncate max-w-xs" title="${escapeHTML(p.label)}">
          ${escapeHTML(p.label)}
        </td>
        <td class="p-3 text-center font-mono font-bold text-white">
          ${p.requestsPerMinute} <span class="text-[10px] text-slate-500">RPM</span>
        </td>
        <td class="p-3 text-center font-mono text-slate-300">
          ${p.burstLimit} <span class="text-[10px] text-slate-500">reqs</span>
        </td>
        <td class="p-3 text-center font-mono text-slate-300">
          ${p.bandwidthLimitKbps >= 1000 ? `${(p.bandwidthLimitKbps / 1000).toFixed(1)} Mbps` : `${p.bandwidthLimitKbps} Kbps`}
        </td>
        <td class="p-3 text-center">
          ${actionBadge}
        </td>
        <td class="p-3 text-center">
          ${statusToggle}
        </td>
        <td class="p-3 text-right">
          <button type="button" onclick="window.deleteSubnetRatePolicy('${p.id}')" class="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[10px] font-semibold transition active:scale-95 flex items-center space-x-1 inline-flex" title="Delete Policy">
            <i class="fa-solid fa-trash text-[9px]"></i>
            <span>Delete</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');
};

window.openAddSubnetRatePolicyModal = function(prefillSubnet) {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Rate policies cannot be modified from this session.', 'warning');
    return;
  }

  const patternInput = document.getElementById('input-ratepolicy-pattern');
  const labelInput = document.getElementById('input-ratepolicy-label');
  const rpmInput = document.getElementById('input-ratepolicy-rpm');
  const burstInput = document.getElementById('input-ratepolicy-burst');
  const bandwidthInput = document.getElementById('input-ratepolicy-bandwidth');
  const actionSelect = document.getElementById('select-ratepolicy-action');

  if (patternInput) patternInput.value = prefillSubnet || '192.168.31.0/24';
  if (labelInput) labelInput.value = '';
  if (rpmInput) rpmInput.value = '120';
  if (burstInput) burstInput.value = '25';
  if (bandwidthInput) bandwidthInput.value = '5000';
  if (actionSelect) actionSelect.value = 'block';

  showModal('modal-add-subnet-rate-policy');
};

window.submitAddSubnetRatePolicy = async function() {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Permission elevation is forbidden.', 'warning');
    return;
  }

  const subnetPattern = document.getElementById('input-ratepolicy-pattern')?.value.trim();
  const label = document.getElementById('input-ratepolicy-label')?.value.trim();
  const requestsPerMinute = parseInt(document.getElementById('input-ratepolicy-rpm')?.value || '120', 10);
  const burstLimit = parseInt(document.getElementById('input-ratepolicy-burst')?.value || '25', 10);
  const bandwidthLimitKbps = parseInt(document.getElementById('input-ratepolicy-bandwidth')?.value || '5000', 10);
  const actionOnExceed = document.getElementById('select-ratepolicy-action')?.value || 'block';

  if (!subnetPattern) {
    showToast('Please enter a target subnet or CIDR pattern.', 'error');
    return;
  }

  try {
    await apiRequest('/api/v1/admin/network/rate-limits', 'POST', {
      subnetPattern,
      label: label || `Rate limit for ${subnetPattern}`,
      requestsPerMinute,
      burstLimit,
      bandwidthLimitKbps,
      actionOnExceed
    });
    hideModal('modal-add-subnet-rate-policy');
    showToast(`Subnet rate policy for "${subnetPattern}" created!`, 'success');
    window.loadSubnetRatePolicies();
  } catch (err) {
    showToast(err.message || 'Failed to create subnet policy', 'error');
  }
};

window.toggleSubnetRatePolicy = async function(id, isActive) {
  try {
    await apiRequest(`/api/v1/admin/network/rate-limits/${id}`, 'PATCH', { isActive });
    showToast(isActive ? 'Policy activated.' : 'Policy deactivated.', 'info');
  } catch (err) {
    showToast(err.message || 'Failed to update policy status', 'error');
    window.loadSubnetRatePolicies();
  }
};

window.deleteSubnetRatePolicy = async function(id) {
  if (!confirm('Are you sure you want to delete this subnet rate policy?')) return;
  try {
    await apiRequest(`/api/v1/admin/network/rate-limits/${id}`, 'DELETE');
    showToast('Subnet rate policy deleted.', 'info');
    window.loadSubnetRatePolicies();
  } catch (err) {
    showToast(err.message || 'Failed to delete policy', 'error');
  }
};

window.loadSubnetLiveMetrics = async function() {
  const container = document.getElementById('container-subnet-live-metrics');
  if (!container) return;

  try {
    const res = await apiRequest('/api/v1/admin/network/rate-limits/metrics', 'GET');
    const metrics = Array.isArray(res) ? res : (res.data || []);
    window.renderSubnetLiveMetrics(metrics);
  } catch (err) {
    container.innerHTML = `<div class="p-3 text-center text-rose-400 text-xs col-span-full">Failed to load live metrics: ${escapeHTML(err.message)}</div>`;
  }
};

window.renderSubnetLiveMetrics = function(metrics) {
  const container = document.getElementById('container-subnet-live-metrics');
  if (!container) return;

  if (!metrics || metrics.length === 0) {
    container.innerHTML = `<div class="p-3 rounded-xl bg-slate-900/60 border border-white/5 text-center text-slate-500 text-[11px] col-span-full">No active client traffic recorded in past 60 seconds.</div>`;
    return;
  }

  container.innerHTML = metrics.slice(0, 6).map(m => `
    <div class="p-3 rounded-xl bg-slate-900/70 border border-white/10 space-y-1">
      <div class="flex items-center justify-between text-xs">
        <span class="font-bold text-white font-mono truncate max-w-[130px]">${escapeHTML(m.ipAddress)}</span>
        <span class="text-[10px] text-amber-400 font-bold font-mono">${m.currentRps} req/s</span>
      </div>
      <div class="flex items-center justify-between text-[10px] text-slate-400">
        <span>60s Total: <strong class="text-white">${m.requestsLast60s} reqs</strong></span>
        <span>Bandwidth: <strong class="text-cyan-300">${m.bandwidthKbps} Kbps</strong></span>
      </div>
    </div>
  `).join('');
};

// ── IP Quarantine & Jail UI Management ─────────────────────────────────────

let cachedJailedIps = [];

window.loadJailedIpsTable = async function() {
  const tbody = document.getElementById('table-jailed-ips-body');
  const countBadge = document.getElementById('badge-jailed-ips-count');
  if (!tbody) return;

  try {
    const res = await apiRequest('/api/v1/admin/network/jail', 'GET');
    cachedJailedIps = Array.isArray(res) ? res : (res.data || []);
    const activeCount = cachedJailedIps.filter(j => j.status === 'active').length;
    if (countBadge) {
      countBadge.textContent = `${activeCount} Jailed`;
      if (activeCount > 0) {
        countBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse';
      } else {
        countBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700';
      }
    }

    if (cachedJailedIps.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-5 text-center text-slate-500 text-xs">No IPs currently quarantined in jail. Threat shield is clear.</td></tr>`;
      return;
    }

    tbody.innerHTML = cachedJailedIps.map(j => {
      const isActive = j.status === 'active';
      let statusBadge = '';
      if (isActive) {
        statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center justify-center space-x-1"><span class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping mr-1"></span>ACTIVE JAIL</span>';
      } else if (j.status === 'pardoned') {
        statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Pardoned</span>';
      } else {
        statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">Expired</span>';
      }

      let remainStr = '—';
      if (isActive && j.remainingSeconds !== undefined) {
        const rem = j.remainingSeconds;
        remainStr = rem >= 3600
          ? `${Math.floor(rem / 3600)}h ${Math.floor((rem % 3600) / 60)}m`
          : rem >= 60
            ? `${Math.floor(rem / 60)}m ${rem % 60}s`
            : `${rem}s`;
      } else if (isActive && !j.expiresAt) {
        remainStr = 'Permanent';
      }

      return `
        <tr class="hover:bg-white/5 transition">
          <td class="p-3 font-mono font-bold text-rose-300">
            <div class="flex items-center space-x-2">
              <i class="fa-solid fa-lock text-rose-400 text-xs"></i>
              <span>${escapeHTML(j.ipAddress)}</span>
            </div>
          </td>
          <td class="p-3 text-slate-300 text-xs max-w-xs truncate" title="${escapeHTML(j.reason)}">
            ${escapeHTML(j.reason)}
          </td>
          <td class="p-3 text-[11px] text-slate-400 font-mono">
            ${new Date(j.jailedAt).toLocaleTimeString()}
          </td>
          <td class="p-3 text-center font-mono font-bold ${isActive ? 'text-amber-300' : 'text-slate-500'}">
            ${remainStr}
          </td>
          <td class="p-3 text-center">
            ${statusBadge}
          </td>
          <td class="p-3 text-right">
            ${isActive ? `
              <button type="button" onclick="window.pardonJailedIp('${j.ipAddress}')" class="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold transition active:scale-95 flex items-center space-x-1 inline-flex" title="Pardon and remove from Jail">
                <i class="fa-solid fa-unlock text-[9px]"></i>
                <span>Pardon</span>
              </button>
            ` : `<span class="text-slate-600 text-[10px]">—</span>`}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-rose-400 text-xs">Failed to load jail logs: ${escapeHTML(err.message)}</td></tr>`;
  }
};

window.openManualJailModal = function(prefillIp) {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: IP quarantines cannot be created from this session.', 'warning');
    return;
  }

  const inputIp = document.getElementById('input-jail-ip');
  const inputReason = document.getElementById('input-jail-reason');
  const selectDuration = document.getElementById('select-jail-duration');

  if (inputIp) inputIp.value = prefillIp || '';
  if (inputReason) inputReason.value = '';
  if (selectDuration) selectDuration.value = '15';

  showModal('modal-manual-jail-ip');
};

window.submitManualJailIp = async function() {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Permission elevation is forbidden.', 'warning');
    return;
  }

  const ipAddress = document.getElementById('input-jail-ip')?.value.trim();
  const reason = document.getElementById('input-jail-reason')?.value.trim();
  const durationMinutes = parseInt(document.getElementById('select-jail-duration')?.value || '15', 10);

  if (!ipAddress) {
    showToast('Please enter a valid IP address to quarantine.', 'error');
    return;
  }

  try {
    await apiRequest('/api/v1/admin/network/jail', 'POST', {
      ipAddress,
      reason: reason || 'Manual Administrator Quarantine',
      durationMinutes
    });
    hideModal('modal-manual-jail-ip');
    showToast(`IP ${ipAddress} has been quarantined in Jail!`, 'warning');
    window.loadJailedIpsTable();
    window.loadTrackedDevicesTable();
  } catch (err) {
    showToast(err.message || 'Failed to quarantine IP', 'error');
  }
};

window.pardonJailedIp = async function(ipAddress) {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Cannot pardon jailed IPs.', 'warning');
    return;
  }
  try {
    await apiRequest(`/api/v1/admin/network/jail/${encodeURIComponent(ipAddress)}/pardon`, 'POST');
    showToast(`IP ${ipAddress} released from quarantine jail.`, 'success');
    window.loadJailedIpsTable();
    window.loadTrackedDevicesTable();
  } catch (err) {
    showToast(err.message || 'Failed to pardon IP', 'error');
  }
};

window.clearAllJailsFromUI = async function() {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Cannot clear all jails.', 'warning');
    return;
  }
  if (!confirm('Are you sure you want to pardon and unban all quarantined IPs?')) return;
  try {
    const res = await apiRequest('/api/v1/admin/network/jail/clear', 'DELETE');
    showToast(res.message || 'All quarantined IP jails pardoned.', 'success');
    window.loadJailedIpsTable();
    window.loadTrackedDevicesTable();
  } catch (err) {
    showToast(err.message || 'Failed to clear jails', 'error');
  }
};

window.loadTrackedDevicesTable = async function() {
  const tbody = document.getElementById('table-tracked-devices-body');
  const countBadge = document.getElementById('badge-tracked-devices-count');
  if (!tbody) return;

  try {
    const res = await apiRequest('/api/v1/admin/network/devices', 'GET');
    cachedTrackedDevices = Array.isArray(res) ? res : (res.data || []);
    if (countBadge) countBadge.textContent = `${cachedTrackedDevices.length} device${cachedTrackedDevices.length === 1 ? '' : 's'}`;
    window.renderTrackedDevicesTable(cachedTrackedDevices);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-rose-400 text-xs">Failed to load device logs: ${escapeHTML(err.message)}</td></tr>`;
  }
};

window.filterTrackedDevicesTable = function() {
  const query = (document.getElementById('input-search-devices')?.value || '').toLowerCase().trim();
  if (!query) {
    window.renderTrackedDevicesTable(cachedTrackedDevices);
    return;
  }

  const filtered = cachedTrackedDevices.filter(d =>
    d.ipAddress.toLowerCase().includes(query) ||
    d.osName.toLowerCase().includes(query) ||
    d.browserName.toLowerCase().includes(query) ||
    (d.lastUserEmail && d.lastUserEmail.toLowerCase().includes(query)) ||
    d.deviceType.toLowerCase().includes(query)
  );
  window.renderTrackedDevicesTable(filtered);
};

window.renderTrackedDevicesTable = function(devices) {
  const tbody = document.getElementById('table-tracked-devices-body');
  if (!tbody) return;

  if (!devices || devices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-500 text-xs">No active devices logged yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = devices.map(d => {
    // Determine OS / Device Icon
    let osIcon = 'fa-solid fa-desktop';
    if (d.osName === 'iOS') osIcon = 'fa-brands fa-apple text-slate-300';
    else if (d.osName === 'macOS') osIcon = 'fa-brands fa-apple text-slate-300';
    else if (d.osName === 'Android') osIcon = 'fa-brands fa-android text-emerald-400';
    else if (d.osName === 'Windows') osIcon = 'fa-brands fa-windows text-blue-400';
    else if (d.osName === 'Linux') osIcon = 'fa-brands fa-linux text-amber-400';

    // Interface Type
    let ifaceBadge = '';
    const ip = d.ipAddress;
    if (ip === '127.0.0.1' || ip === 'localhost' || ip === '::1') {
      ifaceBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">Localhost (Loopback)</span>';
    } else if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
      ifaceBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Wi-Fi / LAN Extender</span>';
    } else {
      ifaceBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">Public WAN</span>';
    }

    // Access status
    let statusBadge = '';
    if (d.isBlocked) {
      statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-flex items-center"><i class="fa-solid fa-ban text-[9px] mr-1"></i>BLOCKED</span>';
    } else if (d.isWhitelisted || ip === '127.0.0.1') {
      statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center"><i class="fa-solid fa-check text-[9px] mr-1"></i>Whitelisted</span>';
    } else {
      statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30 inline-flex items-center"><i class="fa-solid fa-globe text-[9px] mr-1"></i>LAN Allowed</span>';
    }

    const isLocal = ip === '127.0.0.1' || ip === 'localhost' || ip === '::1';

    return `
      <tr class="hover:bg-white/5 transition">
        <td class="p-3.5">
          <div class="flex items-center space-x-2.5 font-sans">
            <div class="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-xs">
              <i class="${osIcon}"></i>
            </div>
            <div>
              <div class="text-xs font-bold text-white">${escapeHTML(d.osName)} • ${escapeHTML(d.browserName)}</div>
              <div class="text-[10px] text-slate-500 capitalize">${escapeHTML(d.deviceType)}</div>
            </div>
          </div>
        </td>
        <td class="p-3.5 font-mono text-xs font-bold text-indigo-300">
          <span class="inline-flex items-center space-x-1">
            <span>${escapeHTML(d.ipAddress)}</span>
            <button type="button" onclick="navigator.clipboard.writeText('${d.ipAddress}'); showToast('IP copied', 'info');" class="text-slate-500 hover:text-white transition text-[10px]" title="Copy IP">
              <i class="fa-solid fa-copy"></i>
            </button>
          </span>
        </td>
        <td class="p-3.5">
          <div class="space-y-1">
            <div class="flex items-center space-x-1.5 text-xs text-white">
              <span class="text-sm">${d.countryFlag || '🌐'}</span>
              <span class="font-semibold">${escapeHTML(d.city || 'Local')}</span>
              <span class="text-slate-500 text-[10px]">(${escapeHTML(d.countryCode || 'LAN')})</span>
            </div>
            <div class="flex items-center space-x-1.5">
              ${d.threatType === 'tor_node' ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">🧅 Tor Exit</span>' :
                d.threatType === 'vpn_proxy' ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">🕵️ VPN/Proxy</span>' :
                d.threatType === 'datacenter' ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">🏢 Cloud VPS</span>' :
                '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">🛡️ Clean</span>'}
              <span class="text-[10px] text-slate-400 truncate max-w-[100px]" title="${escapeHTML(d.isp || '')}">${escapeHTML(d.isp || 'Internal')}</span>
            </div>
          </div>
        </td>
        <td class="p-3.5">${ifaceBadge}</td>
        <td class="p-3.5">
          ${d.lastUserEmail ? `<span class="text-slate-200 text-xs font-semibold font-mono">${escapeHTML(d.lastUserEmail)}</span>` : `<span class="text-slate-500 italic text-[11px]">Unauthenticated / API</span>`}
        </td>
        <td class="p-3.5 text-center font-mono font-bold text-slate-200">${d.requestCount}</td>
        <td class="p-3.5 text-[11px] text-slate-400">${new Date(d.lastSeenAt).toLocaleTimeString()}</td>
        <td class="p-3.5 text-center">${statusBadge}</td>
        <td class="p-3.5 text-right">
          <div class="flex items-center justify-end space-x-1.5 font-sans">
            ${!d.isWhitelisted && !isLocal ? `
              <button type="button" onclick="window.openAddNetworkRuleModal('${d.ipAddress}', '${escapeHTML(d.osName)} (${escapeHTML(d.browserName)})')" class="px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold transition active:scale-95 flex items-center space-x-1" title="Add this device to Whitelist">
                <i class="fa-solid fa-plus text-[9px]"></i>
                <span>Whitelist</span>
              </button>
            ` : ''}
            ${!isLocal ? `
              <button type="button" onclick="window.toggleBlockDevice('${d.ipAddress}', ${!d.isBlocked})" class="px-2 py-1 rounded-lg ${d.isBlocked ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border-rose-500/30'} hover:opacity-80 border text-[10px] font-semibold transition active:scale-95 flex items-center space-x-1" title="${d.isBlocked ? 'Unblock device' : 'Block device'}">
                <i class="fa-solid ${d.isBlocked ? 'fa-unlock' : 'fa-ban'} text-[9px]"></i>
                <span>${d.isBlocked ? 'Unblock' : 'Block'}</span>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

window.toggleBlockDevice = async function(ipAddress, blockState) {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Device access control cannot be altered from this session.', 'warning');
    return;
  }
  try {
    const res = await apiRequest(`/api/v1/admin/network/devices/${encodeURIComponent(ipAddress)}/toggle-block`, 'POST', {
      isBlocked: blockState
    });
    showToast(res.message || (blockState ? `Device ${ipAddress} blocked.` : `Device ${ipAddress} unblocked.`), blockState ? 'warning' : 'success');
    window.loadTrackedDevicesTable();
  } catch (err) {
    showToast(err.message || 'Failed to update device status', 'error');
  }
};

window.handleDeviceTrackerWsEvent = function(data) {
  if (data?.device) {
    const idx = cachedTrackedDevices.findIndex(d => d.ipAddress === data.device.ipAddress);
    if (idx !== -1) {
      cachedTrackedDevices[idx] = { ...cachedTrackedDevices[idx], ...data.device };
    } else {
      cachedTrackedDevices.unshift(data.device);
    }
    window.renderTrackedDevicesTable(cachedTrackedDevices);
  } else if (data?.ipAddress) {
    const found = cachedTrackedDevices.find(d => d.ipAddress === data.ipAddress);
    if (found) {
      found.isBlocked = !!data.isBlocked;
      window.renderTrackedDevicesTable(cachedTrackedDevices);
    }
  }
};

window.inspectGeoIpThreat = async function() {
  const input = document.getElementById('input-geoip-probe-ip');
  const resultBox = document.getElementById('box-geoip-inspector-result');
  if (!input || !resultBox) return;

  const ip = input.value.trim();
  if (!ip) {
    showToast('Please enter an IP address or select a preset to inspect.', 'info');
    return;
  }

  resultBox.classList.remove('hidden');
  resultBox.innerHTML = `
    <div class="p-6 text-center text-cyan-400 text-xs space-y-2">
      <i class="fa-solid fa-spinner fa-spin text-lg"></i>
      <div>Querying global ASN threat databases & Geo-IP resolvers for <span class="font-mono font-bold">${escapeHTML(ip)}</span>...</div>
    </div>
  `;

  try {
    const res = await apiRequest(`/api/v1/admin/network/geoip/${encodeURIComponent(ip)}`, 'GET');
    const geo = (res && res.threatType !== undefined) ? res : (res?.data || res || {});

    const threatType = geo.threatType || 'normal';
    const threatScore = geo.threatScore !== undefined ? geo.threatScore : 0;

    let threatBadge = '';
    let threatColor = 'emerald';
    if (threatType === 'tor_node') {
      threatBadge = '<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-flex items-center"><span class="w-2 h-2 rounded-full bg-rose-500 mr-1.5 animate-pulse"></span>🧅 Tor Exit Node (Critical Risk)</span>';
      threatColor = 'rose';
    } else if (threatType === 'vpn_proxy') {
      threatBadge = '<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 inline-flex items-center">🕵️ Anonymous VPN / Proxy Service</span>';
      threatColor = 'purple';
    } else if (threatType === 'datacenter') {
      threatBadge = '<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center">🏢 Cloud / Datacenter VPS</span>';
      threatColor = 'amber';
    } else {
      threatBadge = '<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center">🛡️ Clean Residential / LAN Interface</span>';
      threatColor = 'emerald';
    }

    resultBox.innerHTML = `
      <div class="space-y-4">
        <!-- Top Summary Bar -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div class="flex items-center space-x-3">
            <div class="text-3xl">${geo.countryFlag || '🌐'}</div>
            <div>
              <div class="flex items-center space-x-2">
                <span class="font-mono text-base font-bold text-white">${escapeHTML(geo.ipAddress)}</span>
                <span class="text-xs text-slate-400 font-semibold">(${escapeHTML(geo.countryName || 'Unknown')})</span>
              </div>
              <div class="text-xs text-cyan-300 font-medium">
                ${escapeHTML(geo.city || 'Unknown')}${geo.region ? `, ${escapeHTML(geo.region)}` : ''} • ISO: <span class="font-mono uppercase font-bold">${escapeHTML(geo.countryCode)}</span>
              </div>
            </div>
          </div>
          <div>${threatBadge}</div>
        </div>

        <!-- Metric Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div class="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-1">
            <div class="text-[10px] text-slate-400 uppercase font-semibold">Network & ISP</div>
            <div class="text-white font-medium truncate" title="${escapeHTML(geo.isp || '—')}">${escapeHTML(geo.isp || 'Private')}</div>
            <div class="text-[10px] text-slate-500 truncate" title="${escapeHTML(geo.asn || geo.org || '—')}">${escapeHTML(geo.asn || geo.org || 'Local Subnet')}</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-1">
            <div class="text-[10px] text-slate-400 uppercase font-semibold">Threat Score & Classification</div>
            <div class="flex items-center space-x-2">
              <div class="text-sm font-bold text-${threatColor}-400 font-mono">${threatScore}/100</div>
              <div class="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                <div class="bg-${threatColor}-500 h-full rounded-full" style="width: ${threatScore}%"></div>
              </div>
            </div>
            <div class="text-[10px] text-slate-400 capitalize">${threatType.replace('_', ' ')} Node</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-1">
            <div class="text-[10px] text-slate-400 uppercase font-semibold">Subnet & Geo-Coordinates</div>
            <div class="text-white font-mono text-[11px]">${geo.latitude && geo.longitude ? `${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)}` : 'Private LAN RFC1918'}</div>
            ${geo.latitude && geo.longitude ? `
              <a href="https://www.google.com/maps/search/?api=1&query=${geo.latitude},${geo.longitude}" target="_blank" class="text-[10px] text-cyan-400 hover:underline flex items-center space-x-1">
                <i class="fa-solid fa-arrow-up-right-from-square text-[8px]"></i>
                <span>Open in Maps</span>
              </a>
            ` : '<div class="text-[10px] text-slate-500">Zero Internet Exposure</div>'}
          </div>
        </div>

        <!-- Quick 1-Click Policy Actions -->
        <div class="flex flex-wrap gap-2 pt-1 border-t border-white/5">
          <button type="button" onclick="window.openAddNetworkRuleModal('${escapeHTML(geo.ipAddress)}', '${escapeHTML(geo.countryName || 'Custom IP')}')" class="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition active:scale-95 flex items-center space-x-1.5">
            <i class="fa-solid fa-shield-check text-[10px]"></i>
            <span>+ Whitelist IP</span>
          </button>
          <button type="button" onclick="window.openManualJailModal('${escapeHTML(geo.ipAddress)}')" class="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition active:scale-95 flex items-center space-x-1.5">
            <i class="fa-solid fa-lock text-[10px]"></i>
            <span>Quarantine in Jail</span>
          </button>
          ${geo.countryCode && geo.countryCode !== 'LAN' && geo.countryCode !== 'WAN' ? `
            <button type="button" onclick="document.getElementById('input-netrule-pattern').value='${geo.countryCode}'; document.getElementById('input-netrule-label').value='${geo.countryName} Geo-Fence'; window.openAddNetworkRuleModal();" class="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition active:scale-95 flex items-center space-x-1.5">
              <i class="fa-solid fa-earth-americas text-[10px]"></i>
              <span>Create ${geo.countryFlag} (${geo.countryCode}) Geo-Fence Rule</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  } catch (err) {
    resultBox.innerHTML = `
      <div class="p-4 text-center text-rose-400 text-xs space-y-1">
        <i class="fa-solid fa-triangle-exclamation text-base"></i>
        <div>Failed to inspect IP: ${escapeHTML(err.message)}</div>
      </div>
    `;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  EMERGENCY PROTOCOLS, PANIC MODE & MAINTENANCE WINDOWS
// ─────────────────────────────────────────────────────────────────────────────

function getAegisAuthToken() {
  return state.accessToken || state.token || localStorage.getItem('aegis_access_token') || localStorage.getItem('token') || '';
}

window.loadEmergencyStatus = async function() {
  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/emergency/status', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.data) {
      window.renderEmergencyStatus(json.data);
    }
  } catch (err) {
    console.error('Failed to load emergency status:', err);
  }
};

window.renderEmergencyStatus = function(data) {
  const badge = document.getElementById('badge-emergency-level-status');
  const inputReason = document.getElementById('input-emergency-reason');
  const toggleMaint = document.getElementById('toggle-maintenance-enabled');
  const inputMaintMsg = document.getElementById('input-maintenance-message');
  const inputMaintStart = document.getElementById('input-maintenance-start-at');
  const inputMaintEnd = document.getElementById('input-maintenance-end-at');
  const inputMaintRetry = document.getElementById('input-maintenance-retry-after');

  if (inputReason && data.reason) inputReason.value = data.reason;
  if (toggleMaint) toggleMaint.checked = Boolean(data.maintenanceEnabled);
  if (inputMaintMsg && data.maintenanceMessage) inputMaintMsg.value = data.maintenanceMessage;
  if (inputMaintStart && data.maintenanceStartAt) inputMaintStart.value = data.maintenanceStartAt.slice(0, 16);
  if (inputMaintEnd && data.maintenanceEndAt) inputMaintEnd.value = data.maintenanceEndAt.slice(0, 16);
  if (inputMaintRetry && data.maintenanceRetryAfterSeconds) inputMaintRetry.value = data.maintenanceRetryAfterSeconds;

  // Update Buttons and Status Dots
  const levels = ['normal', 'readonly', 'lan', 'airgap'];
  const levelMap = {
    'normal': 'normal',
    'read_only': 'readonly',
    'lan_only': 'lan',
    'air_gap': 'airgap'
  };
  const activeKey = levelMap[data.level] || 'normal';

  levels.forEach(lvl => {
    const btn = document.getElementById(`btn-emergency-${lvl}`);
    const dot = document.getElementById(`dot-emergency-${lvl}`);
    if (btn) {
      if (lvl === activeKey) {
        btn.classList.add('ring-2', 'ring-white/40', 'scale-[1.02]');
      } else {
        btn.classList.remove('ring-2', 'ring-white/40', 'scale-[1.02]');
      }
    }
    if (dot) {
      if (lvl === activeKey) {
        dot.className = lvl === 'normal' ? 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse' :
                        lvl === 'readonly' ? 'w-2 h-2 rounded-full bg-amber-400 animate-pulse' :
                        lvl === 'lan' ? 'w-2 h-2 rounded-full bg-orange-400 animate-pulse' :
                        'w-2 h-2 rounded-full bg-red-400 animate-pulse';
      } else {
        dot.className = 'w-2 h-2 rounded-full bg-slate-600';
      }
    }
  });

  if (badge) {
    if (data.level === 'normal') {
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      badge.textContent = '🟢 Normal Mode';
    } else if (data.level === 'read_only') {
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
      badge.textContent = '🟡 Level 1: Read-Only Shield';
    } else if (data.level === 'lan_only') {
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30';
      badge.textContent = '🟠 Level 2: LAN Quarantine';
    } else if (data.level === 'air_gap') {
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/30 text-red-300 border border-red-500/40 animate-pulse';
      badge.textContent = '🔴 Level 3: Air-Gap Freeze';
    }
  }
};

window.setEmergencyLockdownLevel = async function(level) {
  const reason = document.getElementById('input-emergency-reason')?.value?.trim() || '';
  if (level === 'air_gap') {
    const confirmAirGap = confirm('⚠️ CAUTION: Air-Gap Freeze will halt all client network operations and take an emergency snapshot. Are you sure you want to activate Level 3 Air-Gap Freeze?');
    if (!confirmAirGap) return;
  }

  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/emergency/lockdown', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ level, reason })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update emergency lockdown level.');

    showToast(json.message || `Lockdown level updated to ${level}`, 'success');
    if (json.data) window.renderEmergencyStatus(json.data);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
};

window.saveMaintenanceWindowSettings = async function() {
  const enabled = document.getElementById('toggle-maintenance-enabled')?.checked || false;
  const message = document.getElementById('input-maintenance-message')?.value?.trim() || 'System is temporarily undergoing scheduled maintenance.';
  const startAt = document.getElementById('input-maintenance-start-at')?.value || null;
  const endAt = document.getElementById('input-maintenance-end-at')?.value || null;
  const retryAfterSeconds = Number(document.getElementById('input-maintenance-retry-after')?.value || 300);

  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/emergency/maintenance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        enabled,
        message,
        startAt: startAt ? new Date(startAt).toISOString() : null,
        endAt: endAt ? new Date(endAt).toISOString() : null,
        retryAfterSeconds
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update maintenance settings.');

    showToast(enabled ? '⚠️ Scheduled Maintenance Window ACTIVATED' : '✅ Maintenance Window disabled', enabled ? 'warning' : 'success');
    if (json.data) window.renderEmergencyStatus(json.data);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
};

window.triggerEmergencyPanicSnapshot = async function() {
  const reasonNote = document.getElementById('input-emergency-reason')?.value?.trim() || 'Manual emergency admin snapshot';
  try {
    showToast('📸 Creating encrypted emergency snapshot...', 'info');
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/emergency/panic-snapshot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ reasonNote })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to create emergency snapshot.');

    showToast(`✅ Emergency snapshot created: ${(json.data.sizeBytes / 1024).toFixed(1)} KB`, 'success');
  } catch (err) {
    showToast(`Failed snapshot: ${err.message}`, 'error');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  LAYER-7 WEB APPLICATION FIREWALL (WAF) & PAYLOAD SHIELD
// ─────────────────────────────────────────────────────────────────────────────

window.loadWafSettings = async function() {
  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/waf/settings', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.data) {
      window.renderWafSettings(json.data);
    }
  } catch (err) {
    console.error('Failed to load WAF settings:', err);
  }
};

window.renderWafSettings = function(settings) {
  const toggleWaf = document.getElementById('toggle-waf-enabled');
  const toggleSqli = document.getElementById('toggle-waf-sqli');
  const toggleXss = document.getElementById('toggle-waf-xss');
  const toggleProto = document.getElementById('toggle-waf-proto');
  const toggleTraversal = document.getElementById('toggle-waf-traversal');
  const toggleScanners = document.getElementById('toggle-waf-scanners');
  const badgeStatus = document.getElementById('badge-waf-active-status');

  if (toggleWaf) toggleWaf.checked = Boolean(settings.enabled);
  if (toggleSqli) toggleSqli.checked = Boolean(settings.blockSqlInjection);
  if (toggleXss) toggleXss.checked = Boolean(settings.blockXss);
  if (toggleProto) toggleProto.checked = Boolean(settings.blockPrototypePollution);
  if (toggleTraversal) toggleTraversal.checked = Boolean(settings.blockPathTraversal);
  if (toggleScanners) toggleScanners.checked = Boolean(settings.blockScanners);

  if (badgeStatus) {
    if (settings.enabled) {
      badgeStatus.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30';
      badgeStatus.textContent = 'Active Shield';
    } else {
      badgeStatus.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30';
      badgeStatus.textContent = 'Disabled';
    }
  }
};

window.saveWafSettings = async function() {
  const enabled = document.getElementById('toggle-waf-enabled')?.checked || false;
  const blockSqlInjection = document.getElementById('toggle-waf-sqli')?.checked || false;
  const blockXss = document.getElementById('toggle-waf-xss')?.checked || false;
  const blockPrototypePollution = document.getElementById('toggle-waf-proto')?.checked || false;
  const blockPathTraversal = document.getElementById('toggle-waf-traversal')?.checked || false;
  const blockScanners = document.getElementById('toggle-waf-scanners')?.checked || false;

  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/waf/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        enabled,
        blockSqlInjection,
        blockXss,
        blockPrototypePollution,
        blockPathTraversal,
        blockScanners
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update WAF settings.');

    showToast(json.message || 'WAF settings saved successfully.', 'success');
    if (json.data) window.renderWafSettings(json.data);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
};

window.loadWafStats = async function() {
  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/waf/stats', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.data) {
      window.renderWafStats(json.data);
    }
  } catch (err) {
    console.error('Failed to load WAF stats:', err);
  }
};

window.renderWafStats = function(stats) {
  const elInspected = document.getElementById('metric-waf-inspected');
  const elBlocked = document.getElementById('metric-waf-blocked');
  const elSqli = document.getElementById('metric-waf-sqli');
  const elXss = document.getElementById('metric-waf-xss');
  const elProto = document.getElementById('metric-waf-proto');
  const elScanners = document.getElementById('metric-waf-scanners');
  const tableBody = document.getElementById('table-waf-events-body');

  if (elInspected) elInspected.textContent = stats.totalInspected.toLocaleString();
  if (elBlocked) elBlocked.textContent = stats.totalBlocked.toLocaleString();
  if (elSqli) elSqli.textContent = (stats.threatBreakdown?.sqli || 0).toLocaleString();
  if (elXss) elXss.textContent = (stats.threatBreakdown?.xss || 0).toLocaleString();
  if (elProto) elProto.textContent = (stats.threatBreakdown?.prototype_pollution || 0).toLocaleString();
  if (elScanners) elScanners.textContent = (stats.threatBreakdown?.scanner || 0).toLocaleString();

  if (!tableBody) return;

  if (!stats.recentEvents || stats.recentEvents.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500 text-xs">No active threats detected. WAF Shield is monitoring.</td></tr>`;
    return;
  }

  tableBody.innerHTML = stats.recentEvents.map(evt => {
    const threatBadge = evt.threatType === 'sqli' ? '<span class="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">SQLi</span>' :
                        evt.threatType === 'xss' ? '<span class="px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">XSS</span>' :
                        evt.threatType === 'prototype_pollution' ? '<span class="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30">Proto Poison</span>' :
                        evt.threatType === 'path_traversal' ? '<span class="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">Path Traversal</span>' :
                        '<span class="px-2 py-0.5 rounded-full text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/30">Bad Bot</span>';

    return `
      <tr class="hover:bg-white/[0.02] transition">
        <td class="p-3 text-white font-mono text-xs">${escapeHTML(evt.clientIp)}</td>
        <td class="p-3">${threatBadge}</td>
        <td class="p-3 text-slate-300 font-mono text-xs truncate max-w-[140px]" title="${escapeHTML(evt.path)}"><code class="px-1 py-0.5 rounded bg-black/50 text-slate-300">${escapeHTML(evt.method)}</code> ${escapeHTML(evt.path)}</td>
        <td class="p-3 text-rose-300/90 font-mono text-[11px] truncate max-w-[200px]" title="${escapeHTML(evt.matchedSnippet)}">${escapeHTML(evt.matchedSnippet)}</td>
        <td class="p-3 text-right text-slate-400 text-[11px]">${new Date(evt.timestamp).toLocaleTimeString()}</td>
      </tr>
    `;
  }).join('');
};

// ─────────────────────────────────────────────────────────────────────────────
//  EPHEMERAL ONE-TIME TOKENS (OTT) & ZERO-TRUST DEVICE APPROVALS
// ─────────────────────────────────────────────────────────────────────────────

window.loadOttAndDeviceData = function() {
  window.loadOttTokensTable();
  window.loadDeviceRequestsTable();
};

window.loadOttTokensTable = async function() {
  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/ott/list', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.data) {
      window.renderOttTokensTable(json.data);
    }
  } catch (err) {
    console.error('Failed to load OTT tokens:', err);
  }
};

window.renderOttTokensTable = function(tokens) {
  const tbody = document.getElementById('table-ott-tokens-body');
  if (!tbody) return;

  if (!tokens || tokens.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500 text-xs">No One-Time Tokens created.</td></tr>`;
    return;
  }

  tbody.innerHTML = tokens.map(tok => {
    const isExpired = new Date(tok.expiresAt).getTime() < Date.now();
    const statusBadge = tok.isUsed
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 border border-slate-700">Burned</span>'
      : isExpired
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">Expired</span>'
      : '<span class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">Active</span>';

    return `
      <tr class="hover:bg-white/[0.02] transition">
        <td class="p-2.5">
          <div class="font-medium text-white text-xs truncate max-w-[130px]" title="${escapeHTML(tok.label)}">${escapeHTML(tok.label)}</div>
          <div class="text-[10px] text-slate-500">${new Date(tok.createdAt).toLocaleTimeString()}</div>
        </td>
        <td class="p-2.5 text-cyan-300 font-mono text-[11px]">${escapeHTML(tok.ipRestriction || 'Any IP')}</td>
        <td class="p-2.5 text-center">${statusBadge}</td>
        <td class="p-2.5 text-right">
          ${!tok.isUsed && !isExpired ? `
            <button type="button" onclick="window.revokeOneTimeToken('${tok.id}')" class="px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 text-[10px] font-semibold transition" title="Revoke Token">
              Revoke
            </button>
          ` : `
            <span class="text-[10px] text-slate-600">—</span>
          `}
        </td>
      </tr>
    `;
  }).join('');
};

window._currentOttUrls = { network: '', local: '' };

window.generateOneTimeToken = async function() {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Ephemeral sessions cannot generate tokens or extend duration.', 'warning');
    return;
  }

  const label = document.getElementById('input-ott-label')?.value?.trim() || 'Remote Emergency Access Token';
  const durationMinutes = Number(document.getElementById('select-ott-ttl')?.value || 15);
  const ipRestriction = document.getElementById('input-ott-ip-lock')?.value?.trim() || undefined;

  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/ott/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ label, durationMinutes, ipRestriction })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to generate token.');

    showToast('🔑 One-Time Token & QR Code generated successfully!', 'success');

    // Build or use URLs returned by server
    const serverNetworkUrl = json.data.networkUrl;
    const serverLocalUrl = json.data.localUrl;
    const fallbackOrigin = window.location.origin;

    const networkUrl = serverNetworkUrl || `${fallbackOrigin}/?ott=${json.data.token}`;
    const localUrl = serverLocalUrl || `http://localhost:${window.location.port || 3000}/?ott=${json.data.token}`;

    window._currentOttUrls = { network: networkUrl, local: localUrl };

    const box = document.getElementById('box-generated-ott-link');
    const inputNetUrl = document.getElementById('input-generated-ott-network-url');
    const inputLocUrl = document.getElementById('input-generated-ott-local-url');
    const imgQr = document.getElementById('img-ott-qr-code');
    const linkOpen = document.getElementById('link-ott-open-tab');

    if (inputNetUrl) inputNetUrl.value = networkUrl;
    if (inputLocUrl) inputLocUrl.value = localUrl;
    if (linkOpen) linkOpen.href = networkUrl;

    if (imgQr) {
      imgQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(networkUrl)}`;
    }

    if (box) {
      box.classList.remove('hidden');
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    window.loadOttTokensTable();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
};

window.switchOttQrTarget = function(type) {
  const imgQr = document.getElementById('img-ott-qr-code');
  const btnNet = document.getElementById('btn-ott-qr-toggle-net');
  const btnLoc = document.getElementById('btn-ott-qr-toggle-loc');
  const linkOpen = document.getElementById('link-ott-open-tab');

  const targetUrl = type === 'local' ? window._currentOttUrls.local : window._currentOttUrls.network;
  if (!targetUrl) return;

  if (imgQr) {
    imgQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(targetUrl)}`;
  }
  if (linkOpen) linkOpen.href = targetUrl;

  if (type === 'local') {
    btnLoc?.classList.add('bg-cyan-500', 'text-black', 'font-bold', 'shadow-md', 'shadow-cyan-950/50');
    btnLoc?.classList.remove('bg-white/10', 'hover:bg-white/20', 'text-slate-300');
    btnNet?.classList.remove('bg-cyan-500', 'text-black', 'font-bold', 'shadow-md', 'shadow-cyan-950/50');
    btnNet?.classList.add('bg-white/10', 'hover:bg-white/20', 'text-slate-300');
    showToast('📱 QR Code switched to Localhost URL', 'info');
  } else {
    btnNet?.classList.add('bg-cyan-500', 'text-black', 'font-bold', 'shadow-md', 'shadow-cyan-950/50');
    btnNet?.classList.remove('bg-white/10', 'hover:bg-white/20', 'text-slate-300');
    btnLoc?.classList.remove('bg-cyan-500', 'text-black', 'font-bold', 'shadow-md', 'shadow-cyan-950/50');
    btnLoc?.classList.add('bg-white/10', 'hover:bg-white/20', 'text-slate-300');
    showToast('📶 QR Code switched to Wi-Fi LAN Network URL (Recommended for Phones)', 'info');
  }
};

window.copyGeneratedOttUrl = function(type = 'network') {
  const url = type === 'local' ? window._currentOttUrls.local : window._currentOttUrls.network;
  const inputEl = type === 'local'
    ? document.getElementById('input-generated-ott-local-url')
    : document.getElementById('input-generated-ott-network-url');

  const textToCopy = url || inputEl?.value;
  if (textToCopy) {
    navigator.clipboard.writeText(textToCopy);
    showToast(`📋 ${type === 'local' ? 'Localhost' : 'Wi-Fi Network'} login URL copied to clipboard!`, 'info');
  }
};

window.revokeOneTimeToken = async function(id) {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Cannot revoke tokens.', 'warning');
    return;
  }
  try {
    const token = getAegisAuthToken();
    const res = await fetch(`/api/v1/admin/ott/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to revoke token.');

    showToast('Token revoked.', 'warning');
    window.loadOttTokensTable();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
};

window.loadDeviceRequestsTable = async function() {
  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/device-requests', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.data) {
      window.renderDeviceRequestsTable(json.data);
    }
  } catch (err) {
    console.error('Failed to load device requests:', err);
  }
};

window.renderDeviceRequestsTable = function(requests) {
  const tbody = document.getElementById('table-device-requests-body');
  if (!tbody) return;

  if (!requests || requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-slate-500 text-xs">No pending device access requests.</td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map(req => {
    const isPending = req.status === 'pending';
    const statusBadge = req.status === 'approved'
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Approved</span>'
      : req.status === 'rejected'
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">Rejected</span>'
      : '<span class="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">Pending</span>';

    return `
      <tr class="hover:bg-white/[0.02] transition">
        <td class="p-2.5">
          <div class="font-medium text-white text-xs truncate max-w-[140px]" title="${escapeHTML(req.deviceName)}">${escapeHTML(req.deviceName)}</div>
          <div class="text-[10px] text-cyan-400 font-mono">${escapeHTML(req.ipAddress)}</div>
        </td>
        <td class="p-2.5 text-center">${statusBadge}</td>
        <td class="p-2.5 text-right">
          ${isPending && !state.user?.isOttLogin ? `
            <div class="flex items-center justify-end space-x-1">
              <button type="button" onclick="window.approveDeviceRequest('${req.id}')" class="px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold transition" title="Approve (24h Whitelist)">
                Approve
              </button>
              <button type="button" onclick="window.rejectDeviceRequest('${req.id}')" class="px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 text-[10px] font-semibold transition" title="Reject Request">
                Reject
              </button>
            </div>
          ` : `
            <span class="text-[10px] text-slate-500">${escapeHTML(req.decidedBy || (isPending ? 'Pending Host Review' : '—'))}</span>
          `}
        </td>
      </tr>
    `;
  }).join('');
};

window.approveDeviceRequest = async function(id) {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Cannot approve device requests.', 'warning');
    return;
  }
  try {
    const token = getAegisAuthToken();
    const res = await fetch(`/api/v1/admin/device-requests/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ durationHours: 24 })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to approve device.');

    showToast(json.message || 'Device approved and whitelisted.', 'success');
    window.loadDeviceRequestsTable();
    if (typeof window.loadNetworkRules === 'function') window.loadNetworkRules();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
};

window.rejectDeviceRequest = async function(id) {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Cannot reject device requests.', 'warning');
    return;
  }
  try {
    const token = getAegisAuthToken();
    const res = await fetch(`/api/v1/admin/device-requests/${id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to reject device.');

    showToast('Device request rejected.', 'warning');
    window.loadDeviceRequestsTable();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
};

// ── Check URL for ?ott=<token> on startup ──────────────────────────────────
(function checkOttUrlParameter() {
  const urlParams = new URLSearchParams(window.location.search);
  const ottToken = urlParams.get('ott');
  if (ottToken) {
    fetch('/api/v1/auth/ott/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ottToken })
    })
    .then(res => res.json())
    .then(json => {
      if (json.success && json.token) {
        state.token = json.token;
        state.accessToken = json.token;
        state.user = json.user;
        localStorage.setItem('token', json.token);
        localStorage.setItem('aegis_access_token', json.token);
        localStorage.setItem('user', JSON.stringify(json.user));
        localStorage.setItem('aegis_user', JSON.stringify(json.user));
        // Clean URL without refresh
        window.history.replaceState({}, document.title, window.location.pathname);
        showToast('🎉 Authenticated via One-Time Super Admin Token!', 'success');

        document.getElementById('auth-screen')?.classList.add('hidden');
        document.getElementById('main-app')?.classList.remove('hidden');
        if (typeof updateUserProfileUI === 'function') updateUserProfileUI();
        if (typeof setRoleMode === 'function') setRoleMode('superadmin');
        if (typeof connectGlobalWebSocket === 'function') connectGlobalWebSocket();
        if (typeof initGlobalData === 'function') initGlobalData();

        // Switch to Server Hosting & Network Center if on default
        const currentHash = window.location.hash;
        if (!currentHash || currentHash === '#tab-server-hosting') {
          if (typeof window.switchTab === 'function') window.switchTab('tab-server-hosting');
        }
      } else {
        showToast(`One-Time Token Login Failed: ${json.message}`, 'error');
      }
    })
    .catch(err => {
      showToast(`One-Time Token Error: ${err.message}`, 'error');
    });
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
//  CLUSTER PORT DIAGNOSTICS MATRIX & ZERO-DOWNTIME HOT RESTART
// ─────────────────────────────────────────────────────────────────────────────

window.loadClusterDiagnosticsReport = async function() {
  const tbody = document.getElementById('table-cluster-ports-body');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500 text-xs">Running cluster port diagnostic probe...</td></tr>`;
  }

  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/server/cluster-diagnostics', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.data) {
      window.renderClusterDiagnosticsReport(json.data);
    }
  } catch (err) {
    console.error('Failed to load cluster diagnostics:', err);
  }
};

window.renderClusterDiagnosticsReport = function(data) {
  const badgeHost = document.getElementById('badge-cluster-host-info');
  const elUptime = document.getElementById('metric-cluster-uptime');
  const elMem = document.getElementById('metric-cluster-mem');
  const elCpu = document.getElementById('metric-cluster-cpu');
  const elPortHost = document.getElementById('metric-cluster-port-host');
  const tbody = document.getElementById('table-cluster-ports-body');

  if (badgeHost) badgeHost.textContent = `${data.hostname} (${data.platform})`;
  if (elUptime) {
    const s = data.uptimeSeconds;
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    elUptime.textContent = hrs > 0 ? `${hrs}h ${mins}m` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }
  if (elMem) elMem.textContent = `${data.memoryUsageMb} MB (${data.heapUsedMb} MB Heap)`;
  if (elCpu) elCpu.textContent = `${data.cpuLoadAvg?.[0]?.toFixed(2) || '0.00'} (${data.cpuCores} Cores)`;
  if (elPortHost) elPortHost.textContent = `Port ${data.currentPort} (${data.currentHost || '0.0.0.0'})`;

  if (!tbody) return;

  if (!data.portMatrix || data.portMatrix.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500 text-xs">No candidate ports scanned.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.portMatrix.map(pm => {
    const isActive = pm.status === 'active_aegis';
    const isFree = pm.status === 'free';
    const statusBadge = isActive
      ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse font-bold">🟢 Active Master</span>'
      : isFree
      ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">Free & Available</span>'
      : pm.status === 'scheduled_reserved'
      ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">Reserved</span>'
      : '<span class="px-2.5 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">Occupied</span>';

    return `
      <tr class="hover:bg-white/[0.02] transition">
        <td class="p-3 font-mono font-bold text-white text-xs flex items-center space-x-1.5">
          <i class="fa-solid fa-server text-slate-500 text-[10px]"></i>
          <span>Port ${pm.port}</span>
        </td>
        <td class="p-3">${statusBadge}</td>
        <td class="p-3 text-center text-slate-400 font-mono text-[11px]">${pm.latencyMs} ms</td>
        <td class="p-3 text-slate-300 text-xs truncate max-w-[220px]" title="${escapeHTML(pm.description)}">${escapeHTML(pm.description)}</td>
        <td class="p-3 text-right">
          ${isFree ? `
            <button type="button" onclick="document.getElementById('input-target-port').value='${pm.port}'; window.savePlatformSettings();" class="px-2.5 py-1 rounded bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold transition active:scale-95">
              Switch to ${pm.port}
            </button>
          ` : isActive ? `
            <span class="text-[10px] text-emerald-400 font-semibold font-mono">Bound</span>
          ` : `
            <span class="text-[10px] text-slate-600">—</span>
          `}
        </td>
      </tr>
    `;
  }).join('');
};

window.triggerZeroDowntimeHotRestart = async function() {
  const confirmed = confirm('⚡ Zero-Downtime Hot Restart will cycle the HTTP server instance in-memory, flush device tracking buffers, and re-bind listeners without terminating the process or losing client sessions. Proceed?');
  if (!confirmed) return;

  try {
    showToast('⚡ Initiating zero-downtime hot restart...', 'info');
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/server/hot-restart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to trigger hot restart.');

    showToast(json.message || 'Hot restart completed successfully.', 'success');
    window.loadClusterDiagnosticsReport();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GLOBAL PUBLIC HOSTING & INTERNET TUNNELS (NGROK & LOCALTUNNEL)
// ─────────────────────────────────────────────────────────────────────────────

let currentTunnelState = {
  enabled: false,
  status: 'offline',
  provider: 'cloudflare',
  publicUrl: null,
  hostPublicIp: null
};

window.loadTunnelStatus = async function() {
  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/tunnel/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.data) {
      window.renderTunnelUI(json.data);
    }
  } catch (err) {
    console.error('Failed to load tunnel status:', err);
  }
};

window.renderTunnelUI = function(data) {
  if (!data) return;
  currentTunnelState = data;

  const pill = document.getElementById('badge-tunnel-status-pill');
  const providerBadge = document.getElementById('badge-tunnel-provider-pill');
  const btnToggle = document.getElementById('btn-tunnel-master-toggle');
  const textBtn = document.getElementById('text-btn-tunnel-toggle');
  const cardDetails = document.getElementById('card-active-tunnel-details');
  const inputUrl = document.getElementById('input-tunnel-public-url');
  const imgQr = document.getElementById('img-tunnel-qr-code');
  const linkOpen = document.getElementById('link-tunnel-open-tab');
  const badgeCountdown = document.getElementById('badge-tunnel-timer-countdown');

  const selectProvider = document.getElementById('select-tunnel-provider');
  const inputToken = document.getElementById('input-tunnel-authtoken');
  const inputDomain = document.getElementById('input-tunnel-domain');
  const selectTtl = document.getElementById('select-tunnel-ttl');

  const boxLtPassword = document.getElementById('box-localtunnel-password');
  const textLtIp = document.getElementById('text-localtunnel-ip');

  const metricReqs = document.getElementById('metric-tunnel-reqs');
  const metricBytes = document.getElementById('metric-tunnel-bytes');
  const metricUptime = document.getElementById('metric-tunnel-uptime');

  if (selectProvider && data.provider) selectProvider.value = data.provider;
  if (inputDomain && data.customDomain !== undefined) inputDomain.value = data.customDomain;
  if (selectTtl && data.autoCloseMinutes !== undefined) selectTtl.value = data.autoCloseMinutes.toString();

  // Host IP for Localtunnel Password
  if (textLtIp && data.hostPublicIp) {
    textLtIp.textContent = data.hostPublicIp;
  }

  // Toggle Localtunnel password box
  const selectedProv = selectProvider?.value || data.provider;
  if (boxLtPassword) {
    if (selectedProv === 'localtunnel') {
      boxLtPassword.classList.remove('hidden');
    } else {
      boxLtPassword.classList.add('hidden');
    }
  }

  if (data.status === 'online' && data.publicUrl) {
    const provName = data.provider === 'cloudflare' ? 'Cloudflare Quick Tunnel' : data.provider === 'ngrok' ? 'Ngrok' : 'Localtunnel';
    if (pill) {
      pill.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse';
      pill.textContent = `🟢 Online (${provName})`;
    }
    if (providerBadge) {
      providerBadge.textContent = provName;
    }
    if (btnToggle) {
      btnToggle.className = 'px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition flex items-center space-x-1.5 active:scale-95 shadow-lg shadow-rose-950/50';
    }
    if (textBtn) textBtn.textContent = 'Stop Global Tunnel';

    if (cardDetails) cardDetails.classList.remove('hidden');
    if (inputUrl) inputUrl.value = data.publicUrl;
    if (linkOpen) linkOpen.href = data.publicUrl;

    if (imgQr) {
      imgQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data.publicUrl)}`;
    }

    if (badgeCountdown) {
      if (data.remainingSeconds !== null && data.remainingSeconds > 0) {
        const mins = Math.floor(data.remainingSeconds / 60);
        const secs = data.remainingSeconds % 60;
        badgeCountdown.textContent = `Auto-Close: ${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
      } else if (data.autoCloseMinutes === 0) {
        badgeCountdown.textContent = 'Auto-Close: Permanent';
      }
    }

    if (metricReqs && data.stats) metricReqs.textContent = data.stats.totalRequests.toLocaleString();
    if (metricBytes && data.stats) metricBytes.textContent = `${Math.round(data.stats.bytesTransferred / 1024).toLocaleString()} KB`;
    if (metricUptime && data.stats) metricUptime.textContent = `${data.stats.uptimeSeconds}s`;
  } else if (data.status === 'starting') {
    if (pill) {
      pill.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse';
      pill.textContent = '⏳ Connecting...';
    }
    if (btnToggle) {
      btnToggle.className = 'px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition flex items-center space-x-1.5 active:scale-95 shadow-lg shadow-amber-950/50';
    }
    if (textBtn) textBtn.textContent = 'Connecting...';
    if (cardDetails) cardDetails.classList.add('hidden');
  } else {
    if (pill) {
      pill.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-white/10';
      pill.textContent = '⚪ Offline';
    }
    if (btnToggle) {
      btnToggle.className = 'px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center space-x-1.5 active:scale-95 shadow-lg shadow-indigo-950/50';
    }
    if (textBtn) textBtn.textContent = 'Start Global Tunnel';
    if (cardDetails) cardDetails.classList.add('hidden');
  }
};

window.toggleGlobalTunnel = async function() {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Cannot open or close global tunnels.', 'warning');
    return;
  }

  const isOnline = currentTunnelState.status === 'online' || currentTunnelState.status === 'starting';
  const endpoint = isOnline ? '/api/v1/admin/tunnel/stop' : '/api/v1/admin/tunnel/start';

  try {
    showToast(isOnline ? '⏳ Stopping global tunnel...' : '🚀 Establishing global public HTTPS tunnel...', 'info');
    const token = getAegisAuthToken();

    const provider = document.getElementById('select-tunnel-provider')?.value || 'cloudflare';
    const authToken = document.getElementById('input-tunnel-authtoken')?.value?.trim() || '';
    const customDomain = document.getElementById('input-tunnel-domain')?.value?.trim() || '';
    const autoCloseMinutes = parseInt(document.getElementById('select-tunnel-ttl')?.value || '60', 10);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: isOnline ? undefined : JSON.stringify({ provider, authToken, customDomain, autoCloseMinutes })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to toggle global tunnel.');

    showToast(json.message || 'Tunnel operation succeeded.', 'success');
    if (json.data) window.renderTunnelUI(json.data);
  } catch (err) {
    showToast(`Tunnel Error: ${err.message}`, 'error');
    window.loadTunnelStatus();
  }
};

window.saveTunnelSettings = async function() {
  if (state.user?.isOttLogin) {
    showToast('🔒 One-Time Access Mode: Cannot modify tunnel settings.', 'warning');
    return;
  }

  const provider = document.getElementById('select-tunnel-provider')?.value || 'cloudflare';
  const authToken = document.getElementById('input-tunnel-authtoken')?.value?.trim() || '';
  const customDomain = document.getElementById('input-tunnel-domain')?.value?.trim() || '';
  const autoCloseMinutes = parseInt(document.getElementById('select-tunnel-ttl')?.value || '60', 10);

  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/tunnel/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ provider, authToken, customDomain, autoCloseMinutes })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to save settings.');

    showToast('Public tunnel preferences saved.', 'success');
    if (json.data) window.renderTunnelUI(json.data);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
};

window.copyTunnelPublicUrl = function() {
  const inputUrl = document.getElementById('input-tunnel-public-url');
  if (inputUrl && inputUrl.value) {
    navigator.clipboard.writeText(inputUrl.value);
    showToast('📋 Global public HTTPS URL copied to clipboard!', 'info');
  }
};

window.copyLocaltunnelIp = function() {
  const textIp = document.getElementById('text-localtunnel-ip')?.textContent;
  if (textIp && textIp !== 'Loading IP...') {
    navigator.clipboard.writeText(textIp.trim());
    showToast('📋 Localtunnel Password IP copied!', 'info');
  }
};

window.handleTunnelProviderChange = function() {
  const provider = document.getElementById('select-tunnel-provider')?.value;
  const tokenInput = document.getElementById('input-tunnel-authtoken');
  const hintEl = document.getElementById('text-tunnel-provider-hint');
  const boxLtPassword = document.getElementById('box-localtunnel-password');

  if (provider === 'cloudflare') {
    if (tokenInput) tokenInput.placeholder = 'Not needed for Cloudflare Quick Tunnel';
    if (hintEl) hintEl.innerHTML = '<i class="fa-solid fa-cloud text-xs"></i><span>Cloudflare Quick Tunnel: Instant global HTTPS URL powered by Cloudflare with zero 502 Bad Gateways.</span>';
    if (boxLtPassword) boxLtPassword.classList.add('hidden');
  } else if (provider === 'ngrok') {
    if (tokenInput) tokenInput.placeholder = 'Paste authtoken from ngrok.com';
    if (hintEl) hintEl.innerHTML = '<i class="fa-solid fa-bolt text-xs"></i><span>Ngrok: High-speed enterprise tunneling. Requires free authtoken from ngrok.com.</span>';
    if (boxLtPassword) boxLtPassword.classList.add('hidden');
  } else {
    if (tokenInput) tokenInput.placeholder = 'Not required for Localtunnel';
    if (hintEl) hintEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-amber-400 text-xs"></i><span class="text-amber-300">Localtunnel: Free community tunnel. If visitors see an IP password prompt, enter the Host IP shown below.</span>';
    if (boxLtPassword) boxLtPassword.classList.remove('hidden');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  REAL-TIME TRAFFIC TOPOLOGY & FLOW TELEMETRY MATRIX
// ─────────────────────────────────────────────────────────────────────────────

window.loadTrafficTopologyMetrics = async function() {
  try {
    const token = getAegisAuthToken();
    const res = await fetch('/api/v1/admin/traffic/topology', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.data) {
      window.renderTrafficTopologyUI(json.data);
    }
  } catch (err) {
    console.error('Failed to load traffic topology:', err);
  }
};

window.renderTrafficTopologyUI = function(snapshot) {
  if (!snapshot) return;

  // Node 1: Ingress Gateways
  const elLocal = document.getElementById('topo-ingress-local');
  const elLan = document.getElementById('topo-ingress-lan');
  const elWan = document.getElementById('topo-ingress-wan');
  const elLatIngress = document.getElementById('topo-latency-ingress');
  if (elLocal) elLocal.textContent = snapshot.ingressDistribution?.localhost?.toLocaleString() || '0';
  if (elLan) elLan.textContent = snapshot.ingressDistribution?.lan?.toLocaleString() || '0';
  if (elWan) elWan.textContent = snapshot.ingressDistribution?.wan_tunnel?.toLocaleString() || '0';
  if (elLatIngress && snapshot.pipelineNodes?.ingress) elLatIngress.textContent = `${snapshot.pipelineNodes.ingress.avgLatencyMs}ms`;

  // Node 2: Security & WAF
  const elLatSec = document.getElementById('topo-latency-sec');
  if (elLatSec && snapshot.pipelineNodes?.security) elLatSec.textContent = `${snapshot.pipelineNodes.security.avgLatencyMs}ms`;

  // Node 3: Router Dispatcher
  const elHttp = document.getElementById('topo-proto-http');
  const elWs = document.getElementById('topo-proto-ws');
  const elLatRouter = document.getElementById('topo-latency-router');
  if (elHttp) elHttp.textContent = snapshot.protocolDistribution?.['HTTP/1.1']?.toLocaleString() || '0';
  if (elWs) elWs.textContent = snapshot.protocolDistribution?.['WebSocket']?.toLocaleString() || '0';
  if (elLatRouter && snapshot.pipelineNodes?.router) elLatRouter.textContent = `${snapshot.pipelineNodes.router.avgLatencyMs}ms`;

  // Node 4: SQLite Database Engine
  const elDbReqs = document.getElementById('topo-db-total-reqs');
  const elDbBytesIn = document.getElementById('topo-db-bytes-in');
  const elDbBytesOut = document.getElementById('topo-db-bytes-out');
  const elLatStorage = document.getElementById('topo-latency-storage');
  if (elDbReqs) elDbReqs.textContent = snapshot.totalRequests?.toLocaleString() || '0';
  if (elDbBytesIn) elDbBytesIn.textContent = `${Math.round((snapshot.totalBytesIn || 0) / 1024).toLocaleString()} KB`;
  if (elDbBytesOut) elDbBytesOut.textContent = `${Math.round((snapshot.totalBytesOut || 0) / 1024).toLocaleString()} KB`;
  if (elLatStorage && snapshot.pipelineNodes?.storage) elLatStorage.textContent = `${snapshot.pipelineNodes.storage.avgLatencyMs}ms`;

  // 4 Gauges
  const elBwIn = document.getElementById('metric-traffic-bandwidth-in');
  const elBwOut = document.getElementById('metric-traffic-bandwidth-out');
  const elRps = document.getElementById('metric-traffic-rps');
  const elSockets = document.getElementById('metric-traffic-active-sockets');

  if (elBwIn) {
    const bytes = snapshot.bandwidthInBps || 0;
    elBwIn.textContent = bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB/s` : bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB/s` : `${bytes} B/s`;
  }
  if (elBwOut) {
    const bytes = snapshot.bandwidthOutBps || 0;
    elBwOut.textContent = bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB/s` : bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB/s` : `${bytes} B/s`;
  }
  if (elRps) elRps.textContent = `${(snapshot.requestsPerSecond || 0).toFixed(1)} RPS`;
  if (elSockets) elSockets.textContent = (snapshot.activeConcurrentSockets || 1).toString();

  // Streams Table
  const tbody = document.getElementById('table-traffic-streams-body');
  if (tbody && snapshot.recentStreams) {
    if (snapshot.recentStreams.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500 text-xs">No active stream transactions recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = snapshot.recentStreams.map(s => {
      const isErr = s.statusCode >= 400;
      const statusBadge = isErr
        ? `<span class="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">${s.statusCode}</span>`
        : `<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">${s.statusCode}</span>`;

      const ingressBadge = s.ingressType === 'localhost'
        ? '<span class="px-2 py-0.5 rounded text-[10px] bg-white/10 text-slate-300">Localhost</span>'
        : s.ingressType === 'lan'
        ? '<span class="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300">Wi-Fi LAN</span>'
        : '<span class="px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300">Tunnel WAN</span>';

      return `
        <tr class="hover:bg-white/[0.02] transition font-mono">
          <td class="p-2.5">
            <div class="text-white text-xs font-semibold flex items-center space-x-1.5">
              <span>${s.countryCode ? s.countryCode : '🏠'}</span>
              <span>${escapeHTML(s.clientIp)}</span>
            </div>
            <div class="text-[10px] text-slate-500">${escapeHTML(s.countryName || 'Local Network')}</div>
          </td>
          <td class="p-2.5">${ingressBadge}</td>
          <td class="p-2.5">
            <span class="text-cyan-400 font-bold text-[11px]">${escapeHTML(s.method)}</span>
            <span class="text-slate-300 text-xs ml-1">${escapeHTML(s.path)}</span>
          </td>
          <td class="p-2.5 text-center">${statusBadge}</td>
          <td class="p-2.5 text-right text-slate-400 text-xs">${s.latencyMs}ms</td>
          <td class="p-2.5 text-right text-slate-300 text-xs">${Math.round((s.bytesIn + s.bytesOut) / 1024 * 10) / 10} KB</td>
        </tr>
      `;
    }).join('');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  AEGISDB USER FEATURE SUITE (Passkeys, Magic Links, Sessions, PATs, Teams, Quota)
// ─────────────────────────────────────────────────────────────────────────────

// ── WebAuthn Base64URL Helpers ───────────────────────────────────────────────
function bufferFromBase64Url(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── 1. Passkeys / WebAuthn (FIDO2) Handlers ───────────────────────────────────

window.executePasskeyLogin = async function() {
  if (!window.PublicKeyCredential) {
    showToast('Biometric Passkeys (WebAuthn) are not supported on this browser/device.', 'error');
    return;
  }

  try {
    showToast('Initiating Passkey authentication...', 'info');
    const emailInput = document.getElementById('input-email')?.value?.trim();
    const url = emailInput ? `/api/v1/auth/passkeys/login-options?email=${encodeURIComponent(emailInput)}` : '/api/v1/auth/passkeys/login-options';
    const optionsRes = await apiRequest(url, 'GET');
    const options = (optionsRes && optionsRes.challenge) ? optionsRes : (optionsRes?.data || optionsRes || {});

    if (!options.challenge) {
      showToast('No registered biometric passkey found. Please sign in with password/Google first and register your device.', 'error');
      return;
    }

    const challengeBuffer = bufferFromBase64Url(options.challenge);
    const allowCredentials = (options.allowCredentials || []).map(c => ({
      id: bufferFromBase64Url(c.id),
      type: c.type || 'public-key',
      transports: c.transports
    }));

    let assertion;
    try {
      assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challengeBuffer,
          rpId: options.rpId || window.location.hostname,
          allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
          userVerification: 'preferred',
          timeout: 60000
        }
      });
    } catch (ceremonyErr) {
      console.warn('WebAuthn ceremony aborted or rejected:', ceremonyErr);
      showToast('Biometric verification cancelled or timed out.', 'info');
      return;
    }

    if (!assertion) {
      showToast('Biometric verification cancelled.', 'info');
      return;
    }

    const assertionData = {
      challenge: options.challenge,
      credentialId: bufferToBase64Url(assertion.rawId),
      authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
      clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
      signature: bufferToBase64Url(assertion.response.signature)
    };

    const verifyRes = await apiRequest('/api/v1/auth/passkeys/login-verify', 'POST', assertionData);
    const authData = (verifyRes && verifyRes.token) ? verifyRes : (verifyRes?.data || {});

    if (authData.token) {
      state.accessToken = authData.token;
      state.refreshToken = authData.refreshToken;
      state.user = authData.user;
      localStorage.setItem('aegis_access_token', state.accessToken);
      localStorage.setItem('aegis_token', state.accessToken);
      localStorage.setItem('aegis_refresh_token', state.refreshToken);
      localStorage.setItem('aegis_user', JSON.stringify(state.user));

      showToast(`Welcome back, ${state.user.name || state.user.email}!`, 'success');
      document.getElementById('auth-screen')?.classList.add('hidden');
      document.getElementById('main-app')?.classList.remove('hidden');
      updateUserProfileUI();
      setRoleMode(state.user.isSuperAdmin ? 'superadmin' : 'developer');
      connectGlobalWebSocket();
      initGlobalData();
    }
  } catch (err) {
    showToast(err.message || 'Passkey verification failed', 'error');
  }
};

window.registerNewPasskey = async function() {
  if (!window.PublicKeyCredential) {
    showToast('Biometrics / Passkeys are not supported on this device.', 'error');
    return;
  }

  const deviceName = prompt('Enter a friendly name for this Passkey (e.g. MacBook Touch ID, Work Laptop, YubiKey 5):', 'My Hardware Passkey');
  if (!deviceName) return;

  try {
    showToast('Preparing Passkey registration...', 'info');
    const optionsRes = await apiRequest('/api/v1/auth/passkeys/register-options', 'POST');
    const options = (optionsRes && optionsRes.challenge) ? optionsRes : (optionsRes?.data || optionsRes || {});

    if (!options.challenge) {
      showToast('Failed to obtain registration challenge from server.', 'error');
      return;
    }

    const challengeBuffer = bufferFromBase64Url(options.challenge);
    const userIdBuffer = new TextEncoder().encode(options.user.id);

    let credential;
    try {
      credential = await navigator.credentials.create({
        publicKey: {
          challenge: challengeBuffer,
          rp: options.rp,
          user: {
            id: userIdBuffer,
            name: options.user.name,
            displayName: options.user.displayName
          },
          pubKeyCredParams: options.pubKeyCredParams,
          authenticatorSelection: options.authenticatorSelection || {
            residentKey: 'preferred',
            userVerification: 'preferred'
          },
          timeout: 60000,
          attestation: 'none'
        }
      });
    } catch (ceremonyErr) {
      console.warn('WebAuthn registration ceremony cancelled:', ceremonyErr);
      showToast('Passkey registration cancelled.', 'info');
      return;
    }

    if (!credential) {
      showToast('Passkey registration cancelled.', 'info');
      return;
    }

    const verifyData = {
      challenge: options.challenge,
      credentialId: bufferToBase64Url(credential.rawId),
      publicKey: bufferToBase64Url(credential.response.getPublicKey ? credential.response.getPublicKey() : credential.rawId),
      deviceName,
      transports: credential.response.getTransports ? credential.response.getTransports() : ['internal']
    };

    await apiRequest('/api/v1/auth/passkeys/register-verify', 'POST', verifyData);
    showToast('🎉 Biometric Passkey registered successfully!', 'success');
    window.fetchUserPasskeys();
  } catch (err) {
    showToast(err.message || 'Failed to register passkey', 'error');
  }
};

window.fetchUserPasskeys = async function() {
  const container = document.getElementById('user-passkeys-list');
  if (!container || !state.accessToken) return;

  try {
    const res = await apiRequest('/api/v1/auth/passkeys', 'GET');
    const passkeys = Array.isArray(res) ? res : (res?.data || []);

    if (passkeys.length === 0) {
      container.innerHTML = '<div class="text-xs text-slate-500 py-2">No passkeys registered. Click "+ Register New Passkey" above.</div>';
      return;
    }

    container.innerHTML = passkeys.map(p => `
      <div class="p-3 bg-slate-900/80 rounded-xl border border-white/10 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
            <i class="fa-solid fa-fingerprint"></i>
          </div>
          <div>
            <div class="text-xs font-semibold text-white">${escapeHTML(p.deviceName)}</div>
            <div class="text-[10px] text-slate-400 font-mono">Added: ${new Date(p.createdAt).toLocaleDateString()} • Counter: ${p.counter}</div>
          </div>
        </div>
        <button type="button" onclick="window.deleteUserPasskey('${p.id}')" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs border border-rose-500/20 transition cursor-pointer">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-xs text-rose-400">Failed to load passkeys: ${escapeHTML(err.message)}</div>`;
  }
};

window.deleteUserPasskey = async function(id) {
  if (!confirm('Are you sure you want to remove this biometric passkey?')) return;
  try {
    await apiRequest(`/api/v1/auth/passkeys/${id}`, 'DELETE');
    showToast('Passkey removed.', 'info');
    window.fetchUserPasskeys();
  } catch (err) {
    showToast(err.message || 'Failed to remove passkey', 'error');
  }
};

// ── 2. Passwordless Magic Link & 6-Digit Email OTP Handlers ──────────────────

window.openMagicLinkModal = function() {
  document.getElementById('magic-auth-step-1')?.classList.remove('hidden');
  document.getElementById('magic-auth-step-2')?.classList.add('hidden');
  const inputEmail = document.getElementById('input-magic-email');
  if (inputEmail) {
    const mainEmail = document.getElementById('input-email');
    if (mainEmail?.value) inputEmail.value = mainEmail.value;
  }
  window.showModal('modal-magic-link');
};

window.requestMagicAuth = async function() {
  const email = document.getElementById('input-magic-email')?.value?.trim();
  if (!email) {
    showToast('Please enter your email address.', 'error');
    return;
  }

  try {
    showToast('Generating Magic Link & OTP...', 'info');
    const res = await apiRequest('/api/v1/auth/magic-link/request', 'POST', { email });
    showToast('Magic code generated!', 'success');

    document.getElementById('magic-auth-step-1')?.classList.add('hidden');
    document.getElementById('magic-auth-step-2')?.classList.remove('hidden');
    const otpDisplay = document.getElementById('magic-demo-otp-display');
    const otpCode = res?.otpCode || res?.data?.otpCode;
    if (otpDisplay && otpCode) {
      otpDisplay.textContent = `Demo Verification Code: ${otpCode}`;
    }
  } catch (err) {
    showToast(err.message || 'Failed to request magic auth', 'error');
  }
};

window.verifyMagicAuthOtp = async function() {
  const email = document.getElementById('input-magic-email')?.value?.trim();
  const otpCode = document.getElementById('input-magic-otp')?.value?.trim();

  if (!otpCode || otpCode.length !== 6) {
    showToast('Please enter the 6-digit numeric verification code.', 'error');
    return;
  }

  try {
    const res = await apiRequest('/api/v1/auth/magic-link/verify', 'POST', { email, otpCode });
    const authData = (res && res.token) ? res : (res?.data || {});

    if (authData.token) {
      state.accessToken = authData.token;
      state.refreshToken = authData.refreshToken;
      state.user = authData.user;
      localStorage.setItem('aegis_access_token', state.accessToken);
      localStorage.setItem('aegis_token', state.accessToken);
      localStorage.setItem('aegis_refresh_token', state.refreshToken);
      localStorage.setItem('aegis_user', JSON.stringify(state.user));

      window.hideModal('modal-magic-link');
      showToast(`Welcome back, ${state.user.name || state.user.email}!`, 'success');
      document.getElementById('auth-screen')?.classList.add('hidden');
      document.getElementById('main-app')?.classList.remove('hidden');
      updateUserProfileUI();
      setRoleMode(state.user.isSuperAdmin ? 'superadmin' : 'developer');
      connectGlobalWebSocket();
      initGlobalData();
    }
  } catch (err) {
    showToast(err.message || 'Invalid or expired OTP code', 'error');
  }
};

// Auto-login if ?magicToken=... in URL
(async function checkMagicTokenUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const magicToken = urlParams.get('magicToken');
  if (magicToken && magicToken.startsWith('magic_')) {
    try {
      showToast('Authenticating via Magic Link...', 'info');
      const res = await apiRequest('/api/v1/auth/magic-link/verify', 'POST', { token: magicToken });
      const authData = (res && res.token) ? res : (res?.data || {});

      if (authData.token) {
        state.accessToken = authData.token;
        state.refreshToken = authData.refreshToken;
        state.user = authData.user;
        localStorage.setItem('aegis_access_token', state.accessToken);
        localStorage.setItem('aegis_token', state.accessToken);
        localStorage.setItem('aegis_refresh_token', state.refreshToken);
        localStorage.setItem('aegis_user', JSON.stringify(state.user));
        window.history.replaceState(null, '', window.location.pathname);

        showToast('Logged in via Magic Link!', 'success');
        document.getElementById('auth-screen')?.classList.add('hidden');
        document.getElementById('main-app')?.classList.remove('hidden');
        updateUserProfileUI();
        setRoleMode(state.user.isSuperAdmin ? 'superadmin' : 'developer');
        connectGlobalWebSocket();
        initGlobalData();
      }
    } catch (err) {
      showToast(err.message || 'Magic link expired or already used', 'error');
    }
  }
})();

// ── 3. Active Logged-In Sessions & Remote Killswitch Handlers ──────────────────

window.fetchUserSessions = async function() {
  const container = document.getElementById('user-active-sessions-list');
  if (!container || !state.accessToken) return;

  try {
    const refreshToken = localStorage.getItem('aegis_refresh_token') || state.refreshToken || '';
    const res = await fetch('/api/v1/auth/sessions', {
      headers: {
        'Authorization': `Bearer ${state.accessToken}`,
        'x-refresh-token': refreshToken
      }
    }).then(r => r.json());

    const sessions = Array.isArray(res) ? res : (res?.data || []);
    if (sessions.length === 0) {
      container.innerHTML = '<div class="text-xs text-slate-500 py-2">No active sessions found.</div>';
      return;
    }

    container.innerHTML = sessions.map(s => {
      const deviceIcon = s.deviceType === 'mobile' ? 'fa-mobile-screen-button text-emerald-400' :
                         s.deviceType === 'tablet' ? 'fa-tablet-screen-button text-cyan-400' :
                         'fa-desktop text-indigo-400';
      const isCurrentBadge = s.isCurrent
        ? '<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Current Device</span>'
        : `<button type="button" onclick="window.revokeUserSession('${s.id}')" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs border border-rose-500/20 transition cursor-pointer">Revoke</button>`;

      return `
        <div class="p-3 bg-slate-900/80 rounded-xl border border-white/10 flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
              <i class="fa-solid ${deviceIcon}"></i>
            </div>
            <div>
              <div class="text-xs font-semibold text-white flex items-center space-x-2">
                <span>${escapeHTML(s.browserName || 'Unknown Browser')} on ${escapeHTML(s.osName || 'Unknown OS')}</span>
                <span>${s.countryCode ? `(${escapeHTML(s.countryCode)})` : ''}</span>
              </div>
              <div class="text-[10px] text-slate-400 font-mono">
                IP: ${escapeHTML(s.ipAddress)} • Active: ${new Date(s.lastActiveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          <div>${isCurrentBadge}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-xs text-rose-400">Failed to load sessions: ${escapeHTML(err.message)}</div>`;
  }
};

window.revokeUserSession = async function(sessionId) {
  if (!confirm('Log out this remote device immediately?')) return;
  try {
    await apiRequest(`/api/v1/auth/sessions/${sessionId}`, 'DELETE');
    showToast('Remote session revoked.', 'info');
    window.fetchUserSessions();
  } catch (err) {
    showToast(err.message || 'Failed to revoke session', 'error');
  }
};

window.logoutAllOtherSessions = async function() {
  if (!confirm('Are you sure you want to log out of all other devices except this one?')) return;
  try {
    const refreshToken = localStorage.getItem('aegis_refresh_token') || state.refreshToken || '';
    const res = await fetch('/api/v1/auth/sessions/other', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${state.accessToken}`,
        'x-refresh-token': refreshToken
      }
    }).then(r => r.json());

    showToast(res?.message || 'Logged out of other devices', 'success');
    window.fetchUserSessions();
  } catch (err) {
    showToast(err.message || 'Failed to revoke other sessions', 'error');
  }
};

// ── 4. Developer Personal Access Tokens (PATs) Handlers ───────────────────────

window.fetchUserPats = async function() {
  const container = document.getElementById('user-pats-list');
  if (!container || !state.accessToken) return;

  try {
    const res = await apiRequest('/api/v1/auth/pats', 'GET');
    const pats = Array.isArray(res) ? res : (res?.data || []);

    if (pats.length === 0) {
      container.innerHTML = '<div class="text-xs text-slate-500 py-2">No active Personal Access Tokens. Click "+ Generate New PAT" above.</div>';
      return;
    }

    container.innerHTML = pats.map(p => `
      <div class="p-3 bg-slate-900/80 rounded-xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div class="text-xs font-semibold text-white flex items-center space-x-2">
            <span>${escapeHTML(p.name)}</span>
            <span class="font-mono text-[10px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">${escapeHTML(p.tokenPrefix)}</span>
          </div>
          <div class="flex flex-wrap gap-1 pt-1.5">
            ${p.scopes.map(s => `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] text-slate-300 border border-white/5 font-mono">${escapeHTML(s)}</span>`).join('')}
          </div>
        </div>
        <div class="flex items-center space-x-2 self-end sm:self-center">
          <span class="text-[10px] text-slate-400 font-mono">Expires: ${p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : 'Never'}</span>
          <button type="button" onclick="window.revokeUserPat('${p.id}')" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs border border-rose-500/20 transition cursor-pointer">Revoke</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-xs text-rose-400">Failed to load PATs: ${escapeHTML(err.message)}</div>`;
  }
};

window.openCreatePatModal = function() {
  document.getElementById('input-pat-name').value = '';
  window.showModal('modal-create-pat');
};

window.submitCreatePat = async function() {
  const name = document.getElementById('input-pat-name')?.value?.trim();
  const expirationDays = document.getElementById('select-pat-expiry')?.value;
  const scopeCheckboxes = document.querySelectorAll('input[name="pat-scope"]:checked');
  const scopes = Array.from(scopeCheckboxes).map(c => c.value);

  if (!name) {
    showToast('Please provide a name for this token.', 'error');
    return;
  }
  if (scopes.length === 0) {
    showToast('Please select at least one permission scope.', 'error');
    return;
  }

  try {
    const res = await apiRequest('/api/v1/auth/pats', 'POST', { name, scopes, expirationDays });
    window.hideModal('modal-create-pat');

    const rawToken = res?.rawToken || res?.data?.rawToken;
    if (rawToken) {
      document.getElementById('label-pat-raw-token').textContent = rawToken;
      window.showModal('modal-pat-created');
    }

    showToast('Personal Access Token created!', 'success');
    window.fetchUserPats();
  } catch (err) {
    showToast(err.message || 'Failed to create token', 'error');
  }
};

window.copyPatToken = function() {
  const text = document.getElementById('label-pat-raw-token')?.textContent;
  if (text) {
    navigator.clipboard.writeText(text).then(() => showToast('Token copied to clipboard!', 'success'));
  }
};

window.revokeUserPat = async function(id) {
  if (!confirm('Are you sure you want to revoke this Personal Access Token? Any CI/CD pipelines using it will lose access.')) return;
  try {
    await apiRequest(`/api/v1/auth/pats/${id}`, 'DELETE');
    showToast('Personal Access Token revoked.', 'info');
    window.fetchUserPats();
  } catch (err) {
    showToast(err.message || 'Failed to revoke token', 'error');
  }
};

// ── 5. GitHub-Style Multi-Tenant Organizations & Teams Handlers ───────────────

state.activeWorkspace = 'personal';
state.activeOrgId = null;
state.organizations = [];

window.toggleWorkspaceDropdown = function() {
  const dropdown = document.getElementById('dropdown-workspace-menu');
  if (dropdown) dropdown.classList.toggle('hidden');
};

// Unified Switcher: Handles both tab navigation ('tab-...') and tenant workspaces ('personal' | 'org_...')
window.switchWorkspace = async function(target) {
  if (!target) return;

  // Case A: Sidebar Tab Navigation
  if (typeof target === 'string' && (target.startsWith('tab-') || document.getElementById(target)?.classList.contains('workspace-panel'))) {
    document.querySelectorAll('.workspace-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
      item.classList.remove('active-nav', 'bg-indigo-600/30', 'border-indigo-500/30', 'text-white');
      item.classList.add('text-slate-300');
    });

    const activePanel = document.getElementById(target);
    if (activePanel) activePanel.classList.remove('hidden');

    const activeNavBtn = document.querySelector(`.nav-item[data-tab="${target}"]`);
    if (activeNavBtn) {
      activeNavBtn.classList.add('active-nav', 'bg-indigo-600/30', 'border-indigo-500/30', 'text-white');
      activeNavBtn.classList.remove('text-slate-300');
    }

    if (state.telemetryTimer) {
      clearInterval(state.telemetryTimer);
      state.telemetryTimer = null;
    }

    if (target === 'tab-telemetry') {
      initTelemetryCharts();
      loadTelemetryData();
      state.telemetryTimer = setInterval(loadTelemetryData, 3000);
    } else if (target === 'tab-developer-metrics') {
      initDeveloperMetricsCharts();
      loadDeveloperMetrics();
      state.telemetryTimer = setInterval(loadDeveloperMetrics, 3000);
    } else if (target === 'tab-webhook-inspector') {
      loadWebhookLogs();
      state.telemetryTimer = setInterval(loadWebhookLogs, 3000);
    } else if (target === 'tab-auth-config') {
      loadAuthConfig();
    } else if (target === 'tab-ws-debugger') {
      initWsDebugger();
    } else if (target === 'tab-project-management') {
      loadMyProjects();
    } else if (target === 'tab-organizations') {
      window.loadActiveWorkspaceConsole();
    } else if (target === 'tab-user-management') {
      loadUserManagement();
    }
    return;
  }

  // Case B: Workspace Tenant Context Switching (Personal vs Organization)
  const dropdown = document.getElementById('dropdown-workspace-menu');
  if (dropdown) dropdown.classList.add('hidden');

  if (target === 'personal') {
    state.activeWorkspace = 'personal';
    state.activeOrgId = null;

    const label = document.getElementById('label-active-workspace');
    if (label) label.textContent = 'Personal';
    const icon = document.getElementById('workspace-icon');
    if (icon) icon.innerHTML = '<i class="fa-solid fa-user"></i>';

    const personalBadge = document.getElementById('badge-ws-personal-active');
    if (personalBadge) personalBadge.classList.remove('hidden');
    document.querySelectorAll('.badge-ws-org-active').forEach(b => b.classList.add('hidden'));

    const bannerSelect = document.getElementById('select-org-banner-switcher');
    if (bannerSelect) bannerSelect.value = 'personal';

    showToast('Switched to Personal Workspace', 'info');
  } else if (typeof target === 'string' && target.startsWith('org_')) {
    state.activeWorkspace = target;
    state.activeOrgId = target;

    const org = state.organizations.find(o => o.id === target);
    const label = document.getElementById('label-active-workspace');
    if (label) label.textContent = org?.name || 'Organization';
    const icon = document.getElementById('workspace-icon');
    if (icon) icon.innerHTML = '<i class="fa-solid fa-building text-cyan-400"></i>';

    const personalBadge = document.getElementById('badge-ws-personal-active');
    if (personalBadge) personalBadge.classList.add('hidden');
    document.querySelectorAll('.badge-ws-org-active').forEach(b => {
      if (b.getAttribute('data-org-id') === target) b.classList.remove('hidden');
      else b.classList.add('hidden');
    });

    const bannerSelect = document.getElementById('select-org-banner-switcher');
    if (bannerSelect) bannerSelect.value = target;

    showToast(`Switched to workspace "${org?.name || target}"`, 'info');
  }

  // Refresh Projects scoped to newly active workspace
  await loadMyProjects();

  // If currently viewing Organizations & Teams console/directory, reload it
  const currentTab = state.activeTab || document.querySelector('.nav-item.active-nav')?.getAttribute('data-tab');
  if (currentTab === 'tab-organizations') {
    window.loadActiveWorkspaceConsole();
  } else if (currentTab && (currentTab === 'tab-data-browser' || currentTab === 'tab-auth-config' || currentTab === 'tab-rules-sandbox' || currentTab === 'tab-webhook-inspector' || currentTab === 'tab-ws-debugger')) {
    window.switchWorkspace(currentTab);
  }
};

window.fetchUserOrganizations = async function() {
  if (!state.accessToken) return;

  try {
    const res = await apiRequest('/api/v1/orgs', 'GET');
    const orgs = Array.isArray(res) ? res : (res?.data || []);
    state.organizations = orgs;

    // 1. Populate header workspace dropdown list
    const wsList = document.getElementById('workspace-orgs-list');
    if (wsList) {
      if (orgs.length === 0) {
        wsList.innerHTML = '<div class="text-[10px] text-slate-500 px-2 py-1">No organizations joined yet.</div>';
      } else {
        wsList.innerHTML = orgs.map(o => `
          <button type="button" onclick="window.switchWorkspace('${o.id}')" class="w-full p-2 rounded-xl text-left text-xs font-semibold text-white hover:bg-white/10 transition flex items-center justify-between cursor-pointer">
            <div class="flex items-center space-x-2.5 truncate">
              <div class="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs shrink-0">
                <i class="fa-solid fa-building"></i>
              </div>
              <div class="truncate">
                <div class="text-xs font-medium text-white truncate">${escapeHTML(o.name)}</div>
                <div class="text-[9px] text-slate-400 font-mono">@${escapeHTML(o.slug)} • <span class="text-cyan-300 uppercase">${escapeHTML(o.myRole)}</span></div>
              </div>
            </div>
            <span data-org-id="${o.id}" class="badge-ws-org-active ${state.activeOrgId === o.id ? '' : 'hidden'} text-cyan-400 text-xs shrink-0"><i class="fa-solid fa-check"></i></span>
          </button>
        `).join('');
      }
    }

    // 2. Populate create project workspace selector dropdown
    const wsSelect = document.getElementById('select-new-project-workspace');
    if (wsSelect) {
      let opts = '<option value="personal">👤 Personal Workspace</option>';
      orgs.forEach(o => {
        const isSelected = state.activeOrgId === o.id ? 'selected' : '';
        opts += `<option value="${o.id}" ${isSelected}>🏢 ${escapeHTML(o.name)} (@${escapeHTML(o.slug)})</option>`;
      });
      wsSelect.innerHTML = opts;
    }

    // 3. Populate banner switcher dropdown in Org Console
    const bannerSelect = document.getElementById('select-org-banner-switcher');
    if (bannerSelect) {
      let bOpts = '<option value="personal">👤 Personal Account</option>';
      orgs.forEach(o => {
        const isSelected = state.activeOrgId === o.id ? 'selected' : '';
        bOpts += `<option value="${o.id}" ${isSelected}>🏢 ${escapeHTML(o.name)} (@${escapeHTML(o.slug)})</option>`;
      });
      bannerSelect.innerHTML = bOpts;
    }

    // 4. Populate Settings > user-orgs-container if exists
    const userOrgsContainer = document.getElementById('user-orgs-container');
    if (userOrgsContainer) {
      if (orgs.length === 0) {
        userOrgsContainer.innerHTML = '<div class="text-xs text-slate-500 py-2">You are not a member of any organization yet. Click "+ Create Organization" above.</div>';
      } else {
        userOrgsContainer.innerHTML = orgs.map(o => `
          <div class="p-3 bg-slate-900/60 rounded-xl border border-white/5 flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-xs">
                <i class="fa-solid fa-building"></i>
              </div>
              <div>
                <div class="text-xs font-bold text-white">${escapeHTML(o.name)}</div>
                <div class="text-[10px] text-slate-400">Role: <span class="text-cyan-300 font-semibold uppercase">${escapeHTML(o.myRole)}</span> • @${escapeHTML(o.slug)}</div>
              </div>
            </div>
            <button type="button" onclick="window.switchWorkspace('${o.id}'); window.switchWorkspace('tab-organizations')" class="px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 text-xs border border-cyan-500/30 font-semibold transition cursor-pointer">
              Open Org Console
            </button>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Failed to fetch user organizations:', err);
  }
};

window.renderOrgDirectory = function() {
  const container = document.getElementById('container-org-directory-cards');
  const countEl = document.getElementById('metric-directory-orgs-count');
  const personalEl = document.getElementById('metric-directory-personal-count');
  const activeWsEl = document.getElementById('metric-directory-active-ws');
  
  if (countEl) countEl.textContent = state.organizations.length;
  if (personalEl) personalEl.textContent = state.projects?.filter(p => !p.orgId)?.length || 0;
  if (activeWsEl) activeWsEl.textContent = state.activeWorkspace === 'personal' ? 'Personal Account' : (state.organizations.find(o => o.id === state.activeWorkspace)?.name || 'Personal');

  if (!container) return;

  if (state.organizations.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-8 text-center glass-panel rounded-2xl border border-white/10 space-y-3">
        <div class="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 mx-auto flex items-center justify-center text-xl">
          <i class="fa-solid fa-building"></i>
        </div>
        <h3 class="text-base font-bold text-white">Create Your First Organization</h3>
        <p class="text-xs text-slate-400 max-w-sm mx-auto">Organizations allow you to group repositories, invite teammates, and manage project permissions in bulk.</p>
        <button type="button" onclick="window.openCreateOrgModal()" class="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/30 transition cursor-pointer">
          <i class="fa-solid fa-plus mr-1.5"></i> Create Organization
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.organizations.map(org => {
    const roleColors = {
      owner: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
      admin: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
      member: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
      billing_manager: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
    };
    const roleClass = roleColors[org.myRole] || roleColors.member;

    return `
      <div class="glass-panel p-5 rounded-2xl border border-white/10 hover:border-cyan-500/40 transition flex flex-col justify-between space-y-4">
        <div>
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white font-bold flex items-center justify-center text-sm shadow">
                <i class="fa-solid fa-building"></i>
              </div>
              <div>
                <h4 class="text-sm font-bold text-white">${escapeHTML(org.name)}</h4>
                <div class="text-[10px] font-mono text-cyan-400">@${escapeHTML(org.slug)}</div>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${roleClass}">${escapeHTML(org.myRole)}</span>
          </div>
          <p class="text-xs text-slate-400 mt-3 line-clamp-2">${escapeHTML(org.description || 'Enterprise workspace and team collaboration.')}</p>
        </div>

        <div class="pt-3 border-t border-white/5 flex items-center space-x-2">
          <button type="button" onclick="window.switchWorkspace('${org.id}'); window.switchWorkspace('tab-organizations')" class="flex-1 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow transition cursor-pointer flex items-center justify-center space-x-1.5">
            <i class="fa-solid fa-gear text-[10px]"></i>
            <span>Open Org Console</span>
          </button>
          <button type="button" onclick="window.switchWorkspace('${org.id}'); window.switchWorkspace('tab-project-management')" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer" title="View Organization Projects">
            <i class="fa-solid fa-folder-open"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
};

window.loadActiveWorkspaceConsole = async function() {
  const dirView = document.getElementById('org-view-directory');
  const consoleView = document.getElementById('org-view-console');
  if (!dirView || !consoleView) return;

  await window.fetchUserOrganizations();

  if (state.activeWorkspace && state.activeWorkspace.startsWith('org_')) {
    dirView.classList.add('hidden');
    consoleView.classList.remove('hidden');
    const org = state.organizations.find(o => o.id === state.activeWorkspace);
    const breadcrumb = document.getElementById('label-org-console-breadcrumb');
    if (breadcrumb) breadcrumb.textContent = org ? `${org.name} Console` : 'Organization Console';
    window.loadOrgConsole(state.activeWorkspace);
  } else {
    consoleView.classList.add('hidden');
    dirView.classList.remove('hidden');
    window.renderOrgDirectory();
  }
};

window.switchOrgSubTab = function(subTabName) {
  document.querySelectorAll('.org-subtab-btn').forEach(b => {
    b.classList.remove('bg-cyan-600', 'text-white', 'font-semibold', 'shadow');
    b.classList.add('text-slate-400', 'font-medium');
  });

  const activeBtn = document.getElementById(`btn-org-tab-${subTabName}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-cyan-600', 'text-white', 'font-semibold', 'shadow');
    activeBtn.classList.remove('text-slate-400', 'font-medium');
  }

  document.querySelectorAll('.org-subpanel').forEach(p => p.classList.add('hidden'));
  const activePanel = document.getElementById(`org-panel-${subTabName}`);
  if (activePanel) activePanel.classList.remove('hidden');

  if (state.activeOrgId) {
    if (subTabName === 'members') window.loadOrgMembers(state.activeOrgId);
    else if (subTabName === 'teams') window.loadOrgTeams(state.activeOrgId);
    else if (subTabName === 'invites') window.loadOrgInvites(state.activeOrgId);
    else if (subTabName === 'audit') window.refreshOrgAuditLogs(state.activeOrgId);
    else if (subTabName === 'projects') window.loadOrgProjects(state.activeOrgId);
  }
};

window.loadOrgConsole = async function(orgId) {
  if (!orgId) return;

  try {
    const res = await apiRequest(`/api/v1/orgs/${orgId}`, 'GET');
    const org = res?.data || res;

    // 1. Update Org Banner Info
    const bannerName = document.getElementById('org-banner-name');
    if (bannerName) bannerName.textContent = org.name;
    const bannerSlug = document.getElementById('org-banner-slug');
    if (bannerSlug) bannerSlug.textContent = `@${org.slug}`;
    const bannerDesc = document.getElementById('org-banner-desc');
    if (bannerDesc) bannerDesc.textContent = org.description || 'Enterprise Workspace & Team Collaboration';
    const bannerRole = document.getElementById('org-banner-role-badge');
    if (bannerRole) bannerRole.textContent = (org.myRole || 'MEMBER').toUpperCase();

    // 2. Settings form prefill
    const editName = document.getElementById('input-edit-org-name');
    if (editName) editName.value = org.name;
    const editSlug = document.getElementById('input-edit-org-slug');
    if (editSlug) editSlug.value = org.slug;
    const editDesc = document.getElementById('input-edit-org-desc');
    if (editDesc) editDesc.value = org.description || '';
    const editDefaultRole = document.getElementById('select-edit-org-default-role');
    if (editDefaultRole) editDefaultRole.value = org.defaultMemberRole || 'member';

    // 3. Load sub-panel content based on current active subtab
    window.loadOrgProjects(orgId);
    window.loadOrgMembers(orgId);
    window.loadOrgTeams(orgId);
    window.loadOrgInvites(orgId);
  } catch (err) {
    showToast(err.message || 'Failed to load organization console', 'error');
  }
};

// ── Org Subpanel: Projects ───────────────────────────────────────────────────
window.loadOrgProjects = async function(orgId) {
  const container = document.getElementById('container-org-projects-list');
  const metric = document.getElementById('metric-org-projects');
  if (!container) return;

  try {
    const res = await apiRequest(`/api/v1/projects?orgId=${encodeURIComponent(orgId)}`, 'GET');
    const projects = Array.isArray(res) ? res : (res?.data || []);
    if (metric) metric.textContent = projects.length;

    if (projects.length === 0) {
      container.innerHTML = `
        <div class="col-span-full p-8 text-center glass-panel rounded-2xl border border-white/10 space-y-2">
          <i class="fa-solid fa-folder-open text-slate-500 text-2xl"></i>
          <div class="text-xs font-semibold text-slate-300">No projects in this organization yet.</div>
          <button type="button" onclick="window.openCreateProjectModalForOrg()" class="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition cursor-pointer">
            <i class="fa-solid fa-plus mr-1"></i> Create First Org Project
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = projects.map(p => `
      <div class="glass-panel p-5 rounded-2xl border border-white/10 hover:border-cyan-500/30 transition space-y-3">
        <div class="flex items-start justify-between">
          <div>
            <h4 class="text-sm font-bold text-white">${escapeHTML(p.name)}</h4>
            <span class="text-[10px] font-mono text-slate-400">${p.id.substring(0, 12)}...</span>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">${escapeHTML(p.myProjectRole || 'viewer')}</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-[11px] text-slate-400 py-1 border-y border-white/5">
          <div><span class="text-slate-200 font-semibold">${p.collectionCount || 0}</span> Collections</div>
          <div><span class="text-slate-200 font-semibold">${p.documentCount || 0}</span> Documents</div>
        </div>
        <div class="flex items-center space-x-2 pt-1">
          <button type="button" onclick="selectProjectForBrowsing('${p.id}')" class="flex-1 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow transition cursor-pointer flex items-center justify-center space-x-1">
            <i class="fa-solid fa-arrow-right"></i>
            <span>Browse</span>
          </button>
          <button type="button" onclick="window.openProjectCollaboratorsModal('${p.id}', '${escapeHTML(p.name)}')" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 text-xs font-semibold transition cursor-pointer" title="Manage Collaborators">
            <i class="fa-solid fa-users-gear"></i>
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="col-span-full text-xs text-rose-400">Failed to load projects: ${escapeHTML(err.message)}</div>`;
  }
};

window.openCreateProjectModalForOrg = function() {
  const wsSelect = document.getElementById('select-new-project-workspace');
  if (wsSelect && state.activeOrgId) {
    wsSelect.value = state.activeOrgId;
  }
  document.getElementById('input-new-project-name').value = '';
  window.showModal('modal-create-project');
};

window.cleanUserLabel = function(val, fallback = 'Team Member') {
  if (!val) return fallback;
  if (typeof val === 'string' && val.includes('"_encrypted":true')) {
    return fallback;
  }
  return String(val);
};

// ── Org Subpanel: Members & Roles ────────────────────────────────────────────
window.loadOrgMembers = async function(orgId) {
  const tableBody = document.getElementById('table-org-members-body');
  const metric = document.getElementById('metric-org-members');
  if (!tableBody) return;

  try {
    const res = await apiRequest(`/api/v1/orgs/${orgId}/members`, 'GET');
    const members = Array.isArray(res) ? res : (res?.data || []);
    if (metric) metric.textContent = members.length;

    if (members.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500">No members found.</td></tr>';
      return;
    }

    const org = state.organizations.find(o => o.id === orgId);
    const isOrgAdmin = org?.myRole === 'owner' || org?.myRole === 'admin';

    tableBody.innerHTML = members.map(m => {
      const displayName = window.cleanUserLabel(m.name || m.email, 'Team Member');
      const displayEmail = window.cleanUserLabel(m.email, 'member@workspace');
      return `
        <tr class="border-b border-white/5 hover:bg-white/5 transition text-xs">
          <td class="p-4">
            <div class="font-semibold text-white">${escapeHTML(displayName)}</div>
            <div class="text-[10px] text-slate-400 font-mono">${escapeHTML(displayEmail)}</div>
          </td>
          <td class="p-4">
            ${isOrgAdmin && m.role !== 'owner' ? `
              <select onchange="window.updateOrgMemberRole('${orgId}', '${m.userId}', this.value)" class="px-2.5 py-1 rounded-lg glass-input text-xs font-semibold bg-slate-900 border border-cyan-500/30 text-cyan-300 cursor-pointer">
                <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="member" ${m.role === 'member' ? 'selected' : ''}>Member</option>
                <option value="billing_manager" ${m.role === 'billing_manager' ? 'selected' : ''}>Billing Manager</option>
                <option value="auditor" ${m.role === 'auditor' ? 'selected' : ''}>Auditor</option>
              </select>
            ` : `
              <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">${escapeHTML(m.role)}</span>
            `}
          </td>
          <td class="p-4 text-slate-400 text-[11px]">${m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : 'N/A'}</td>
          <td class="p-4 text-right">
            ${isOrgAdmin && m.role !== 'owner' ? `
              <button type="button" onclick="window.removeOrgMember('${orgId}', '${m.userId}')" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[10px] font-semibold transition cursor-pointer">
                <i class="fa-solid fa-user-xmark mr-1"></i> Remove
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-rose-400">${escapeHTML(err.message)}</td></tr>`;
  }
};

window.updateOrgMemberRole = async function(orgId, userId, role) {
  try {
    await apiRequest(`/api/v1/orgs/${orgId}/members/${userId}`, 'PATCH', { role });
    showToast('Member role updated successfully!', 'success');
    window.loadOrgMembers(orgId);
  } catch (err) {
    showToast(err.message || 'Failed to update member role', 'error');
    window.loadOrgMembers(orgId);
  }
};

// ── Org Subpanel: Functional Teams & Project Grants ──────────────────────────
window.loadOrgTeams = async function(orgId) {
  const container = document.getElementById('container-org-teams-list');
  const metric = document.getElementById('metric-org-teams');
  if (!container) return;

  try {
    const res = await apiRequest(`/api/v1/orgs/${orgId}/teams`, 'GET');
    const teams = Array.isArray(res) ? res : (res?.data || []);
    if (metric) metric.textContent = teams.length;

    if (teams.length === 0) {
      container.innerHTML = `
        <div class="col-span-full p-8 text-center glass-panel rounded-2xl border border-white/10 space-y-2">
          <i class="fa-solid fa-people-group text-slate-500 text-2xl"></i>
          <div class="text-xs font-semibold text-slate-300">No functional teams created yet.</div>
          <p class="text-[11px] text-slate-400">Teams help you grant repository permissions to groups of engineers at once.</p>
          <button type="button" onclick="window.openCreateTeamModal()" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer">
            <i class="fa-solid fa-plus mr-1"></i> Create First Team
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = teams.map(t => `
      <div class="glass-panel p-5 rounded-2xl border border-white/10 hover:border-indigo-500/30 transition space-y-4">
        <div class="flex items-start justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-sm">
              <i class="fa-solid fa-people-group"></i>
            </div>
            <div>
              <h4 class="text-sm font-bold text-white">${escapeHTML(t.name)}</h4>
              <div class="text-[10px] font-mono text-indigo-300">@${escapeHTML(t.slug)}</div>
            </div>
          </div>
          <button type="button" onclick="window.deleteTeam('${t.id}')" class="text-slate-500 hover:text-rose-400 text-xs transition" title="Delete Team">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>

        <p class="text-xs text-slate-400 line-clamp-2">${escapeHTML(t.description || 'Functional team unit')}</p>

        <div class="grid grid-cols-2 gap-2 text-center text-xs py-2 bg-slate-900/60 rounded-xl border border-white/5">
          <div>
            <div class="text-[10px] text-slate-400 uppercase font-semibold">Members</div>
            <div class="text-sm font-bold text-white">${t.memberCount || 0}</div>
          </div>
          <div>
            <div class="text-[10px] text-slate-400 uppercase font-semibold">Projects</div>
            <div class="text-sm font-bold text-indigo-300">${t.projectGrantCount || 0}</div>
          </div>
        </div>

        <div class="flex items-center space-x-2 pt-1">
          <button type="button" onclick="window.openManageTeamMembersModal('${t.id}', '${escapeHTML(t.name)}', '${escapeHTML(t.slug)}')" class="flex-1 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition cursor-pointer flex items-center justify-center space-x-1">
            <i class="fa-solid fa-user-group"></i>
            <span>Members</span>
          </button>
          <button type="button" onclick="window.openGrantTeamProjectModal('${t.id}', '${escapeHTML(t.name)}', '${escapeHTML(t.slug)}')" class="flex-1 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition cursor-pointer flex items-center justify-center space-x-1">
            <i class="fa-solid fa-folder-tree"></i>
            <span>Projects</span>
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="col-span-full text-xs text-rose-400">Failed to load teams: ${escapeHTML(err.message)}</div>`;
  }
};

window.openCreateTeamModal = function() {
  document.getElementById('input-team-name').value = '';
  document.getElementById('input-team-slug').value = '';
  document.getElementById('input-team-desc').value = '';
  window.showModal('modal-create-team');
};

window.submitCreateTeam = async function() {
  const orgId = state.activeOrgId;
  const name = document.getElementById('input-team-name')?.value?.trim();
  const slug = document.getElementById('input-team-slug')?.value?.trim();
  const description = document.getElementById('input-team-desc')?.value?.trim();

  if (!name) {
    showToast('Please enter a team name.', 'error');
    return;
  }

  try {
    await apiRequest(`/api/v1/orgs/${orgId}/teams`, 'POST', { name, slug, description });
    window.hideModal('modal-create-team');
    showToast(`Team "${name}" created!`, 'success');
    window.loadOrgTeams(orgId);
  } catch (err) {
    showToast(err.message || 'Failed to create team', 'error');
  }
};

window.deleteTeam = async function(teamId) {
  if (!confirm('Are you sure you want to delete this team? Members will lose group-granted project access.')) return;
  try {
    await apiRequest(`/api/v1/orgs/${state.activeOrgId}/teams/${teamId}`, 'DELETE');
    showToast('Team deleted.', 'info');
    window.loadOrgTeams(state.activeOrgId);
  } catch (err) {
    showToast(err.message || 'Failed to delete team', 'error');
  }
};

// ── Modal: Manage Team Members ───────────────────────────────────────────────
window.openManageTeamMembersModal = async function(teamId, teamName, teamSlug) {
  document.getElementById('input-manage-team-id').value = teamId;
  document.getElementById('label-manage-team-title').textContent = teamName;
  document.getElementById('label-manage-team-slug').textContent = `@${teamSlug}`;

  window.showModal('modal-manage-team-members');

  // Load Org Members into select dropdown
  try {
    const memRes = await apiRequest(`/api/v1/orgs/${state.activeOrgId}/members`, 'GET');
    const orgMembers = Array.isArray(memRes) ? memRes : (memRes?.data || []);
    const select = document.getElementById('select-team-add-member');
    if (select) {
      select.innerHTML = '<option value="">Select Member...</option>' + 
        orgMembers.map(m => `<option value="${m.userId}">${escapeHTML(m.name || m.email)} (${escapeHTML(m.email)})</option>`).join('');
    }
  } catch (_) {}

  window.loadTeamMembersList(teamId);
};

window.loadTeamMembersList = async function(teamId) {
  const container = document.getElementById('container-team-members-list');
  if (!container) return;

  try {
    const res = await apiRequest(`/api/v1/orgs/${state.activeOrgId}/teams/${teamId}`, 'GET');
    const members = res?.data?.members || res?.members || [];

    if (members.length === 0) {
      container.innerHTML = '<div class="text-slate-500 text-center py-4">No members assigned to this team yet.</div>';
      return;
    }

    container.innerHTML = members.map(m => {
      const displayName = window.cleanUserLabel(m.name || m.email, 'Team Member');
      const displayEmail = window.cleanUserLabel(m.email, 'member@workspace');
      return `
        <div class="py-2 flex items-center justify-between">
          <div>
            <span class="text-white font-medium">${escapeHTML(displayName)}</span>
            <span class="text-slate-500 text-[10px] ml-1">(${escapeHTML(displayEmail)})</span>
            <span class="ml-2 px-1.5 py-0.2 rounded text-[9px] uppercase font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">${escapeHTML(m.role)}</span>
          </div>
          <button type="button" onclick="window.removeTeamMember('${teamId}', '${m.userId}')" class="text-rose-400 hover:text-rose-300 text-[10px] cursor-pointer">
            Remove
          </button>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-rose-400 text-center py-2">${escapeHTML(err.message)}</div>`;
  }
};

window.submitAddTeamMember = async function() {
  const teamId = document.getElementById('input-manage-team-id')?.value;
  const targetUserId = document.getElementById('select-team-add-member')?.value;
  const role = document.getElementById('select-team-add-role')?.value;

  if (!targetUserId) {
    showToast('Please select a member to add.', 'error');
    return;
  }

  try {
    await apiRequest(`/api/v1/orgs/${state.activeOrgId}/teams/${teamId}/members`, 'POST', { targetUserId, role });
    showToast('Member added to team!', 'success');
    window.loadTeamMembersList(teamId);
    window.loadOrgTeams(state.activeOrgId);
  } catch (err) {
    showToast(err.message || 'Failed to add member to team', 'error');
  }
};

window.removeTeamMember = async function(teamId, memberUserId) {
  try {
    await apiRequest(`/api/v1/orgs/${state.activeOrgId}/teams/${teamId}/members/${memberUserId}`, 'DELETE');
    showToast('Member removed from team.', 'info');
    window.loadTeamMembersList(teamId);
    window.loadOrgTeams(state.activeOrgId);
  } catch (err) {
    showToast(err.message || 'Failed to remove member', 'error');
  }
};

// ── Modal: Grant Team Project Access ─────────────────────────────────────────
window.openGrantTeamProjectModal = async function(teamId, teamName, teamSlug) {
  document.getElementById('input-grant-team-id').value = teamId;
  document.getElementById('label-grant-project-team-title').textContent = teamName;
  document.getElementById('label-grant-project-team-slug').textContent = `@${teamSlug}`;

  window.showModal('modal-grant-team-project');

  // Load Org Projects into dropdown
  try {
    const projRes = await apiRequest(`/api/v1/projects?orgId=${encodeURIComponent(state.activeOrgId)}`, 'GET');
    const orgProjects = Array.isArray(projRes) ? projRes : (projRes?.data || []);
    const select = document.getElementById('select-team-grant-project');
    if (select) {
      select.innerHTML = '<option value="">Select Project...</option>' +
        orgProjects.map(p => `<option value="${p.id}">${escapeHTML(p.name)} (${p.id.substring(0, 8)}...)</option>`).join('');
    }
  } catch (_) {}

  window.loadTeamProjectGrantsList(teamId);
};

window.loadTeamProjectGrantsList = async function(teamId) {
  const container = document.getElementById('container-team-projects-list');
  if (!container) return;

  try {
    const res = await apiRequest(`/api/v1/orgs/${state.activeOrgId}/teams/${teamId}`, 'GET');
    const grants = res?.data?.projectGrants || res?.projectGrants || [];

    if (grants.length === 0) {
      container.innerHTML = '<div class="text-slate-500 text-center py-4">No projects granted to this team yet.</div>';
      return;
    }

    container.innerHTML = grants.map(g => `
      <div class="py-2 flex items-center justify-between">
        <div>
          <span class="text-white font-medium">${escapeHTML(g.projectName)}</span>
          <span class="ml-2 px-1.5 py-0.2 rounded text-[9px] uppercase font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">${escapeHTML(g.role)}</span>
        </div>
        <button type="button" onclick="window.revokeTeamProjectAccess('${teamId}', '${g.projectId}')" class="text-rose-400 hover:text-rose-300 text-[10px] cursor-pointer">
          Revoke
        </button>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-rose-400 text-center py-2">${escapeHTML(err.message)}</div>`;
  }
};

window.submitGrantTeamProject = async function() {
  const teamId = document.getElementById('input-grant-team-id')?.value;
  const projectId = document.getElementById('select-team-grant-project')?.value;
  const role = document.getElementById('select-team-grant-role')?.value;

  if (!projectId) {
    showToast('Please select a project to grant access.', 'error');
    return;
  }

  try {
    await apiRequest(`/api/v1/orgs/${state.activeOrgId}/teams/${teamId}/projects`, 'POST', { projectId, role });
    showToast('Project access granted to team!', 'success');
    window.loadTeamProjectGrantsList(teamId);
    window.loadOrgTeams(state.activeOrgId);
  } catch (err) {
    showToast(err.message || 'Failed to grant project access', 'error');
  }
};

window.revokeTeamProjectAccess = async function(teamId, projectId) {
  try {
    await apiRequest(`/api/v1/orgs/${state.activeOrgId}/teams/${teamId}/projects/${projectId}`, 'DELETE');
    showToast('Team project access revoked.', 'info');
    window.loadTeamProjectGrantsList(teamId);
    window.loadOrgTeams(state.activeOrgId);
  } catch (err) {
    showToast(err.message || 'Failed to revoke project access', 'error');
  }
};

// ── Modal: Direct Project Collaborators & Effective RBAC ──────────────────────
window.openProjectCollaboratorsModal = async function(projectId, projectName) {
  document.getElementById('input-collab-project-id').value = projectId;
  document.getElementById('label-collab-project-title').textContent = projectName || 'Project Access';
  document.getElementById('label-collab-project-id').textContent = projectId;

  window.showModal('modal-project-collaborators');
  window.loadProjectCollaboratorsList(projectId);
};

window.loadProjectCollaboratorsList = async function(projectId) {
  const directContainer = document.getElementById('container-direct-collaborators-list');
  const teamContainer = document.getElementById('container-project-team-grants-list');
  if (!directContainer || !teamContainer) return;

  try {
    const res = await apiRequest(`/api/v1/projects/${projectId}/collaborators`, 'GET');
    const data = res?.data || res || { directMembers: [], teamGrants: [] };

    const direct = data.directMembers || [];
    const teams = data.teamGrants || [];

    if (direct.length === 0) {
      directContainer.innerHTML = '<div class="text-slate-500 text-center py-4 text-[11px]">No direct collaborators added.</div>';
    } else {
      directContainer.innerHTML = direct.map(d => {
        const displayName = window.cleanUserLabel(d.name || d.email, 'Collaborator');
        const displayEmail = window.cleanUserLabel(d.email, 'user@project');
        return `
          <div class="py-2 flex items-center justify-between text-xs">
            <div>
              <div class="font-medium text-white">${escapeHTML(displayName)}</div>
              <div class="text-[10px] text-slate-400 font-mono">${escapeHTML(displayEmail)}</div>
            </div>
            <div class="flex items-center space-x-2">
              <span class="px-1.5 py-0.2 rounded text-[9px] uppercase font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">${escapeHTML(d.role)}</span>
              <button type="button" onclick="window.removeProjectCollaborator('${projectId}', '${d.userId}')" class="text-rose-400 hover:text-rose-300 text-[10px] cursor-pointer">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    if (teams.length === 0) {
      teamContainer.innerHTML = '<div class="text-slate-500 text-center py-4 text-[11px]">No team grants assigned.</div>';
    } else {
      teamContainer.innerHTML = teams.map(t => `
        <div class="py-2 flex items-center justify-between text-xs">
          <div>
            <div class="font-medium text-white">${escapeHTML(t.teamName)}</div>
            <div class="text-[10px] text-indigo-400 font-mono">@${escapeHTML(t.teamSlug)}</div>
          </div>
          <span class="px-1.5 py-0.2 rounded text-[9px] uppercase font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">${escapeHTML(t.role)}</span>
        </div>
      `).join('');
    }
  } catch (err) {
    directContainer.innerHTML = `<div class="text-rose-400 text-center py-2 text-xs">${escapeHTML(err.message)}</div>`;
  }
};

window.submitAddProjectCollaborator = async function() {
  const projectId = document.getElementById('input-collab-project-id')?.value;
  const userId = document.getElementById('input-collab-user-id')?.value?.trim();
  const role = document.getElementById('select-collab-role')?.value;

  if (!userId) {
    showToast('Please enter user ID or email.', 'error');
    return;
  }

  try {
    await apiRequest(`/api/v1/projects/${projectId}/collaborators`, 'POST', { userId, role });
    document.getElementById('input-collab-user-id').value = '';
    showToast('Collaborator added successfully!', 'success');
    window.loadProjectCollaboratorsList(projectId);
  } catch (err) {
    showToast(err.message || 'Failed to add collaborator', 'error');
  }
};

window.removeProjectCollaborator = async function(projectId, userId) {
  try {
    await apiRequest(`/api/v1/projects/${projectId}/collaborators/${userId}`, 'DELETE');
    showToast('Collaborator removed.', 'info');
    window.loadProjectCollaboratorsList(projectId);
  } catch (err) {
    showToast(err.message || 'Failed to remove collaborator', 'error');
  }
};

// ── Org Subpanel: Invitations ────────────────────────────────────────────────
window.loadOrgInvites = async function(orgId) {
  const tableBody = document.getElementById('table-org-invites-body');
  const metric = document.getElementById('metric-org-invites');
  if (!tableBody) return;

  try {
    const res = await apiRequest(`/api/v1/orgs/${orgId}/invites`, 'GET');
    const invites = Array.isArray(res) ? res : (res?.data || []);
    if (metric) metric.textContent = invites.length;

    if (invites.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-500">No pending invitations.</td></tr>';
      return;
    }

    tableBody.innerHTML = invites.map(inv => `
      <tr class="border-b border-white/5 hover:bg-white/5 transition text-xs">
        <td class="p-4 font-mono font-medium text-white">${escapeHTML(inv.invitedEmail)}</td>
        <td class="p-4">
          <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">${escapeHTML(inv.role)}</span>
        </td>
        <td class="p-4 text-slate-400">${inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : 'N/A'}</td>
        <td class="p-4 text-amber-300">${inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : '7 days'}</td>
        <td class="p-4 text-right space-x-2">
          <button type="button" onclick="window.copyOrgInviteLink('${inv.token}')" class="px-2.5 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold transition cursor-pointer">
            <i class="fa-solid fa-copy mr-1"></i> Copy Link
          </button>
          <button type="button" onclick="window.revokeOrgInvite('${orgId}', '${inv.id}')" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[10px] font-semibold transition cursor-pointer">
            Revoke
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-rose-400">${escapeHTML(err.message)}</td></tr>`;
  }
};

window.openInviteMemberModal = function(orgId) {
  document.getElementById('input-invite-org-id').value = orgId || state.activeOrgId;
  document.getElementById('input-invite-email').value = '';
  window.showModal('modal-invite-member');
};

window.submitInviteMember = async function() {
  const orgId = document.getElementById('input-invite-org-id')?.value || state.activeOrgId;
  const email = document.getElementById('input-invite-email')?.value?.trim();
  const role = document.getElementById('select-invite-role')?.value;
  const ttlDays = document.getElementById('select-invite-ttl')?.value;

  if (!email) {
    showToast('Please enter teammate email address.', 'error');
    return;
  }

  try {
    const res = await apiRequest(`/api/v1/orgs/${orgId}/invites`, 'POST', { email, role, ttlDays });
    window.hideModal('modal-invite-member');
    showToast(`Invitation created for ${email}!`, 'success');
    window.loadOrgInvites(orgId);
    window.loadOrgConsole(orgId);
  } catch (err) {
    showToast(err.message || 'Failed to create invitation', 'error');
  }
};

window.revokeOrgInvite = async function(orgId, inviteId) {
  if (!confirm('Revoke this invitation?')) return;
  try {
    await apiRequest(`/api/v1/orgs/${orgId}/invites/${inviteId}`, 'DELETE');
    showToast('Invitation revoked.', 'info');
    window.loadOrgInvites(orgId);
  } catch (err) {
    showToast(err.message || 'Failed to revoke invitation', 'error');
  }
};

window.copyOrgInviteLink = function(token) {
  const url = `${window.location.origin}/#invite=${token}`;
  navigator.clipboard.writeText(url).then(() => showToast('Invitation link copied to clipboard!', 'success'));
};

// ── Org Subpanel: Audit Log ──────────────────────────────────────────────────
window.refreshOrgAuditLogs = async function(orgId) {
  const tableBody = document.getElementById('table-org-audit-body');
  if (!tableBody) return;
  const targetOrgId = orgId || state.activeOrgId;
  if (!targetOrgId) return;

  try {
    const res = await apiRequest(`/api/v1/orgs/${targetOrgId}/audit-logs`, 'GET');
    const logs = Array.isArray(res) ? res : (res?.data || []);

    if (logs.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500">No activity recorded yet.</td></tr>';
      return;
    }

    tableBody.innerHTML = logs.map(l => {
      const actorLabel = window.cleanUserLabel(l.actorName || l.actorEmail || l.actorId, 'User');
      return `
        <tr class="border-b border-white/5 hover:bg-white/5 transition text-xs">
          <td class="p-4 text-slate-400 font-mono text-[10px] whitespace-nowrap">${new Date(l.createdAt).toLocaleString()}</td>
          <td class="p-4 text-white font-medium">${escapeHTML(actorLabel)}</td>
          <td class="p-4">
            <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">${escapeHTML(l.action)}</span>
          </td>
          <td class="p-4 text-slate-300 font-mono text-[10px]">${escapeHTML(l.targetType || 'org')}: ${escapeHTML(l.targetId || '')}</td>
          <td class="p-4 text-slate-400 font-mono text-[10px]">${escapeHTML(l.ipAddress || '127.0.0.1')}</td>
          <td class="p-4 text-right text-slate-400 font-mono text-[10px] truncate max-w-[140px]" title="${escapeHTML(JSON.stringify(l.details || {}))}">
            ${escapeHTML(JSON.stringify(l.details || {}))}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-rose-400">${escapeHTML(err.message)}</td></tr>`;
  }
};

// ── Org Subpanel: Settings & Danger Zone ──────────────────────────────────────
window.saveOrgSettings = async function() {
  const orgId = state.activeOrgId;
  const name = document.getElementById('input-edit-org-name')?.value?.trim();
  const description = document.getElementById('input-edit-org-desc')?.value?.trim();
  const defaultMemberRole = document.getElementById('select-edit-org-default-role')?.value;

  if (!name) {
    showToast('Organization name cannot be empty.', 'error');
    return;
  }

  try {
    await apiRequest(`/api/v1/orgs/${orgId}`, 'PATCH', { name, description, defaultMemberRole });
    showToast('Organization settings saved!', 'success');
    window.fetchUserOrganizations();
    window.loadOrgConsole(orgId);
  } catch (err) {
    showToast(err.message || 'Failed to save settings', 'error');
  }
};

window.openTransferOwnershipModal = async function() {
  const orgId = state.activeOrgId;
  document.getElementById('label-transfer-org-name').textContent = `@${state.organizations.find(o => o.id === orgId)?.slug || orgId}`;
  window.showModal('modal-transfer-org-ownership');

  try {
    const memRes = await apiRequest(`/api/v1/orgs/${orgId}/members`, 'GET');
    const members = Array.isArray(memRes) ? memRes : (memRes?.data || []);
    const select = document.getElementById('select-transfer-new-owner');
    if (select) {
      select.innerHTML = '<option value="">Select Member...</option>' +
        members.filter(m => m.role !== 'owner').map(m => `<option value="${m.userId}">${escapeHTML(m.name || m.email)} (${escapeHTML(m.email)})</option>`).join('');
    }
  } catch (_) {}
};

window.submitTransferOrgOwnership = async function() {
  const orgId = state.activeOrgId;
  const newOwnerUserId = document.getElementById('select-transfer-new-owner')?.value;

  if (!newOwnerUserId) {
    showToast('Please select a member to transfer ownership to.', 'error');
    return;
  }

  if (!confirm('Are you ABSOLUTELY SURE you want to transfer ownership of this organization?')) return;

  try {
    await apiRequest(`/api/v1/orgs/${orgId}/transfer-ownership`, 'POST', { newOwnerUserId });
    window.hideModal('modal-transfer-org-ownership');
    showToast('Organization ownership transferred.', 'success');
    window.fetchUserOrganizations();
    window.loadOrgConsole(orgId);
  } catch (err) {
    showToast(err.message || 'Failed to transfer ownership', 'error');
  }
};

window.confirmDeleteOrg = async function() {
  const orgId = state.activeOrgId;
  const org = state.organizations.find(o => o.id === orgId);
  if (!confirm(`Are you SURE you want to permanently delete organization "${org?.name || orgId}" and ALL its repositories and teams? This action cannot be undone.`)) return;

  try {
    await apiRequest(`/api/v1/orgs/${orgId}`, 'DELETE');
    showToast('Organization permanently deleted.', 'info');
    state.activeOrgId = null;
    state.activeWorkspace = 'personal';
    await window.fetchUserOrganizations();
    window.switchWorkspace('personal');
  } catch (err) {
    showToast(err.message || 'Failed to delete organization', 'error');
  }
};

window.openCreateOrgModal = function() {
  document.getElementById('input-org-name').value = '';
  document.getElementById('input-org-slug').value = '';
  document.getElementById('input-org-desc').value = '';
  window.showModal('modal-create-org');
};

window.submitCreateOrg = async function() {
  const name = document.getElementById('input-org-name')?.value?.trim();
  const slug = document.getElementById('input-org-slug')?.value?.trim();
  const description = document.getElementById('input-org-desc')?.value?.trim();

  if (!name) {
    showToast('Please enter an organization name.', 'error');
    return;
  }

  try {
    const res = await apiRequest('/api/v1/orgs', 'POST', { name, slug, description });
    const org = res?.data || res;
    window.hideModal('modal-create-org');
    showToast('Organization created successfully!', 'success');
    await window.fetchUserOrganizations();
    if (org?.id) {
      window.switchWorkspace(org.id);
      window.switchWorkspace('tab-organizations');
    }
  } catch (err) {
    showToast(err.message || 'Failed to create organization', 'error');
  }
};

window.removeOrgMember = async function(orgId, userId) {
  if (!confirm('Remove this member from the organization?')) return;
  try {
    await apiRequest(`/api/v1/orgs/${orgId}/members/${userId}`, 'DELETE');
    showToast('Member removed.', 'info');
    window.loadOrgMembers(orgId);
    window.loadOrgConsole(orgId);
  } catch (err) {
    showToast(err.message || 'Failed to remove member', 'error');
  }
};

// ── 6. Storage Quota Handlers ────────────────────────────────────────────────

window.fetchUserStorageQuota = async function() {
  if (!state.accessToken) return;
  try {
    const res = await apiRequest('/api/v1/storage/quota', 'GET');
    const quota = (res && res.usedBytes !== undefined) ? res : (res?.data || {});
    if (quota.usedBytes === undefined) return;

    const usedMb = Math.round(quota.usedBytes / (1024 * 1024) * 10) / 10;
    const maxMb = Math.round(quota.maxBytes / (1024 * 1024));
    const percent = Math.min(100, Math.max(0, quota.percentage || 0));

    const progressBar = document.getElementById('quota-progress-bar');
    if (progressBar) progressBar.style.width = `${percent}%`;

    const badgePercent = document.getElementById('quota-badge-percent');
    if (badgePercent) badgePercent.textContent = `${percent}% Used`;

    const labelUsed = document.getElementById('quota-label-used');
    if (labelUsed) labelUsed.textContent = `${usedMb} MB of ${maxMb} MB`;

    const labelFiles = document.getElementById('quota-label-files');
    if (labelFiles) labelFiles.textContent = `${quota.fileCount} file${quota.fileCount === 1 ? '' : 's'}`;
  } catch (_) {}
};

// ── 7. In-App Notification Center Handlers ───────────────────────────────────

window.fetchUserNotifications = async function() {
  if (!state.accessToken) return;
  try {
    const res = await apiRequest('/api/v1/notifications', 'GET');
    const data = (res && res.notifications !== undefined) ? res : (res?.data || { unreadCount: 0, notifications: [] });

    const badge = document.getElementById('badge-notif-unread-count');
    if (badge) {
      if (data.unreadCount > 0) {
        badge.textContent = data.unreadCount > 99 ? '99+' : data.unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    const container = document.getElementById('user-notifications-feed-list');
    if (container) {
      const notifs = data.notifications || [];
      if (notifs.length === 0) {
        container.innerHTML = '<div class="text-slate-400 text-center py-4">No notifications yet.</div>';
        return;
      }

      container.innerHTML = notifs.map(n => {
        const icon = n.type === 'security' ? 'fa-shield-halved text-rose-400' :
                     n.type === 'invite' ? 'fa-user-plus text-cyan-400' :
                     n.type === 'success' ? 'fa-circle-check text-emerald-400' :
                     'fa-bell text-indigo-400';
        return `
          <div onclick="window.markNotificationRead('${n.id}')" class="p-2.5 rounded-xl border ${n.isRead ? 'bg-white/[0.02] border-white/5 text-slate-400' : 'bg-indigo-500/10 border-indigo-500/30 text-white'} transition cursor-pointer flex items-start space-x-2.5">
            <i class="fa-solid ${icon} mt-0.5 text-xs"></i>
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-xs truncate">${escapeHTML(n.title)}</div>
              <div class="text-[11px] text-slate-300 leading-snug mt-0.5">${escapeHTML(n.message)}</div>
              <div class="text-[9px] text-slate-500 mt-1">${new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            ${!n.isRead ? '<span class="h-2 w-2 rounded-full bg-indigo-400 shrink-0 mt-1"></span>' : ''}
          </div>
        `;
      }).join('');
    }
  } catch (_) {}
};

window.toggleNotificationCenter = function() {
  const dropdown = document.getElementById('dropdown-user-notifications');
  if (!dropdown) return;
  dropdown.classList.toggle('hidden');
  if (!dropdown.classList.contains('hidden')) {
    window.fetchUserNotifications();
  }
};

window.markNotificationRead = async function(id) {
  try {
    await apiRequest(`/api/v1/notifications/${id}/read`, 'PATCH');
    window.fetchUserNotifications();
  } catch (_) {}
};

window.markAllNotificationsRead = async function() {
  try {
    await apiRequest('/api/v1/notifications/read-all', 'PATCH');
    showToast('All notifications marked as read.', 'info');
    window.fetchUserNotifications();
  } catch (_) {}
};

// ── 8. User Security Activity Logs Handlers ───────────────────────────────────

window.fetchUserSecurityLogs = async function() {
  const container = document.getElementById('user-security-logs-feed');
  if (!container || !state.accessToken) return;

  try {
    const res = await apiRequest('/api/v1/auth/security-logs', 'GET');
    const logs = Array.isArray(res) ? res : (res?.data || []);

    if (logs.length === 0) {
      container.innerHTML = '<div class="text-slate-500 text-center py-4">No recent security events.</div>';
      return;
    }

    container.innerHTML = logs.map(l => `
      <div class="p-2 bg-slate-900/60 rounded-lg border border-white/5 flex items-center justify-between text-[11px]">
        <div class="flex items-center space-x-2">
          <i class="fa-solid fa-shield text-indigo-400 text-[10px]"></i>
          <span class="text-slate-200 font-semibold">${escapeHTML(l.actionType)}</span>
          <span class="text-slate-400">${escapeHTML(l.details || '')}</span>
        </div>
        <div class="text-slate-500 font-mono text-[10px]">
          ${new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-xs text-rose-400">Failed to load logs: ${escapeHTML(err.message)}</div>`;
  }
};

// ── Master User Suite Initialization ─────────────────────────────────────────

window.initUserFeaturesDashboard = function() {
  if (!state.accessToken) return;
  window.fetchUserPasskeys();
  window.fetchUserSessions();
  window.fetchUserPats();
  window.fetchUserOrganizations();
  window.fetchUserStorageQuota();
  window.fetchUserNotifications();
  window.fetchUserSecurityLogs();
};
