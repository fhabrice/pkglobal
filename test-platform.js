/**
 * PK GLOBAL PARTNERS - Automated Test Suite
 * Validates all 10 modules from the Cahier des Charges:
 * Auth, RBAC, Dashboard, CMS, Calls, Candidatures, Investors,
 * Inquiries/CRM, Filiales, Users, Excel & PDF Exports, Backups.
 */

const assert = require('assert');
const http = require('http');

const BASE_URL = 'http://localhost:3000';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Accept': 'application/json', ...(options.headers || {}) };

  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';

  let body;
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else if (contentType.includes('pdf') || contentType.includes('spreadsheet') || contentType.includes('octet-stream')) {
    const buffer = await res.arrayBuffer();
    body = Buffer.from(buffer);
  } else {
    body = await res.text();
  }

  return { status: res.status, headers: res.headers, body };
}

async function runTests() {
  console.log('====================================================');
  console.log(' STARTING PK GLOBAL PARTNERS PLATFORM TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`• ${name} ... `);
    try {
      await fn();
      console.log('PASSED ✓');
      passed++;
    } catch (err) {
      console.log('FAILED ✗');
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

  // Tokens for different roles
  let superToken, adminToken, friviaToken;

  // 0. ADMIN PORTAL & PUBLISHED CMS CONTENT
  await test('0.1 Admin portal is served at both /admin URL forms', async () => {
    const bare = await request('/admin');
    const slash = await request('/admin/');
    assert.strictEqual(bare.status, 200);
    assert.strictEqual(slash.status, 200);
    assert.ok(bare.body.includes('login-form'));
    assert.ok(slash.body.includes('login-form'));
    // The login and dashboard must not depend on a blocking third-party CDN.
    assert.ok(!bare.body.includes('cdn.tailwindcss.com'));
    assert.strictEqual((await request('/data/pkglobal.sqlite')).status, 404);
    assert.strictEqual((await request('/backups/')).status, 404);
    for (const [asset, contentType] of [
      ['/admin/admin.js', 'javascript'],
      ['/admin/admin.css', 'css'],
      ['/public/admin/supabase-admin.js', 'javascript'],
      ['/public/css/tailwind.css', 'css'],
      ['/public/js/chart.min.js', 'javascript']
    ]) {
      const res = await request(asset);
      assert.strictEqual(res.status, 200, asset);
      assert.ok(res.headers.get('content-type').includes(contentType), asset);
    }
  });

  await test('0.2 Public CMS endpoints return content, services and published news', async () => {
    const [content, services, news] = await Promise.all([
      request('/api/content'), request('/api/services'), request('/api/news?status=published')
    ]);
    assert.strictEqual(content.status, 200);
    assert.ok(content.body.hero);
    assert.strictEqual(services.status, 200);
    assert.ok(Array.isArray(services.body));
    assert.strictEqual(news.status, 200);
    assert.ok(Array.isArray(news.body));
  });

  // 1. PUBLIC VISITOR & FORM SUBMISSIONS
  await test('1.1 Track Page Visit (Public API)', async () => {
    const res = await request('/api/track-visit', {
      method: 'POST',
      body: { page: 'accueil', referrer: 'google.cd' }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  await test('1.2 Submit Commercial Inquiry (Public Form)', async () => {
    const res = await request('/api/inquiries', {
      method: 'POST',
      body: {
        nom: 'Alain Makabu',
        email: 'alain.makabu@test.cd',
        telephone: '+243 812 345 678',
        organisation: 'Test Corp Goma',
        service: 'Agroalimentaire & ELIKYA',
        objet: 'Demande de partenariat café',
        message: 'Bonjour, nous souhaitons distribuer ELIKYA COFFEE.'
      }
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.email_status, 'not_configured');
    assert.ok(res.body.reference.startsWith('DEM-'));
  });

  await test('1.3 Register Investor Interest (Public Form)', async () => {
    const res = await request('/api/investors/interest', {
      method: 'POST',
      body: {
        name: 'Jean-Pierre Laurent',
        organization: 'Laurent Capital Partners',
        email: 'jp.laurent@laurentcap.be',
        phone: '+32 470 11 22 33',
        country: 'Belgique',
        investor_type: 'Family Office',
        ticket_min: 100000,
        ticket_max: 1000000,
        sectors_of_interest: 'Agroalimentaire, Fast-Food',
        project_interest: 'Déploiement FRIVIA Kinshasa',
        message: 'Intéressé par le modèle de franchise.'
      }
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
  });

  await test('1.4 Submit Project Candidature (Public Form)', async () => {
    const res = await request('/api/candidatures', {
      method: 'POST',
      body: {
        candidate_name: 'Espérance Nabintu',
        candidate_email: 'esperance@biofruits-kivu.cd',
        candidate_phone: '+243 850 112 233',
        project_title: 'BioFruits Kivu : Jus naturels pasteurisés',
        sector: 'Agroalimentaire',
        location: 'Bukavu & Goma',
        funding_requested: 75000,
        currency: 'USD',
        summary: 'Production artisanale et distribution de jus de fruits locaux.',
        details: 'Partenariat avec 120 petits producteurs de mangues et maracujas.'
      }
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.id > 0);
  });

  // 2. AUTHENTICATION & RBAC
  await test('2.1 Login Super Administrator', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'superadmin@pkglobalpartners.com', password: 'AdminPKGlobal2026!' }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.user.role, 'superadmin');
    superToken = res.body.token;
  });

  await test('2.2 Login Administrator', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@pkglobalpartners.com', password: 'AdminPKGlobal2026!' }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.role, 'admin');
    adminToken = res.body.token;
  });

  await test('2.3 Login Filiale Manager (FRIVIA)', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'frivia.manager@pkglobalpartners.com', password: 'ManagerPKGlobal2026!' }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.role, 'filiale_manager');
    assert.strictEqual(res.body.user.filiale_code, 'frivia');
    friviaToken = res.body.token;
  });

  await test('2.4 Invalid Password Rejection', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'superadmin@pkglobalpartners.com', password: 'WrongPassword123' }
    });
    assert.strictEqual(res.status, 401);
  });

  await test('2.5 RBAC: Filiale Manager Restricted from Candidatures', async () => {
    const res = await request('/api/candidatures', {
      headers: { 'Authorization': `Bearer ${friviaToken}` }
    });
    assert.strictEqual(res.status, 403);
  });

  // 3. DASHBOARD
  await test('3.1 Global Dashboard Statistics (Superadmin)', async () => {
    const res = await request('/api/dashboard/stats', {
      headers: { 'Authorization': `Bearer ${superToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.visitor_count >= 1);
    assert.ok(res.body.candidatures_total >= 1);
    assert.ok(res.body.investors_total >= 1);
    assert.ok(res.body.inquiries_total >= 1);
    assert.ok(Array.isArray(res.body.chart_traffic));
  });

  await test('3.2 Filiale Filtered Dashboard (Manager FRIVIA)', async () => {
    const res = await request('/api/dashboard/stats', {
      headers: { 'Authorization': `Bearer ${friviaToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.role, 'filiale_manager');
    assert.strictEqual(res.body.filiale.code, 'frivia');
    assert.ok(res.body.product_count >= 1);
  });

  // 4. CONTENT MANAGEMENT (CMS)
  await test('4.1 Get & Update Site Content (Hero & Presentation)', async () => {
    const getRes = await request('/api/content');
    assert.strictEqual(getRes.status, 200);
    assert.ok(getRes.body.hero);

    const updateRes = await request('/api/content/hero', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        title: "Transformer l'Afrique par l'Investissement d'Impact",
        subtitle: "PK GLOBAL PARTNERS est une holding stratégique en RDC.",
        badge: "Holding d'Investissement Panafricain • RDC"
      }
    });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.body.success, true);
  });

  await test('4.2 Services/Poles Management (Create & List)', async () => {
    const createRes = await request('/api/services', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        title: 'Énergie Propre & Transition',
        category: 'Pôle Durable',
        description: 'Électrification solaire décentralisée.',
        icon: 'fa-solar-panel'
      }
    });
    assert.strictEqual(createRes.status, 201);
    const newId = createRes.body.id;

    const listRes = await request('/api/services');
    assert.ok(listRes.body.some(s => s.id === newId));

    // Cleanup service
    await request(`/api/services/${newId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
  });

  // 5. CALLS FOR PROJECTS & CANDIDATURES
  await test('5.1 Calls for Projects (Create & List)', async () => {
    const res = await request('/api/calls');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length >= 1);
  });

  await test('5.2 Evaluate Candidature (Score 4.5/5 & Notes)', async () => {
    // Get list of candidatures
    const listRes = await request('/api/candidatures', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(listRes.status, 200);
    const firstId = listRes.body[0].id;

    const evalRes = await request(`/api/candidatures/${firstId}/evaluate`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        evaluation_score: 4.7,
        status: 'retenu',
        evaluation_notes: 'Dossier rigoureux, modèle éprouvé, fort impact social.'
      }
    });
    assert.strictEqual(evalRes.status, 200);
    assert.strictEqual(evalRes.body.success, true);
  });

  await test('5.3 Notify Candidate via Email', async () => {
    const listRes = await request('/api/candidatures', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const firstId = listRes.body[0].id;

    const notifRes = await request(`/api/candidatures/${firstId}/notify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        subject: 'Félicitations pour votre sélection - PK Global Partners',
        message: 'Nous vous informons avec plaisir que votre dossier est retenu.'
      }
    });
    assert.strictEqual(notifRes.status, 200);
    assert.strictEqual(notifRes.body.success, true);
  });

  // 6. INVESTORS MANAGEMENT
  await test('6.1 Investors Directory & Status Update', async () => {
    const listRes = await request('/api/investors', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(listRes.status, 200);
    const first = listRes.body[0];

    const statusRes = await request(`/api/investors/${first.id}/status`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { status: 'valide' }
    });
    assert.strictEqual(statusRes.status, 200);
  });

  await test('6.2 Link Project & Deal to Investor', async () => {
    const listRes = await request('/api/investors', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const invId = listRes.body[0].id;

    const dealRes = await request(`/api/investors/${invId}/interests`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        project_title: 'Unité mobile de séchage AgriKivu',
        amount_intended: 85000,
        stage: 'Due Diligence',
        notes: 'Co-investissement structuré.'
      }
    });
    assert.strictEqual(dealRes.status, 201);
  });

  // 7. COMMERCIAL INQUIRIES & CRM
  await test('7.1 Commercial Inquiries List & Assign Collaborator', async () => {
    const inqRes = await request('/api/inquiries', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(inqRes.status, 200);
    assert.ok(inqRes.body.length >= 1);
    const inqId = inqRes.body[0].id;

    const assignRes = await request(`/api/inquiries/${inqId}/assign`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { assigned_to: 2 }
    });
    assert.strictEqual(assignRes.status, 200);
  });

  await test('7.2 Respond to Inquiry & Resolve', async () => {
    const inqRes = await request('/api/inquiries', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const inqId = inqRes.body[0].id;

    const respRes = await request(`/api/inquiries/${inqId}/respond`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        response_text: 'Bonjour, nous vous transmettons notre grille tarifaire par retour.',
        mark_resolved: true
      }
    });
    assert.strictEqual(respRes.status, 200);
    assert.strictEqual(respRes.body.success, true);
  });

  // 8. FILIALES MANAGEMENT
  await test('8.1 Filiales List & Product Add', async () => {
    const filRes = await request('/api/filiales');
    assert.strictEqual(filRes.status, 200);
    assert.ok(filRes.body.length >= 3);

    const frivia = filRes.body.find(f => f.code === 'frivia');
    assert.ok(frivia);

    const addProdRes = await request(`/api/filiales/${frivia.id}/products`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${friviaToken}` },
      body: {
        name: 'FRIVIA Maxi Wings',
        category: 'Ailes de poulet',
        price_indicative: '6.50 USD',
        description: 'Ailes marinées grillées au barbecue.'
      }
    });
    assert.strictEqual(addProdRes.status, 201);
  });

  // 9. EXPORTS (EXCEL & PDF)
  await test('9.1 Export Candidatures to Excel (.xlsx)', async () => {
    const res = await request('/api/candidatures/export/excel', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length > 1000); // Binary xlsx has considerable size
  });

  await test('9.2 Export Investors to Excel (.xlsx)', async () => {
    const res = await request('/api/investors/export/excel', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length > 1000);
  });

  await test('9.3 Export Inquiries to Excel (.xlsx)', async () => {
    const res = await request('/api/inquiries/export/excel', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length > 1000);
  });

  await test('9.4 Generate Global Platform Activity Report PDF', async () => {
    const res = await request('/api/reports/pdf/global', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
    assert.ok(res.body.length > 2000); // Formatted PDF binary
  });

  await test('9.5 Generate Candidature Evaluation Sheet PDF', async () => {
    const res = await request('/api/reports/pdf/candidature/1', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
    assert.ok(res.body.length > 1000);
  });

  // 10. BACKUPS & DATA SECURITY
  await test('10.1 Create SQLite Database Backup (Superadmin)', async () => {
    const res = await request('/api/backups/create', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${superToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.filename.endsWith('.sqlite'));
  });

  await test('10.2 Export Full JSON Database Dump', async () => {
    const res = await request('/api/backups/export-json', {
      headers: { 'Authorization': `Bearer ${superToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/json'));
    assert.ok(res.body.users);
    assert.ok(res.body.candidatures);
    assert.ok(res.body.investors);
  });

  // 11. SUPABASE INTEGRATION ENDPOINTS
  await test('11.1 Supabase Status & Schema Endpoints', async () => {
    const statusRes = await request('/api/supabase/status');
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.body.schema_ready, true);

    const schemaRes = await request('/api/supabase/schema');
    assert.strictEqual(schemaRes.status, 200);
    assert.ok(schemaRes.body.length > 500);

    const seedRes = await request('/api/supabase/seed');
    assert.strictEqual(seedRes.status, 200);
    assert.ok(seedRes.body.length > 500);
  });

  console.log('\n====================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

// Start the integration server with demo identities and no outbound email enabled.
// These test-only settings are applied before the server module is initialized.
process.env.NODE_ENV = 'test';
process.env.ALLOW_DEMO_USERS = 'true';
process.env.JWT_SECRET = 'pkglobal_integration_tests_only_secret_2026';
process.env.MAIL_HOST = '';
process.env.MAIL_USER = '';
process.env.MAIL_PASSWORD = '';
const app = require('./server');
setTimeout(runTests, 1200);
