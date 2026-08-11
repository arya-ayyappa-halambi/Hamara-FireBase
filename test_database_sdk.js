// ─────────────────────────────────────────────────────────────────────────────
//  test_database_sdk.js — Runnable Database SDK Test Script
//  Usage: node test_database_sdk.js
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

const BASE_URL = process.env.AEGIS_BASE_URL || 'http://localhost:3000';

async function runTest() {
  console.log('\n🚀 Starting AegisDB Database SDK Integration Test...\n');
  console.log(`Connecting to AegisDB Backend at: ${BASE_URL}\n`);

  try {
    // 1. Authenticate / Login
    console.log('1️⃣  Authenticating user (Register/Login)...');
    let authRes;
    try {
      authRes = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
        email: 'demo_developer@aegis.dev',
        password: 'Password123!',
      });
    } catch (err) {
      if (err.response && err.response.status === 401) {
        authRes = await axios.post(`${BASE_URL}/api/v1/auth/register`, {
          email: 'demo_developer@aegis.dev',
          password: 'Password123!',
          name: 'Demo Developer',
        });
      } else {
        throw err;
      }
    }

    const token = authRes.data.data.token;
    console.log('✅ Authenticated successfully!');
    console.log('   User Email:', authRes.data.data.user.email);
    console.log('   Access Token:', token.substring(0, 25) + '...\n');

    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. Fetch or Create Project Context
    console.log('2️⃣  Fetching or creating active project context...');
    let projectsRes = await axios.get(`${BASE_URL}/api/v1/projects`, { headers: authHeaders });
    let project = projectsRes.data.data && projectsRes.data.data[0];

    if (!project) {
      const createProjRes = await axios.post(
        `${BASE_URL}/api/v1/projects`,
        { name: 'External Database Host App', description: 'Database hosted via AegisDB SDK' },
        { headers: authHeaders }
      );
      project = createProjRes.data.data;
    }

    console.log('✅ Active Project Identified:');
    console.log('   Project Name:', project.name);
    console.log('   Project ID:  ', project.id);
    console.log('   API Key:     ', project.apiKey ? project.apiKey.substring(0, 18) + '...' : 'Available on creation', '\n');

    // Headers with Project Context (API Key or Project ID)
    const dbHeaders = {
      Authorization: `Bearer ${token}`,
      'x-aegis-project-id': project.id,
      ...(project.apiKey ? { 'x-aegis-api-key': project.apiKey } : {}),
    };

    // 3. Create Collection
    console.log('3️⃣  Creating Database Collection: "my_app_users"...');
    let colRes;
    try {
      colRes = await axios.post(
        `${BASE_URL}/api/v1/db/collections`,
        {
          name: 'my_app_users',
          description: 'Collection hosting external project user profiles',
        },
        { headers: dbHeaders }
      );
      console.log('✅ Collection created:', colRes.data.data.name, '\n');
    } catch (colErr) {
      if (colErr.response && colErr.response.data && colErr.response.data.message.includes('already exists')) {
        console.log('✅ Collection "my_app_users" already exists.\n');
      } else {
        throw colErr;
      }
    }

    // 4. Insert Document
    console.log('4️⃣  Inserting document into "my_app_users"...');
    const docData = {
      name: 'Sharanya',
      email: 'sharanya@example.com',
      role: 'Project Owner',
      database: 'AegisDB-Host-v2',
      createdAt: new Date().toISOString(),
    };

    const insertRes = await axios.post(
      `${BASE_URL}/api/v1/db/collections/my_app_users/documents`,
      { data: docData },
      { headers: dbHeaders }
    );
    console.log('✅ Document inserted successfully!');
    console.log('   Inserted Document ID:', insertRes.data.data.id || insertRes.data.data._id);
    console.log('   Payload:', JSON.stringify(insertRes.data.data, null, 2), '\n');

    // 5. Query Documents
    console.log('5️⃣  Querying documents from "my_app_users"...');
    const queryRes = await axios.get(
      `${BASE_URL}/api/v1/db/collections/my_app_users/documents`,
      { headers: dbHeaders }
    );
    console.log(`✅ Query successful! Retrieved ${queryRes.data.data.documents.length} document(s):`);
    console.log(JSON.stringify(queryRes.data.data.documents, null, 2));

    console.log('\n🎉 ALL DATABASE SDK TESTS PASSED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('\n❌ Test execution failed:');
    if (error.response) {
      console.error(`HTTP Status: ${error.response.status}`);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
      console.error('Make sure AegisDB server is running (`npm run dev`) at http://localhost:3000');
    }
  }
}

runTest();
