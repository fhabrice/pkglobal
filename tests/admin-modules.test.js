const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPortal } = require('../public/admin/supabase-admin');

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
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
  ilike() { return this; }
  or() { return this; }
  in(field, values) { this.filters.push(row => values.map(String).includes(String(row[field]))); return this; }
  order(field, options = {}) { this.orderField = field; this.orderAscending = options.ascending !== false; return this; }
  single() { this.singleMode = true; return this; }
  maybeSingle() { this.singleMode = true; return this; }
  rows() { return this.client.tables[this.table] || (this.client.tables[this.table] = []); }
  filteredRows() {
    let result = this.rows().filter(row => this.filters.every(filter => filter(row)));
    if (this.orderField) {
      result = [...result].sort((a, b) => {
        const cmp = String(a[this.orderField] ?? '').localeCompare(String(b[this.orderField] ?? ''));
        return this.orderAscending ? cmp : -cmp;
      });
    }
    return result;
  }
  execute() {
    if (this.client.missingTables.has(this.table)) {
      return { data: null, count: null, error: { code: 'PGRST205', message: `Could not find table ${this.table} in schema cache` } };
    }
    const rows = this.rows();
    if (this.countMode) return { data: null, count: this.filteredRows().length, error: null };
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

function fakeClient({ tables = {}, missingTables = [] } = {}) {
  const client = {
    tables: { call_for_projects: [], candidatures: [], site_media: [], crm_contacts: [], ...tables },
    missingTables: new Set(missingTables),
    storedFiles: new Map(),
    from(table) { return new FakeQuery(client, table); },
    storage: {
      from(bucket) {
        return {
          async upload(storagePath, file) {
            client.storedFiles.set(`${bucket}/${storagePath}`, file);
            return { data: { path: storagePath }, error: null };
          },
          getPublicUrl(storagePath) {
            return { data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/${bucket}/${storagePath}` } };
          },
          async remove(paths) {
            paths.forEach(storagePath => client.storedFiles.delete(`${bucket}/${storagePath}`));
            return { data: [], error: null };
          }
        };
      }
    }
  };
  return client;
}

test('Supabase admin publishes, edits and deletes calls for projects', async () => {
  const client = fakeClient();
  const portal = createPortal(client);

  const created = await portal.saveCall({
    title: 'Appel Test Agro RDC',
    description: 'Financer la transformation locale.',
    target_sector: 'Agroalimentaire',
    budget_indicatif: 'Jusqu’à 50 000 USD',
    eligibility: 'PME basées en RDC',
    deadline: '2026-12-31',
    status: 'draft'
  });
  assert.equal(created.status, 'draft');
  assert.equal(created.slug, 'appel-test-agro-rdc');
  assert.ok(String(created.deadline).startsWith('2026-12-31'));

  const published = await portal.setCallStatus(created.id, 'open');
  assert.equal(published.status, 'open');

  const edited = await portal.saveCall({ ...created, title: 'Appel Test Agro RDC (modifié)' }, created.id);
  assert.match(edited.title, /modifié/);

  let calls = await portal.listCalls();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].candidatures_count, 0);

  client.tables.candidatures.push({ id: 99, call_id: created.id, candidate_name: 'Candidate réelle' });
  calls = await portal.listCalls();
  assert.equal(calls[0].candidatures_count, 1);
  await assert.rejects(portal.deleteCall(created.id), /candidatures réelles/);

  const other = await portal.saveCall({ title: 'Appel sans candidature', deadline: '2027-01-15', status: 'open' });
  assert.equal(await portal.deleteCall(other.id), true);
  assert.equal((await portal.listCalls()).length, 1);

  await assert.rejects(portal.saveCall({ title: '', deadline: '' }), /Titre et date limite/);
  await assert.rejects(portal.setCallStatus(created.id, 'publie'), /Statut invalide/);
});

test('Supabase media library uploads, edits and deletes site images', async () => {
  const client = fakeClient();
  const portal = createPortal(client);

  const uploaded = await portal.uploadMediaFile({ name: 'Flotte ELVO.jpg', type: 'image/jpeg', size: 120000 });
  assert.match(uploaded.image_url, /site-media\//);
  assert.ok(uploaded.storage_path.endsWith('Flotte_ELVO.jpg'));
  assert.equal(client.storedFiles.size, 1);

  const created = await portal.saveMedia({
    title: 'Flotte ELVO',
    alt_text: 'Motos électriques ELVO',
    image_url: uploaded.image_url,
    storage_path: uploaded.storage_path,
    section: 'galerie',
    placement: 'galerie-2',
    active: true,
    display_order: 2
  });
  assert.equal(created.placement, 'galerie-2');

  const byUrl = await portal.saveMedia({ title: 'Bureau Kinshasa', image_url: 'https://images.example.com/bureau.jpg', section: 'hero', placement: 'accueil-hero' });
  assert.equal(byUrl.storage_path, null);
  assert.equal((await portal.listMedia()).length, 2);

  // Replacing the image URL removes the previously uploaded storage file.
  await portal.saveMedia({ ...created, image_url: 'https://images.example.com/nouvelle.jpg' }, created.id);
  assert.equal(client.storedFiles.size, 0);

  const uploadedAgain = await portal.uploadMediaFile({ name: 'terrain.png', type: 'image/png', size: 50000 });
  const withFile = await portal.saveMedia({ title: 'Terrain', image_url: uploadedAgain.image_url, storage_path: uploadedAgain.storage_path });
  assert.equal(client.storedFiles.size, 1);
  assert.equal(await portal.deleteMedia(withFile.id), true);
  assert.equal(client.storedFiles.size, 0);
  assert.equal((await portal.listMedia()).length, 2);

  await assert.rejects(portal.uploadMediaFile({ name: 'doc.pdf', type: 'application/pdf', size: 10 }), /Format d’image/);
  await assert.rejects(portal.saveMedia({ title: 'Sans image', image_url: 'ftp://exemple.com/x.jpg' }), /URL d’image/);
});

test('modules overview reports installed and missing modules without inventing data', async () => {
  const ready = createPortal(fakeClient({
    tables: {
      crm_contacts: [{ id: 1 }, { id: 2 }],
      call_for_projects: [{ id: 1, status: 'open' }, { id: 2, status: 'draft' }],
      site_media: [{ id: 1 }]
    }
  }));
  const overview = await ready.modulesOverview();
  assert.deepEqual(
    {
      crm: [overview.crm.installed, overview.crm.contacts],
      calls: [overview.calls.installed, overview.calls.total, overview.calls.open],
      media: [overview.media.installed, overview.media.total]
    },
    { crm: [true, 2], calls: [true, 2, 1], media: [true, 1] }
  );

  const missing = createPortal(fakeClient({ missingTables: ['crm_contacts', 'site_media', 'call_for_projects'] }));
  const missingOverview = await missing.modulesOverview();
  assert.equal(missingOverview.crm.installed, false);
  assert.match(missingOverview.crm.error, /crm\.sql/);
  assert.equal(missingOverview.calls.installed, false);
  assert.match(missingOverview.calls.error, /admin-modules\.sql/);
  assert.equal(missingOverview.media.installed, false);
  assert.match(missingOverview.media.error, /admin-modules\.sql/);
  await assert.rejects(missing.listMedia(), /admin-modules\.sql/);
  await assert.rejects(missing.listCalls(), /admin-modules\.sql/);
});

test('Supabase portal UI opens dashboard modules, calls, media and CRM after login', async () => {
  const vm = require('node:vm');
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'public/admin/supabase-admin.js'), 'utf8');

  async function startWithHash(hash) {
    const window = {
      location: { hash },
      history: { replaceState() {} },
      addEventListener() {}
    };
    vm.runInNewContext(source, { window });
    const ids = ['login-error', 'login-error-text', 'login-form', 'login-submit-btn', 'login-screen', 'app-wrapper', 'view-container', 'user-display-name', 'user-role-badge', 'user-avatar', 'page-title', 'page-subtitle', 'admin-notifications', 'admin-change-password', 'login-email', 'login-password', 'modal-container', 'modal-content', 'toast-container', 'badge-crm-count'];
    const elements = Object.fromEntries(ids.map(id => [id, {
      classList: { classes: new Set(), add(name) { this.classes.add(name); }, remove(name) { this.classes.delete(name); } },
      textContent: '', innerHTML: '', value: '', disabled: id === 'login-submit-btn',
      addEventListener(type, fn) { this[type] = fn; }
    }]));
    elements['login-email'].value = 'admin@pkglobal.com';
    elements['login-password'].value = 'private-password';
    const document = { getElementById: id => elements[id] || null, querySelectorAll: () => [] };

    const client = fakeClient({
      tables: {
        profiles: [{ id: 'u1', email: 'admin@pkglobal.com', full_name: 'Admin', role: 'superadmin', active: true }],
        candidatures: [], investors: [], investor_interests: [], inquiries: [], filiales: [],
        crm_contacts: [], crm_opportunities: [], crm_activities: [],
        call_for_projects: [{ id: 1, title: 'Appel UI Test', description: 'Description réelle', target_sector: 'Agro', budget_indicatif: '10 000 USD', eligibility: 'Tous', deadline: '2026-12-31T00:00:00.000Z', status: 'open', created_at: '2026-01-01T00:00:00.000Z' }],
        site_media: [{ id: 1, title: 'Image UI Test', alt_text: 'Alt', image_url: 'https://images.example.com/ui.jpg', storage_path: null, section: 'galerie', placement: null, link_url: null, active: true, display_order: 0, created_at: '2026-01-01T00:00:00.000Z' }]
      }
    });
    client.auth = {
      async signInWithPassword() { return { data: { user: { id: 'u1' } }, error: null }; },
      async getSession() { return { data: { session: null }, error: null }; },
      async getUser() { return { data: { user: { id: 'u1' } }, error: null }; },
      async signOut() { return { error: null }; }
    };

    await window.SupabaseAdmin.start(document, { createClient: () => client });
    await elements['login-form'].submit({ preventDefault() {} });
    return elements['view-container'].innerHTML;
  }

  const dashboardHtml = await startWithHash('');
  assert.match(dashboardHtml, /Modules de gestion/);
  assert.match(dashboardHtml, /Ouvrir le CRM/);
  assert.match(dashboardHtml, /CRM — Contacts &amp; Pipeline/);
  assert.match(dashboardHtml, /Appels à projets/);
  assert.match(dashboardHtml, /Médiathèque — Images/);
  assert.match(dashboardHtml, /1 appel\(s\) au total · 1 ouvert\(s\)/);

  const callsHtml = await startWithHash('#/calls');
  assert.match(callsHtml, /Appel UI Test/);
  assert.match(callsHtml, /Créer un Appel à Projets/);
  assert.match(callsHtml, /Voir la page publique/);

  const mediaHtml = await startWithHash('#/media');
  assert.match(mediaHtml, /Image UI Test/);
  assert.match(mediaHtml, /Ajouter une image/);

  const crmHtml = await startWithHash('#/crm');
  assert.match(crmHtml, /Nouveau contact/);
  assert.match(crmHtml, /Synchroniser les sources/);
});

test('admin modules are wired in the portal, the Node API and the public site', () => {
  const root = path.join(__dirname, '..');
  const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

  const adminPage = read('public/admin/index.html');
  assert.match(adminPage, /data-route="calls"/);
  assert.match(adminPage, /data-route="media"/);
  assert.match(adminPage, /data-route="crm"/);
  assert.match(adminPage, /Médiathèque/);

  const supabaseAdmin = read('public/admin/supabase-admin.js');
  assert.match(supabaseAdmin, /listCalls/);
  assert.match(supabaseAdmin, /showMedia/);
  assert.match(supabaseAdmin, /uploadMediaFile/);
  assert.match(supabaseAdmin, /modulesOverview/);
  assert.match(supabaseAdmin, /ADMIN_ROUTES = \['dashboard', 'calls', 'media', 'crm'\]/);

  const nodeAdmin = read('public/admin/admin.js');
  assert.match(nodeAdmin, /renderMediaView/);
  assert.match(nodeAdmin, /\/api\/media\/upload/);

  const server = read('server.js');
  assert.match(server, /\/api\/public\/media/);
  assert.match(server, /\/api\/media\/upload/);
  assert.match(server, /\/api\/media\/:id\/replace/);

  assert.match(read('database.js'), /CREATE TABLE IF NOT EXISTS site_media/);

  const migration = read('supabase/admin-modules.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.site_media/);
  assert.match(migration, /storage\.buckets/);
  assert.match(migration, /PK admins manage calls/);
  assert.match(migration, /is_pk_admin/);
  assert.doesNotMatch(migration, /INSERT INTO public\.site_media/i);
  assert.doesNotMatch(migration, /INSERT INTO public\.call_for_projects/i);

  const callsPage = read('appels-a-projets.html');
  assert.match(callsPage, /\/api\/public\/calls/);
  assert.match(callsPage, /rest\/v1\/call_for_projects/);
  assert.match(callsPage, /submitCandidatureToSupabase/);
  assert.doesNotMatch(callsPage, /FALLBACK_CALLS/);

  const siteConnect = read('public/js/site-connect.js');
  assert.match(siteConnect, /\/api\/public\/media/);
  assert.match(siteConnect, /rest\/v1\/site_media/);
  assert.match(siteConnect, /data-media-slot/);

  const home = read('index.html');
  assert.match(home, /id="media-gallery-grid"/);
  assert.match(home, /data-media-slot="accueil-hero"/);
  assert.match(home, /data-media-slot="galerie-1"/);
});
