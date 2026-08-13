import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { getDb } from '../db/sqlite.connection';

export class RestoreService {
  async restoreBackup(gzipPath: string, passkey: string): Promise<void> {
    const tempDir = path.join(process.cwd(), 'backups', 'temp_restore');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const extractPath = path.join(tempDir, `restore_${Date.now()}.db`);

    try {
      // 1. Decompress
      await new Promise<void>((resolve, reject) => {
        const source = fs.createReadStream(gzipPath);
        const destination = fs.createWriteStream(extractPath);
        const gunzip = zlib.createGunzip();

        source.pipe(gunzip).pipe(destination);
        destination.on('finish', () => resolve());
        destination.on('error', (err) => reject(err));
        gunzip.on('error', (err) => reject(err));
      });

      // 2. Validate SQLite Header
      const header = Buffer.alloc(16);
      const fd = fs.openSync(extractPath, 'r');
      fs.readSync(fd, header, 0, 16, 0);
      fs.closeSync(fd);
      
      const magicString = header.toString('utf8', 0, 15);
      if (magicString !== 'SQLite format 3') {
        throw new Error('Invalid backup file: Not a valid SQLite database.');
      }

      // 3. Cryptographic Proof (Verify passkey)
      const tempDb = new Database(extractPath, { readonly: true });
      let systemKeyRow;
      try {
        systemKeyRow = tempDb.prepare('SELECT dekEncrypted, dekIv, dekTag FROM system_keys WHERE id = ?').get('SYSTEM') as any;
      } catch (err) {
        tempDb.close();
        throw new Error('Invalid backup file: Missing schema (system_keys).');
      }

      if (systemKeyRow) {
        // Attempt decryption
        const kek = Buffer.from(crypto.hkdfSync('sha256', passkey, Buffer.from('aegis-kek-salt'), Buffer.from('aegis-kek-info'), 32));
        try {
          const decipher = crypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(systemKeyRow.dekIv, 'hex'));
          decipher.setAuthTag(Buffer.from(systemKeyRow.dekTag, 'hex'));
          Buffer.concat([decipher.update(Buffer.from(systemKeyRow.dekEncrypted, 'hex')), decipher.final()]);
        } catch (decErr) {
          tempDb.close();
          throw new Error('Cryptographic Proof Failed: The provided passkey is incorrect and cannot decrypt this backup.');
        }
      }
      tempDb.close();

      // 4. Atomic Swap
      const activeDb = getDb();
      activeDb.close();

      const activeDbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'aegis.db');
      fs.copyFileSync(extractPath, activeDbPath);
      
      this.updateEnvVariable('ENCRYPTION_KEY', passkey);
      
      fs.unlinkSync(extractPath);
      fs.unlinkSync(gzipPath);

      // Force restart to cleanly reload connection and env
      setTimeout(() => process.exit(0), 1000);

    } catch (err) {
      if (fs.existsSync(extractPath)) fs.unlinkSync(extractPath);
      throw err;
    }
  }

  private updateEnvVariable(key: string, value: string) {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
      } else {
        content += `\n${key}=${value}\n`;
      }
      fs.writeFileSync(envPath, content);
    }
  }
}

export const restoreService = new RestoreService();
