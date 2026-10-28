/* Supabase-backed login and read-only dashboard for the static admin portal.
 * The publishable key is intentionally public; authorization is enforced by RLS. */
(function (root) {
  'use strict';

  function createPortal(client) {
    async function profileFor(user) {
      if (!user) throw new Error('Votre session a expiré. Veuillez vous reconnecter.');
      const { data, error } = await client.from('profiles')
        .select('id,email,full_name,role,active').eq('id', user.id).maybeSingle();
      if (error) throw new Error('Impossible de vérifier le profil administrateur. Vérifiez les droits Supabase.');
      if (!data || data.active !== true || !['admin', 'superadmin'].includes(data.role)) {
        throw new Error('Ce compte ne possède pas de profil administrateur actif.');
      }
      return data;
    }

    async function signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user) throw new Error('Connexion impossible. Vérifiez vos identifiants et la configuration Supabase.');
      try {
        return await profileFor(data.user);
      } catch (err) {
        await client.auth.signOut();
        throw err;
      }
    }

    async function restore() {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) return null;
      try {
        const result = await client.auth.getUser();
        if (result.error) throw result.error;
        return await profileFor(result.data.user);
      } catch (err) {
        await client.auth.signOut();
        throw err;
      }
    }

    async function dashboard() {
      const tables = ['candidatures', 'investors', 'inquiries', 'filiales'];
      const results = await Promise.all(tables.map(table =>
        client.from(table).select('*', { count: 'exact', head: true })
      ));
      if (results.some(result => result.error || typeof result.count !== 'number')) {
        throw new Error('Impossible de charger les données. Vérifiez les tables et les politiques RLS dans Supabase.');
      }
      return Object.fromEntries(tables.map((table, index) => [table, results[index].count]));
    }

    async function signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw new Error('La déconnexion a échoué. Réessayez.');
    }

    return { signIn, restore, dashboard, signOut };
  }

  async function start(document, supabaseLibrary) {
    const errorBox = document.getElementById('login-error');
    const errorText = document.getElementById('login-error-text');
    function showError(message) {
      errorText.textContent = message;
      errorBox.classList.remove('hidden');
    }
    if (!supabaseLibrary || !supabaseLibrary.createClient) {
      showError('Le client Supabase est indisponible. Vérifiez que les fichiers du site ont été déployés.');
      return;
    }

    let client;
    try {
      client = supabaseLibrary.createClient(
        'https://vumerporrumovowyonfj.supabase.co',
        'sb_publishable_1clRgc8vKrinbm0VM7OR2g_BUnDZVV4'
      );
    } catch (err) {
      showError('Impossible de démarrer le client Supabase. Vérifiez sa configuration.');
      return;
    }
    const portal = createPortal(client);
    root.supabaseAdminPortal = portal;
    const form = document.getElementById('login-form');
    const button = document.getElementById('login-submit-btn');
    const loginScreen = document.getElementById('login-screen');
    const app = document.getElementById('app-wrapper');
    const view = document.getElementById('view-container');

    async function showDashboard(profile) {
      loginScreen.classList.add('hidden');
      app.classList.remove('hidden');
      document.getElementById('user-display-name').textContent = profile.full_name || profile.email;
      document.getElementById('user-role-badge').textContent = profile.role === 'superadmin' ? 'Super Administrateur' : 'Administrateur';
      document.getElementById('user-avatar').textContent = (profile.full_name || profile.email || 'A').slice(0, 2).toUpperCase();
      document.getElementById('page-title').textContent = 'Tableau de bord';
      document.getElementById('page-subtitle').textContent = 'Données Supabase en lecture seule';
      document.querySelectorAll('.nav-item').forEach(link => {
        if (link.getAttribute('data-route') !== 'dashboard') link.classList.add('hidden');
      });
      document.querySelectorAll('#sidebar nav > div').forEach(heading => heading.classList.add('hidden'));
      document.getElementById('admin-notifications').classList.add('hidden');
      document.getElementById('admin-change-password').classList.add('hidden');
      view.textContent = 'Chargement des données Supabase…';
      try {
        const counts = await portal.dashboard();
        // Only fixed labels and numeric counts are inserted as HTML.
        view.innerHTML = `<div class="space-y-6"><div class="bg-white p-6 rounded-2xl border border-slate-200"><h1 class="text-xl font-bold">Bienvenue dans l’espace administrateur</h1><p class="text-sm text-slate-600 mt-2">Tableau de bord Supabase en lecture seule. Les autres modules de gestion ne sont pas encore disponibles avec Supabase.</p></div><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">${[['Candidatures', counts.candidatures], ['Investisseurs', counts.investors], ['Demandes', counts.inquiries], ['Filiales', counts.filiales]].map(([label, count]) => `<div class="bg-white p-5 rounded-2xl border border-slate-200"><div class="text-sm text-slate-500">${label}</div><div class="text-2xl font-bold mt-2">${count}</div></div>`).join('')}</div></div>`;
      } catch (err) {
        view.textContent = err.message;
      }
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      errorBox.classList.add('hidden');
      button.disabled = true;
      try {
        const profile = await portal.signIn(document.getElementById('login-email').value, document.getElementById('login-password').value);
        document.getElementById('login-password').value = '';
        await showDashboard(profile);
      } catch (err) {
        showError(err.message);
      } finally {
        button.disabled = false;
      }
    });

    try {
      const profile = await portal.restore();
      if (profile) await showDashboard(profile);
    } catch (err) {
      showError(err.message);
    } finally {
      button.disabled = false;
    }
  }

  const exported = { createPortal, start };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (root) root.SupabaseAdmin = exported;
})(typeof window !== 'undefined' ? window : null);
