// ─────────────────────────────────────────────────────────────────────────────
//  public/app.js
//  AegisDB Developer Dashboard Application Controller.
// ─────────────────────────────────────────────────────────────────────────────

// ── Application State ─────────────────────────────────────────────────────────

const state = {
  baseUrl: window.location.origin,
  wsUrl: window.location.origin.replace(/^http/, 'ws'),
  accessToken: localStorage.getItem('aegis_access_token') || null,
  refreshToken: localStorage.getItem('aegis_refresh_token') || null,
  user: JSON.parse(localStorage.getItem('aegis_user') || 'null'),
  activeCollection: null,
  ws: null,
  wsSubscriptions: new Set(),
};

// ── Toast Notifications ───────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  
  let bgClass = 'bg-slate-800 border-slate-700';
  let icon = '<i class="fa-solid fa-circle-info text-blue-400"></i>';
  
  if (type === 'success') {
    bgClass = 'bg-emerald-950/80 border-emerald-800 text-emerald-100';
    icon = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
  } else if (type === 'error') {
    bgClass = 'bg-red-950/80 border-red-800 text-red-100';
    icon = '<i class="fa-solid fa-circle-exclamation text-red-400"></i>';
  } else if (type === 'warning') {
    bgClass = 'bg-amber-950/80 border-amber-800 text-amber-100';
    icon = '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i>';
  }

  toast.className = `flex items-center space-x-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md pointer-events-auto toast-enter ${bgClass}`;
  toast.innerHTML = `
    <div class="flex-shrink-0 text-lg">${icon}</div>
    <div class="text-sm font-medium pr-2">${message}</div>
    <button class="ml-auto text-slate-400 hover:text-white transition" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  container.appendChild(toast);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300); // Wait for animation
    }
  }, 4000);
}

// ── API Helper ────────────────────────────────────────────────────────────────

async function apiRequest(endpoint, method = 'GET', body = null, isFormData = false) {
  const headers = {};
  if (state.accessToken) {
    headers['Authorization'] = `Bearer ${state.accessToken}`;
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

  // Auto-refresh token on 401
  if (res.status === 401 && state.refreshToken) {
    const refreshed = await refreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${state.accessToken}`;
      res = await fetch(`${state.baseUrl}${endpoint}`, config);
    }
  }

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Request failed (${res.status}).`);
  }

  return json.data;
}

// ── Auth Actions ──────────────────────────────────────────────────────────────

function setAuthState(data) {
  state.accessToken = data.token;
  state.refreshToken = data.refreshToken;
  state.user = data.user;

  localStorage.setItem('aegis_access_token', data.token);
  localStorage.setItem('aegis_refresh_token', data.refreshToken);
  localStorage.setItem('aegis_user', JSON.stringify(data.user));

  updateAuthUI();
}

function clearAuthState() {
  state.accessToken = null;
  state.refreshToken = null;
  state.user = null;

  localStorage.removeItem('aegis_access_token');
  localStorage.removeItem('aegis_refresh_token');
  localStorage.removeItem('aegis_user');

  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }

  updateAuthUI();
}

async function refreshToken() {
  if (!state.refreshToken) return false;
  try {
    const res = await fetch(`${state.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setAuthState(json.data);
      return true;
    }
  } catch { /* Silent fail */ }
  clearAuthState();
  return false;
}

// ── UI Updates ────────────────────────────────────────────────────────────────

function updateAuthUI() {
  const authScreen = document.getElementById('auth-screen');
  const appDashboard = document.getElementById('app-dashboard');
  const userBadge = document.getElementById('userBadge');
  const userEmailText = document.getElementById('userEmailText');
  const jwtTokenDisplay = document.getElementById('jwtTokenDisplay');
  const adminTabBtn = document.getElementById('adminTabBtn');
  const adminNavDivider = document.getElementById('adminNavDivider');

  if (state.user && state.accessToken) {
    // Hide Auth Screen, Show Dashboard
    authScreen.classList.add('hidden');
    authScreen.classList.remove('flex');
    appDashboard.classList.remove('hidden');

    // Update Header Badge
    userBadge.classList.remove('hidden');
    const adminTag = state.user.isSuperAdmin ? ' 👑 (Admin)' : '';
    userEmailText.textContent = `${state.user.name}${adminTag}`;
    
    // Update Sidebar JWT
    jwtTokenDisplay.textContent = state.accessToken;
    jwtTokenDisplay.classList.add('text-emerald-400');

    // Super Admin Conditional Rendering
    if (state.user.isSuperAdmin) {
      adminTabBtn?.classList.remove('hidden');
      adminNavDivider?.classList.remove('hidden');
    } else {
      adminTabBtn?.classList.add('hidden');
      adminNavDivider?.classList.add('hidden');
    }
    
    // Initial Load - force projects tab on fresh login
    switchTab('projects');
  } else {
    // Show Auth Screen, Hide Dashboard
    authScreen.classList.remove('hidden');
    authScreen.classList.add('flex');
    appDashboard.classList.add('hidden');
  }
}

