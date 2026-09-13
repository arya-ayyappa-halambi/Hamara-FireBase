const crypto = require('crypto');
const db = require('better-sqlite3')('flarebase.db');

const rows = db.prepare('SELECT projectId, dekEncrypted, dekIv, dekTag FROM project_keys').all();

function tryDecrypt(masterSecret, row) {
  try {
    const kek = Buffer.from(crypto.hkdfSync('sha256', masterSecret, Buffer.from('flarebase-kek-salt'), Buffer.from('flarebase-kek-info'), 32));
    const decipher = crypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(row.dekIv, 'hex'));
    decipher.setAuthTag(Buffer.from(row.dekTag, 'hex'));
    Buffer.concat([decipher.update(Buffer.from(row.dekEncrypted, 'hex')), decipher.final()]);
    return true;
  } catch(e) {
    return false;
  }
}

for (const row of rows) {
  if (tryDecrypt('flarebase_default_master_encryption_key_32_chars', row)) {
    console.log(row.projectId, '=> flarebase_default_master_encryption_key_32_chars');
  } else if (tryDecrypt('master_fallback_key_32_bytes_long!!', row)) {
    console.log(row.projectId, '=> master_fallback_key_32_bytes_long!!');
  } else if (tryDecrypt('flarebase_dev_secret_for_testing_only_must_be_at_least_32_chars_long_abc123', row)) {
    console.log(row.projectId, '=> flarebase_dev_secret_for_testing_only_must_be_at_least_32_chars_long_abc123');
  } else {
    console.log(row.projectId, '=> UNKNOWN KEY');
  }
}
