require('dotenv').config();
const { envelopeEncryptionService } = require('./dist/services/envelope-encryption.service');
const db = require('better-sqlite3')('aegis.db');

const email = 'aryaayyappahalambi@gmail.com';
const hash = envelopeEncryptionService.hashBlindIndex(email);
console.log('Generated hash:', hash);

const row = db.prepare('SELECT emailHash FROM users WHERE emailHash = ?').get(hash);
console.log('Row found:', row);

const all = db.prepare('SELECT emailHash, name FROM users').all();
console.log('First user hash:', all[0].emailHash);