// ── Tab Navigation ────────────────────────────────────────────────────────────

function switchTab(tabTarget) {
  const tabs = document.querySelectorAll('.nav-tab');
  
  // Ignore admin tab click if not admin
  if (tabTarget === 'admin' && (!state.user || !state.user.isSuperAdmin)) {
    return;
  }

  tabs.forEach((t) => {
    t.classList.remove('bg-brand-600', 'text-white');
    
    // Preserve custom hover colors for admin tab vs others
    if (t.id === 'adminTabBtn') {
      t.classList.remove('text-rose-100', 'bg-rose-900/60');
      t.classList.add('text-rose-400', 'hover:text-rose-300', 'hover:bg-rose-950/40');
    } else {
      t.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-slate-800/50');
    }
  });

  const activeTab = document.querySelector(`.nav-tab[data-tab="${tabTarget}"]`);
  if (activeTab) {
    if (tabTarget === 'admin') {
      activeTab.classList.add('bg-rose-900/80', 'text-rose-100');
      activeTab.classList.remove('text-rose-400', 'hover:text-rose-300', 'hover:bg-rose-950/40');
    } else {
      activeTab.classList.add('bg-brand-600', 'text-white');
      activeTab.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-slate-800/50');
    }
  }

  document.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hidden', 'opacity-0'));
  
  const targetContent = document.getElementById(`tab-${tabTarget}`);
  if (targetContent) {
    targetContent.classList.remove('hidden');
    // small delay for fade-in effect
    setTimeout(() => targetContent.classList.remove('opacity-0'), 10);
  }

  // Auto-load tab data if logged in
  if (state.accessToken) {
    if (tabTarget === 'projects') loadProjects();
    if (tabTarget === 'db') loadCollections();
    if (tabTarget === 'storage') loadAssets();
    if (tabTarget === 'hoster') loadDeployments();
    if (tabTarget === 'realtime') initWebSocket();
    if (tabTarget === 'admin') loadAdminStats();
  }
}

function setupTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabTarget = tab.getAttribute('data-tab');
      switchTab(tabTarget);
    });
  });
}

// ── Auth Form Event Handlers ──────────────────────────────────────────────────

