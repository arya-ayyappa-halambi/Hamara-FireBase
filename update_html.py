import re

with open('public/index.html', 'r') as f:
    html = f.read()

# 1. Add c-ind-5 to all existing slides
for i in range(5):
    old_btn_list = f'<button class="c-ind-4 w-4 h-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-all focus:outline-none"></button>'
    if f'c-ind-{i} w-10' in old_btn_list:
         continue
    # Just insert it after c-ind-4 if c-ind-4 is not the active one
    # Wait, c-ind-4 might be active (w-10 bg-purple-500)
    
    # Let's just use regex to find the button list
    pass

# Actually, it's easier to just find the container for the buttons
html = html.replace(
    '<button class="c-ind-4 w-4 h-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-all focus:outline-none"></button>',
    '<button class="c-ind-4 w-4 h-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-all focus:outline-none"></button>\n                  <button class="c-ind-5 w-4 h-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-all focus:outline-none"></button>'
)
html = html.replace(
    '<button class="c-ind-4 w-10 h-1.5 rounded-full bg-purple-500 transition-all focus:outline-none"></button>',
    '<button class="c-ind-4 w-10 h-1.5 rounded-full bg-purple-500 transition-all focus:outline-none"></button>\n                  <button class="c-ind-5 w-4 h-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-all focus:outline-none"></button>'
)

# 2. Add the 6th slide (Slide 5)
new_slide = """
    <!-- Slide 5 -->
    <div class="carousel-slide absolute inset-0 transition-opacity duration-1000 ease-in-out opacity-0 z-0">
      <img src="https://images.unsplash.com/photo-1614064641936-3899d9b73479?q=80&w=2072&auto=format&fit=crop" class="w-full h-full object-cover opacity-60 mix-blend-overlay" />
      <div class="absolute inset-0 bg-gradient-to-r from-[#090d16] via-[#090d16]/90 to-[#090d16]/30 pointer-events-none z-10"></div>
      
      <div class="absolute inset-0 flex">
        <div class="w-1/2"></div>
        <div class="w-1/2 flex flex-col p-10 md:p-14 z-20 pointer-events-auto">
          <div class="flex justify-end w-full">
              <div class="inline-flex items-center space-x-2 bg-purple-500/20 border border-purple-500/30 backdrop-blur-md px-4 py-2 rounded-full shadow-lg">
                <i class="fa-solid fa-cloud-arrow-up text-purple-400"></i>
                <span class="text-sm font-semibold text-purple-300 tracking-wide">Automated Backups</span>
              </div>
            </div>
            
            <div class="m-auto bg-slate-900/60 border border-slate-800 backdrop-blur-md p-10 lg:p-12 rounded-3xl shadow-2xl relative w-full max-w-2xl flex flex-col min-h-[300px] justify-between">
              <div>
                <h2 class="text-3xl lg:text-4xl font-extrabold text-white mb-4 leading-tight">Dual-Target Disaster Recovery.</h2>
                <p class="text-base lg:text-lg text-slate-300 leading-relaxed max-w-xl">Safeguard your data with automated, encrypted snapshots synced instantly to both Local File Systems and AWS S3-compatible object storage.</p>
              </div>
              <div class="flex items-center justify-between mt-8 pt-6 border-t border-slate-800 pointer-events-auto">
                <div class="flex space-x-3">
                  <button class="c-ind-0 w-4 h-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-all focus:outline-none"></button>
                  <button class="c-ind-1 w-4 h-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-all focus:outline-none"></button>
                  <button class="c-ind-2 w-4 h-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-all focus:outline-none"></button>
                  <button class="c-ind-3 w-4 h-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-all focus:outline-none"></button>
                  <button class="c-ind-4 w-4 h-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-all focus:outline-none"></button>
                  <button class="c-ind-5 w-10 h-1.5 rounded-full bg-purple-500 transition-all focus:outline-none"></button>
                </div>
                <div class="flex items-center space-x-3">
                  <button class="btn-prev-slide p-3 rounded-full bg-slate-950 border border-slate-800 hover:bg-slate-900 text-white transition-all focus:outline-none">
                    <i class="fa-solid fa-chevron-left text-purple-400"></i>
                  </button>
                  <button class="btn-next-slide p-3 rounded-full bg-slate-950 border border-slate-800 hover:bg-slate-900 text-white transition-all focus:outline-none">
                    <i class="fa-solid fa-chevron-right text-purple-400"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  </div>

  <!-- FOREGROUND SPLIT -->
"""
html = html.replace('  </div>\n\n  <!-- FOREGROUND SPLIT -->', new_slide)

