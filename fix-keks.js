const crypto = require('crypto');
const db = require('better-sqlite3')('aegis.db.restored');

const keks = [
  'aegisdb_dev_secret_for_testing_only_must_be_at_least_32_chars_long_abc123',
  'aegisdb_default_master_encryption_key_32_chars',
  'master_fallback_key_32_bytes_long!!'
];

function getKekBuffer(secret) {
  return Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.from('aegis-kek-salt'), Buffer.from('aegis-kek-info'), 32));
}

const targetKekSecret = process.env.JWT_SECRET || 'aegisdb_dev_secret_for_testing_only_must_be_at_least_32_chars_long_abc123';
const targetKek = getKekBuffer(targetKekSecret);

const rows = db.prepare('SELECT projectId, dekEncrypted, dekIv, dekTag FROM project_keys').all();

for (const row of rows) {
  let dek = null;
  for (const secret of keks) {
    try {
      const kek = getKekBuffer(secret);
      const decipher = crypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(row.dekIv, 'hex'));
      decipher.setAuthTag(Buffer.from(row.dekTag, 'hex'));
      dek = Buffer.concat([decipher.update(Buffer.from(row.dekEncrypted, 'hex')), decipher.final()]);
      break; // found it
    } catch(e) {}
  }
  
  if (dek) {
    // re-encrypt with targetKek
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', targetKek, iv);
    const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    
    db.prepare('UPDATE project_keys SET dekEncrypted = ?, dekIv = ?, dekTag = ? WHERE projectId = ?').run(
      encrypted.toString('hex'), iv.toString('hex'), tag.toString('hex'), row.projectId
    );
    console.log('Fixed project', row.projectId);
  } else {
    console.error('Could not decrypt DEK for project', row.projectId);
  }
}
