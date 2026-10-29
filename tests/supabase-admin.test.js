const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPortal } = require('../public/admin/supabase-admin');

function fakeClient({ profile = { id: 'u1', email: 'admin@pkglobal.com', full_name: 'Admin', active: true, role: 'superadmin' }, authError = null, profileError = null, countError = null, session = true, getUserError = null } = {}) {
  const calls = [];
  const client = {
    calls,
    auth: {
      async signInWithPassword(credentials) { calls.push(['login', credentials]); return { data: { user: authError ? null : { id: 'u1' } }, error: authError }; },
      async getSession() { return { data: { session: session ? { access_token: 'token' } : null }, error: null }; },
      async getUser() { return { data: { user: { id: 'u1' } }, error: getUserError }; },
      async signOut() { calls.push(['logout']); return { error: null }; }
    },
    from(table) {
      return {
        select(columns, options) {
          if (options) { calls.push(['count', table]); return Promise.resolve({ count: countError && table === 'inquiries' ? null : 2, error: countError && table === 'inquiries' ? countError : null }); }
          return { eq(key, id) { calls.push(['profile', key, id]); return { async maybeSingle() { return { data: profile, error: profileError }; } }; } };
        }
      };
    }
  };
  return client;
}

test('signs in against Supabase Auth and verifies the active admin profile', async () => {
  const client = fakeClient();
  const portal = createPortal(client);
  const user = await portal.signIn(' admin@pkglobal.com ', 'private-password');
  assert.equal(user.role, 'superadmin');
  assert.deepEqual(client.calls[0], ['login', { email: 'admin@pkglobal.com', password: 'private-password' }]);
  assert.deepEqual(client.calls[1], ['profile', 'id', 'u1']);
});

test('rejects inactive, missing and non-admin profiles and signs out', async () => {
  for (const profile of [null, { active: false, role: 'admin' }, { active: true, role: 'filiale_manager' }]) {
    const client = fakeClient({ profile });
    await assert.rejects(createPortal(client).signIn('user@domain.test', 'secret'), /profil administrateur actif/);
    assert.ok(client.calls.some(call => call[0] === 'logout'));
  }
});

test('rejects invalid credentials and does not query a profile', async () => {
  const client = fakeClient({ authError: { message: 'Invalid login credentials' } });
  await assert.rejects(createPortal(client).signIn('user@domain.test', 'bad'), /Connexion impossible/);
  assert.ok(!client.calls.some(call => call[0] === 'profile'));
});

test('restores only a verified session with an authorized profile', async () => {
  assert.equal(await createPortal(fakeClient({ session: false })).restore(), null);
  const client = fakeClient();
  assert.equal((await createPortal(client).restore()).email, 'admin@pkglobal.com');
  const invalid = fakeClient({ getUserError: new Error('expired') });
  await assert.rejects(createPortal(invalid).restore(), /expired/);
  assert.ok(invalid.calls.some(call => call[0] === 'logout'));
});

test('loads exact counts without inventing data and surfaces failures', async () => {
  assert.deepEqual(await createPortal(fakeClient()).dashboard(), { candidatures: 2, investors: 2, inquiries: 2, filiales: 2 });
  await assert.rejects(createPortal(fakeClient({ countError: new Error('denied') })).dashboard(), /politiques RLS/);
});

test('initializes the static login screen and displays a Supabase dashboard', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../public/admin/supabase-admin.js'), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const ids = ['login-error', 'login-error-text', 'login-form', 'login-submit-btn', 'login-screen', 'app-wrapper', 'view-container', 'user-display-name', 'user-role-badge', 'user-avatar', 'page-title', 'page-subtitle', 'admin-notifications', 'admin-change-password', 'login-email', 'login-password'];
  const elements = Object.fromEntries(ids.map(id => [id, {
    classList: { classes: new Set(), add(name) { this.classes.add(name); }, remove(name) { this.classes.delete(name); } },
    textContent: '', innerHTML: '', value: '', disabled: id === 'login-submit-btn',
    addEventListener(type, fn) { this[type] = fn; }
  }]));
  elements['login-email'].value = 'admin@pkglobal.com';
  elements['login-password'].value = 'private-password';
  const document = { getElementById: id => elements[id], querySelectorAll: () => [] };
  await window.SupabaseAdmin.start(document, { createClient: () => fakeClient({ session: false }) });
  assert.equal(elements['login-submit-btn'].disabled, false);
  let prevented = false;
  await elements['login-form'].submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(elements['login-password'].value, '');
  assert.equal(elements['user-display-name'].textContent, 'Admin');
  assert.ok(elements['view-container'].innerHTML.includes('Candidatures'));
  assert.ok(elements['login-screen'].classList.classes.has('hidden'));
});