# 3. Add Feature Card to "About FlareBase"
new_feature = """
            <!-- Feature Card 7 -->
            <div onclick="showFeatureModal('backup')" class="cursor-pointer glass-panel p-6 rounded-2xl border border-white/10 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-teal-500/10 hover:border-teal-500/30 transition-all duration-300 group relative overflow-hidden">
              <div class="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div class="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 text-xl mb-4 group-hover:bg-teal-500 group-hover:text-white transition-colors duration-300">
                <i class="fa-solid fa-cloud-arrow-up"></i>
              </div>
              <h3 class="text-base font-bold text-white mb-2 relative z-10">Dual-Target Backups</h3>
              <p class="text-xs text-slate-400 leading-relaxed relative z-10">Automated disaster recovery via simultaneous snapshots to Local File Systems and AWS S3 endpoints with end-to-end encryption.</p>
            </div>
          </div>
"""
html = html.replace('            </div>\n          </div>\n          \n          <!-- Call to Action / Footer -->', new_feature + '\n          \n          <!-- Call to Action / Footer -->')

# 4. Add the Backup Manual Modal trigger button
trigger_btn = """
                <button id="btn-save-backup-settings" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition active:scale-95">
                  Save Backup Settings
                </button>
                <button onclick="document.getElementById('modal-backup-manual').classList.remove('hidden')" class="px-4 py-2 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 text-xs font-semibold shadow transition active:scale-95">
                  <i class="fa-solid fa-book-open mr-1"></i> Setup & Restore Manual
                </button>
"""
html = html.replace('<button id="btn-save-backup-settings" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition active:scale-95">\n                  Save Backup Settings\n                </button>', trigger_btn)

