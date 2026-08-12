import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { getDb } from '../db/sqlite.connection';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export class ProjectBackupService {
  private backupDir = path.join(process.cwd(), 'backups', 'projects');
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    this.startScheduler();
  }

  async exportProjectJson(projectId: string, ownerId: string): Promise<string> {
    const db = getDb();
    
    // Validate project ownership
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND ownerId = ?').get(projectId, ownerId) as any;
    if (!project) throw new Error('Project not found or unauthorized');

    // Get collections
    const collections = db.prepare('SELECT name, schema, rules FROM collections WHERE projectId = ?').all(projectId) as any[];
    
    const exportData = {
      project: { id: project.id, name: project.name },
      collections: [] as any[]
    };

    for (const col of collections) {
      const docs = db.prepare('SELECT id, data, createdAt, updatedAt FROM documents WHERE projectId = ? AND collectionName = ?').all(projectId, col.name) as any[];
      exportData.collections.push({
        name: col.name,
        schema: col.schema,
        rules: col.rules,
        documents: docs.map(d => ({
          id: d.id,
          data: JSON.parse(d.data),
          createdAt: d.createdAt,
          updatedAt: d.updatedAt
        }))
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `project-${projectId}-${timestamp}.json`;
    const tempFile = path.join(this.backupDir, filename);
    const gzipFile = `${tempFile}.gz`;

    fs.writeFileSync(tempFile, JSON.stringify(exportData, null, 2));

    await new Promise<void>((resolve, reject) => {
      const gzip = zlib.createGzip();
      const source = fs.createReadStream(tempFile);
      const destination = fs.createWriteStream(gzipFile);
      source.pipe(gzip).pipe(destination);
      destination.on('finish', () => {
        fs.unlinkSync(tempFile);
        resolve();
      });
      destination.on('error', (err) => reject(err));
    });

    let backupConfig = project.backupConfig ? JSON.parse(project.backupConfig) : null;
    let s3Status = 'none';
    const now = new Date().toISOString();
    
    if (backupConfig && backupConfig.s3BucketName && backupConfig.s3Region && backupConfig.s3AccessKey && backupConfig.s3SecretKey) {
      try {
        const s3Client = new S3Client({
          region: backupConfig.s3Region,
          credentials: {
            accessKeyId: backupConfig.s3AccessKey,
            secretAccessKey: backupConfig.s3SecretKey
          }
        });
        const fileStream = fs.createReadStream(gzipFile);
        await s3Client.send(new PutObjectCommand({
          Bucket: backupConfig.s3BucketName,
          Key: `backups/project-${projectId}/${path.basename(gzipFile)}`,
          Body: fileStream,
          ContentType: 'application/gzip'
        }));
        console.log(`✅ Uploaded project backup to S3: ${path.basename(gzipFile)}`);
        s3Status = 'success';
      } catch (s3Err) {
        console.error('❌ Failed to upload project backup to S3:', s3Err);
        s3Status = 'failed';
      }
    }

    // Save status
    if (!backupConfig) backupConfig = {};
    backupConfig.lastBackupAt = now;
    backupConfig.lastBackupStatus = 'success';
    backupConfig.lastBackupS3Status = s3Status;
    
    if (s3Status === 'success') {
      backupConfig.lastBackupS3Url = `s3://${backupConfig.s3BucketName}/backups/project-${projectId}/${path.basename(gzipFile)}`;
    } else {
      backupConfig.lastBackupS3Url = null;
    }
    
    // Project backups are always kept locally since the user initiates download from the same gzip file
    backupConfig.lastBackupLocation = gzipFile;

    db.prepare('UPDATE projects SET backupConfig = ? WHERE id = ?').run(JSON.stringify(backupConfig), projectId);

    return gzipFile;
  }

  /**
   * Start scheduled project backup job (every hour, checks if backup is needed)
   */
  startScheduler(): void {
    if (this.schedulerInterval) return;
    
    const tickIntervalMs = 60 * 60 * 1000; // Check every hour
    this.schedulerInterval = setInterval(async () => {
      const db = getDb();
      const projects = db.prepare('SELECT id, ownerId, backupConfig FROM projects WHERE backupConfig IS NOT NULL').all() as any[];
      
      for (const project of projects) {
        try {
          const config = JSON.parse(project.backupConfig);
          // If no automated S3 credentials, skip automated backup
          if (!config.s3BucketName) continue;

          const lastBackupMs = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0;
          const intervalMs = 24 * 60 * 60 * 1000; // Default to daily automated backups for projects
          const now = Date.now();
          
          if (now - lastBackupMs >= intervalMs) {
            console.log(`⏰ Triggering automated scheduled backup for project ${project.id}...`);
            await this.exportProjectJson(project.id, project.ownerId);
          }
        } catch (err) {
          console.error(`❌ Automated project backup failed for project ${project.id}:`, err);
          try {
             let config = project.backupConfig ? JSON.parse(project.backupConfig) : {};
             config.lastBackupAt = new Date().toISOString();
             config.lastBackupStatus = 'failed';
             config.lastBackupS3Status = 'none';
             db.prepare('UPDATE projects SET backupConfig = ? WHERE id = ?').run(JSON.stringify(config), project.id);
          } catch(e){}
        }
      }
    }, tickIntervalMs);
  }

  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }
}

export const projectBackupService = new ProjectBackupService();