test('keeps login disabled if the Supabase library is missing', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/admin/supabase-admin.js'), 'utf8'), { window });
  const nodes = {
    'login-error': { classList: { remove() {} } },
    'login-error-text': { textContent: '' }
  };
  await window.SupabaseAdmin.start({ getElementById: id => nodes[id] }, null);
  assert.match(nodes['login-error-text'].textContent, /client Supabase est indisponible/);
});

function fakeCrmClient({ tables = {}, missingCrm = false } = {}) {
  const client = {
    tables: {
      profiles: [], crm_contacts: [], crm_opportunities: [], crm_activities: [],
      inquiries: [], investors: [], investor_interests: [], candidatures: [], call_for_projects: [],
      ...tables
    },
    auth: {},
    from(table) { return new FakeCrmQuery(client, table, missingCrm); }
  };
  return client;
}

class FakeCrmQuery {
  constructor(client, table, missingCrm) {
    this.client = client;
    this.table = table;
    this.missingCrm = missingCrm;
    this.operation = 'select';
    this.payload = null;
    this.filters = [];
    this.singleMode = false;
    this.countMode = false;
    this.orderField = null;
    this.orderAscending = true;
  }
  select(columns, options) {
    if (options?.count === 'exact') this.countMode = true;
    return this;
  }
  insert(payload) { this.operation = 'insert'; this.payload = payload; return this; }
  update(payload) { this.operation = 'update'; this.payload = payload; return this; }
  delete() { this.operation = 'delete'; return this; }
  eq(field, value) { this.filters.push(row => String(row[field]) === String(value)); return this; }
  neq(field, value) { this.filters.push(row => String(row[field]) !== String(value)); return this; }
  in(field, values) { this.filters.push(row => values.map(String).includes(String(row[field]))); return this; }
  ilike(field, pattern) {
    const term = String(pattern).replace(/%/g, '').toLowerCase();
    this.filters.push(row => String(row[field] || '').toLowerCase().includes(term));
    return this;
  }
  or(expression) {
    const checks = String(expression).split(',').map(part => {
      const [field, , pattern] = part.split('.');
      const term = String(pattern || '').replace(/%/g, '').toLowerCase();
      return row => String(row[field] || '').toLowerCase().includes(term);
    });
    this.filters.push(row => checks.some(check => check(row)));
    return this;
  }
  order(field, options = {}) { this.orderField = field; this.orderAscending = options.ascending !== false; return this; }
  single() { this.singleMode = true; return this; }
  maybeSingle() { this.singleMode = true; return this; }
  filteredRows() {
    const rows = this.client.tables[this.table] || (this.client.tables[this.table] = []);
    let result = rows.filter(row => this.filters.every(filter => filter(row)));
    if (this.orderField) {
      result = [...result].sort((a, b) => {
        const comparison = String(a[this.orderField] ?? '').localeCompare(String(b[this.orderField] ?? ''));
        return this.orderAscending ? comparison : -comparison;
      });
    }
    return result;
  }
  execute() {
    if (this.missingCrm && this.table.startsWith('crm_')) {
      return { data: null, error: { code: 'PGRST205', message: `Could not find table ${this.table} in schema cache` } };
    }
    const rows = this.client.tables[this.table] || (this.client.tables[this.table] = []);
    if (this.countMode) return { data: null, count: rows.length, error: null };
    if (this.operation === 'insert') {
      const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
      const row = { ...this.payload, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      rows.push(row);
      return { data: this.singleMode ? row : [row], error: null };
    }
    const matches = this.filteredRows();
    if (this.operation === 'update') {
      matches.forEach(row => Object.assign(row, this.payload, { updated_at: new Date().toISOString() }));
      return { data: this.singleMode ? (matches[0] || null) : matches, error: null };
    }
    if (this.operation === 'delete') {
      const deleted = matches[0] || null;
      this.client.tables[this.table] = rows.filter(row => !matches.includes(row));
      return { data: this.singleMode ? deleted : matches, error: null };
    }
    const data = matches.map(row => ({ ...row }));
    return { data: this.singleMode ? (data[0] || null) : data, error: null };
  }
  then(resolve, reject) { return Promise.resolve().then(() => this.execute()).then(resolve, reject); }
  catch(reject) { return this.then(null, reject); }
}

test('Supabase CRM CRUD manages contacts, pipeline stages and activities', async () => {
  const client = fakeCrmClient();
  const portal = createPortal(client);
  const contact = await portal.saveCrmContact({
    full_name: 'Client Test', organization: 'Test SARL', email: 'Client@Test.cd',
    type: 'prospect', status: 'nouveau', owner_id: 'u1'
  });
  assert.equal(contact.email, 'client@test.cd');
  const opportunity = await portal.saveCrmOpportunity({
    contact_id: contact.id, title: 'Deal test', stage: 'nouveau', amount: 10000, probability: 15, owner_id: 'u1'
  });
  const moved = await portal.moveCrmOpportunity(opportunity.id, 'qualification');
  assert.equal(moved.stage, 'qualification');
  const activity = await portal.saveCrmActivity({
    contact_id: contact.id, opportunity_id: opportunity.id, type: 'tache', status: 'a_faire', title: 'Relancer'
  });
  const completed = await portal.completeCrmActivity(activity.id);
  assert.equal(completed.status, 'terminee');
  const detail = await portal.getCrmContact(contact.id);
  assert.equal(detail.opportunities.length, 1);
  assert.equal(detail.activities.length, 1);
  const overview = await portal.crmOverview();
  assert.equal(overview.contacts_total, 1);
  assert.equal(overview.opportunities_open, 1);
  assert.equal(overview.pipeline_value, 10000);
});

test('Supabase CRM source synchronization is idempotent', async () => {
  const client = fakeCrmClient({
    tables: {
      inquiries: [{ id: 1, name: 'Prospect Un', email: 'prospect@test.cd', subject: 'Demande test', service_requested: 'Conseil', message: 'Bonjour', status: 'nouveau' }],
      investors: [{ id: 2, name: 'Investisseur Test', organization: 'Capital Test', email: 'investor@test.cd', country: 'RDC', investor_type: 'Fonds', status: 'valide' }],
      investor_interests: [{ id: 3, investor_id: 2, project_title: 'Projet investisseur', amount_intended: 50000, stage: 'Due Diligence' }],
      candidatures: [{ id: 4, call_id: 5, candidate_name: 'Porteur Test', candidate_email: 'candidate@test.cd', project_title: 'Projet candidature', sector: 'Agro', location: 'Goma', funding_requested: 20000, currency: 'USD', summary: 'Résumé', status: 'recu' }],
      call_for_projects: [{ id: 5, title: 'Appel officiel test' }]
    }
  });
  const portal = createPortal(client);
  const first = await portal.syncCrmSources('u1');
  assert.equal(first.contacts_created, 3);
  assert.equal(first.opportunities_created, 3);
  const second = await portal.syncCrmSources('u1');
  assert.equal(second.contacts_created, 0);
  assert.equal(second.opportunities_created, 0);
  assert.equal(client.tables.crm_contacts.length, 3);
  assert.equal(client.tables.crm_opportunities.length, 3);
});

test('Supabase CRM explains the missing migration instead of inventing data', async () => {
  const portal = createPortal(fakeCrmClient({ missingCrm: true }));
  await assert.rejects(portal.listCrmContacts(), /supabase\/crm\.sql/);
});

test('CRM Supabase files and real calls page contain no fictional fallback', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'supabase/crm.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.crm_contacts/);
  assert.match(migration, /is_pk_admin/);
  assert.doesNotMatch(migration, /INSERT INTO public\.crm_/i);
  const schema = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8');
  assert.doesNotMatch(schema, /Appel à Projets 2026 : AgriTech & Transformation RDC/);
  const callsPage = fs.readFileSync(path.join(root, 'appels-a-projets.html'), 'utf8');
  assert.match(callsPage, /\/api\/public\/calls/);
  assert.doesNotMatch(callsPage, /FALLBACK_CALLS|Fonds Jeunes Entrepreneurs/);
  const adminPage = fs.readFileSync(path.join(root, 'public/admin/index.html'), 'utf8');
  assert.match(adminPage, /data-route="crm"/);
});
