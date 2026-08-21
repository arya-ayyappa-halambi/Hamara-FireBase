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
console.log('✅ app.js v15 loaded successfully');

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
  el.style.setProperty('display', 'flex', 'important');
};

window.hideModal = function(id) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (!el) return;
  el.classList.add('hidden');
  el.classList.remove('flex');
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
  if (!state.user || state.user.isSuperAdmin) return;

  const containerAlerts = document.getElementById('container-threat-alerts');
  const badgeCount = document.getElementById('badge-threat-count');
  const feedList = document.getElementById('threat-alerts-feed-list');
  const bannerNotice = document.getElementById('banner-compliance-notice');
  const bannerNoticeText = document.getElementById('banner-compliance-notice-text');

  let alerts = [];

  // Flag Alert
  if (state.user.isFlagged || state.user.flagged) {
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

  // Active Notice Alert
  if (activeNoticeObj) {
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

  // Pending Deletion Alert
  if (state.user.isPendingDeletion || state.user.status === 'pending_deletion') {
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
        <div class="p-3 rounded-xl bg-slate-900/90 border ${a.type === 'deletion' ? 'border-amber-500/40 bg-amber-950/20' : 'border-rose-500/40 bg-rose-950/20'} flex items-start justify-between gap-2 shadow">
          <div class="space-y-0.5">
            <div class="font-bold text-xs ${a.type === 'deletion' ? 'text-amber-300' : 'text-rose-300'} flex items-center space-x-1.5">
              <i class="fa-solid ${a.type === 'deletion' ? 'fa-triangle-exclamation' : 'fa-shield-halved'}"></i>
              <span>${escapeHTML(a.title)}</span>
            </div>
            <div class="text-[10px] text-slate-300">${escapeHTML(a.details)}</div>
          </div>
          <button type="button" onclick="event.preventDefault(); event.stopPropagation(); ${a.actionFn}" class="px-2.5 py-1 rounded-lg ${a.type === 'deletion' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'} text-white font-semibold text-[10px] shadow transition active:scale-95 shrink-0">
            ${a.actionText}
          </button>
        </div>
      `).join('');
    }
  } else {
    if (badgeCount) badgeCount.textContent = '0';
    if (feedList) feedList.innerHTML = '<div class="text-slate-400 text-center py-4 text-xs">No active threat alerts. System normal.</div>';
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
    switchWorkspace('tab-telemetry');
  } else {
    if (btnDev) btnDev.className = 'px-3 py-1.5 rounded-lg transition-all bg-indigo-600 text-white shadow flex items-center space-x-1.5';
    if (btnSuper) {
      btnSuper.className = 'px-3 py-1.5 rounded-lg transition-all text-slate-400 hover:text-white flex items-center space-x-1.5';
      if (!state.user?.isSuperAdmin) btnSuper.classList.add('hidden');
    }
    if (secSuper) secSuper.classList.add('hidden');
    if (secDev) secDev.classList.remove('hidden');
    switchWorkspace('tab-developer-metrics');
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

  if (projects && projects.length > 0) {
    if (!state.activeProject || !projects.some(p => p.id === state.activeProject.id)) {
      state.activeProject = projects[0];
    }
  } else {
    state.activeProject = null;
  }

  dropdown.innerHTML = (projects || [])
    .map((p) => `<option value="${p.id}" ${state.activeProject?.id === p.id ? 'selected' : ''}>${escapeHTML(p.name)}</option>`)
    .join('');

  if (state.activeProject) {
    dropdown.value = state.activeProject.id;
  }
}

// ── Global Data Initialization ───────────────────────────────────────────────

async function initGlobalData() {
  try {
    const projects = await apiRequest('/api/v1/projects');
    state.projects = projects;
    updateProjectSelectorDropdown(projects);
    
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
    const projects = await apiRequest('/api/v1/projects');
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
    tableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">No projects found. Create one to get started.</td></tr>`;
    return;
  }

  tableBody.innerHTML = projects.map(p => {
    const authCfg = p.authConfig;
    const authBadges = authCfg
      ? Object.entries(authCfg).filter(([,v]) => v === true || v?.enabled).map(([k]) =>
          `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">${k}</span>`
        ).join(' ') || '<span class="text-slate-500 text-[10px]">None</span>'
      : '<span class="text-slate-500 text-[10px]">Not configured</span>';

    return `
    <tr class="hover:bg-white/5 transition">
      <td class="p-4 font-semibold text-white">${escapeHTML(p.name)}</td>
      <td class="p-4 text-slate-400 font-mono text-[10px]">${p.id.substring(0, 8)}...</td>
      <td class="p-4">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">${p.collectionCount || 0}</span>
      </td>
      <td class="p-4">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">${p.documentCount || 0}</span>
      </td>
      <td class="p-4 space-x-1">${authBadges}</td>
      <td class="p-4 text-slate-400">${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'N/A'}</td>
      <td class="p-4 text-right space-x-2">
        <button type="button" onclick="event.preventDefault(); event.stopPropagation(); selectProjectForBrowsing('${p.id}')" class="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 text-[10px] font-semibold transition">
          <i class="fa-solid fa-arrow-right"></i> Browse
        </button>
        <button type="button" onclick="event.preventDefault(); event.stopPropagation(); openProjectBackupModal('${p.id}', '${escapeHTML(p.name)}')" class="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 text-[10px] font-semibold transition">
          <i class="fa-solid fa-cloud-arrow-up"></i> Backup
        </button>
        <button type="button" onclick="event.preventDefault(); event.stopPropagation(); rotateProjectKeys('${p.id}', '${escapeHTML(p.name)}')" class="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 text-[10px] font-semibold transition">
          <i class="fa-solid fa-key"></i> Rotate
        </button>
        <button type="button" onclick="event.preventDefault(); event.stopPropagation(); deleteProjectById('${p.id}', '${escapeHTML(p.name)}')" class="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 text-[10px] font-semibold transition">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
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
}

async function createNewProject() {
  const name = document.getElementById('input-new-project-name')?.value?.trim();
  if (!name) return showToast('Please enter a project name.', 'error');

  try {
    const data = await apiRequest('/api/v1/projects', 'POST', { name });
    document.getElementById('modal-create-project')?.classList.add('hidden');
    document.getElementById('input-new-project-name').value = '';
    showToast(`Project "${name}" created successfully!`, 'success');
    await loadMyProjects();

    // Set the newly created project as active project immediately
    if (state.projects && state.projects.length > 0) {
      const newProj = state.projects.find(p => p.id === data.id);
      if (newProj) {
        state.activeProject = newProj;
        const dropdown = document.getElementById('select-active-project');
        if (dropdown) dropdown.value = newProj.id;
        // If we are currently on a project-specific tab, refresh its data
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
    const container = document.getElementById('google-auth-container');
    if (data && data.googleAuthEnabled && data.googleClientId && data.googleClientId.trim().length > 0) {
      if (container) {
        container.classList.remove('hidden');
        container.style.display = 'flex';
      }
      
      const btn = document.getElementById('btn-custom-google-login');
      if (btn) {
        btn.onclick = (e) => {
          e.preventDefault();
          const redirectUri = window.location.origin;
          const nonce = Math.random().toString(36).substring(2);
          const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(data.googleClientId.trim())}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token id_token&scope=email profile&nonce=${nonce}`;
          window.location.href = authUrl;
        };
      }
    } else {
      if (container) {
        container.classList.add('hidden');
        container.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Failed to init Google Auth', err);
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

    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    showToast('Successfully authenticated with Google.', 'success');
    updateUserProfileUI();
    setRoleMode(data.user.isSuperAdmin ? 'superadmin' : 'developer');
    connectGlobalWebSocket();
    initGlobalData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadPlatformSettings() {
  if (!state.user?.isSuperAdmin) return;
  const card = document.getElementById('card-platform-settings');
  if (card) card.classList.remove('hidden');
  try {
    const data = await apiRequest('/api/v1/admin/platform-settings');
    if (data) {
      document.getElementById('setting-google-client-id').value = data.googleClientId || '';
      document.getElementById('toggle-google-auth').checked = data.googleAuthEnabled || false;
      document.getElementById('setting-backup-mode').value = data.backupMode || 'none';
      document.getElementById('setting-backup-interval').value = data.backupIntervalMinutes || '';
      document.getElementById('setting-backup-retention-days').value = data.backupRetentionDays || '7';
      document.getElementById('setting-s3-bucket').value = data.s3BucketName || '';
      document.getElementById('setting-s3-region').value = data.s3Region || '';
      document.getElementById('setting-s3-access').value = data.s3AccessKey || '';
      document.getElementById('setting-s3-secret').value = data.s3SecretKey || '';
      const maintToggle = document.getElementById('toggle-maintenance-mode');
      if (maintToggle) maintToggle.checked = data.maintenanceMode || false;

      // Render Backup Statuses
      if (data.lastBackupAt) {
        document.getElementById('label-global-last-backup-time').textContent = new Date(data.lastBackupAt).toLocaleString();
        if (data.backupIntervalMinutes && data.backupMode !== 'none') {
          const nextTime = new Date(new Date(data.lastBackupAt).getTime() + data.backupIntervalMinutes * 60000);
          document.getElementById('label-global-next-backup-time').textContent = nextTime.toLocaleString();
        } else {
          document.getElementById('label-global-next-backup-time').textContent = 'Not Scheduled';
        }
      } else {
        document.getElementById('label-global-last-backup-time').textContent = 'Never';
        document.getElementById('label-global-next-backup-time').textContent = 'N/A';
      }

      const lBadge = document.getElementById('badge-global-local-status');
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

      const s3Badge = document.getElementById('badge-global-s3-status');
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
    }
  } catch (err) {
    showToast('Failed to load platform settings', 'error');
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

  // Check maintenance mode immediately
  try {
    await apiRequest('/api/v1/system/status');
  } catch (err) {
    // If maintenance mode is active, it will automatically show the overlay and throw here.
    console.warn('System is under maintenance.');
  }

  initGoogleAuth();
  initInactivityTracker();
  initStorageUpload();

  // Check for Google Auth Redirect Hash
  if (window.location.hash.includes('id_token=')) {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const idToken = params.get('id_token');
    if (idToken) {
      window.location.hash = ''; // Clear hash
      try {
        const data = await apiRequest('/api/v1/auth/google', 'POST', { token: idToken });
        state.accessToken = data.token;
        state.user = data.user;
        localStorage.setItem('aegis_access_token', data.token);
        localStorage.setItem('aegis_user', JSON.stringify(data.user));
        showToast('Successfully signed in with Google!', 'success');
        
        if (data.requiresPasswordSetup) {
          document.getElementById('modal-initial-password').classList.remove('hidden');
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

    // Sync fresh user profile from database to get real-time isFlagged / status
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
      } catch (_) {}
    })();

    if (state.user.isSuperAdmin) {
      loadPlatformSettings();
      document.getElementById('container-threat-alerts')?.classList.remove('hidden');
      if (typeof window.loadSecurityThreatAlerts === 'function') window.loadSecurityThreatAlerts();
    }

    // Check dynamic policy consent
    (async () => {
      try {
        const policy = await apiRequest('/api/v1/policies/current', 'GET');
        if (policy && state.user.acceptedTermsVersion !== policy.version) {
          window.showMandatoryPolicyGate(policy.version);
        }
      } catch (_) {}
    })();

    // Check active compliance notices
    (async () => {
      try {
        const noticeRes = await apiRequest('/api/v1/auth/active-notice', 'GET');
        if (noticeRes?.activeNotice) {
          window.renderComplianceBanner(noticeRes.activeNotice);
        }
      } catch (_) {}
    })();
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

  // Auth Tab Switchers
  const btnTabLogin = document.getElementById('tab-btn-login');
  const btnTabRegister = document.getElementById('tab-btn-register');
  const fieldName = document.getElementById('field-name');
  const fieldTerms = document.getElementById('field-terms-agreement');

  if (btnTabLogin && btnTabRegister) {
    btnTabLogin.onclick = () => {
      btnTabLogin.className = 'flex-1 text-center py-2 font-medium text-white border-b-2 border-indigo-500 transition';
      btnTabRegister.className = 'flex-1 text-center py-2 font-medium text-slate-400 border-b-2 border-transparent hover:text-white transition';
      fieldName?.classList.add('hidden');
      fieldTerms?.classList.add('hidden');
    };
    btnTabRegister.onclick = () => {
      btnTabRegister.className = 'flex-1 text-center py-2 font-medium text-white border-b-2 border-indigo-500 transition';
      btnTabLogin.className = 'flex-1 text-center py-2 font-medium text-slate-400 border-b-2 border-transparent hover:text-white transition';
      fieldName?.classList.remove('hidden');
      fieldTerms?.classList.remove('hidden');
    };
  }


  const btnForgotPassword = document.getElementById('btn-forgot-password');
  if (btnForgotPassword) {
    btnForgotPassword.onclick = async () => {
      const email = document.getElementById('input-email').value;
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

  // Auth Form Submission
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
      localStorage.clear();
      window.location.reload();
    };
  }

  // Quick Demo Admin Login Handler
  const btnDemoAdmin = document.getElementById('btn-demo-admin-login');
  if (btnDemoAdmin && authForm) {
    btnDemoAdmin.onclick = () => {
      document.getElementById('input-email').value = 'admin@aegisdb.dev';
      document.getElementById('input-password').value = 'Admin@123';
      showToast('Demo Super Admin credentials populated. Signing in...', 'info');
      authForm.dispatchEvent(new Event('submit'));
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
        await apiRequest('/api/v1/auth/profile', 'PATCH', { name, email, currentPassword });
        state.user.name = name;
        if (email) state.user.email = email;
        localStorage.setItem('aegis_user', JSON.stringify(state.user));
        
        // clear password field
        const pwdField = document.getElementById('setting-profile-current-pwd');
        if (pwdField) pwdField.value = '';
        
        updateUserProfileUI();
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
      try {
        await apiRequest('/api/v1/admin/platform-settings', 'PATCH', { googleClientId, googleAuthEnabled });
        showToast('Platform settings updated successfully. Reload page to see changes on login.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
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
    btnCopyCode.onclick = () => {
      const code = document.getElementById('code-snippet-display')?.textContent;
      if (code) {
        navigator.clipboard.writeText(code);
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
    btnCopyDocJson.onclick = () => {
      const content = document.getElementById('doc-detail-content')?.textContent;
      if (content) {
        navigator.clipboard.writeText(content);
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
});

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
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
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
  const version = document.getElementById('gate-policy-version')?.textContent || 'v1.0.0';
  try {
    await apiRequest('/api/v1/auth/accept-policy', 'POST', { version });
    if (state.user) {
      state.user.acceptedTermsVersion = version;
      localStorage.setItem('aegis_user', JSON.stringify(state.user));
    }
    const modal = document.getElementById('modal-mandatory-policy-gate');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
    showToast(`Platform policies (${version}) accepted successfully!`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to accept policy', 'error');
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
    inputEmail.value = 'admin@aegisdb.dev';
    inputEmail.focus();
  }
};
