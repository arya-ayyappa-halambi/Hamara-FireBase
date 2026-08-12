import re

with open('public/index.html', 'r') as f:
    html = f.read()

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
        Never lose data with AegisDB's dual-target backup system. Backups are automatically scheduled and securely encrypted using AES-256 before being transmitted to both the Local File System and an external AWS S3-compatible cloud storage provider.
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
            <p class="text-xs text-slate-400">Comprehensive guide to configuring, monitoring, and restoring AegisDB backups.</p>
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
            Local backups provide the fastest recovery time objective (RTO). AegisDB automatically takes atomic snapshots of the SQLite database and stores them in a highly compressed format.
          </p>
          <div class="bg-slate-950 border border-white/5 rounded-xl p-5 space-y-3">
            <div class="flex items-start space-x-3">
              <div class="w-6 h-6 rounded bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5"><i class="fa-solid fa-gear text-xs"></i></div>
              <div>
                <strong class="text-white block mb-1">Configuration</strong>
                <p class="text-slate-400 text-xs">Enable the <code>Local Drive Setup</code> toggle in the Backup Configuration panel. Specify the absolute directory path where backups should be stored (e.g., <code>/var/aegisdb/backups</code>). Ensure the Node.js process has write permissions to this directory.</p>
              </div>
            </div>
            <div class="flex items-start space-x-3">
              <div class="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5"><i class="fa-solid fa-rotate-left text-xs"></i></div>
              <div>
                <strong class="text-white block mb-1">Retrieval & Restoration</strong>
                <p class="text-slate-400 text-xs">Local backups are stored as <code>.sqlite3.bak</code> files. To restore, stop the AegisDB service, replace the primary <code>aegis.db</code> file with the desired backup file, and restart the service.</p>
                <code class="block mt-2 bg-black/50 text-emerald-300 p-2 rounded text-[11px] font-mono border border-white/10">cp /var/aegisdb/backups/aegis_20260812.sqlite3.bak ./aegis.db<br>npm run start</code>
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
                <p class="text-slate-400 text-xs">Enable the <code>S3 Setup</code> toggle. You must provide the <strong>Bucket Name</strong>, <strong>Region</strong>, <strong>Access Key ID</strong>, and <strong>Secret Access Key</strong>. AegisDB requires <code>s3:PutObject</code> and <code>s3:ListBucket</code> IAM permissions.</p>
              </div>
            </div>
            <div class="flex items-start space-x-3">
              <div class="w-6 h-6 rounded bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 mt-0.5"><i class="fa-solid fa-download text-xs"></i></div>
              <div>
                <strong class="text-white block mb-1">Retrieval & Restoration</strong>
                <p class="text-slate-400 text-xs">To restore from S3, use the AWS CLI to download the backup file to your server, then replace the primary database file.</p>
                <code class="block mt-2 bg-black/50 text-emerald-300 p-2 rounded text-[11px] font-mono border border-white/10">aws s3 cp s3://your-bucket-name/aegis_backup.sqlite3.bak ./aegis.db<br>npm run start</code>
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
            Use the <strong>Interval Dropdown</strong> to schedule automatic backups (e.g., Every 1 Hour, Daily, Weekly). AegisDB uses a built-in cron scheduler. 
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

html = html.replace('  <!-- Create Project Modal -->', modals + '\n\n  <!-- Create Project Modal -->')
with open('public/index.html', 'w') as f:
    f.write(html)
