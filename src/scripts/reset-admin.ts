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

    // Verify user exists and is Super Admin
    const emailHash = crypto.createHmac('sha256', pepper).update(email).digest('hex');
    const user = db.prepare('SELECT id FROM users WHERE emailHash = ? AND isSuperAdmin = 1').get(emailHash);

    if (!user) {
      console.error(`Error: No Super Admin account found with email ${email}`);
      db.close();
      process.exit(1);
    }

    const newPasswordHash = await argon2.hash(newPassword);

    const stmt = db.prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?');
    stmt.run(newPasswordHash, new Date().toISOString(), user.id);

    db.close();
    console.log(`✅ Success: Super Admin password for ${email} has been reset.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to reset password:', err);
    process.exit(1);
  }
}

run();
