import { Database } from 'better-sqlite3';
import * as path from 'path';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';

dotenv.config();

async function run() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: npm run reset-admin <admin-email> <new-password>');
    process.exit(1);
  }

  const [email, newPassword] = args;

  if (newPassword.length < 8) {
    console.error('Error: New password must be at least 8 characters long.');
    process.exit(1);
  }

  const pepper = process.env.EMAIL_HASH_PEPPER;
  if (!pepper) {
    console.error('Error: EMAIL_HASH_PEPPER is missing in .env');
    process.exit(1);
  }

  try {
    const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'aegis.db');
    const sqlite = require('better-sqlite3');
    const db = new sqlite(dbPath);

    // Verify user exists
    const cleanEmail = email.trim().toLowerCase();
    const emailHash = crypto.createHmac('sha256', pepper).update(cleanEmail).digest('hex');
    const user = db.prepare('SELECT id, isSuperAdmin FROM users WHERE emailHash = ?').get(emailHash) as any;

    if (!user) {
      console.error(`Error: No account found with email ${cleanEmail}`);
      db.close();
      process.exit(1);
    }

    const ARGON2_OPTIONS = {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    };
    const newPasswordHash = await argon2.hash(newPassword, ARGON2_OPTIONS as any);

    const stmt = db.prepare('UPDATE users SET passwordHash = ?, lockedUntil = NULL, status = \'active\', updatedAt = ? WHERE id = ?');
    stmt.run(newPasswordHash, new Date().toISOString(), user.id);

    db.close();
    console.log(`✅ Success: Password for ${cleanEmail} (Super Admin: ${Boolean(user.isSuperAdmin)}) has been reset.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to reset password:', err);
    process.exit(1);
  }
}

run();
