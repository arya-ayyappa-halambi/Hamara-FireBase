const { userStore } = require('./dist/store/user.store');
const { envelopeEncryptionService } = require('./dist/services/envelope-encryption.service');
const { getDb, initSqlite } = require('./dist/db/sqlite.connection');
require('dotenv').config();

initSqlite();
const user = userStore.findByEmail('testuser@gmail.com');
console.log("User by email:", user);
