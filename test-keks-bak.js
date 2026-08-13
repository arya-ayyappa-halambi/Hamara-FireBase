const crypto = require('crypto');
const db = require('better-sqlite3')('aegis.db.bak');

function getKekBuffer(secret) {
  return Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.from('aegis-kek-salt'), Buffer.from('aegis-kek-info'), 32));
}

const targetKekSecret = process.env.JWT_SECRET || 'aegisdb_dev_secret_for_testing_only_must_be_at_least_32_chars_long_abc123';
const targetKek = getKekBuffer(targetKekSecret);

const rows = db.prepare('SELECT projectId, dekEncrypted, dekIv, dekTag FROM project_keys').all();

for (const row of rows) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', targetKek, Buffer.from(row.dekIv, 'hex'));
    decipher.setAuthTag(Buffer.from(row.dekTag, 'hex'));
    Buffer.concat([decipher.update(Buffer.from(row.dekEncrypted, 'hex')), decipher.final()]);
    console.log('✅ Project', row.projectId, 'is unified.');
  } catch(e) {
    console.error('❌ Project', row.projectId, 'is NOT unified (auth tag mismatch).');
  }
}
