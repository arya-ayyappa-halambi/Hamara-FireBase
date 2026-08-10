// ─────────────────────────────────────────────────────────────────────────────
//  public/app.js
//  AegisDB High-End Enterprise Dashboard Controller.
// ─────────────────────────────────────────────────────────────────────────────

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
  }, 4000);
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
    body: body ? (isFormData ? body : JSON.stringify(body)) : null,
  };

  let res = await fetch(`${state.baseUrl}${endpoint}`, config);
  const json = await res.json().catch(() => ({}));

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
}

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

function setRoleMode(mode) {
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
}

// ── Workspace Panel Navigation ─────────────────────────────────────────────────

function switchWorkspace(tabId) {
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
  } else if (tabId === 'tab-project-management') {
    loadMyProjects();
  } else if (tabId === 'tab-data-browser') {
    loadProjectsAndCollections();
  } else if (tabId === 'tab-api-playground') {
    renderCodeSnippet('js');
  } else if (tabId === 'tab-asset-vault') {
    loadAssetsList();
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
        labels: ['12m ago', '10m ago', '8m ago', '6m ago', '4m ago', '2m ago', 'Now'],
        datasets: [
          {
            label: 'CPU Load (%)',
            data: [1.2, 1.5, 2.1, 1.8, 2.4, 1.9, 1.8],
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            fill: true,
            tension: 0.4,
          },
          {
            label: 'Heap Allocated (MB)',
            data: [38, 40, 42, 41, 44, 43, 42],
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
            data: [0.35, 0.48, 0.42, 0.38, 1.12],
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
          data: [12, 3, 5, 45],
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
          data: [1500, 850, 120, 10, 50],
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
          data: [15, 85],
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
          { label: 'Allowed', data: [120, 45, 10, 5], backgroundColor: '#10b981' },
          { label: 'Denied', data: [5, 12, 3, 2], backgroundColor: '#ef4444' }
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
        
        // Simulating events per second based on WS connections
        const eps = (stats.websocketConnectionsActive || 0) * Math.floor(Math.random() * 5);
        chart.data.datasets[1].data.push(eps);
        if (chart.data.datasets[1].data.length > 15) chart.data.datasets[1].data.shift();
        
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
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-rose-400">${err.message}</td></tr>`;
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
      <td class="p-4 font-semibold text-white">${p.name}</td>
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

  dropdown.innerHTML = projects
    .map((p) => `<option value="${p.id}" ${state.activeProject?.id === p.id ? 'selected' : ''}>${p.name}</option>`)
    .join('');

  if (projects.length > 0 && !state.activeProject) {
    state.activeProject = projects[0];
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
    if (res && res.data) {
      renderWebhookLogs(res.data);
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
        <td class="p-3 text-slate-400 break-all max-w-[200px] truncate">${endpoint}</td>
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
          <div class="text-[10px] text-slate-500 break-all">${endpoint}</div>
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

async function loadUserManagement() {
  const tableBody = document.getElementById('table-users-body');
  const badgeCount = document.getElementById('badge-user-count');
  if (!tableBody) return;

  try {
    const users = await apiRequest('/api/v1/admin/users');
    const usersList = Array.isArray(users) ? users : (users?.users || []);
    if (badgeCount) badgeCount.textContent = `${usersList.length} users`;
    renderUsersTable(usersList);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-rose-400">${err.message}</td></tr>`;
  }
}

function renderUsersTable(users) {
  const tableBody = document.getElementById('table-users-body');
  if (!tableBody) return;

  if (!users || users.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">No users found.</td></tr>`;
    return;
  }

  tableBody.innerHTML = users.map(u => `
    <tr class="hover:bg-white/5 transition">
      <td class="p-4 font-semibold text-white">${u.name || 'N/A'}</td>
      <td class="p-4 text-slate-300">${u.email}</td>
      <td class="p-4">
        ${u.isSuperAdmin
          ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30"><i class="fa-solid fa-crown text-[9px] mr-1"></i>Super Admin</span>'
          : '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"><i class="fa-solid fa-code text-[9px] mr-1"></i>Developer</span>'
        }
      </td>
      <td class="p-4">
        ${u.mfaEnabled
          ? '<span class="text-emerald-400 text-[10px] font-semibold">✅ Enabled</span>'
          : '<span class="text-slate-500 text-[10px] font-semibold">⚪ Disabled</span>'
        }
      </td>
      <td class="p-4 text-slate-400 font-mono text-[10px]">${u.readRateLimit || 100}r / ${u.writeRateLimit || 50}w</td>
      <td class="p-4 text-slate-400">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}</td>
      <td class="p-4 text-right space-x-2">
        <button onclick="openEditUserLimits('${u.id}', '${u.email}', ${u.maxProjects || 5}, ${u.readRateLimit || 100}, ${u.writeRateLimit || 50})" class="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 text-[10px] font-semibold transition">
          <i class="fa-solid fa-sliders"></i> Limits
        </button>
        ${u.mfaEnabled ? `<button onclick="resetUserMfa('${u.id}', '${u.email}')" class="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 text-[10px] font-semibold transition">
          <i class="fa-solid fa-shield-halved"></i> Reset MFA
        </button>` : ''}
        ${!u.isSuperAdmin ? `<button onclick="deleteUserById('${u.id}')" class="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 text-[10px] font-semibold transition">
          <i class="fa-solid fa-trash"></i> Remove
        </button>` : ''}
      </td>
    </tr>
  `).join('');
}

async function resetUserMfa(userId, email) {
  if (!confirm(`Are you sure you want to reset MFA for ${email}? They will need to re-setup MFA from their account.`)) return;
  try {
    await apiRequest(`/api/v1/admin/users/${userId}/reset-mfa`, 'POST');
    showToast(`MFA has been reset for ${email}.`, 'success');
    loadUserManagement();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditUserLimits(userId, email, maxProjects, readLimit, writeLimit) {
  document.getElementById('edit-user-id').value = userId;
  document.getElementById('edit-user-email').textContent = email;
  document.getElementById('edit-user-max-projects').value = maxProjects;
  document.getElementById('edit-user-read-limit').value = readLimit;
  document.getElementById('edit-user-write-limit').value = writeLimit;
  document.getElementById('modal-user-limits')?.classList.remove('hidden');
}

async function saveUserLimits() {
  const userId = document.getElementById('edit-user-id')?.value;
  if (!userId) return;

  const limits = {
    maxProjects: parseInt(document.getElementById('edit-user-max-projects')?.value || '5', 10),
    readRateLimit: parseInt(document.getElementById('edit-user-read-limit')?.value || '100', 10),
    writeRateLimit: parseInt(document.getElementById('edit-user-write-limit')?.value || '50', 10),
  };

  try {
    await apiRequest(`/api/v1/admin/users/${userId}/limits`, 'PATCH', limits);
    document.getElementById('modal-user-limits')?.classList.add('hidden');
    showToast('User limits updated successfully.', 'success');
    loadUserManagement();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

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
    tableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-rose-400">${err.message}</td></tr>`;
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
      ? Object.entries(authCfg).filter(([,v]) => v).map(([k]) =>
          `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">${k}</span>`
        ).join(' ') || '<span class="text-slate-500 text-[10px]">None</span>'
      : '<span class="text-slate-500 text-[10px]">Not configured</span>';

    return `
    <tr class="hover:bg-white/5 transition">
      <td class="p-4 font-semibold text-white">${p.name}</td>
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
        <button onclick="selectProjectForBrowsing('${p.id}')" class="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 text-[10px] font-semibold transition">
          <i class="fa-solid fa-arrow-right"></i> Browse
        </button>
        <button onclick="rotateProjectKeys('${p.id}', '${p.name}')" class="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 text-[10px] font-semibold transition">
          <i class="fa-solid fa-key"></i> Rotate
        </button>
        <button onclick="deleteProjectById('${p.id}', '${p.name}')" class="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 text-[10px] font-semibold transition">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
      </td>
    </tr>
  `;
  }).join('');
}

function selectProjectForBrowsing(projectId) {
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
    loadMyProjects();

    // Show modal with new keys
    const modal = document.getElementById('modal-rotate-keys');
    if (modal) {
      const titleEl = document.getElementById('rotate-keys-title');
      const warningEl = document.getElementById('rotate-keys-warning');
      if (titleEl) titleEl.textContent = 'Project Created:';
      if (warningEl) warningEl.textContent = 'Please copy these keys now. For security reasons, they will not be shown again.';
      
      document.getElementById('rotate-keys-project-name').textContent = name;
      document.getElementById('rotate-keys-api-key').textContent = data.rawApiKey || 'Missing API Key';
      document.getElementById('rotate-keys-service-key').textContent = data.rawServiceKey || 'Missing Service Key';
      modal.classList.remove('hidden');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteProjectById(projectId, projectName) {
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
      document.getElementById('rotate-keys-api-key').textContent = data.rawApiKey;
      document.getElementById('rotate-keys-service-key').textContent = data.rawServiceKey;
      modal.classList.remove('hidden');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Document Detail Viewer ──────────────────────────────────────────────────────

function viewDocumentDetail(docId) {
  const doc = state.documents.find(d => d._id === docId);
  if (!doc) return showToast('Document not found.', 'error');

  const idEl = document.getElementById('doc-detail-id');
  const contentEl = document.getElementById('doc-detail-content');
  const modal = document.getElementById('modal-document-detail');

  if (idEl) idEl.textContent = docId;
  if (contentEl) contentEl.textContent = JSON.stringify(doc, null, 2);
  if (modal) modal.classList.remove('hidden');
}

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
    showToast(`Failed to load collections: ${err.message}`, 'error');
  }
}

function renderCollectionChips(collections) {
  const container = document.getElementById('collections-tabs');
  if (!container) return;

  container.innerHTML = collections
    .map(
      (c) => `
    <button onclick="selectCollectionByName('${c.name}')" class="px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center space-x-2 ${
      state.activeCollection?.name === c.name
        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
        : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/5'
    }">
      <i class="fa-solid fa-folder text-indigo-300 text-xs"></i>
      <span>${c.name}</span>
      <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-white/10 text-slate-300">${c.documentCount || 0}</span>
    </button>
  `
    )
    .join('');
}

function selectCollectionByName(name) {
  const coll = state.collections.find((c) => c.name === name);
  if (coll) selectCollection(coll);
}

async function selectCollection(coll) {
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
    tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-rose-400">${err.message}</td></tr>`;
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
      const { _id, _createdAt, _updatedAt, ...fields } = d;
      const previewStr = JSON.stringify(fields);
      const truncated = previewStr.length > 120 ? previewStr.substring(0, 120) + '...' : previewStr;
      const isEncrypted = previewStr.includes('_encrypted');

      return `
      <tr class="hover:bg-white/5 transition">
        <td class="p-3 font-semibold text-indigo-300 text-[10px]">${_id}</td>
        <td class="p-3 text-slate-300 max-w-xs">
          ${
            isEncrypted
              ? '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mr-2"><i class="fa-solid fa-lock text-[9px] mr-1"></i>x-encrypted</span>'
              : ''
          }
          <code class="text-[10px]">${truncated}</code>
        </td>
        <td class="p-3 text-slate-400 text-[10px]">${_createdAt ? new Date(_createdAt).toLocaleString() : 'N/A'}</td>
        <td class="p-3 text-slate-400 text-[10px]">${_updatedAt ? new Date(_updatedAt).toLocaleString() : 'N/A'}</td>
        <td class="p-3 text-right space-x-2">
          <button onclick="viewDocumentDetail('${_id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition" title="View full document">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button onclick="deleteDocument('${_id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition" title="Delete document">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
    })
    .join('');
}

async function deleteDocument(docId) {
  if (!state.activeCollection) return;
  try {
    await apiRequest(`/api/v1/db/collections/${state.activeCollection.name}/documents/${docId}`, 'DELETE');
    showToast('Document deleted.', 'success');
    loadDocuments(state.activeCollection.name, state.docsOffset || 0, state.docsLimit || 100);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Auth Config Management ──────────────────────────────────────────────────

async function loadAuthConfig() {
  if (!state.activeProject) return;
  
  try {
    const res = await apiRequest(`/api/v1/projects/${state.activeProject.id}/auth-config`);
    const config = res || {};
    
    // Populate form fields
    const formEmail = document.getElementById('auth-enable-email');
    if (formEmail) formEmail.checked = config.email?.enabled || false;
    
    const formGoogle = document.getElementById('auth-enable-google');
    const formGoogleId = document.getElementById('auth-clientid-google');
    if (formGoogle) formGoogle.checked = config.google?.enabled || false;
    if (formGoogleId) formGoogleId.value = config.google?.clientId || '';
    
    const formApple = document.getElementById('auth-enable-apple');
    const formAppleId = document.getElementById('auth-clientid-apple');
    if (formApple) formApple.checked = config.apple?.enabled || false;
    if (formAppleId) formAppleId.value = config.apple?.clientId || '';
    
    const formGithub = document.getElementById('auth-enable-github');
    const formGithubId = document.getElementById('auth-clientid-github');
    if (formGithub) formGithub.checked = config.github?.enabled || false;
    if (formGithubId) formGithubId.value = config.github?.clientId || '';
    
  } catch (err) {
    console.error('Failed to load auth config:', err);
    showToast('Failed to load Auth Config', 'error');
  }
}

async function saveAuthConfig() {
  if (!state.activeProject) return showToast('No active project', 'error');
  
  const config = {
    email: {
      enabled: document.getElementById('auth-enable-email')?.checked || false
    },
    google: {
      enabled: document.getElementById('auth-enable-google')?.checked || false,
      clientId: document.getElementById('auth-clientid-google')?.value || ''
    },
    apple: {
      enabled: document.getElementById('auth-enable-apple')?.checked || false,
      clientId: document.getElementById('auth-clientid-apple')?.value || ''
    },
    github: {
      enabled: document.getElementById('auth-enable-github')?.checked || false,
      clientId: document.getElementById('auth-clientid-github')?.value || ''
    }
  };
  
  try {
    await apiRequest(`/api/v1/projects/${state.activeProject.id}/auth-config`, 'PATCH', { authConfig: config });
    showToast('Auth config saved successfully.', 'success');
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
    const output = document.getElementById('sim-output');

    try {
      const rulesObj = JSON.parse(rulesStr);
      const auth = authStr ? JSON.parse(authStr) : null;

      const rule = rulesObj.read;
      if (rule === true || (rule === 'auth != null' && auth !== null)) {
        output.className = 'text-emerald-400 font-bold';
        output.textContent = '✅ ALLOWED (Evaluation returned true in 0.4ms)';
      } else {
        output.className = 'text-rose-400 font-bold';
        output.textContent = '❌ DENIED (HTTP 403 Forbidden - Rule evaluated false)';
      }
    } catch (err) {
      output.className = 'text-amber-400 font-bold';
      output.textContent = `⚠️ Syntax Error: ${err.message}`;
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
    formData.append('file', file);
    
    try {
      await apiRequest('/api/v1/storage/upload', 'POST', formData, true);
      successCount++;
    } catch (err) {
      showToast(`Failed to upload ${file.name}: ${err.message}`, 'error');
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
        <td class="p-3 text-white">${a.originalName}</td>
        <td class="p-3 text-slate-400">${a.mimeType}</td>
        <td class="p-3 text-slate-400">${(a.sizeBytes / 1024).toFixed(1)} KB</td>
        <td class="p-3 text-right">
          <a href="${state.baseUrl}/api/v1/storage/assets/${a.id}/download" target="_blank" class="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 text-[10px] font-semibold transition">
            <i class="fa-solid fa-download"></i> Download
          </a>
        </td>
      </tr>
    `
      )
      .join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No assets uploaded yet.</td></tr>`;
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

document.addEventListener('DOMContentLoaded', () => {
  initInactivityTracker();
  initStorageUpload();


  // Check existing session
  if (state.user && state.accessToken) {
    document.getElementById('auth-screen')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.remove('hidden');
    updateUserProfileUI();
    setRoleMode(state.user.isSuperAdmin ? 'superadmin' : 'developer');
    connectGlobalWebSocket();
    initGlobalData();
  }

  // Auth Tab Switchers
  const btnTabLogin = document.getElementById('tab-btn-login');
  const btnTabRegister = document.getElementById('tab-btn-register');
  const fieldName = document.getElementById('field-name');

  if (btnTabLogin && btnTabRegister) {
    btnTabLogin.onclick = () => {
      btnTabLogin.className = 'flex-1 text-center py-2 font-medium text-white border-b-2 border-indigo-500 transition';
      btnTabRegister.className = 'flex-1 text-center py-2 font-medium text-slate-400 border-b-2 border-transparent hover:text-white transition';
      fieldName.classList.add('hidden');
    };
    btnTabRegister.onclick = () => {
      btnTabRegister.className = 'flex-1 text-center py-2 font-medium text-white border-b-2 border-indigo-500 transition';
      btnTabLogin.className = 'flex-1 text-center py-2 font-medium text-slate-400 border-b-2 border-transparent hover:text-white transition';
      fieldName.classList.remove('hidden');
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
      const isRegister = !fieldName.classList.contains('hidden');

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

        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        showToast('Successfully authenticated.', 'success');
        updateUserProfileUI();
        setRoleMode(data.user.isSuperAdmin ? 'superadmin' : 'developer');
        connectGlobalWebSocket();
        initGlobalData();
      } catch (err) {
        if (err.message.includes('MFA')) {
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
      if (!name) return;
      try {
        await apiRequest('/api/v1/auth/profile', 'PATCH', { name });
        state.user.name = name;
        localStorage.setItem('aegis_user', JSON.stringify(state.user));
        updateUserProfileUI();
        showToast('Profile name updated.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
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
        showToast(`Invalid JSON or API error: ${err.message}`, 'error');
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
        if (state.activeTab === 'tab-developer-metrics') {
          loadDeveloperMetrics();
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

  // User Management: Refresh Button
  const btnRefreshUsers = document.getElementById('btn-refresh-users');
  if (btnRefreshUsers) btnRefreshUsers.onclick = () => loadUserManagement();

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

  // Document Detail: Copy JSON Button
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
  
  document.getElementById('sidebar')?.classList.remove('sidebar-collapsed');

  const driverObj = window.driver.js.driver;
  
  const tour = driverObj({
    showProgress: true,
    animate: true,
    popoverClass: 'driver-theme-glass',
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