function setupAuthHandlers() {
  
  // Auth Form Toggle (Login vs Register)
  const loginTabBtn = document.getElementById('authLoginTabBtn');
  const registerTabBtn = document.getElementById('authRegisterTabBtn');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  loginTabBtn?.addEventListener('click', () => {
    loginTabBtn.classList.replace('text-slate-400', 'text-white');
    loginTabBtn.classList.add('bg-brand-600', 'shadow');
    loginTabBtn.classList.remove('hover:text-white');
    
    registerTabBtn.classList.replace('text-white', 'text-slate-400');
    registerTabBtn.classList.remove('bg-brand-600', 'shadow');
    registerTabBtn.classList.add('hover:text-white');
    
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  });

  registerTabBtn?.addEventListener('click', () => {
    registerTabBtn.classList.replace('text-slate-400', 'text-white');
    registerTabBtn.classList.add('bg-brand-600', 'shadow');
    registerTabBtn.classList.remove('hover:text-white');
    
    loginTabBtn.classList.replace('text-white', 'text-slate-400');
    loginTabBtn.classList.remove('bg-brand-600', 'shadow');
    loginTabBtn.classList.add('hover:text-white');
    
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    try {
      const res = await fetch(`${state.baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);

      setAuthState(json.data);
      showToast('Account registered successfully! Welcome to AegisDB.', 'success');
    } catch (err) {
      showToast(`Registration Error: ${err.message}`, 'error');
    }
  });

  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
      const res = await fetch(`${state.baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);

      setAuthState(json.data);
      showToast(`Welcome back, ${json.data.user.name}!`, 'success');
    } catch (err) {
      showToast(`Login Error: ${err.message}`, 'error');
    }
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    if (state.refreshToken) {
      try {
        await fetch(`${state.baseUrl}/api/v1/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: state.refreshToken }),
        });
      } catch { /* Silent */ }
    }
    clearAuthState();
    showToast('You have been logged out.', 'info');
  });

  document.getElementById('refreshTokenBtn')?.addEventListener('click', async () => {
    const success = await refreshToken();
    if (success) showToast('Access token refreshed!', 'success');
    else showToast('Refresh failed. Please login again.', 'error');
  });
}

// ── Projects & API Keys Handlers ──────────────────────────────────────────────

async function loadProjects() {
  const container = document.getElementById('projectsListContainer');
  try {
    const projects = await apiRequest('/api/v1/projects');
    if (!projects || projects.length === 0) {
      container.innerHTML = '<div class="bg-darkbg p-6 rounded-xl border border-slate-800 text-center text-sm text-slate-500 italic">No projects created yet. Create one above to get started.</div>';
      return;
    }

    container.innerHTML = projects.map((p) => `
      <div class="bg-darkbg p-5 rounded-xl border border-slate-800 space-y-4 hover:border-brand-500/50 transition">
        <div class="flex items-center justify-between">
          <div class="font-bold text-white text-base flex items-center space-x-3">
            <div class="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
              <i class="fa-solid fa-layer-group text-brand-400 text-sm"></i>
            </div>
            <span>${p.name}</span>
          </div>
          <button class="delete-proj-btn text-red-400 hover:bg-red-500/10 px-2 py-1.5 rounded-lg transition text-xs font-medium" data-projid="${p.id}">
            <i class="fa-solid fa-trash mr-1.5"></i> Delete
          </button>
        </div>
        
        <div class="bg-slate-900 rounded-lg p-3 border border-slate-700/50 space-y-2">
           <div class="flex items-center justify-between text-xs">
             <span class="text-slate-500">Project ID</span>
             <span class="text-slate-300 font-mono">${p.id}</span>
           </div>
           <div class="flex items-center justify-between text-xs">
             <span class="text-slate-500">API Key Hash</span>
             <div class="flex items-center space-x-2">
               <span class="text-emerald-400 font-mono truncate max-w-[150px] sm:max-w-xs">${p.apiKeyHash}</span>
               <button class="copy-key-btn text-slate-400 hover:text-white hover:bg-slate-700 p-1 rounded transition" data-keyhash="${p.apiKeyHash}" title="Copy Hash">
                 <i class="fa-solid fa-copy"></i>
               </button>
             </div>
           </div>
        </div>

        <div class="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-center">
          <div class="bg-slate-800/30 rounded py-2">
            <div class="text-[10px] text-slate-500 uppercase font-semibold">Collections</div>
            <div class="text-sm font-bold text-indigo-400 mt-1">${p.collectionCount}</div>
          </div>
          <div class="bg-slate-800/30 rounded py-2">
            <div class="text-[10px] text-slate-500 uppercase font-semibold">Documents</div>
            <div class="text-sm font-bold text-blue-400 mt-1">${p.documentCount}</div>
          </div>
          <div class="bg-slate-800/30 rounded py-2">
            <div class="text-[10px] text-slate-500 uppercase font-semibold">Assets</div>
            <div class="text-sm font-bold text-emerald-400 mt-1">${p.assetCount}</div>
          </div>
          <div class="bg-slate-800/30 rounded py-2">
            <div class="text-[10px] text-slate-500 uppercase font-semibold">Deployments</div>
            <div class="text-sm font-bold text-cyan-400 mt-1">${p.deploymentCount}</div>
          </div>
        </div>
      </div>
    `).join('');

    // Delete Handlers
    document.querySelectorAll('.delete-proj-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-projid');
        if (confirm(`Danger Zone! Are you sure you want to delete project "${id}" and ALL its data? This cannot be undone.`)) {
          try {
            await apiRequest(`/api/v1/projects/${encodeURIComponent(id)}`, 'DELETE');
            showToast('Project deleted successfully.', 'success');
            loadProjects();
          } catch (err) {
            showToast(`Error deleting project: ${err.message}`, 'error');
          }
        }
      });
    });

    // Copy Hash Handlers
    document.querySelectorAll('.copy-key-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const hash = btn.getAttribute('data-keyhash');
        navigator.clipboard.writeText(hash).then(() => {
           showToast('API Key Hash copied to clipboard. Note: The RAW key was only shown once at creation.', 'info');
        }).catch(err => {
           console.error('Copy failed', err);
        });
      });
    });

  } catch (err) {
    container.innerHTML = `<p class="text-sm text-red-400 p-4 bg-red-950/20 rounded-xl border border-red-900/50">${err.message}</p>`;
  }
}

function setupProjectHandlers() {
  document.getElementById('createProjectBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('newProjectName');
    const name = input.value.trim();
    if (!name) return showToast('Please enter a project name.', 'warning');

    try {
      const res = await apiRequest('/api/v1/projects', 'POST', { name });
      input.value = '';
      
      // We must show the raw API key to the user NOW, as it won't be retrievable again.
      // A standard alert is actually best here to ensure they don't miss it, but we'll use a prompt so they can easily copy it.
      window.prompt(`✅ Project created successfully!\n\n⚠️ IMPORTANT: Copy this RAW API Key now. It will NEVER be shown again! Use this in the x-aegis-api-key header.`, res.rawApiKey);
      
      showToast('Project created successfully.', 'success');
      loadProjects();
    } catch (err) {
      showToast(`Error creating project: ${err.message}`, 'error');
    }
  });

  document.getElementById('refreshProjectsBtn')?.addEventListener('click', () => {
     showToast('Refreshing project list...', 'info');
     loadProjects();
  });
}

// ── Database Engine Handlers ──────────────────────────────────────────────────

async function loadCollections() {
  const collectionsList = document.getElementById('collectionsList');
  try {
    const collections = await apiRequest('/api/v1/db/collections');
    if (!collections || collections.length === 0) {
      collectionsList.innerHTML = '<p class="text-xs text-slate-500 italic p-2">No collections created yet.</p>';
      return;
    }

    collectionsList.innerHTML = collections.map((col) => `
      <div class="col-item p-2.5 rounded-xl border border-slate-800 hover:border-indigo-500 cursor-pointer flex items-center justify-between transition ${state.activeCollection === col.name ? 'bg-indigo-900/30 border-indigo-500' : 'bg-darkbg'}" data-col="${col.name}">
        <div>
          <div class="text-sm font-bold text-white">${col.name}</div>
          <div class="text-[11px] text-slate-400">${col.documentCount} docs</div>
        </div>
        <button class="delete-col-btn text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded p-1.5 transition" data-col="${col.name}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `).join('');

    document.querySelectorAll('.col-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.delete-col-btn')) return;
        selectCollection(item.getAttribute('data-col'));
      });
    });

    document.querySelectorAll('.delete-col-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = btn.getAttribute('data-col');
        if (confirm(`Delete collection "${name}" and all its documents?`)) {
          try {
            await apiRequest(`/api/v1/db/collections/${encodeURIComponent(name)}`, 'DELETE');
            if (state.activeCollection === name) {
               state.activeCollection = null;
               document.getElementById('activeColName').textContent = 'select a collection';
               document.getElementById('documentsContainer').innerHTML = '<p class="text-xs text-slate-500 italic p-4 text-center">Select a collection and fetch documents.</p>';
            }
            showToast(`Collection "${name}" deleted.`, 'success');
            loadCollections();
          } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
          }
        }
      });
    });
  } catch (err) {
    collectionsList.innerHTML = `<p class="text-xs text-red-400 p-2">${err.message}</p>`;
  }
}

