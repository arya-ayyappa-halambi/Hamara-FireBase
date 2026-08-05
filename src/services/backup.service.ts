import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { getDb } from '../db/sqlite.connection';

export interface BackupStatus {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export class BackupService {
  private backupDir = path.join(process.cwd(), 'backups');
  private retentionCount = 10;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    // Start automated daily backup (every 24 hours)
    this.startScheduler();
  }

  /**
   * Run dynamic non-blocking backup of the current database.
   */
  async createBackup(): Promise<BackupStatus> {
    const db = getDb();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempFile = path.join(this.backupDir, `backup-${timestamp}.db`);
    const gzipFile = `${tempFile}.gz`;

    try {
      // 1. Perform non-blocking online backup using better-sqlite3 backup API
      await db.backup(tempFile);

      // 2. Compress the backup using zlib Gzip
      await new Promise<void>((resolve, reject) => {
        const gzip = zlib.createGzip();
        const source = fs.createReadStream(tempFile);
        const destination = fs.createWriteStream(gzipFile);

        source.pipe(gzip).pipe(destination);
        destination.on('finish', () => {
          // Remove uncompressed temp file
          fs.unlinkSync(tempFile);
          resolve();
        });
        destination.on('error', (err) => reject(err));
      });

      // 3. Enforce retention policy
      this.enforceRetention();

      const stats = fs.statSync(gzipFile);
      return {
        filename: path.basename(gzipFile),
        sizeBytes: stats.size,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (fs.existsSync(gzipFile)) fs.unlinkSync(gzipFile);
      throw error;
    }
  }

  /**
   * List all stored backups.
   */
  listBackups(): BackupStatus[] {
    if (!fs.existsSync(this.backupDir)) return [];
    const files = fs.readdirSync(this.backupDir);
    return files
      .filter((f) => f.endsWith('.db.gz'))
      .map((f) => {
        const fp = path.join(this.backupDir, f);
        const stats = fs.statSync(fp);
        return {
          filename: f,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Enforce retention policy: delete backups older than retentionCount limit.
   */
  private enforceRetention(): void {
    const backups = this.listBackups();
    if (backups.length > this.retentionCount) {
      const toDelete = backups.slice(this.retentionCount);
      for (const b of toDelete) {
        try {
          fs.unlinkSync(path.join(this.backupDir, b.filename));
          console.log(`🧹 Deleted old database backup: ${b.filename}`);
        } catch (e) {
          console.error(`Failed to delete old backup ${b.filename}:`, e);
        }
      }
    }
  }

  /**
   * Start scheduled backup job.
   */
  startScheduler(): void {
    if (this.schedulerInterval) return;
    // 24 hour interval
    const intervalMs = 24 * 60 * 60 * 1000;
    this.schedulerInterval = setInterval(async () => {
      try {
        console.log('⏰ Triggering automated scheduled database backup...');
        const backup = await this.createBackup();
        console.log(`✅ Automated backup successful: ${backup.filename} (${backup.sizeBytes} bytes)`);
      } catch (err) {
        console.error('❌ Automated database backup failed:', err);
      }
    }, intervalMs);
  }

  /**
   * Stop scheduled backup job.
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }
}

export const backupService = new BackupService();
