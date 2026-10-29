/**
 * PK GLOBAL PARTNERS - Automated Test Suite
 * Validates all 10 modules from the Cahier des Charges:
 * Auth, RBAC, Dashboard, CMS, Calls, Candidatures, Investors,
 * Inquiries, CRM, Filiales, Users, Excel & PDF Exports, Backups.
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

  await test('0.3 Calls page uses only the real public API and admin exposes CRM', async () => {
    const [callsPage, adminPage, adminScript, supabaseScript] = await Promise.all([
      request('/appels-a-projets.html'),
      request('/admin/'),
      request('/admin/admin.js'),
      request('/public/admin/supabase-admin.js')
    ]);
    assert.strictEqual(callsPage.status, 200);
    assert.ok(callsPage.body.includes('/api/public/calls'));
    assert.ok(!callsPage.body.includes('FALLBACK_CALLS'));
    assert.ok(!callsPage.body.includes('Appel à Projets 2026 : AgriTech'));
    assert.ok(!callsPage.body.includes('Fonds Jeunes Entrepreneurs'));
    assert.strictEqual(adminPage.status, 200);
    assert.ok(adminPage.body.includes('data-route="crm"'));
    assert.ok(adminPage.body.includes('badge-crm-count'));
    assert.ok(adminScript.body.includes('renderCRMView'));
    assert.ok(supabaseScript.body.includes('showCRM'));
    assert.ok(supabaseScript.body.includes('syncCrmSources'));
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
  await test('5.1 Real Calls lifecycle (draft stays private, published call is public)', async () => {
    const suffix = Date.now();
    const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const pastDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const title = `Appel réel integration ${suffix}`;
    const candidatePayload = {
      candidate_name: 'Candidate Integration',
      candidate_email: `candidate.integration.${suffix}@example.cd`,
      candidate_phone: '+243 800 000 000',
      project_title: 'Projet integration appels reels',
      sector: 'Agroalimentaire',
      location: 'Goma',
      funding_requested: 10000,
      currency: 'USD',
      summary: 'Candidature de test pour verifier le cycle de publication.',
      details: 'Test automatise.'
    };

    const unauthenticated = await request('/api/calls');
    assert.strictEqual(unauthenticated.status, 401);

    const createRes = await request('/api/calls', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        title,
        description: 'Appel cree par le test d integration.',
        target_sector: 'Agroalimentaire',
        budget_indicatif: 'Budget test',
        eligibility: 'PME enregistree en RDC',
        deadline: futureDate
      }
    });
    assert.strictEqual(createRes.status, 201, JSON.stringify(createRes.body));
    const callId = createRes.body.id;
    assert.ok(callId > 0);

    const adminList = await request('/api/calls', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(adminList.status, 200);
    const draft = adminList.body.find(call => call.id === callId);
    assert.ok(draft);
    assert.strictEqual(draft.status, 'draft');

    const publicDraftList = await request('/api/public/calls');
    assert.strictEqual(publicDraftList.status, 200);
    assert.strictEqual(publicDraftList.headers.get('cache-control'), 'no-store');
    assert.ok(!publicDraftList.body.some(call => call.id === callId));

    const draftCandidature = await request('/api/candidatures', {
      method: 'POST',
      body: { ...candidatePayload, call_id: callId }
    });
    assert.strictEqual(draftCandidature.status, 400);

    const publishRes = await request(`/api/calls/${callId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { status: 'open' }
    });
    assert.strictEqual(publishRes.status, 200, JSON.stringify(publishRes.body));

    const publicOpenList = await request('/api/public/calls');
    assert.ok(publicOpenList.body.some(call => call.id === callId && call.status === 'open'));

    const openCandidature = await request('/api/candidatures', {
      method: 'POST',
      body: { ...candidatePayload, call_id: callId }
    });
    assert.strictEqual(openCandidature.status, 201, JSON.stringify(openCandidature.body));

    const deleteWithCandidature = await request(`/api/calls/${callId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(deleteWithCandidature.status, 409);

    const closeRes = await request(`/api/calls/${callId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { status: 'closed' }
    });
    assert.strictEqual(closeRes.status, 200);
    const closedCandidature = await request('/api/candidatures', {
      method: 'POST',
      body: { ...candidatePayload, call_id: callId, candidate_email: `closed.${suffix}@example.cd` }
    });
    assert.strictEqual(closedCandidature.status, 400);

    const expireRes = await request(`/api/calls/${callId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { status: 'open', deadline: pastDate }
    });
    assert.strictEqual(expireRes.status, 200);
    const expiredCandidature = await request('/api/candidatures', {
      method: 'POST',
      body: { ...candidatePayload, call_id: callId, candidate_email: `expired.${suffix}@example.cd` }
    });
    assert.strictEqual(expiredCandidature.status, 400);

    // Keep the integration call out of the public list after the test.
    const unpublishRes = await request(`/api/calls/${callId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { status: 'draft', deadline: futureDate }
    });
    assert.strictEqual(unpublishRes.status, 200);

    const removableRes = await request('/api/calls', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { title: `Appel supprimable ${suffix}`, deadline: futureDate, status: 'draft' }
    });
    assert.strictEqual(removableRes.status, 201);
    const deleteRes = await request(`/api/calls/${removableRes.body.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(deleteRes.status, 200);
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

  // 7 BIS. CRM — CONTACTS, PIPELINE, ACTIVITIES & SOURCE SYNC
  await test('7.3 CRM RBAC and Overview', async () => {
    const unauthenticated = await request('/api/crm/overview');
    assert.strictEqual(unauthenticated.status, 401);

    const forbidden = await request('/api/crm/overview', {
      headers: { 'Authorization': `Bearer ${friviaToken}` }
    });
    assert.strictEqual(forbidden.status, 403);

    const overview = await request('/api/crm/overview', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(overview.status, 200, JSON.stringify(overview.body));
    assert.ok(Number.isInteger(overview.body.contacts_total));
    assert.ok(Number.isInteger(overview.body.opportunities_open));
    assert.ok(overview.body.sources);
    assert.ok(Number.isInteger(overview.body.sources.unsynced));
  });

  await test('7.4 CRM CRUD Lifecycle (Contact, Opportunity, Activity)', async () => {
    const suffix = Date.now();
    const email = `crm.integration.${suffix}@example.cd`;
    const createContact = await request('/api/crm/contacts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        full_name: 'Contact CRM Integration',
        organization: 'Integration SARL',
        email,
        phone: '+243 800 111 222',
        type: 'prospect',
        status: 'nouveau',
        country: 'RDC',
        location: 'Goma',
        sector: 'Agroalimentaire',
        source: 'test-integration',
        notes: 'Fiche cree par le test automatise.'
      }
    });
    assert.strictEqual(createContact.status, 201, JSON.stringify(createContact.body));
    const contactId = createContact.body.contact.id;
    assert.ok(contactId > 0);

    const duplicate = await request('/api/crm/contacts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { full_name: 'Doublon CRM', email: email.toUpperCase() }
    });
    assert.strictEqual(duplicate.status, 409);

    const createOpportunity = await request('/api/crm/opportunities', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        contact_id: contactId,
        title: `Opportunite integration ${suffix}`,
        type: 'commerciale',
        stage: 'nouveau',
        amount: 25000,
        currency: 'USD',
        probability: 20,
        description: 'Opportunite de test du pipeline CRM.'
      }
    });
    assert.strictEqual(createOpportunity.status, 201, JSON.stringify(createOpportunity.body));
    const opportunityId = createOpportunity.body.opportunity.id;

    const move = await request(`/api/crm/opportunities/${opportunityId}/stage`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { stage: 'qualification' }
    });
    assert.strictEqual(move.status, 200, JSON.stringify(move.body));
    assert.strictEqual(move.body.opportunity.stage, 'qualification');

    const createActivity = await request('/api/crm/activities', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        contact_id: contactId,
        opportunity_id: opportunityId,
        type: 'tache',
        status: 'a_faire',
        title: 'Relance integration CRM',
        details: 'Appeler le contact de test.',
        due_at: new Date(Date.now() + 86400000).toISOString()
      }
    });
    assert.strictEqual(createActivity.status, 201, JSON.stringify(createActivity.body));
    const activityId = createActivity.body.activity.id;

    const complete = await request(`/api/crm/activities/${activityId}/complete`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {}
    });
    assert.strictEqual(complete.status, 200, JSON.stringify(complete.body));
    assert.strictEqual(complete.body.activity.status, 'terminee');

    const detail = await request(`/api/crm/contacts/${contactId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(detail.status, 200);
    assert.ok(detail.body.opportunities.some(item => item.id === opportunityId));
    assert.ok(detail.body.activities.some(item => item.id === activityId));

    const archive = await request(`/api/crm/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { ...detail.body, status: 'archive' }
    });
    assert.strictEqual(archive.status, 200, JSON.stringify(archive.body));

    const deleteContact = await request(`/api/crm/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(deleteContact.status, 200, JSON.stringify(deleteContact.body));
  });

  await test('7.5 CRM Source Synchronization is Idempotent and Auto-syncs Public Forms', async () => {
    const firstSync = await request('/api/crm/sync-sources', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {}
    });
    assert.strictEqual(firstSync.status, 200, JSON.stringify(firstSync.body));

    const secondSync = await request('/api/crm/sync-sources', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {}
    });
    assert.strictEqual(secondSync.status, 200, JSON.stringify(secondSync.body));
    assert.strictEqual(secondSync.body.contacts_created, 0);
    assert.strictEqual(secondSync.body.opportunities_created, 0);

    for (const email of ['alain.makabu@test.cd', 'jp.laurent@laurentcap.be', 'esperance@biofruits-kivu.cd']) {
      const found = await request(`/api/crm/contacts?search=${encodeURIComponent(email)}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(found.status, 200);
      assert.ok(found.body.some(contact => contact.email.toLowerCase() === email), email);
    }

    const overview = await request('/api/crm/overview', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(overview.body.sources.unsynced, 0);
  });

  await test('7.6 CRM Excel Export', async () => {
    const res = await request('/api/crm/export/excel', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length > 1000);
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
    assert.ok(Array.isArray(res.body.crm_contacts));
    assert.ok(Array.isArray(res.body.crm_opportunities));
    assert.ok(Array.isArray(res.body.crm_activities));
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

    const crmRes = await request('/api/supabase/crm');
    assert.strictEqual(crmRes.status, 200);
    assert.ok(crmRes.body.includes('crm_contacts'));
    assert.ok(crmRes.body.includes('is_pk_admin'));
    assert.ok(!/INSERT INTO public\.crm_/i.test(crmRes.body));

    const accessRes = await request('/api/supabase/admin-access');
    assert.strictEqual(accessRes.status, 200);
    assert.ok(accessRes.body.includes('PK dashboard read'));
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