function selectCollection(name) {
  state.activeCollection = name;
  document.getElementById('activeColName').textContent = name;
  loadCollections();
  fetchDocuments();
}

async function fetchDocuments() {
  const container = document.getElementById('documentsContainer');
  if (!state.activeCollection) {
    container.innerHTML = '<p class="text-sm text-amber-500 italic p-4 text-center bg-amber-950/20 rounded-lg border border-amber-900/30">Select a collection first.</p>';
    return;
  }

  try {
    const result = await apiRequest(`/api/v1/db/collections/${encodeURIComponent(state.activeCollection)}/documents`);
    if (!result.documents || result.documents.length === 0) {
      container.innerHTML = '<p class="text-sm text-slate-500 italic p-4 text-center">Collection is empty. Insert a document above!</p>';
      return;
    }

    container.innerHTML = result.documents.map((doc) => `
      <div class="bg-darkbg p-3 rounded-xl border border-slate-800 space-y-2">
        <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono border-b border-slate-800 pb-2">
          <span>ID: <span class="text-slate-300">${doc._id}</span></span>
          <button class="delete-doc-btn text-red-400 hover:bg-red-500/10 px-2 py-1 rounded transition font-sans flex items-center" data-docid="${doc._id}">
            <i class="fa-solid fa-trash mr-1.5"></i> Delete
          </button>
        </div>
        <pre class="text-xs text-emerald-400 font-mono overflow-x-auto p-2 bg-slate-950/50 rounded-lg">${JSON.stringify(doc, null, 2)}</pre>
      </div>
    `).join('');

    document.querySelectorAll('.delete-doc-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-docid');
        if (confirm(`Delete document "${id}"?`)) {
          try {
            await apiRequest(`/api/v1/db/collections/${encodeURIComponent(state.activeCollection)}/documents/${encodeURIComponent(id)}`, 'DELETE');
            fetchDocuments();
          } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
          }
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<p class="text-xs text-red-400 p-2">${err.message}</p>`;
  }
}

function setupDbHandlers() {
  document.getElementById('createColBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('newColName');
    const name = input.value.trim();
    if (!name) return showToast('Enter collection name.', 'warning');
    try {
      await apiRequest('/api/v1/db/collections', 'POST', { name });
      input.value = '';
      selectCollection(name);
      showToast(`Collection "${name}" created.`, 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  });

  document.getElementById('insertDocBtn')?.addEventListener('click', async () => {
    if (!state.activeCollection) return showToast('Select a collection first.', 'warning');
    const input = document.getElementById('docJsonInput');
    try {
      const data = JSON.parse(input.value);
      await apiRequest(`/api/v1/db/collections/${encodeURIComponent(state.activeCollection)}/documents`, 'POST', { data });
      input.value = ''; // clear only on success
      fetchDocuments();
      showToast('Document inserted.', 'success');
    } catch (err) {
      showToast(`Invalid JSON or Error: ${err.message}`, 'error');
    }
  });

  document.getElementById('refreshCollectionsBtn')?.addEventListener('click', loadCollections);
  document.getElementById('queryDocsBtn')?.addEventListener('click', fetchDocuments);
}

// ── Real-Time WebSockets Engine ───────────────────────────────────────────────

function logWsMessage(type, message, data = null) {
  const logContainer = document.getElementById('wsActivityLog');
  const now = new Date().toLocaleTimeString();

  let colorClass = 'text-slate-400';
  if (type === 'sys') colorClass = 'text-slate-500';
  if (type === 'auth') colorClass = 'text-emerald-400';
  if (type === 'event') colorClass = 'text-amber-400';
  if (type === 'error') colorClass = 'text-red-400';

  const entry = document.createElement('div');
  entry.className = `space-y-1 p-3 rounded-lg bg-slate-900 border border-slate-800 ${colorClass}`;
  entry.innerHTML = `
    <div class="flex items-center justify-between text-[11px]">
      <span class="font-bold uppercase tracking-wider">[${type}] ${message}</span>
      <span class="text-slate-600">${now}</span>
    </div>
    ${data ? `<pre class="text-[11px] text-slate-300 overflow-x-auto mt-2 p-2 bg-black/30 rounded">${JSON.stringify(data, null, 2)}</pre>` : ''}
  `;

  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

function updateWsBadge(status) {
  const dot = document.getElementById('wsStatusDot');
  const text = document.getElementById('wsStatusText');

  if (status === 'connected') {
    dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
    text.className = 'text-emerald-400 font-medium';
    text.textContent = 'WS Connected';
  } else if (status === 'connecting') {
    dot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping';
    text.className = 'text-amber-400 font-medium';
    text.textContent = 'WS Connecting...';
  } else {
    dot.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
    text.className = 'text-slate-400 font-medium';
    text.textContent = 'WS Disconnected';
  }
}

function initWebSocket() {
  if (!state.accessToken) return showToast('Log in first to connect WebSocket.', 'warning');
  if (state.ws && state.ws.readyState === WebSocket.OPEN) return;

  updateWsBadge('connecting');
  logWsMessage('sys', `Connecting to ${state.wsUrl}...`);

  state.ws = new WebSocket(`${state.wsUrl}?token=${encodeURIComponent(state.accessToken)}`);

  state.ws.onopen = () => {
    updateWsBadge('connected');
    logWsMessage('sys', 'WebSocket Handshake Established.');
  };

  state.ws.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      if (parsed.event === 'auth:success') {
        logWsMessage('auth', parsed.message, parsed.data);
      } else if (parsed.event === 'subscribed') {
        logWsMessage('sys', `Subscribed to collection "${parsed.collection}".`);
      } else if (parsed.event?.startsWith('document:')) {
        logWsMessage('event', `REALTIME STREAM: ${parsed.event} on "${parsed.collection}"`, parsed.data);
      } else {
        logWsMessage('sys', parsed.event || 'Frame', parsed);
      }
    } catch {
      logWsMessage('sys', 'Raw frame received', event.data);
    }
  };

  state.ws.onclose = () => {
    updateWsBadge('disconnected');
    logWsMessage('sys', 'WebSocket Connection Closed.');
  };

  state.ws.onerror = () => {
    updateWsBadge('disconnected');
    logWsMessage('error', 'WebSocket Error Occurred.');
  };
}

function setupRealtimeHandlers() {
  document.getElementById('connectWsBtn')?.addEventListener('click', initWebSocket);

  document.getElementById('wsSubBtn')?.addEventListener('click', () => {
    const input = document.getElementById('wsSubCollectionName');
    const collection = input.value.trim();
    if (!collection) return showToast('Enter collection name to subscribe.', 'warning');
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return showToast('Connect WebSocket first.', 'warning');

    state.ws.send(JSON.stringify({ action: 'subscribe', collection }));
    state.wsSubscriptions.add(collection);
  });

  document.getElementById('clearWsLogBtn')?.addEventListener('click', () => {
    document.getElementById('wsActivityLog').innerHTML = '<div class="text-slate-500 italic">[SYS] Log cleared.</div>';
  });
}

// ── Storage Handlers ──────────────────────────────────────────────────────────

async function loadAssets() {
  const container = document.getElementById('assetsContainer');
  try {
    const assets = await apiRequest('/api/v1/storage/assets');
    if (!assets || assets.length === 0) {
      container.innerHTML = '<p class="text-sm text-slate-500 italic text-center py-8">No biometric assets uploaded yet.</p>';
      return;
    }

    container.innerHTML = assets.map((asset) => `
      <div class="bg-darkbg p-4 rounded-xl border border-slate-800 flex items-center justify-between transition hover:border-emerald-500/50">
        <div class="flex items-center space-x-4">
          <div class="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center border border-slate-700/50">
             <i class="fa-solid fa-file-image text-emerald-400 text-lg"></i>
          </div>
          <div>
            <div class="font-bold text-white text-sm">${asset.originalName}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">${(asset.sizeBytes / 1024).toFixed(1)} KB • ${new Date(asset.uploadedAt).toLocaleString()}</div>
          </div>
        </div>
        <div class="flex items-center space-x-3">
          <a href="${state.baseUrl}/api/v1/storage/assets/${asset.id}/file" target="_blank" class="px-3 py-1.5 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-xs font-medium border border-emerald-500/20 transition flex items-center">
            View <i class="fa-solid fa-arrow-up-right-from-square text-[10px] ml-1.5"></i>
          </a>
          <button class="delete-asset-btn text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-lg transition" data-assetid="${asset.id}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.delete-asset-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-assetid');
        if (confirm('Delete asset?')) {
          try {
            await apiRequest(`/api/v1/storage/assets/${encodeURIComponent(id)}`, 'DELETE');
            showToast('Asset deleted.', 'success');
            loadAssets();
          } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
          }
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<p class="text-sm text-red-400 bg-red-950/20 p-4 border border-red-900/30 rounded-lg">${err.message}</p>`;
  }
}

function setupStorageHandlers() {
  const fileInput = document.getElementById('assetFileInput');
  const fileLabelText = document.getElementById('fileLabelText');

  fileInput?.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      fileLabelText.textContent = `Selected: ${fileInput.files[0].name}`;
      fileLabelText.classList.add('text-emerald-400');
    }
  });

  document.getElementById('uploadAssetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fileInput.files || fileInput.files.length === 0) return showToast('Select a file first.', 'warning');

    const formData = new FormData();
    formData.append('biometric', fileInput.files[0]);

    try {
      await apiRequest('/api/v1/storage/upload', 'POST', formData, true);
      showToast('Asset uploaded successfully!', 'success');
      fileInput.value = '';
      fileLabelText.textContent = 'Click to select image file';
      fileLabelText.classList.remove('text-emerald-400');
      loadAssets();
    } catch (err) {
      showToast(`Upload Error: ${err.message}`, 'error');
    }
  });

  document.getElementById('refreshAssetsBtn')?.addEventListener('click', loadAssets);
}

// ── Hoster Handlers ───────────────────────────────────────────────────────────

async function loadDeployments() {
  const container = document.getElementById('deploymentsContainer');
  try {
    const deployments = await apiRequest('/api/v1/hoster/deployments');
    if (!deployments || deployments.length === 0) {
      container.innerHTML = '<p class="text-sm text-slate-500 italic text-center py-8">No active project deployments found.</p>';
      return;
    }

    container.innerHTML = deployments.map((dep) => `
      <div class="bg-darkbg p-5 rounded-xl border border-slate-800 space-y-3 transition hover:border-cyan-500/50">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <span class="w-3 h-3 rounded-full ${dep.status === 'running' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-red-500'}"></span>
            <span class="font-bold text-white text-sm">${dep.name}</span>
          </div>
          <span class="px-3 py-1 rounded-lg text-[10px] uppercase font-bold tracking-wider ${dep.runtimeMode === 'docker' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}">
            <i class="fa-brands ${dep.runtimeMode === 'docker' ? 'fa-docker' : 'fa-node-js'} mr-1"></i>
            ${dep.runtimeMode}
          </span>
        </div>
        <div class="text-xs text-slate-400 font-mono flex items-center justify-between border-t border-slate-800 pt-3">
          <span>Port: <a href="http://localhost:${dep.allocatedPort}" target="_blank" class="text-cyan-400 hover:underline">:${dep.allocatedPort}</a></span>
          <span class="capitalize">Status: <span class="${dep.status === 'running' ? 'text-emerald-400' : 'text-red-400'}">${dep.status}</span></span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p class="text-sm text-red-400 p-4 bg-red-950/20 rounded-lg border border-red-900/30">${err.message}</p>`;
  }
}

function setupHosterHandlers() {
  document.getElementById('refreshDeploymentsBtn')?.addEventListener('click', loadDeployments);
}

// ── Super Admin Handlers ──────────────────────────────────────────────────────

async function loadAdminStats() {
  try {
    const stats = await apiRequest('/api/v1/admin/stats');
    
    // Animate numbers
    animateValue("statTotalUsers", 0, stats.totalUsers, 500);
    animateValue("statTotalProjects", 0, stats.totalProjects, 500);
    
    document.getElementById('statTotalDocs').textContent = `${stats.totalCollections} / ${stats.totalDocuments}`;
    document.getElementById('statSystemHealth').textContent = `${stats.memoryUsageMb} MB`;
  } catch (err) {
    showToast(`Admin Error: ${err.message}`, 'error');
  }
}

function animateValue(id, start, end, duration) {
    if (start === end) return;
    var range = end - start;
    var current = start;
    var increment = end > start? 1 : -1;
    var stepTime = Math.abs(Math.floor(duration / range));
    var obj = document.getElementById(id);
    var timer = setInterval(function() {
        current += increment;
        obj.innerHTML = current;
        if (current == end) {
            clearInterval(timer);
        }
    }, stepTime);
}

function setupAdminHandlers() {
  document.getElementById('refreshAdminStatsBtn')?.addEventListener('click', loadAdminStats);

  document.getElementById('rateLimitForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const authLimit = parseInt(document.getElementById('authLimitInput').value, 10);
    const apiLimit = parseInt(document.getElementById('apiLimitInput').value, 10);

    try {
      await apiRequest('/api/v1/admin/rate-limits', 'PATCH', { authLimit, apiLimit });
      showToast('Live Rate Limits updated successfully.', 'success');
    } catch (err) {
      showToast(`Error updating rate limits: ${err.message}`, 'error');
    }
  });
}

// ── Initialization ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupTabNavigation();
  setupAuthHandlers();
  setupProjectHandlers();
  setupDbHandlers();
  setupRealtimeHandlers();
  setupStorageHandlers();
  setupHosterHandlers();
  setupAdminHandlers();

  // Initial state check
  updateAuthUI();
});
