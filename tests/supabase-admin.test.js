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