# 5. Add the modals
modals = """
  <!-- MODAL: Feature Backup -->
  <div id="modal-feature-backup" class="fixed inset-0 z-50 hidden flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="this.parentElement.classList.add('hidden')"></div>
    <div class="glass-panel p-8 rounded-3xl border border-white/10 w-full max-w-md relative z-10 shadow-2xl animate-fade-in text-center space-y-4">
      <div class="w-16 h-16 rounded-2xl bg-teal-500/10 flex items-center justify-center text-teal-400 text-3xl mx-auto mb-2 border border-teal-500/20 shadow-[0_0_30px_rgba(20,184,166,0.3)]">
        <i class="fa-solid fa-cloud-arrow-up"></i>
      </div>
      <h3 class="text-2xl font-bold text-white">Dual-Target Backups</h3>
      <p class="text-sm text-slate-300 leading-relaxed">
        Never lose data with FlareBase's dual-target backup system. Backups are automatically scheduled and securely encrypted using AES-256 before being transmitted to both the Local File System and an external AWS S3-compatible cloud storage provider.
      </p>
      <button onclick="document.getElementById('modal-feature-backup').classList.add('hidden')" class="w-full mt-4 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium transition-colors">
        Close Details
      </button>
    </div>
  </div>

  <!-- MODAL: Backup Manual -->
  <div id="modal-backup-manual" class="fixed inset-0 z-50 hidden flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/80 backdrop-blur-md" onclick="this.parentElement.classList.add('hidden')"></div>
    <div class="glass-panel p-8 rounded-3xl border border-white/10 w-full max-w-4xl relative z-10 shadow-2xl animate-fade-in max-h-[90vh] flex flex-col">
      
      <div class="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 text-xl">
            <i class="fa-solid fa-book-open"></i>
          </div>
          <div>
            <h3 class="text-xl font-bold text-white tracking-tight">Backup & Disaster Recovery Manual</h3>
            <p class="text-xs text-slate-400">Comprehensive guide to configuring, monitoring, and restoring FlareBase backups.</p>
          </div>
        </div>
        <button onclick="document.getElementById('modal-backup-manual').classList.add('hidden')" class="text-slate-400 hover:text-white transition focus:outline-none">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar pr-4 space-y-8 text-sm">
        
        <!-- Local Backups -->
        <div class="space-y-4">
          <h4 class="text-lg font-bold text-white flex items-center space-x-2">
            <i class="fa-solid fa-hard-drive text-indigo-400"></i>
            <span>1. Local File System Backups</span>
          </h4>
          <p class="text-slate-300 leading-relaxed">
            Local backups provide the fastest recovery time objective (RTO). FlareBase automatically takes atomic snapshots of the SQLite database and stores them in a highly compressed format.
          </p>
          <div class="bg-slate-950 border border-white/5 rounded-xl p-5 space-y-3">
            <div class="flex items-start space-x-3">
              <div class="w-6 h-6 rounded bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5"><i class="fa-solid fa-gear text-xs"></i></div>
              <div>
                <strong class="text-white block mb-1">Configuration</strong>
                <p class="text-slate-400 text-xs">Enable the <code>Local Drive Setup</code> toggle in the Backup Configuration panel. Specify the absolute directory path where backups should be stored (e.g., <code>/var/flarebase/backups</code>). Ensure the Node.js process has write permissions to this directory.</p>
              </div>
            </div>
            <div class="flex items-start space-x-3">
              <div class="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5"><i class="fa-solid fa-rotate-left text-xs"></i></div>
              <div>
                <strong class="text-white block mb-1">Retrieval & Restoration</strong>
                <p class="text-slate-400 text-xs">Local backups are stored as <code>.sqlite3.bak</code> files. To restore, stop the FlareBase service, replace the primary <code>flarebase.db</code> file with the desired backup file, and restart the service.</p>
                <code class="block mt-2 bg-black/50 text-emerald-300 p-2 rounded text-[11px] font-mono border border-white/10">cp /var/flarebase/backups/flarebase_20260812.sqlite3.bak ./flarebase.db<br>npm run start</code>
              </div>
            </div>
          </div>
        </div>

        <!-- S3 Backups -->
        <div class="space-y-4">
          <h4 class="text-lg font-bold text-white flex items-center space-x-2">
            <i class="fa-brands fa-aws text-[#FF9900]"></i>
            <span>2. AWS S3 Cloud Backups</span>
          </h4>
          <p class="text-slate-300 leading-relaxed">
            S3 backups provide off-site disaster recovery. Backups are streamed directly to your configured S3 bucket using multipart uploads for maximum reliability.
          </p>
          <div class="bg-slate-950 border border-white/5 rounded-xl p-5 space-y-3">
            <div class="flex items-start space-x-3">
              <div class="w-6 h-6 rounded bg-[#FF9900]/20 flex items-center justify-center text-[#FF9900] shrink-0 mt-0.5"><i class="fa-solid fa-cloud text-xs"></i></div>
              <div>
                <strong class="text-white block mb-1">Configuration</strong>
                <p class="text-slate-400 text-xs">Enable the <code>S3 Setup</code> toggle. You must provide the <strong>Bucket Name</strong>, <strong>Region</strong>, <strong>Access Key ID</strong>, and <strong>Secret Access Key</strong>. FlareBase requires <code>s3:PutObject</code> and <code>s3:ListBucket</code> IAM permissions.</p>
              </div>
            </div>
            <div class="flex items-start space-x-3">
              <div class="w-6 h-6 rounded bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 mt-0.5"><i class="fa-solid fa-download text-xs"></i></div>
              <div>
                <strong class="text-white block mb-1">Retrieval & Restoration</strong>
                <p class="text-slate-400 text-xs">To restore from S3, use the AWS CLI to download the backup file to your server, then replace the primary database file.</p>
                <code class="block mt-2 bg-black/50 text-emerald-300 p-2 rounded text-[11px] font-mono border border-white/10">aws s3 cp s3://your-bucket-name/flarebase_backup.sqlite3.bak ./flarebase.db<br>npm run start</code>
              </div>
            </div>
          </div>
        </div>

        <!-- Scheduling -->
        <div class="space-y-4 pb-4">
          <h4 class="text-lg font-bold text-white flex items-center space-x-2">
            <i class="fa-solid fa-clock text-rose-400"></i>
            <span>3. Automated Scheduling & Status</span>
          </h4>
          <p class="text-slate-300 leading-relaxed">
            Use the <strong>Interval Dropdown</strong> to schedule automatic backups (e.g., Every 1 Hour, Daily, Weekly). FlareBase uses a built-in cron scheduler. 
            You can verify the success of the last backup by checking the <strong>Last Backup Time</strong> and the individual target statuses (Local Status / S3 Status) in the Configuration panel.
          </p>
        </div>

      </div>

      <div class="border-t border-white/10 pt-5 mt-4 flex justify-end">
        <button onclick="document.getElementById('modal-backup-manual').classList.add('hidden')" class="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition border border-white/10">
          Acknowledge & Close
        </button>
      </div>

    </div>
  </div>
"""
html = html.replace('  <!-- MODAL: Add Admin -->', modals + '\n\n  <!-- MODAL: Add Admin -->')

with open('public/index.html', 'w') as f:
    f.write(html)
