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
  activeDocumentId: null,
  activeDocumentData: null,
  activeProject: null,
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
    t.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-slate-800/50');
  });

  const activeTab = document.querySelector(`.nav-tab[data-tab="${tabTarget}"]`);
  if (activeTab) {
    activeTab.classList.add('bg-brand-600', 'text-white');
    activeTab.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-slate-800/50');
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
    if (tabTarget === 'auth') loadAuthConfig();
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

function setupDbSubTabs() {
  const tabBtns = ['data', 'rules', 'tester'];
  
  tabBtns.forEach(tab => {
    const btn = document.getElementById(`dbTabBtn-${tab}`);
    if (!btn) return;
    
    btn.addEventListener('click', () => {
      // Reset all buttons
      tabBtns.forEach(t => {
        const b = document.getElementById(`dbTabBtn-${t}`);
        if (b) {
          b.classList.remove('text-blue-400', 'border-blue-400');
          b.classList.add('text-slate-400', 'border-transparent');
        }
        
        const view = document.getElementById(`dbView-${t}`);
        if (view) {
          view.classList.add('hidden');
          view.classList.remove('flex');
        }
      });
      
      // Activate clicked button
      btn.classList.add('text-blue-400', 'border-blue-400');
      btn.classList.remove('text-slate-400', 'border-transparent');
      
      // Show corresponding view
      const activeView = document.getElementById(`dbView-${tab}`);
      if (activeView) {
        activeView.classList.remove('hidden');
        if (tab === 'rules') {
           activeView.classList.add('flex'); // Rules is flex-col
           populateRulesCollectionDropdown(); // Load collections into dropdown
        } else if (tab === 'data') {
           activeView.classList.add('flex'); // Data is flex
        }
      }
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

  document.getElementById('demoCredsBtn')?.addEventListener('click', () => {
    document.getElementById('loginEmail').value = 'admin@aegis.dev';
    document.getElementById('loginPassword').value = 'AdminPass123!';
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
          <div class="flex space-x-2">
            <button class="toggle-limits-btn text-amber-400 hover:bg-amber-500/10 px-2 py-1.5 rounded-lg transition text-xs font-medium" data-projid="${p.id}">
              <i class="fa-solid fa-gear mr-1.5"></i> Limits
            </button>
            <button class="delete-proj-btn text-red-400 hover:bg-red-500/10 px-2 py-1.5 rounded-lg transition text-xs font-medium" data-projid="${p.id}">
              <i class="fa-solid fa-trash mr-1.5"></i> Delete
            </button>
          </div>
        </div>
        
        <div class="bg-slate-900 rounded-lg p-3 border border-slate-700/50 space-y-2">
           <div class="flex items-center justify-between text-xs">
             <span class="text-slate-500">Project ID</span>
             <span class="text-slate-300 font-mono">${p.id}</span>
           </div>
           <div class="flex items-center justify-between text-xs">
             <span class="text-slate-500">API Key Hash</span>
             <div class="flex items-center space-x-2">
               <span class="text-emerald-400 font-mono overflow-hidden text-ellipsis whitespace-nowrap max-w-[150px] sm:max-w-[200px] block" title="${p.apiKeyHash}">${p.apiKeyHash}</span>
               <button class="copy-key-btn text-slate-400 hover:text-white hover:bg-slate-700 p-1 rounded transition" data-keyhash="${p.apiKeyHash}" title="Copy Hash">
                 <i class="fa-solid fa-copy"></i>
               </button>
             </div>
           </div>
        </div>

        <div id="limits-proj-${p.id}" class="hidden mt-2 p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-3">
          <div class="grid grid-cols-2 gap-3">
             <div>
               <label class="text-[10px] text-slate-400 uppercase">Max Asset Size (Bytes)</label>
               <input type="number" id="maxAsset-${p.id}" value="${p.maxAssetSizeBytes}" class="w-full bg-darkbg border border-slate-700 rounded p-1.5 text-xs text-white">
             </div>
             <div>
               <label class="text-[10px] text-slate-400 uppercase">Max Storage (Bytes)</label>
               <input type="number" id="maxStorage-${p.id}" value="${p.maxStorageBytes}" class="w-full bg-darkbg border border-slate-700 rounded p-1.5 text-xs text-white">
             </div>
          </div>
          <div class="flex justify-end">
            <button class="save-limits-btn bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded text-xs transition" data-projid="${p.id}">Save Limits</button>
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
    
    // Update Global Project Selector Dropdown
    const dropdownList = document.getElementById('globalProjectsList');
    if (dropdownList) {
      dropdownList.innerHTML = projects.map(p => `
        <div class="px-3 py-2 hover:bg-[#3c3c3c] cursor-pointer text-sm text-slate-300 transition global-project-item" data-projid="${p.id}" data-projname="${p.name}">
          ${p.name}
        </div>
      `).join('');
      
      document.querySelectorAll('.global-project-item').forEach(item => {
        item.addEventListener('click', (e) => {
           e.stopPropagation();
           const name = item.getAttribute('data-projname');
           const id = item.getAttribute('data-projid');
           
           state.activeProject = { id, name };
           document.getElementById('globalActiveProjectName').textContent = name;
           document.getElementById('projectSelectorDropdown').classList.add('hidden');
           
           // Reload active tab
           const activeTab = document.querySelector('.nav-tab.bg-brand-600');
           if (activeTab) {
             const tab = activeTab.getAttribute('data-tab');
             if (tab === 'auth') loadAuthConfig();
             if (tab === 'db') {
                state.activeCollection = null; // reset selected collection
                document.getElementById('documentsContainer').innerHTML = '<p class="text-xs text-slate-500 italic p-4 text-center">Select a collection.</p>';
                loadCollections();
             }
             if (tab === 'storage') loadAssets();
             if (tab === 'hoster') loadDeployments();
           }
        });
      });
    }

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

    // Toggle Limits Handler
    document.querySelectorAll('.toggle-limits-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-projid');
        const div = document.getElementById(`limits-proj-${id}`);
        div.classList.toggle('hidden');
      });
    });

    // Save Limits Handler
    document.querySelectorAll('.save-limits-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-projid');
        const maxAssetSizeBytes = parseInt(document.getElementById(`maxAsset-${id}`).value, 10);
        const maxStorageBytes = parseInt(document.getElementById(`maxStorage-${id}`).value, 10);
        
        try {
          await apiRequest(`/api/v1/projects/${encodeURIComponent(id)}`, 'PATCH', {
            maxAssetSizeBytes, maxStorageBytes
          });
          showToast('Project limits updated.', 'success');
          loadProjects();
        } catch (err) {
          showToast(`Error updating limits: ${err.message}`, 'error');
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
  
  // Global Project Dropdown Toggle
  document.getElementById('projectSelectorDropdownBtn')?.addEventListener('click', (e) => {
     const dropdown = document.getElementById('projectSelectorDropdown');
     if (dropdown) {
        dropdown.classList.toggle('hidden');
     }
  });
  
  // Close dropdown on click outside
  document.addEventListener('click', (e) => {
     const btn = document.getElementById('projectSelectorDropdownBtn');
     const dropdown = document.getElementById('projectSelectorDropdown');
     if (btn && dropdown && !btn.contains(e.target)) {
        dropdown.classList.add('hidden');
     }
  });
  
  // Create project modal open (redirects to top of page for now since the input is there)
  document.getElementById('openCreateProjectModalBtn')?.addEventListener('click', () => {
     document.getElementById('newProjectName')?.focus();
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
               document.getElementById('documentsContainer').innerHTML = '<p class="text-xs text-slate-500 italic p-4 text-center">Select a collection.</p>';
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
  loadCollections();
  fetchDocuments();
  loadCollectionSettings(name);
}

async function loadCollectionSettings(name) {
  if (!name) return;
  try {
    const res = await apiRequest(`/api/v1/db/collections/${encodeURIComponent(name)}`);
    document.getElementById('colSchemaInput').value = res.schema || '';
    document.getElementById('colRulesInput').value = res.rules || '';
    // Update dropdown if it exists
    const dropdown = document.getElementById('rulesCollectionSelect');
    if (dropdown) dropdown.value = name;
    // Hide publish status when switching
    const statusEl = document.getElementById('publishStatus');
    if (statusEl) statusEl.classList.add('hidden');
  } catch (err) {
    console.error('Failed to load collection settings', err);
  }
}

async function populateRulesCollectionDropdown() {
  const dropdown = document.getElementById('rulesCollectionSelect');
  if (!dropdown) return;
  try {
    const collections = await apiRequest('/api/v1/db/collections');
    dropdown.innerHTML = '<option value="">-- select collection --</option>';
    if (collections && collections.length > 0) {
      collections.forEach(col => {
        const opt = document.createElement('option');
        opt.value = col.name;
        opt.textContent = col.name;
        if (state.activeCollection === col.name) opt.selected = true;
        dropdown.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Failed to load collections for rules dropdown', err);
  }
}

async function fetchDocuments() {
  const container = document.getElementById('documentsContainer');
  const fieldsList = document.getElementById('fieldsList');
  const activeDocIdText = document.getElementById('activeDocIdText');
  
  fieldsList.innerHTML = '<p class="text-xs text-slate-500 italic p-4 text-center">Select a document.</p>';
  activeDocIdText.textContent = '';
  
  if (!state.activeCollection) {
    container.innerHTML = '<p class="text-sm text-amber-500 italic p-4 text-center">Select a collection first.</p>';
    return;
  }

  try {
    const result = await apiRequest(`/api/v1/db/collections/${encodeURIComponent(state.activeCollection)}/documents`);
    if (!result.documents || result.documents.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-500 italic p-4 text-center">Collection is empty.</p>';
      return;
    }

    container.innerHTML = result.documents.map((doc) => {
      const { _id } = doc;
      
      return `
      <div class="border-b border-darkborder hover:bg-[#2a2a2a] cursor-pointer transition p-2 flex justify-between items-center group" onclick='selectDocument(${JSON.stringify(doc).replace(/'/g, "&#39;")})'>
        <div class="flex flex-col overflow-hidden">
          <span class="text-xs font-mono text-slate-300 truncate">${_id}</span>
        </div>
        <button class="delete-doc-btn opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-500/10 px-2 py-1 rounded transition text-xs ml-2 shrink-0" data-docid="${_id}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
      `;
    }).join('');

    document.querySelectorAll('.delete-doc-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-docid');
        if (confirm(`Delete document "${id}"?`)) {
          try {
            await apiRequest(`/api/v1/db/collections/${encodeURIComponent(state.activeCollection)}/documents/${encodeURIComponent(id)}`, 'DELETE');
            showToast('Document deleted', 'success');
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

window.selectDocument = function(doc) {
  const { _id, _ownerId, _createdAt, _updatedAt, ...dataFields } = doc;
  state.activeDocumentId = _id;
  state.activeDocumentData = dataFields;
  document.getElementById('activeDocIdText').textContent = _id;
  const fieldsList = document.getElementById('fieldsList');
  
  const rows = Object.entries(dataFields).map(([k, v]) => `
    <div class="border-b border-darkborder/50 last:border-0 hover:bg-slate-800/30 p-2 flex flex-col">
      <span class="text-[11px] font-medium text-slate-400">${k}</span>
      <span class="text-xs text-emerald-300 font-mono break-all mt-1">${typeof v === 'object' ? JSON.stringify(v) : v}</span>
    </div>
  `).join('');

  fieldsList.innerHTML = rows || '<p class="text-xs text-slate-500 italic p-4 text-center">No custom fields.</p>';
}

function setupDbHandlers() {
  document.getElementById('developTestBtn')?.addEventListener('click', () => {
     document.getElementById('dbTabBtn-tester')?.click();
  });
  
  document.getElementById('createColBtn')?.addEventListener('click', () => {
     document.getElementById('newColInputContainer')?.classList.toggle('hidden');
  });
  
  document.getElementById('submitNewColBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('newColName');
    const name = input.value.trim();
    if (!name) return showToast('Enter collection name.', 'warning');
    try {
      await apiRequest('/api/v1/db/collections', 'POST', { name });
      input.value = '';
      document.getElementById('newColInputContainer')?.classList.add('hidden');
      selectCollection(name);
      showToast(`Collection "${name}" created.`, 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  });

  document.getElementById('addFieldBtn')?.addEventListener('click', async () => {
    if (!state.activeCollection || !state.activeDocumentId || !state.activeDocumentData) {
      return showToast('Select a document first.', 'warning');
    }

    const fieldKey = prompt('Enter new field name:');
    if (!fieldKey) return;
    
    const fieldValueStr = prompt('Enter field value (JSON format or raw string):');
    if (fieldValueStr === null) return;
    
    let fieldValue = fieldValueStr;
    try {
      fieldValue = JSON.parse(fieldValueStr);
    } catch (e) {
      // Treat as string
    }
    
    const updatedData = { ...state.activeDocumentData, [fieldKey]: fieldValue };
    
    try {
      const res = await apiRequest(`/api/v1/db/collections/${encodeURIComponent(state.activeCollection)}/documents/${encodeURIComponent(state.activeDocumentId)}`, 'PATCH', { data: updatedData });
      showToast('Field added successfully.', 'success');
      selectDocument(res.data);
    } catch (err) {
      showToast(`Error adding field: ${err.message}`, 'error');
    }
  });

  document.getElementById('insertDocBtn')?.addEventListener('click', () => {
     if (!state.activeCollection) return showToast('Select a collection first.', 'warning');
     document.getElementById('newDocInputContainer')?.classList.toggle('hidden');
  });

  document.getElementById('submitNewDocBtn')?.addEventListener('click', async () => {
    if (!state.activeCollection) return showToast('Select a collection first.', 'warning');
    const input = document.getElementById('docJsonInput');
    try {
      const data = JSON.parse(input.value);
      await apiRequest(`/api/v1/db/collections/${encodeURIComponent(state.activeCollection)}/documents`, 'POST', { data });
      input.value = '{"field": "value"}'; // clear only on success
      document.getElementById('newDocInputContainer')?.classList.add('hidden');
      fetchDocuments();
      showToast('Document inserted.', 'success');
    } catch (err) {
      showToast(`Invalid JSON or Error: ${err.message}`, 'error');
    }
  });

  // Rules collection dropdown change handler
  document.getElementById('rulesCollectionSelect')?.addEventListener('change', (e) => {
    const name = e.target.value;
    if (name) {
      state.activeCollection = name;
      loadCollectionSettings(name);
    } else {
      document.getElementById('colSchemaInput').value = '';
      document.getElementById('colRulesInput').value = '';
      const statusEl = document.getElementById('publishStatus');
      if (statusEl) statusEl.classList.add('hidden');
    }
  });

  document.getElementById('saveColSettingsBtn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('publishStatus');
    
    if (!state.activeCollection) {
      showToast('Please select a collection first!', 'warning');
      if (statusEl) {
        statusEl.textContent = '⚠ No collection selected';
        statusEl.className = 'text-xs font-mono text-amber-400';
        statusEl.classList.remove('hidden');
      }
      return;
    }
    
    const schemaStr = document.getElementById('colSchemaInput').value.trim();
    const rulesStr = document.getElementById('colRulesInput').value.trim();
    
    // basic validation
    try {
      if (schemaStr) JSON.parse(schemaStr);
      if (rulesStr) JSON.parse(rulesStr);
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = '✗ Invalid JSON';
        statusEl.className = 'text-xs font-mono text-red-400';
        statusEl.classList.remove('hidden');
      }
      return showToast('Invalid JSON in schema or rules.', 'error');
    }

    // Show publishing state
    if (statusEl) {
      statusEl.textContent = '⏳ Publishing...';
      statusEl.className = 'text-xs font-mono text-blue-400';
      statusEl.classList.remove('hidden');
    }

    try {
      await apiRequest(`/api/v1/db/collections/${encodeURIComponent(state.activeCollection)}`, 'PATCH', {
        schema: schemaStr || null,
        rules: rulesStr || null
      });
      if (statusEl) {
        statusEl.textContent = '✓ Published successfully';
        statusEl.className = 'text-xs font-mono text-emerald-400';
      }
      showToast(`Rules published for "${state.activeCollection}".`, 'success');
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = '✗ Publish failed';
        statusEl.className = 'text-xs font-mono text-red-400';
      }
      showToast(`Error: ${err.message}`, 'error');
    }
  });

  document.getElementById('runApiTestBtn')?.addEventListener('click', async () => {
    const apiKey = document.getElementById('apiTestKey').value.trim();
    const method = document.getElementById('apiTestMethod').value;
    const col = document.getElementById('apiTestCol').value.trim();
    const bodyStr = document.getElementById('apiTestBody').value.trim();
    const resElem = document.getElementById('apiTestResponse');

    if (!apiKey || !col) {
      resElem.textContent = 'Please provide an API Key and Collection Name.';
      return;
    }

    let payload = undefined;
    if (method === 'POST') {
      try {
        payload = JSON.parse(bodyStr);
      } catch (e) {
        resElem.textContent = 'Invalid JSON body for POST request.';
        return;
      }
    }

    resElem.textContent = 'Sending request...';

    try {
      const response = await fetch(`/api/v1/db/collections/${encodeURIComponent(col)}/documents`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-aegis-api-key': apiKey
        },
        body: payload ? JSON.stringify({ data: payload }) : undefined
      });

      const data = await response.json();
      resElem.textContent = `Status: ${response.status} ${response.statusText}\n\n${JSON.stringify(data, null, 2)}`;
    } catch (err) {
      resElem.textContent = `Network Error: ${err.message}`;
    }
  });

  document.getElementById('refreshCollectionsBtn')?.addEventListener('click', loadCollections);
  document.getElementById('queryDocsBtn')?.addEventListener('click', fetchDocuments);
  
  setupDbSubTabs();
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
    const [stats, usersRes] = await Promise.all([
       apiRequest('/api/v1/admin/stats'),
       apiRequest('/api/v1/admin/users')
    ]);
    
    // Animate numbers
    animateValue("statTotalUsers", 0, stats.totalUsers, 500);
    animateValue("statTotalProjects", 0, stats.totalProjects, 500);
    
    document.getElementById('statTotalDocs').textContent = `${stats.totalCollections} / ${stats.totalDocuments}`;
    document.getElementById('statSystemHealth').textContent = `${stats.memoryUsageMb} MB`;
    
    // Render users table
    const tableBody = document.getElementById('adminUsersTableBody');
    if (tableBody && usersRes) {
       tableBody.innerHTML = usersRes.map(u => `
         <tr class="hover:bg-[#3c3c3c] transition">
           <td class="px-4 py-3 font-medium text-white flex items-center">
             ${u.email}
             ${u.isSuperAdmin ? '<span class="ml-2 text-[10px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded uppercase font-bold">Admin</span>' : ''}
           </td>
           <td class="px-4 py-3 text-slate-400">${u.projectCount || 0}</td>
           <td class="px-4 py-3 text-slate-400">
             ${u.readsCount || 0} / ${u.readLimit || '∞'}
           </td>
           <td class="px-4 py-3 text-slate-400">
             ${u.writesCount || 0} / ${u.writeLimit || '∞'}
           </td>
           <td class="px-4 py-3">${u.apiLimit} / 15m</td>
           <td class="px-4 py-3 text-slate-400">${new Date(u.createdAt).toLocaleDateString()}</td>
           <td class="px-4 py-3 font-mono text-slate-400 text-[10px]">${u.id}</td>
           <td class="px-4 py-3">
             <button onclick="openEditUserLimitsModal('${u.id}', ${u.apiLimit}, ${u.readLimit || 50000}, ${u.writeLimit || 20000}, ${u.lockoutMinutes || 1440})" class="px-2 py-1 bg-darkborder hover:bg-[#3c3c3c] border border-darkborder rounded text-white text-xs flex items-center gap-2 transition">
               Edit Limits
               <i class="fa-solid fa-pen text-slate-500 text-[10px]"></i>
             </button>
             ${!u.isSuperAdmin ? `<button onclick="confirmDeleteUser('${u.id}', '${u.email}')" class="px-2 py-1 bg-red-900/30 hover:bg-red-700/50 border border-red-800 rounded text-red-400 hover:text-red-200 text-xs flex items-center gap-2 transition ml-2">Delete <i class="fa-solid fa-trash text-[10px]"></i></button>` : ''}
           </td>
           <td class="px-4 py-3 text-slate-400">${new Date(u.createdAt).toLocaleDateString()}</td>
           <td class="px-4 py-3 font-mono text-slate-400 text-[10px]">${u.id}</td>
         </tr>
       `).join('');
    }
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

  // Global function for the onclick attribute
  window.openEditUserLimitsModal = function(userId, apiLimit, readLimit, writeLimit, lockoutMinutes) {
    document.getElementById('editLimitsUserId').value = userId;
    document.getElementById('editApiLimit').value = apiLimit;
    document.getElementById('editReadLimit').value = readLimit;
    document.getElementById('editWriteLimit').value = writeLimit;
    document.getElementById('editLockoutMinutes').value = lockoutMinutes;
    document.getElementById('editUserLimitsModal').classList.remove('hidden');
  };

  window.confirmDeleteUser = async function(userId, email) {
    if (!confirm(`Are you sure you want to delete user "${email}"?\n\nThis will permanently delete ALL their projects, collections, and documents.`)) return;
    try {
      await apiRequest(`/api/v1/admin/users/${userId}`, 'DELETE');
      showToast(`User "${email}" deleted successfully.`, 'success');
      loadAdminStats();
    } catch (err) {
      showToast(`Error deleting user: ${err.message}`, 'error');
    }
  };

  const closeEditLimits = () => {
    document.getElementById('editUserLimitsModal').classList.add('hidden');
  };

  document.getElementById('closeEditUserLimitsBtn')?.addEventListener('click', closeEditLimits);
  document.getElementById('cancelEditUserLimitsBtn')?.addEventListener('click', closeEditLimits);

  document.getElementById('saveUserLimitsBtn')?.addEventListener('click', async () => {
    const userId = document.getElementById('editLimitsUserId').value;
    const apiLimit = parseInt(document.getElementById('editApiLimit').value, 10);
    const readLimit = parseInt(document.getElementById('editReadLimit').value, 10);
    const writeLimit = parseInt(document.getElementById('editWriteLimit').value, 10);
    const lockoutMinutes = parseInt(document.getElementById('editLockoutMinutes').value, 10);
    const resetLockout = document.getElementById('editResetLockout').checked;

    if (!isNaN(apiLimit) && !isNaN(readLimit) && !isNaN(writeLimit) && !isNaN(lockoutMinutes)) {
      try {
        const res = await fetch(`${state.baseUrl}/api/v1/admin/users/${userId}/limits`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.accessToken}`
          },
          body: JSON.stringify({ apiLimit, readLimit, writeLimit, lockoutMinutes, resetLockout })
        });
        const json = await res.json();
        if (json.success) {
          showToast('User limits updated!', 'success');
          closeEditLimits();
          loadAdminStats(); // refresh the table
        } else {
          showToast('Failed to update limit: ' + json.message, 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    }
  });

  document.getElementById('addUserBtn')?.addEventListener('click', async () => {
    const email = prompt('Enter email for the new user:');
    if (!email) return;
    const password = prompt('Enter password for the new user:');
    if (!password) return;
    const isSuperAdmin = confirm('Make this user a Super Admin?');

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, isSuperAdmin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast('User created successfully!', 'success');
      loadAdminStats(); // Refresh user list
    } catch (err) {
      showToast(`Error creating user: ${err.message}`, 'error');
    }
  });

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

async function fetchProjectUsers() {
  if (!state.activeProject) return;
  const tbody = document.getElementById('projectUsersTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-center text-slate-500">Loading users...</td></tr>';
  
  try {
    const users = await apiRequest('/api/v1/project-auth/users', 'GET') || [];
    
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-center text-slate-500">No users found for this project.</td></tr>';
      return;
    }
    
    tbody.innerHTML = users.map(u => `
      <tr class="hover:bg-[#282828] transition">
        <td class="px-4 py-2 font-medium text-white">${u.email || '-'}</td>
        <td class="px-4 py-2 text-slate-400 capitalize">${u.provider || 'email'}</td>
        <td class="px-4 py-2 text-slate-400">${new Date(u.createdAt).toLocaleDateString()}</td>
        <td class="px-4 py-2 text-slate-400">${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}</td>
        <td class="px-4 py-2 text-slate-500 font-mono text-[10px]">${u.id}</td>
        <td class="px-4 py-2">
          <button onclick="deleteProjectUser('${u.id}')" class="text-red-400 hover:text-red-300 transition" title="Delete User">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-4 text-center text-red-400">Error loading users: ${err.message}</td></tr>`;
  }
}

async function deleteProjectUser(userId) {
  if (!state.activeProject) return;
  if (!confirm('Are you sure you want to delete this user from the project? This cannot be undone.')) return;
  
  try {
    const json = await apiRequest(`/api/v1/project-auth/users/${userId}`, 'DELETE');
    if (json && json.success) {
      showToast('User deleted successfully.', 'success');
      fetchProjectUsers();
    } else {
      showToast((json && json.message) ? json.message : 'Failed to delete user.', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

function setupAuthSubTabs() {
  const tabBtns = ['users', 'signin', 'templates'];
  
  tabBtns.forEach(tab => {
    const btn = document.getElementById(`authTabBtn-${tab}`);
    if (!btn) return;
    
    btn.addEventListener('click', () => {
      tabBtns.forEach(t => {
        const b = document.getElementById(`authTabBtn-${t}`);
        if (b) {
          b.classList.remove('text-blue-400', 'border-blue-400');
          b.classList.add('text-slate-400', 'border-transparent');
        }
        
        const view = document.getElementById(`authView-${t}`);
        if (view) {
          view.classList.add('hidden');
          view.classList.remove('block');
        }
      });
      
      btn.classList.add('text-blue-400', 'border-blue-400');
      btn.classList.remove('text-slate-400', 'border-transparent');
      
      const targetView = document.getElementById(`authView-${tab}`);
      if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('block');
      }

      if (tab === 'users') {
        fetchProjectUsers();
      }
    });
  });

  const refreshBtn = document.getElementById('refreshProjectUsersBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', fetchProjectUsers);
  }
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
  setupAuthSubTabs();

  // Initial state check
  updateAuthUI();
});

// ── Auth Config Management ───────────────────────────────────────────────────

let currentAuthConfig = { email: false, google: false, github: false, apple: false };

async function loadAuthConfig() {
  if (!state.activeProject) {
    showToast('Select a project from the top dropdown to view its Auth Config.', 'error');
    return;
  }
  try {
    const res = await fetch(`${state.baseUrl}/api/v1/projects/${state.activeProject.id}/auth-config`, {
      headers: { 'Authorization': `Bearer ${state.accessToken}` }
    });
    const json = await res.json();
    if (json.success && json.data) {
      currentAuthConfig = { ...currentAuthConfig, ...json.data };
    }
    renderAuthConfig();
  } catch (err) {
    showToast(`Error loading auth config: ${err.message}`, 'error');
  }
}

function renderAuthConfig() {
  const providers = ['email', 'google', 'github', 'apple'];
  providers.forEach(p => {
    const toggleEl = document.getElementById(`authToggle-${p}`);
    const knobEl = document.getElementById(`authKnob-${p}`);
    if (toggleEl && knobEl) {
      const isEnabled = currentAuthConfig[p]?.enabled === true || currentAuthConfig[p] === true;
      if (isEnabled) {
        toggleEl.classList.remove('bg-slate-600');
        toggleEl.classList.add('bg-brand-500');
        knobEl.classList.remove('translate-x-0');
        knobEl.classList.add('translate-x-4');
      } else {
        toggleEl.classList.remove('bg-brand-500');
        toggleEl.classList.add('bg-slate-600');
        knobEl.classList.remove('translate-x-4');
        knobEl.classList.add('translate-x-0');
      }
    }
  });

  const tmplVerify = document.getElementById('templateVerification');
  const tmplReset = document.getElementById('templateReset');
  if (tmplVerify) tmplVerify.value = currentAuthConfig.templates?.verification || '';
  if (tmplReset) tmplReset.value = currentAuthConfig.templates?.reset || '';
}

window.toggleAuthProvider = async function(provider) {
  if (!state.activeProject) {
    showToast('Please select a project first.', 'error');
    return;
  }
  
  const isEnabled = currentAuthConfig[provider]?.enabled === true || currentAuthConfig[provider] === true;
  
  // If we are enabling an OAuth provider (not email)
  if (!isEnabled && provider !== 'email') {
    const modal = document.getElementById('oauthModal');
    const title = document.getElementById('oauthModalTitle');
    const secretContainer = document.getElementById('oauthSecretContainer');
    const clientIdInput = document.getElementById('oauthClientId');
    const clientSecretInput = document.getElementById('oauthClientSecret');
    
    title.textContent = `Configure ${provider.charAt(0).toUpperCase() + provider.slice(1)}`;
    clientIdInput.value = currentAuthConfig[provider]?.clientId || '';
    clientSecretInput.value = currentAuthConfig[provider]?.clientSecret || '';
    
    if (provider === 'github') {
      secretContainer.classList.remove('hidden');
    } else {
      secretContainer.classList.add('hidden');
    }
    
    modal.classList.remove('hidden');
    
    const saveHandler = async () => {
      const clientId = clientIdInput.value.trim();
      const clientSecret = clientSecretInput.value.trim();
      
      if (!clientId) {
        showToast('Client ID is required.', 'warning');
        return;
      }
      
      const newConfig = { 
        ...currentAuthConfig, 
        [provider]: { enabled: true, clientId, clientSecret }
      };
      
      await saveAuthConfig(provider, newConfig, true);
      
      modal.classList.add('hidden');
      cleanupModal();
    };
    
    const cancelHandler = () => {
      modal.classList.add('hidden');
      cleanupModal();
    };
    
    const cleanupModal = () => {
      document.getElementById('oauthModalSaveBtn').removeEventListener('click', saveHandler);
      document.getElementById('oauthModalCancelBtn').removeEventListener('click', cancelHandler);
    };
    
    document.getElementById('oauthModalSaveBtn').addEventListener('click', saveHandler);
    document.getElementById('oauthModalCancelBtn').addEventListener('click', cancelHandler);
    return;
  }
  
  // For email, or turning OFF an OAuth provider
  let newState;
  if (provider === 'email') {
    newState = !isEnabled;
  } else {
    newState = { ...(currentAuthConfig[provider] || {}), enabled: false };
  }
  
  const newConfig = { ...currentAuthConfig, [provider]: newState };
  await saveAuthConfig(provider, newConfig, !isEnabled);
}

async function saveAuthConfig(provider, newConfig, isEnabling) {
  const oldConfig = { ...currentAuthConfig };
  
  // Optimistic update
  currentAuthConfig = newConfig;
  renderAuthConfig();
  
  try {
    const res = await fetch(`${state.baseUrl}/api/v1/projects/${state.activeProject.id}/auth-config`, {
      method: 'PATCH',
      headers: { 
        'Authorization': `Bearer ${state.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ authConfig: newConfig })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    showToast(`${provider} authentication ${isEnabling ? 'enabled' : 'disabled'}.`, 'success');
  } catch (err) {
    currentAuthConfig = oldConfig;
    renderAuthConfig();
    showToast(`Error updating auth config: ${err.message}`, 'error');
  }
}

document.getElementById('saveTemplatesBtn')?.addEventListener('click', async () => {
  if (!state.activeProject) return;
  
  const tmplVerify = document.getElementById('templateVerification').value;
  const tmplReset = document.getElementById('templateReset').value;
  
  const newConfig = { 
    ...currentAuthConfig, 
    templates: { verification: tmplVerify, reset: tmplReset }
  };
  
  try {
    const res = await fetch(`${state.baseUrl}/api/v1/projects/${state.activeProject.id}/auth-config`, {
      method: 'PATCH',
      headers: { 
        'Authorization': `Bearer ${state.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ authConfig: newConfig })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    
    currentAuthConfig = newConfig;
    showToast('Templates saved successfully.', 'success');
  } catch (err) {
    showToast(`Error saving templates: ${err.message}`, 'error');
  }
});
