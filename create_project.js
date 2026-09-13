const fs = require('fs');
const sqlite = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const argon2 = require('argon2');

function generateApiKey() {
  const rawApiKey = `flare_pk_${crypto.randomBytes(32).toString('hex')}`;
  const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');
  return { rawApiKey, apiKeyHash };
}

async function main() {
  const db = sqlite('./flarebase.db');
  
  // 1. Create a user
  const userId = uuidv4();
  const email = 'admin@campus-asthra.dev';
  const now = new Date().toISOString();
  const hash = await argon2.hash('Password123!');
  
  db.prepare(`
    INSERT INTO users (id, email, name, passwordHash, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, email, 'Campus Asthra Admin', hash, now, now);
  
  // 2. Create a project
  const projectId = uuidv4();
  const { rawApiKey, apiKeyHash } = generateApiKey();
  
  db.prepare(`
    INSERT INTO projects (id, name, ownerId, apiKeyHash, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(projectId, 'Campus Asthra Portal', userId, apiKeyHash, now, now);
  
  console.log('--- FLAREBASE PROJECT CREATED ---');
  console.log('Project ID:', projectId);
  console.log('API Key:', rawApiKey);
  console.log('Owner Email:', email);
  console.log('-------------------------------');
}

main().catch(console.error);
