import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { getDb } from '../db/sqlite.connection';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

export interface BackupStatus {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  location?: string;
  s3Url?: string;
}

export class BackupService {
  private backupDir = path.join(process.cwd(), 'backups');
  private schedulerInterval: NodeJS.Timeout | null = null;
  private lastBackupTime: number = 0;

  constructor() {
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    // Start automated tick-based scheduler
    this.startScheduler();
  }

  private getConfig() {
    const db = getDb();
    const config = db.prepare('SELECT * FROM platform_settings WHERE id = ?').get('default') as any;
    return config || { backupMode: 'none', backupIntervalMinutes: 1440 };
  }

  /**
   * Run dynamic non-blocking backup of the current database.
   */
  async createBackup(): Promise<BackupStatus | null> {
    const config = this.getConfig();
    if (config.backupMode === 'none') return null;

    const db = getDb();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempFile = path.join(this.backupDir, `backup-${timestamp}.db`);
    const gzipFile = `${tempFile}.gz`;

    const now = new Date().toISOString();
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

      let s3Status = 'none';

      // 3. Handle S3 Upload
      if (config.backupMode === 's3' || config.backupMode === 'both') {
        if (config.s3BucketName && config.s3Region && config.s3AccessKey && config.s3SecretKey) {
          try {
            const s3Client = new S3Client({
              region: config.s3Region,
              credentials: {
                accessKeyId: config.s3AccessKey,
                secretAccessKey: config.s3SecretKey
              }
            });
            const fileStream = fs.createReadStream(gzipFile);
            await s3Client.send(new PutObjectCommand({
              Bucket: config.s3BucketName,
              Key: `backups/${path.basename(gzipFile)}`,
              Body: fileStream
            }));
            console.log(`✅ Uploaded backup to S3: ${path.basename(gzipFile)}`);
            s3Status = 'success';
          } catch (s3Err) {
            console.error('❌ Failed to upload backup to S3:', s3Err);
            s3Status = 'failed';
          }
        } else {
          console.error('⚠️ S3 Backup configured but credentials are missing in platform_settings.');
          s3Status = 'failed';
        }
      }

      const stats = fs.statSync(gzipFile);
      const s3Url = s3Status === 'success' ? `s3://${config.s3BucketName}/backups/${path.basename(gzipFile)}` : null;
      const location = config.backupMode === 's3' ? null : gzipFile;

      const backupStatus: BackupStatus = {
        filename: path.basename(gzipFile),
        sizeBytes: stats.size,
        createdAt: now,
        location: location || undefined,
        s3Url: s3Url || undefined
      };

      // 4. Handle retention & local cleanup
      if (config.backupMode === 's3') {
        // If s3 only, delete the local file to save space
        if (fs.existsSync(gzipFile)) {
          fs.unlinkSync(gzipFile);
        }
      }
      
      // Enforce time-based retention policy for both local and S3
      await this.enforceRetention(config);
      
      this.lastBackupTime = Date.now();
      
      // Update database status
      db.prepare(`UPDATE platform_settings SET lastBackupAt = ?, lastBackupStatus = ?, lastBackupS3Status = ?, lastBackupLocation = ?, lastBackupS3Url = ? WHERE id = 'default'`).run(now, 'success', s3Status, location, s3Url);

      return backupStatus;

    } catch (error) {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (fs.existsSync(gzipFile)) fs.unlinkSync(gzipFile);
      
      // Update database status on failure
      db.prepare(`UPDATE platform_settings SET lastBackupAt = ?, lastBackupStatus = ?, lastBackupS3Status = ? WHERE id = 'default'`).run(now, 'failed', 'none');
      
      throw error;
    }
  }

  /**
   * List all stored backups locally.
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
   * Enforce retention policy based on time for Local and S3 backups.
   */
  private async enforceRetention(config: any): Promise<void> {
    const retentionDays = config.backupRetentionDays || 7;
    const thresholdTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    // 1. Clean up local backups
    if (config.backupMode === 'local' || config.backupMode === 'both') {
      const backups = this.listBackups();
      // Keep at least the newest backup
      if (backups.length > 1) {
        for (let i = 1; i < backups.length; i++) {
          const b = backups[i];
          const bTime = new Date(b.createdAt).getTime();
          if (bTime < thresholdTime) {
            try {
              fs.unlinkSync(path.join(this.backupDir, b.filename));
              console.log(`🧹 Deleted old local database backup: ${b.filename}`);
            } catch (e) {
              console.error(`Failed to delete old local backup ${b.filename}:`, e);
            }
          }
        }
      }
    }

    // 2. Clean up S3 backups
    if ((config.backupMode === 's3' || config.backupMode === 'both') && 
        config.s3BucketName && config.s3Region && config.s3AccessKey && config.s3SecretKey) {
      try {
        const s3Client = new S3Client({
          region: config.s3Region,
          credentials: {
            accessKeyId: config.s3AccessKey,
            secretAccessKey: config.s3SecretKey
          }
        });
        
        // List objects in 'backups/' prefix
        const listRes = await s3Client.send(new ListObjectsV2Command({
          Bucket: config.s3BucketName,
          Prefix: 'backups/'
        }));
        
        if (listRes.Contents && listRes.Contents.length > 1) {
          // Sort descending by LastModified
          const s3Objects = listRes.Contents
            .filter(obj => obj.Key?.endsWith('.db.gz'))
            .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0));
            
          // Keep at least the newest backup
          for (let i = 1; i < s3Objects.length; i++) {
            const obj = s3Objects[i];
            const objTime = obj.LastModified?.getTime() || 0;
            if (objTime < thresholdTime) {
              await s3Client.send(new DeleteObjectCommand({
                Bucket: config.s3BucketName,
                Key: obj.Key!
              }));
              console.log(`🧹 Deleted old S3 database backup: ${obj.Key}`);
            }
          }
        }
      } catch (e) {
        console.error('Failed to enforce S3 backup retention:', e);
      }
    }
  }

  /**
   * Start scheduled backup job based on tick check.
   */
  startScheduler(): void {
    if (this.schedulerInterval) return;
    
    // Check every minute
    const tickIntervalMs = 60 * 1000;
    this.schedulerInterval = setInterval(async () => {
      const config = this.getConfig();
      if (config.backupMode === 'none') return;
      
      const intervalMs = (config.backupIntervalMinutes || 1440) * 60 * 1000;
      const now = Date.now();
      if (now - this.lastBackupTime >= intervalMs) {
        try {
          console.log('⏰ Triggering automated scheduled database backup...');
          const backup = await this.createBackup();
          if (backup) {
             console.log(`✅ Automated backup successful: ${backup.filename} (${backup.sizeBytes} bytes)`);
          }
        } catch (err) {
          console.error('❌ Automated database backup failed:', err);
        }
      }
    }, tickIntervalMs);
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
