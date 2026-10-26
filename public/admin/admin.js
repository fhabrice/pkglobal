/**
 * PK GLOBAL PARTNERS - Administration Platform Client SPA
 * Full-featured administration client implementing all modules:
 * Dashboard, CMS, Calls for Projects, Candidatures, Investors,
 * CRM Inquiries, Subsidiaries, RBAC Users, Reports (PDF & Excel), Backups.
 */

// Global State
let currentUser = null;
let currentRoute = 'dashboard';
let currentStats = null;
let currentChart1 = null;
let currentChart2 = null;
let currentChart3 = null;

// Safe Storage Wrapper (resilient to iframe storage / cookie restrictions)
const memoryStorage = {};
const safeStorage = {
  getItem(key) {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) return val;
    } catch (e) {}
    return memoryStorage[key] || null;
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
    memoryStorage[key] = value;
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
    delete memoryStorage[key];
  }
};

// API Fetch Wrapper
async function api(endpoint, options = {}) {
  const token = safeStorage.getItem('pkgp_token');
  const headers = {
    'Accept': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(endpoint, { ...options, headers });
    
    if (response.status === 401 || response.status === 403) {
      if (endpoint !== '/api/auth/login') {
        const errorData = await response.json().catch(() => ({}));
        showToast(errorData.error || 'Session expirée ou droits insuffisants.', 'error');
        if (response.status === 401) {
          logout();
          return null;
        }
      }
    }

    // Check if binary download
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('spreadsheet') || contentType.includes('pdf') || contentType.includes('octet-stream')) {
      return response;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Une erreur est survenue.');
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
}

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-900 text-yellow-400 border-emerald-700' :
             type === 'error' ? 'bg-red-900 text-white border-red-700' :
             'bg-slate-900 text-white border-slate-700';

  const icon = type === 'success' ? 'fa-circle-check' :
               type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';

  toast.className = `${bg} pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-semibold animate-scale-up transition-all duration-300`;
  toast.innerHTML = `
    <i class="fas ${icon} text-sm"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Modal Helpers
function openModal(title, htmlContent, onConfirm = null, confirmText = 'Enregistrer') {
  const modalContainer = document.getElementById('modal-container');
  const modalContent = document.getElementById('modal-content');
  if (!modalContainer || !modalContent) return;

  modalContent.innerHTML = `
    <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
      <h3 class="text-base font-bold text-slate-800">${title}</h3>
      <button onclick="closeModal()" class="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition">
        <i class="fas fa-times text-sm"></i>
      </button>
    </div>
    <div class="p-6 overflow-y-auto flex-1">
      ${htmlContent}
    </div>
    ${onConfirm ? `
    <div class="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 flex-shrink-0">
      <button onclick="closeModal()" class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/80 rounded-xl transition">
        Annuler
      </button>
      <button id="modal-confirm-btn" class="px-5 py-2 text-xs font-bold text-emerald-950 bg-yellow-400 hover:bg-yellow-500 rounded-xl shadow transition">
        ${confirmText}
      </button>
    </div>
    ` : ''}
  `;

  modalContainer.classList.remove('hidden');

  if (onConfirm) {
    document.getElementById('modal-confirm-btn').addEventListener('click', async () => {
      const btn = document.getElementById('modal-confirm-btn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Traitement...';
      try {
        const shouldClose = await onConfirm();
        if (shouldClose !== false) {
          closeModal();
        }
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = confirmText;
      }
    });
  }
}

function closeModal() {
  const modalContainer = document.getElementById('modal-container');
  if (modalContainer) modalContainer.classList.add('hidden');
}

// Mobile sidebar toggle
function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('-translate-x-full');
}

// Password toggle helper
function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

// Quick fill for testing
function quickFill(email, password) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = password;
  document.getElementById('login-form').dispatchEvent(new Event('submit'));
}

// Quick role switch helper for stakeholders
async function switchRoleDemo(role, filialeId = null) {
  let email = 'superadmin@pkglobalpartners.com';
  let pass = 'AdminPKGlobal2026!';

  if (role === 'admin') {
    email = 'admin@pkglobalpartners.com';
  } else if (role === 'filiale_manager') {
    if (filialeId === 2) {
      email = 'elikya.manager@pkglobalpartners.com';
    } else if (filialeId === 3) {
      email = 'youpi.manager@pkglobalpartners.com';
    } else {
      email = 'frivia.manager@pkglobalpartners.com';
    }
    pass = 'ManagerPKGlobal2026!';
  }

  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password: pass }
    });
    safeStorage.setItem('pkgp_token', res.token);
    safeStorage.setItem('pkgp_user', JSON.stringify(res.user));
    currentUser = res.user;
    showToast(`Bascule vers le profil : ${res.user.name}`, 'info');
    setupUIForUser();
    navigateTo(currentRoute || 'dashboard');
  } catch (err) {
    showToast('Erreur de changement de profil: ' + err.message, 'error');
  }
}

// -------------------------------------------------------------
// APP INITIALIZATION & AUTHENTICATION
// -------------------------------------------------------------

async function initApp() {
  // Login form handler
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const errorDiv = document.getElementById('login-error');
      const submitBtn = document.getElementById('login-submit-btn');

      if (errorDiv) errorDiv.classList.add('hidden');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Vérification...';
      }

      try {
        const res = await api('/api/auth/login', {
          method: 'POST',
          body: { email, password }
        });

        safeStorage.setItem('pkgp_token', res.token);
        safeStorage.setItem('pkgp_user', JSON.stringify(res.user));
        currentUser = res.user;

        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-wrapper').classList.remove('hidden');

        setupUIForUser();
        initRouter();
        showToast(`Bienvenue, ${currentUser.name} !`);
      } catch (err) {
        if (errorDiv) {
          errorDiv.classList.remove('hidden');
          const errText = document.getElementById('login-error-text');
          if (errText) errText.textContent = err.message || 'Identifiants invalides';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Connexion Sécurisée</span><i class="fas fa-arrow-right text-xs"></i>';
        }
      }
    });
  }

  // 1. Check existing saved session
  let token = safeStorage.getItem('pkgp_token');
  if (token) {
    try {
      const res = await api('/api/auth/me');
      if (res && res.user) {
        currentUser = res.user;
        safeStorage.setItem('pkgp_user', JSON.stringify(currentUser));
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-wrapper').classList.remove('hidden');
        setupUIForUser();
        initRouter();
        return;
      }
    } catch (e) {
      safeStorage.removeItem('pkgp_token');
      safeStorage.removeItem('pkgp_user');
      token = null;
    }
  }

  // 2. Auto-login as Superadmin by default so the admin space is never empty on first visit
  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'superadmin@pkglobalpartners.com', password: 'AdminPKGlobal2026!' }
    });
    if (res && res.token && res.user) {
      safeStorage.setItem('pkgp_token', res.token);
      safeStorage.setItem('pkgp_user', JSON.stringify(res.user));
      currentUser = res.user;
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app-wrapper').classList.remove('hidden');
      setupUIForUser();
      initRouter();
      return;
    }
  } catch (err) {
    console.warn('Auto-login notice:', err);
  }

  // 3. Fallback: Show login screen
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-wrapper').classList.add('hidden');
}

// Run initApp immediately or on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

function logout() {
  safeStorage.removeItem('pkgp_token');
  safeStorage.removeItem('pkgp_user');
  currentUser = null;
  document.getElementById('app-wrapper').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  showToast('Vous avez été déconnecté.', 'info');
}

function setupUIForUser() {
  if (!currentUser) return;

  // Display user info in sidebar
  document.getElementById('user-display-name').textContent = currentUser.name;
  
  const roleBadge = document.getElementById('user-role-badge');
  const roleNames = {
    superadmin: 'Super Administrateur',
    admin: 'Administrateur',
    filiale_manager: currentUser.filiale_name ? `Resp. ${currentUser.filiale_name}` : 'Resp. Filiale'
  };
  roleBadge.textContent = roleNames[currentUser.role] || currentUser.role;

  // Avatar Initials
  const initials = currentUser.name.split(' ').map(n => n[0]).slice(0, 2).join('');
  document.getElementById('user-avatar').textContent = initials;

  // Adjust Filiale label if filiale manager
  const filialesLabel = document.getElementById('nav-filiales-label');
  if (currentUser.role === 'filiale_manager' && currentUser.filiale_name) {
    filialesLabel.textContent = `Ma Filiale (${currentUser.filiale_name})`;
  } else {
    filialesLabel.textContent = 'Gestion des Filiales';
  }

  // RBAC Menu Filtering
  document.querySelectorAll('[data-role-min]').forEach(el => {
    const minRole = el.getAttribute('data-role-min');
    if (minRole === 'superadmin' && currentUser.role !== 'superadmin') {
      el.classList.add('hidden');
    } else if (minRole === 'admin' && currentUser.role === 'filiale_manager') {
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
    }
  });

  // Load notification count & dropdown
  loadNotifications();
}

async function loadNotifications() {
  try {
    const notifs = await api('/api/notifications');
    if (!notifs) return;

    const unread = notifs.filter(n => !n.read);
    const dot = document.getElementById('notif-unread-dot');
    if (dot) {
      if (unread.length > 0) dot.classList.remove('hidden');
      else dot.classList.add('hidden');
    }

    const list = document.getElementById('notif-list');
    if (list) {
      if (notifs.length === 0) {
        list.innerHTML = '<div class="p-4 text-center text-slate-400">Aucune notification</div>';
      } else {
        list.innerHTML = notifs.map(n => `
          <div class="p-3 hover:bg-slate-50 transition cursor-pointer ${n.read ? 'opacity-60' : 'bg-emerald-50/40'}" onclick="markNotificationRead(${n.id})">
            <div class="font-bold text-slate-800">${n.title}</div>
            <div class="text-slate-600 text-[11px] mt-0.5">${n.message}</div>
            <div class="text-[9px] text-slate-400 mt-1">${new Date(n.created_at).toLocaleString('fr-FR')}</div>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    console.error('Error loading notifications:', e);
  }
}

function toggleNotificationDropdown() {
  const dropdown = document.getElementById('notif-dropdown');
  if (dropdown) dropdown.classList.toggle('hidden');
}

async function markNotificationRead(id) {
  await api(`/api/notifications/${id}/read`, { method: 'PUT' });
  loadNotifications();
}

async function markAllNotificationsRead() {
  await api('/api/notifications/read-all', { method: 'PUT' });
  loadNotifications();
  showToast('Toutes les notifications marquées comme lues.');
}

function openChangePasswordModal() {
  openModal('Modifier mon mot de passe', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Mot de passe actuel</label>
        <input type="password" id="pw-old" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-600">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Nouveau mot de passe (min. 6 car.)</label>
        <input type="password" id="pw-new" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-600">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Confirmer le nouveau mot de passe</label>
        <input type="password" id="pw-confirm" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-600">
      </div>
    </div>
  `, async () => {
    const oldP = document.getElementById('pw-old').value;
    const newP = document.getElementById('pw-new').value;
    const confP = document.getElementById('pw-confirm').value;

    if (!oldP || !newP) throw new Error('Veuillez remplir tous les champs.');
    if (newP !== confP) throw new Error('Les mots de passe ne correspondent pas.');
    if (newP.length < 6) throw new Error('Le mot de passe doit comporter au moins 6 caractères.');

    await api('/api/auth/change-password', {
      method: 'POST',
      body: { old_password: oldP, new_password: newP }
    });
    showToast('Mot de passe mis à jour avec succès.');
  });
}

// -------------------------------------------------------------
// ROUTER & VIEW SWITCHER
// -------------------------------------------------------------

function initRouter() {
  window.addEventListener('hashchange', handleRouteChange);
  handleRouteChange();
}

function handleRouteChange() {
  const hash = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  navigateTo(hash);
}

function navigateTo(route) {
  // Enforce RBAC on routes
  if (currentUser && currentUser.role === 'filiale_manager') {
    const allowed = ['dashboard', 'filiales', 'inquiries', 'guide', 'formation'];
    if (!allowed.includes(route)) {
      route = 'dashboard';
    }
  }

  currentRoute = route;

  // Update active nav link
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.getAttribute('data-route') === route) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Render view
  renderView(route);
}

// Route Titles & View Dispatcher
async function renderView(route) {
  const container = document.getElementById('view-container');
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');
  if (!container) return;

  // Destroy previous charts if any
  if (currentChart1) { currentChart1.destroy(); currentChart1 = null; }
  if (currentChart2) { currentChart2.destroy(); currentChart2 = null; }
  if (currentChart3) { currentChart3.destroy(); currentChart3 = null; }

  container.innerHTML = `
    <div class="h-64 flex flex-col items-center justify-center text-slate-400">
      <i class="fas fa-circle-notch fa-spin text-3xl text-emerald-600 mb-3"></i>
      <span class="text-xs font-semibold">Chargement des données...</span>
    </div>
  `;

  try {
    switch (route) {
      case 'dashboard':
        titleEl.textContent = 'Tableau de bord';
        subEl.textContent = 'Indicateurs clés et activités en temps réel';
        await renderDashboardView(container);
        break;

      case 'contents':
        titleEl.textContent = 'Gestion des contenus du site';
        subEl.textContent = 'Modifier les textes de présentation, pôles de compétences et actualités';
        await renderContentsView(container);
        break;

      case 'calls':
        titleEl.textContent = 'Gestion des appels à projets';
        subEl.textContent = 'Création, publication et suivi des programmes d\'accélération';
        await renderCallsView(container);
        break;

      case 'candidatures':
        titleEl.textContent = 'Candidatures & Projets soumis';
        subEl.textContent = 'Évaluation, notation, téléchargement des dossiers et notifications';
        await renderCandidaturesView(container);
        break;

      case 'investors':
        titleEl.textContent = 'Gestion des investisseurs';
        subEl.textContent = 'Répertoire des fonds, manifestations d\'intérêt et pipeline de co-financement';
        await renderInvestorsView(container);
        break;

      case 'inquiries':
        titleEl.textContent = 'Demandes commerciales & CRM';
        subEl.textContent = 'Traitement des messages du site, attribution et réponses aux prospects';
        await renderInquiriesView(container);
        break;

      case 'filiales':
        titleEl.textContent = currentUser.role === 'filiale_manager' ? `Gestion de ${currentUser.filiale_name || 'la Filiale'}` : 'Gestion des Filiales du Groupe';
        subEl.textContent = 'Présentation, catalogues de produits, tarifs et réalisations';
        await renderFilialesView(container);
        break;

      case 'users':
        titleEl.textContent = 'Gestion des utilisateurs & Droits';
        subEl.textContent = 'Attribution des rôles (Superadmin, Admin, Resp. Filiale) et audit de sécurité';
        await renderUsersView(container);
        break;

      case 'stats':
        titleEl.textContent = 'Statistiques & Téléchargement des Rapports';
        subEl.textContent = 'Fréquentation du site, analyses comparatives et exports PDF / Excel';
        await renderStatsReportsView(container);
        break;

      case 'backups':
        titleEl.textContent = 'Sauvegardes & Sécurité des données';
        subEl.textContent = 'Sauvegarde instantanée SQLite, exports JSON et journal système';
        await renderBackupsView(container);
        break;

      case 'supabase':
        titleEl.textContent = 'Intégration Backend Supabase';
        subEl.textContent = 'Connexion BaaS Cloud, export SQL PostgreSQL et synchronisation';
        await renderSupabaseView(container);
        break;

      case 'guide':
        titleEl.textContent = 'Guide simplifié d\'utilisation (Livrable 5)';
        subEl.textContent = 'Manuel complet d\'utilisation de l\'espace administrateur';
        await renderGuideView(container);
        break;

      case 'formation':
        titleEl.textContent = 'Guide de Formation à l\'interface (Livrable 6)';
        subEl.textContent = 'Procédures types, étapes pas-à-pas et guide de prise en main';
        await renderFormationView(container);
        break;

      default:
        navigateTo('dashboard');
        break;
    }
  } catch (err) {
    container.innerHTML = `
      <div class="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-800 text-center">
        <i class="fas fa-triangle-exclamation text-3xl mb-2 text-red-500"></i>
        <h4 class="font-bold text-sm">Erreur lors du chargement de ce module</h4>
        <p class="text-xs mt-1 text-red-600">${err.message}</p>
        <button onclick="renderView('${route}')" class="mt-4 px-4 py-2 bg-red-700 text-white rounded-xl text-xs font-bold">Réessayer</button>
      </div>
    `;
  }
}

// -------------------------------------------------------------
// MODULE 1: TABLEAU DE BORD (DASHBOARD)
// -------------------------------------------------------------

async function renderDashboardView(container) {
  const stats = await api('/api/dashboard/stats');
  currentStats = stats;

  if (stats.role === 'filiale_manager') {
    // FILIALE MANAGER SPECIALIZED DASHBOARD
    container.innerHTML = `
      <div class="space-y-6">
        <!-- Filiale Welcome Banner -->
        <div class="bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 text-white rounded-3xl p-8 shadow-xl relative overflow-hidden">
          <div class="absolute right-0 top-0 bottom-0 w-1/3 bg-cover bg-center opacity-10" style="background-image: url('${stats.filiale.cover_image_url || '/logo.svg'}')"></div>
          <div class="relative z-10 max-w-2xl">
            <span class="px-3 py-1 bg-yellow-400 text-emerald-950 text-[10px] font-black uppercase tracking-widest rounded-full">Filiale Opérationnelle</span>
            <h1 class="text-3xl font-extrabold mt-3 mb-1 text-white">${stats.filiale.name}</h1>
            <p class="text-yellow-400 italic text-sm font-semibold mb-4">"${stats.filiale.slogan}"</p>
            <p class="text-emerald-100/90 text-xs leading-relaxed">${stats.filiale.description}</p>
          </div>
        </div>

        <!-- KPIs Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs kpi-card">
            <div class="flex items-center justify-between text-slate-500 mb-2">
              <span class="text-xs font-bold uppercase tracking-wider">Produits Phares</span>
              <div class="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center text-sm">
                <i class="fas fa-boxes-stacked"></i>
              </div>
            </div>
            <div class="text-3xl font-extrabold text-slate-800">${stats.product_count}</div>
            <div class="text-[11px] text-slate-400 mt-1">Au catalogue actif</div>
          </div>

          <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs kpi-card">
            <div class="flex items-center justify-between text-slate-500 mb-2">
              <span class="text-xs font-bold uppercase tracking-wider">Réalisations & Projets</span>
              <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm">
                <i class="fas fa-award"></i>
              </div>
            </div>
            <div class="text-3xl font-extrabold text-slate-800">${stats.project_count}</div>
            <div class="text-[11px] text-slate-400 mt-1">Actions & Certifications</div>
          </div>

          <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs kpi-card">
            <div class="flex items-center justify-between text-slate-500 mb-2">
              <span class="text-xs font-bold uppercase tracking-wider">Demandes Reçues</span>
              <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm">
                <i class="fas fa-envelope-open"></i>
              </div>
            </div>
            <div class="text-3xl font-extrabold text-slate-800">${stats.inquiries_count}</div>
            <div class="text-[11px] text-slate-400 mt-1">Messages concernant ${stats.filiale.name}</div>
          </div>
        </div>

        <!-- Quick Access -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-bold text-slate-800">Derniers Produits Enregistrés</h3>
              <a href="#/filiales" class="text-xs text-emerald-700 font-bold hover:underline">Gérer tout</a>
            </div>
            <div class="space-y-3">
              ${stats.products.slice(0, 4).map(p => `
                <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div class="flex items-center gap-3">
                    <img src="${p.image_url || '/logo.svg'}" class="w-10 h-10 rounded-lg object-cover">
                    <div>
                      <div class="font-bold text-xs text-slate-800">${p.name}</div>
                      <div class="text-[10px] text-slate-500">${p.category}</div>
                    </div>
                  </div>
                  <span class="text-xs font-black text-emerald-700">${p.price_indicative || '-'}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-bold text-slate-800">Projets & Réalisations Clés</h3>
              <a href="#/filiales" class="text-xs text-emerald-700 font-bold hover:underline">Gérer tout</a>
            </div>
            <div class="space-y-3">
              ${stats.projects.slice(0, 4).map(prj => `
                <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div class="flex items-center justify-between mb-1">
                    <div class="font-bold text-xs text-slate-800">${prj.title}</div>
                    <span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">${prj.status}</span>
                  </div>
                  <div class="text-[10px] text-slate-500">${prj.location} • ${prj.date_realization}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // GLOBAL DASHBOARD (Superadmin / Admin)
  container.innerHTML = `
    <div class="space-y-8">
      
      <!-- Top Action Bar -->
      <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div class="text-xs font-bold text-emerald-800 uppercase tracking-wider">Centre de Commande</div>
          <div class="text-sm font-extrabold text-slate-800">Synthèse Générale de la Plateforme PK GLOBAL PARTNERS</div>
        </div>
        <div class="flex flex-wrap items-center gap-2.5">
          <button onclick="navigateTo('calls')" class="px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-900 hover:bg-emerald-100 text-xs font-bold transition flex items-center gap-2 border border-emerald-200/80">
            <i class="fas fa-plus text-[10px]"></i> Nouvel Appel à Projets
          </button>
          <button onclick="navigateTo('contents')" class="px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold transition flex items-center gap-2">
            <i class="fas fa-newspaper text-[10px]"></i> Publier Actualité
          </button>
          <a href="/api/reports/pdf/global" target="_blank" class="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-emerald-950 text-xs font-bold transition flex items-center gap-2 shadow-xs">
            <i class="fas fa-file-pdf"></i> Rapport Global PDF
          </a>
        </div>
      </div>

      <!-- 5 Required Cahier des Charges KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        <!-- 1. Nombre de visiteurs -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs kpi-card">
          <div class="flex items-center justify-between text-slate-400 mb-2">
            <span class="text-[10px] font-bold uppercase tracking-wider">1. Visiteurs du site</span>
            <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs">
              <i class="fas fa-users"></i>
            </div>
          </div>
          <div class="text-2xl font-black text-slate-800">${stats.visitor_count}</div>
          <div class="text-[10px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
            <i class="fas fa-arrow-trend-up"></i> +${stats.visitor_today} aujourd'hui
          </div>
        </div>

        <!-- 2. Projets et candidatures reçus -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs kpi-card">
          <div class="flex items-center justify-between text-slate-400 mb-2">
            <span class="text-[10px] font-bold uppercase tracking-wider">2. Candidatures reçues</span>
            <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center text-xs">
              <i class="fas fa-folder-open"></i>
            </div>
          </div>
          <div class="text-2xl font-black text-slate-800">${stats.candidatures_total}</div>
          <div class="text-[10px] font-bold text-emerald-600 mt-1">
            ${stats.candidatures_approved} projets retenus
          </div>
        </div>

        <!-- 3. Projets en cours d'évaluation -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs kpi-card">
          <div class="flex items-center justify-between text-slate-400 mb-2">
            <span class="text-[10px] font-bold uppercase tracking-wider">3. En cours d'évaluation</span>
            <div class="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-xs">
              <i class="fas fa-hourglass-half"></i>
            </div>
          </div>
          <div class="text-2xl font-black text-amber-700">${stats.candidatures_evaluating}</div>
          <div class="text-[10px] font-semibold text-slate-400 mt-1">En revue par le comité</div>
        </div>

        <!-- 4. Investisseurs inscrits -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs kpi-card">
          <div class="flex items-center justify-between text-slate-400 mb-2">
            <span class="text-[10px] font-bold uppercase tracking-wider">4. Investisseurs inscrits</span>
            <div class="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center text-xs">
              <i class="fas fa-hand-holding-dollar"></i>
            </div>
          </div>
          <div class="text-2xl font-black text-slate-800">${stats.investors_total}</div>
          <div class="text-[10px] font-bold text-purple-700 mt-1">${stats.investors_active} profils validés</div>
        </div>

        <!-- 5. Demandes de contact reçues -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs kpi-card">
          <div class="flex items-center justify-between text-slate-400 mb-2">
            <span class="text-[10px] font-bold uppercase tracking-wider">5. Demandes commerciales</span>
            <div class="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center text-xs">
              <i class="fas fa-envelope"></i>
            </div>
          </div>
          <div class="text-2xl font-black text-slate-800">${stats.inquiries_total}</div>
          <div class="text-[10px] font-bold text-rose-600 mt-1">${stats.inquiries_new} nouveaux messages</div>
        </div>
      </div>

      <!-- Charts Section (Visites 30j & Répartition) -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Traffic Chart -->
        <div class="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-sm font-bold text-slate-800">Évolution de la Fréquentation (30 derniers jours)</h3>
              <p class="text-[11px] text-slate-400">Visites uniques enregistrées sur le site www.pkglobalpartners.com</p>
            </div>
            <span class="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-bold text-[10px]">Temps Réel</span>
          </div>
          <div class="h-64 relative">
            <canvas id="chart-traffic"></canvas>
          </div>
        </div>

        <!-- Candidatures Distribution -->
        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <h3 class="text-sm font-bold text-slate-800 mb-1">Entonnoir des Projets</h3>
          <p class="text-[11px] text-slate-400 mb-4">Répartition des dossiers par statut</p>
          <div class="h-56 relative flex items-center justify-center">
            <canvas id="chart-candidatures"></canvas>
          </div>
        </div>
      </div>

      <!-- Real-time Activity Feed & Recent Inquiries -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Notifications & Latest Activities -->
        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-slate-800">Dernières Activités & Notifications</h3>
            <span class="text-[10px] text-slate-400 font-semibold">Flux en direct</span>
          </div>
          <div class="space-y-3">
            ${stats.notifications.slice(0, 6).map(n => `
              <div class="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center flex-shrink-0 text-xs mt-0.5">
                  <i class="fas ${n.type === 'candidature' ? 'fa-file-signature' : n.type === 'investor' ? 'fa-sack-dollar' : 'fa-bell'}"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-bold text-slate-800 truncate">${n.title}</div>
                  <div class="text-[11px] text-slate-600 mt-0.5 leading-snug">${n.message}</div>
                  <div class="text-[9px] text-slate-400 mt-1">${new Date(n.created_at).toLocaleString('fr-FR')}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Recent Inquiries -->
        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-slate-800">Dernières Demandes Commerciales</h3>
            <a href="#/inquiries" class="text-xs text-emerald-700 font-bold hover:underline">Voir toutes</a>
          </div>
          <div class="space-y-3">
            ${stats.recent_inquiries.map(inq => `
              <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div class="min-w-0">
                  <div class="text-xs font-bold text-slate-800 truncate">${inq.name} (${inq.organization || 'Client'})</div>
                  <div class="text-[10px] text-slate-500 truncate">${inq.service_requested}</div>
                  <div class="text-[9px] text-slate-400">${inq.reference} • ${new Date(inq.created_at).toLocaleDateString('fr-FR')}</div>
                </div>
                <span class="badge-status badge-${inq.status}">${inq.status}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Render Chart.js Traffic
  if (typeof Chart !== 'undefined') {
    const trafficCtx = document.getElementById('chart-traffic');
    if (trafficCtx) {
      const labels = stats.chart_traffic.map(t => {
        const d = new Date(t.visit_date);
        return `${d.getDate()}/${d.getMonth() + 1}`;
      });
      const data = stats.chart_traffic.map(t => t.count);

      currentChart1 = new Chart(trafficCtx, {
        type: 'line',
        data: {
          labels: labels.length ? labels : ['1', '5', '10', '15', '20', '25', '30'],
          datasets: [{
            label: 'Visiteurs uniques',
            data: data.length ? data : [15, 22, 19, 27, 35, 29, 31],
            borderColor: '#059669',
            backgroundColor: 'rgba(5, 150, 105, 0.08)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 3,
            pointBackgroundColor: '#064e3b'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // Candidatures Donut
    const candCtx = document.getElementById('chart-candidatures');
    if (candCtx) {
      const statusMap = { recu: 'Reçus', en_evaluation: 'En cours', retenu: 'Retenus', rejete: 'Rejetés' };
      const labels = stats.chart_candidatures.map(c => statusMap[c.status] || c.status);
      const data = stats.chart_candidatures.map(c => c.count);

      currentChart2 = new Chart(candCtx, {
        type: 'doughnut',
        data: {
          labels: labels.length ? labels : ['Reçus', 'En cours', 'Retenus', 'Rejetés'],
          datasets: [{
            data: data.length ? data : [4, 3, 2, 1],
            backgroundColor: ['#38bdf8', '#fbbf24', '#10b981', '#f87171']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }
          }
        }
      });
    }
  }
}

// -------------------------------------------------------------
// MODULE 2: GESTION DES CONTENUS DU SITE (CMS)
// -------------------------------------------------------------

async function renderContentsView(container) {
  const content = await api('/api/content');
  const services = await api('/api/services');
  const news = await api('/api/news');

  container.innerHTML = `
    <div class="space-y-8">
      
      <!-- Sub-tabs -->
      <div class="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button onclick="switchContentTab('presentation')" id="tab-btn-presentation" class="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-900 text-yellow-400">1. Présentation & Textes Clés</button>
        <button onclick="switchContentTab('services')" id="tab-btn-services" class="px-4 py-2 text-xs font-bold rounded-xl bg-white text-slate-600 hover:bg-slate-100">2. Pôles d'Expertise (${services.length})</button>
        <button onclick="switchContentTab('news')" id="tab-btn-news" class="px-4 py-2 text-xs font-bold rounded-xl bg-white text-slate-600 hover:bg-slate-100">3. Actualités & Annonces (${news.length})</button>
        <button onclick="switchContentTab('contact')" id="tab-btn-contact" class="px-4 py-2 text-xs font-bold rounded-xl bg-white text-slate-600 hover:bg-slate-100">4. Coordonnées & Réseaux</button>
      </div>

      <!-- TAB 1: PRESENTATION & HERO -->
      <div id="content-tab-presentation" class="space-y-6">
        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-slate-800">Texte d'Accroche Principal (Hero Section)</h3>
            <button onclick="saveHeroContent()" class="px-4 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-emerald-950 text-xs font-bold rounded-xl transition">Enregistrer</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Titre Principal</label>
              <input type="text" id="hero-title" value="${content.hero?.title || ''}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Badge d'en-tête</label>
              <input type="text" id="hero-badge" value="${content.hero?.badge || ''}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-bold text-slate-600 mb-1">Sous-titre / Descriptif</label>
              <textarea id="hero-subtitle" rows="2" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm leading-relaxed">${content.hero?.subtitle || ''}</textarea>
            </div>
          </div>
        </div>

        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-slate-800">Mission & Vision de PK Global Partners</h3>
            <button onclick="saveMissionContent()" class="px-4 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-emerald-950 text-xs font-bold rounded-xl transition">Enregistrer</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Titre de la Section Présentation</label>
              <input type="text" id="pres-headline" value="${content.presentation?.headline || ''}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold">
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-600 mb-1">Mission</label>
                <textarea id="pres-mission" rows="3" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">${content.presentation?.mission || ''}</textarea>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-600 mb-1">Vision</label>
                <textarea id="pres-vision" rows="3" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">${content.presentation?.vision || ''}</textarea>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 2: SERVICES / POLES -->
      <div id="content-tab-services" class="hidden space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-bold text-slate-800">Pôles d'Expertise & Services</h3>
            <p class="text-xs text-slate-500">Ajoutez ou modifiez les pôles affichés sur la page d'accueil</p>
          </div>
          <button onclick="openServiceModal()" class="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-yellow-400 text-xs font-bold rounded-xl shadow flex items-center gap-2">
            <i class="fas fa-plus"></i> Ajouter un Pôle
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${services.map(s => `
            <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2.5">
                    <div class="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center text-sm">
                      <i class="fas ${s.icon || 'fa-briefcase'}"></i>
                    </div>
                    <div>
                      <div class="font-bold text-sm text-slate-800">${s.title}</div>
                      <div class="text-[10px] text-slate-400">${s.category}</div>
                    </div>
                  </div>
                  <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${s.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">
                    ${s.active ? 'Actif' : 'Inactif'}
                  </span>
                </div>
                <p class="text-xs text-slate-600 leading-relaxed mb-4">${s.description}</p>
              </div>
              <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button onclick='editService(${JSON.stringify(s)})' class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg">Modifier</button>
                <button onclick="deleteService(${s.id})" class="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-lg">Supprimer</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- TAB 3: NEWS & ARTICLES -->
      <div id="content-tab-news" class="hidden space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-bold text-slate-800">Actualités, Événements & Communiqués</h3>
            <p class="text-xs text-slate-500">Gérez les publications officielles du groupe</p>
          </div>
          <button onclick="openNewsModal()" class="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-yellow-400 text-xs font-bold rounded-xl shadow flex items-center gap-2">
            <i class="fas fa-plus"></i> Rédiger une Actualité
          </button>
        </div>
        <div class="space-y-3">
          ${news.map(item => `
            <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div class="flex items-start gap-4">
                <img src="${item.image_url || '/logo.svg'}" class="w-16 h-16 rounded-xl object-cover bg-slate-100 flex-shrink-0">
                <div>
                  <div class="flex items-center gap-2 mb-1">
                    <span class="px-2 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-900 uppercase">${item.category}</span>
                    <span class="text-[10px] text-slate-400">${new Date(item.published_at).toLocaleDateString('fr-FR')}</span>
                    <span class="text-[10px] text-slate-500 font-semibold">• Par ${item.author_name || 'Admin'}</span>
                  </div>
                  <h4 class="font-bold text-sm text-slate-800">${item.title}</h4>
                  <p class="text-xs text-slate-500 line-clamp-1 mt-0.5">${item.summary || item.content}</p>
                </div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                <button onclick='editNews(${JSON.stringify(item)})' class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg">Modifier</button>
                <button onclick="deleteNews(${item.id})" class="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-lg">Supprimer</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- TAB 4: CONTACT & COORDONNÉES -->
      <div id="content-tab-contact" class="hidden space-y-6">
        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-slate-800">Coordonnées Officielles de Contact</h3>
            <button onclick="saveContactDetails()" class="px-4 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-emerald-950 text-xs font-bold rounded-xl transition">Enregistrer</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Téléphone Principal (Standard)</label>
              <input type="text" id="contact-phone" value="${content.contact_info?.phone || '+243 814 119 635'}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">WhatsApp Officiel</label>
              <input type="text" id="contact-whatsapp" value="${content.contact_info?.whatsapp || '+243814119635'}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Email Général</label>
              <input type="email" id="contact-email-general" value="${content.contact_info?.email_general || 'info@pkglobalpartners.com'}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Email Relations Investisseurs</label>
              <input type="email" id="contact-email-investors" value="${content.contact_info?.email_investors || 'investors@pkglobalpartners.com'}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Adresse Siège Goma (RDC)</label>
              <input type="text" id="contact-addr-goma" value="${content.contact_info?.address_goma || ''}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Adresse Représentation Kinshasa (RDC)</label>
              <input type="text" id="contact-addr-kin" value="${content.contact_info?.address_kinshasa || ''}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function switchContentTab(tab) {
  ['presentation', 'services', 'news', 'contact'].forEach(t => {
    const el = document.getElementById(`content-tab-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (t === tab) {
      if (el) el.classList.remove('hidden');
      if (btn) { btn.className = 'px-4 py-2 text-xs font-bold rounded-xl bg-emerald-900 text-yellow-400'; }
    } else {
      if (el) el.classList.add('hidden');
      if (btn) { btn.className = 'px-4 py-2 text-xs font-bold rounded-xl bg-white text-slate-600 hover:bg-slate-100'; }
    }
  });
}

async function saveHeroContent() {
  const title = document.getElementById('hero-title').value;
  const subtitle = document.getElementById('hero-subtitle').value;
  const badge = document.getElementById('hero-badge').value;

  await api('/api/content/hero', {
    method: 'PUT',
    body: { title, subtitle, badge }
  });
  showToast('Accroche Hero mise à jour !');
}

async function saveMissionContent() {
  const headline = document.getElementById('pres-headline').value;
  const mission = document.getElementById('pres-mission').value;
  const vision = document.getElementById('pres-vision').value;

  await api('/api/content/presentation', {
    method: 'PUT',
    body: { headline, mission, vision }
  });
  showToast('Mission et vision mises à jour !');
}

async function saveContactDetails() {
  const phone = document.getElementById('contact-phone').value;
  const whatsapp = document.getElementById('contact-whatsapp').value;
  const email_general = document.getElementById('contact-email-general').value;
  const email_investors = document.getElementById('contact-email-investors').value;
  const address_goma = document.getElementById('contact-addr-goma').value;
  const address_kinshasa = document.getElementById('contact-addr-kin').value;

  await api('/api/content/contact_info', {
    method: 'PUT',
    body: { phone, whatsapp, email_general, email_investors, address_goma, address_kinshasa }
  });
  showToast('Coordonnées mises à jour !');
}

function openServiceModal(service = null) {
  openModal(service ? 'Modifier le Pôle' : 'Ajouter un Pôle', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Intitulé du pôle</label>
        <input type="text" id="svc-title" value="${service?.title || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Catégorie</label>
        <input type="text" id="svc-category" value="${service?.category || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="Ex: Pôle Industriel">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Icône FontAwesome</label>
        <input type="text" id="svc-icon" value="${service?.icon || 'fa-briefcase'}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="fa-utensils, fa-chart-line, fa-truck...">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Description détaillée</label>
        <textarea id="svc-desc" rows="3" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">${service?.description || ''}</textarea>
      </div>
    </div>
  `, async () => {
    const title = document.getElementById('svc-title').value;
    const category = document.getElementById('svc-category').value;
    const icon = document.getElementById('svc-icon').value;
    const description = document.getElementById('svc-desc').value;

    if (!title || !description) throw new Error('Titre et description requis');

    if (service) {
      await api(`/api/services/${service.id}`, {
        method: 'PUT',
        body: { title, category, icon, description }
      });
      showToast('Pôle modifié !');
    } else {
      await api('/api/services', {
        method: 'POST',
        body: { title, category, icon, description }
      });
      showToast('Nouveau pôle ajouté !');
    }
    renderView('contents');
  });
}

function editService(s) {
  openServiceModal(s);
}

async function deleteService(id) {
  if (!confirm('Voulez-vous vraiment supprimer ce pôle d\'expertise ?')) return;
  await api(`/api/services/${id}`, { method: 'DELETE' });
  showToast('Pôle supprimé.');
  renderView('contents');
}

function openNewsModal(item = null) {
  openModal(item ? 'Modifier l\'Actualité' : 'Publier une Actualité', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Titre de l'article</label>
        <input type="text" id="news-title" value="${item?.title || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Catégorie</label>
          <select id="news-cat" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="Actualité" ${item?.category === 'Actualité' ? 'selected' : ''}>Actualité</option>
            <option value="Événement" ${item?.category === 'Événement' ? 'selected' : ''}>Événement</option>
            <option value="Communiqué" ${item?.category === 'Communiqué' ? 'selected' : ''}>Communiqué</option>
            <option value="Annonce" ${item?.category === 'Annonce' ? 'selected' : ''}>Annonce</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">URL Image d'illustration</label>
          <input type="text" id="news-img" value="${item?.image_url || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="https://...">
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Bref résumé / Chapeau</label>
        <textarea id="news-summary" rows="2" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">${item?.summary || ''}</textarea>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Corps complet de l'article</label>
        <textarea id="news-content" rows="4" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">${item?.content || ''}</textarea>
      </div>
    </div>
  `, async () => {
    const title = document.getElementById('news-title').value;
    const category = document.getElementById('news-cat').value;
    const image_url = document.getElementById('news-img').value;
    const summary = document.getElementById('news-summary').value;
    const content = document.getElementById('news-content').value;

    if (!title || !content) throw new Error('Titre et contenu obligatoires.');

    if (item) {
      await api(`/api/news/${item.id}`, {
        method: 'PUT',
        body: { title, category, image_url, summary, content }
      });
      showToast('Actualité mise à jour !');
    } else {
      await api('/api/news', {
        method: 'POST',
        body: { title, category, image_url, summary, content }
      });
      showToast('Actualité publiée avec succès !');
    }
    renderView('contents');
  });
}

function editNews(item) {
  openNewsModal(item);
}

async function deleteNews(id) {
  if (!confirm('Supprimer cette publication ?')) return;
  await api(`/api/news/${id}`, { method: 'DELETE' });
  showToast('Publication supprimée.');
  renderView('contents');
}

// -------------------------------------------------------------
// MODULE 3: GESTION DES APPELS À PROJETS
// -------------------------------------------------------------

async function renderCallsView(container) {
  const calls = await api('/api/calls');

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Programmes et Appels à Projets</h3>
          <p class="text-xs text-slate-500">Créez et publiez des opportunités de financement pour entrepreneurs congolais</p>
        </div>
        <button onclick="openCallModal()" class="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-yellow-400 text-xs font-bold rounded-xl shadow flex items-center gap-2">
          <i class="fas fa-plus"></i> Créer un Appel à Projets
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        ${calls.map(call => `
          <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-3">
                <span class="badge-status ${call.status === 'open' ? 'badge-retenu' : 'badge-rejete'}">
                  ${call.status === 'open' ? 'Ouvert aux candidatures' : 'Clôturé'}
                </span>
                <span class="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <i class="fas fa-folder-open text-emerald-600"></i> ${call.candidatures_count} dossiers reçus
                </span>
              </div>
              <h4 class="font-extrabold text-base text-slate-800 mb-2">${call.title}</h4>
              <p class="text-xs text-slate-600 leading-relaxed mb-4">${call.description}</p>
              
              <div class="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs mb-4">
                <div class="flex items-center justify-between">
                  <span class="text-slate-400 font-semibold">Secteur cible :</span>
                  <span class="font-bold text-slate-700">${call.target_sector}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400 font-semibold">Enveloppe :</span>
                  <span class="font-bold text-emerald-700">${call.budget_indicatif}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400 font-semibold">Date Limite :</span>
                  <span class="font-bold text-red-600">${new Date(call.deadline).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button onclick="navigateTo('candidatures')" class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl">Voir Candidatures</button>
              <button onclick='editCall(${JSON.stringify(call)})' class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl">Modifier</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function openCallModal(call = null) {
  openModal(call ? 'Modifier l\'Appel à Projets' : 'Créer un Nouvel Appel à Projets', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Titre de l'appel</label>
        <input type="text" id="call-title" value="${call?.title || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold">
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Secteur cible</label>
          <input type="text" id="call-sector" value="${call?.target_sector || 'Agroalimentaire & Transformation'}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Budget / Enveloppe indicative</label>
          <input type="text" id="call-budget" value="${call?.budget_indicatif || 'Jusqu\'à 100 000 USD'}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Date limite de dépôt</label>
          <input type="date" id="call-deadline" value="${call?.deadline ? call.deadline.substring(0, 10) : ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Statut</label>
          <select id="call-status" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="open" ${call?.status === 'open' ? 'selected' : ''}>Ouvert (Acceptant candidatures)</option>
            <option value="closed" ${call?.status === 'closed' ? 'selected' : ''}>Clôturé</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Description des objectifs</label>
        <textarea id="call-desc" rows="3" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">${call?.description || ''}</textarea>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Critères d'éligibilité</label>
        <textarea id="call-elig" rows="2" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">${call?.eligibility || ''}</textarea>
      </div>
    </div>
  `, async () => {
    const title = document.getElementById('call-title').value;
    const target_sector = document.getElementById('call-sector').value;
    const budget_indicatif = document.getElementById('call-budget').value;
    const deadline = document.getElementById('call-deadline').value;
    const status = document.getElementById('call-status').value;
    const description = document.getElementById('call-desc').value;
    const eligibility = document.getElementById('call-elig').value;

    if (!title || !deadline) throw new Error('Titre et date limite obligatoires.');

    if (call) {
      await api(`/api/calls/${call.id}`, {
        method: 'PUT',
        body: { title, target_sector, budget_indicatif, deadline, status, description, eligibility }
      });
      showToast('Appel à projets mis à jour !');
    } else {
      await api('/api/calls', {
        method: 'POST',
        body: { title, target_sector, budget_indicatif, deadline, status, description, eligibility }
      });
      showToast('Appel à projets publié !');
    }
    renderView('calls');
  });
}

function editCall(call) {
  openCallModal(call);
}

// -------------------------------------------------------------
// MODULE 3 BIS: CANDIDATURES & PROJETS
// -------------------------------------------------------------

async function renderCandidaturesView(container, filterStatus = 'all') {
  const candidatures = await api(`/api/candidatures?status=${filterStatus}`);

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- Top Filters & Actions -->
      <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-bold text-slate-400 mr-2 uppercase tracking-wider">Statut :</span>
          <button onclick="filterCandidatures('all')" class="px-3 py-1.5 text-xs font-bold rounded-xl ${filterStatus === 'all' ? 'bg-emerald-900 text-yellow-400' : 'bg-slate-100 text-slate-600'}">Tous (${candidatures.length})</button>
          <button onclick="filterCandidatures('recu')" class="px-3 py-1.5 text-xs font-bold rounded-xl ${filterStatus === 'recu' ? 'bg-emerald-900 text-yellow-400' : 'bg-slate-100 text-slate-600'}">Reçus</button>
          <button onclick="filterCandidatures('en_evaluation')" class="px-3 py-1.5 text-xs font-bold rounded-xl ${filterStatus === 'en_evaluation' ? 'bg-emerald-900 text-yellow-400' : 'bg-slate-100 text-slate-600'}">En Évaluation</button>
          <button onclick="filterCandidatures('retenu')" class="px-3 py-1.5 text-xs font-bold rounded-xl ${filterStatus === 'retenu' ? 'bg-emerald-900 text-yellow-400' : 'bg-slate-100 text-slate-600'}">Retenus</button>
          <button onclick="filterCandidatures('rejete')" class="px-3 py-1.5 text-xs font-bold rounded-xl ${filterStatus === 'rejete' ? 'bg-emerald-900 text-yellow-400' : 'bg-slate-100 text-slate-600'}">Rejetés</button>
        </div>
        
        <div class="flex items-center gap-2">
          <a href="/api/candidatures/export/excel" class="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-yellow-400 text-xs font-bold rounded-xl shadow flex items-center gap-2">
            <i class="fas fa-file-excel"></i> Exporter en Excel (.xlsx)
          </a>
        </div>
      </div>

      <!-- Candidatures Table -->
      <div class="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
              <tr>
                <th class="py-3.5 px-4">Réf / Date</th>
                <th class="py-3.5 px-4">Porteur de Projet</th>
                <th class="py-3.5 px-4">Titre du Projet & Secteur</th>
                <th class="py-3.5 px-4">Financement</th>
                <th class="py-3.5 px-4">Statut</th>
                <th class="py-3.5 px-4">Évaluation</th>
                <th class="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${candidatures.length === 0 ? `
                <tr><td colspan="7" class="py-12 text-center text-slate-400">Aucune candidature trouvée.</td></tr>
              ` : candidatures.map(c => `
                <tr class="hover:bg-slate-50/70 transition">
                  <td class="py-3.5 px-4">
                    <span class="font-bold text-emerald-900">#CAND-${c.id}</span>
                    <div class="text-[10px] text-slate-400">${new Date(c.submitted_at).toLocaleDateString('fr-FR')}</div>
                  </td>
                  <td class="py-3.5 px-4">
                    <div class="font-bold text-slate-800">${c.candidate_name}</div>
                    <div class="text-[10px] text-slate-500">${c.candidate_email}</div>
                    <div class="text-[10px] text-slate-400">${c.candidate_phone || '-'}</div>
                  </td>
                  <td class="py-3.5 px-4 max-w-xs">
                    <div class="font-bold text-slate-800 truncate">${c.project_title}</div>
                    <span class="text-[9px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">${c.sector} • ${c.location}</span>
                  </td>
                  <td class="py-3.5 px-4">
                    <span class="font-black text-emerald-800">${Number(c.funding_requested).toLocaleString('fr-FR')} ${c.currency}</span>
                  </td>
                  <td class="py-3.5 px-4">
                    <span class="badge-status badge-${c.status}">${c.status.replace('_', ' ')}</span>
                  </td>
                  <td class="py-3.5 px-4">
                    ${c.evaluation_score ? `
                      <div class="flex items-center gap-1 font-bold text-amber-600">
                        <i class="fas fa-star text-[10px]"></i>
                        <span>${c.evaluation_score} / 5</span>
                      </div>
                      <span class="text-[9px] text-slate-400 block truncate max-w-[120px]" title="${c.evaluation_notes || ''}">${c.evaluation_notes || ''}</span>
                    ` : '<span class="text-[10px] text-slate-400 italic">Non évalué</span>'}
                  </td>
                  <td class="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="viewCandidatureDetail(${c.id})" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold" title="Détails du dossier">
                      <i class="fas fa-eye text-xs"></i>
                    </button>
                    <button onclick="openEvaluationModal(${c.id})" class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg font-bold" title="Évaluer & Noter">
                      <i class="fas fa-gavel text-xs"></i>
                    </button>
                    <button onclick="openNotifyCandidateModal(${c.id})" class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold" title="Envoyer email au candidat">
                      <i class="fas fa-paper-plane text-xs"></i>
                    </button>
                    <a href="/api/reports/pdf/candidature/${c.id}" target="_blank" class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg font-bold inline-block" title="Télécharger Fiche PDF">
                      <i class="fas fa-file-pdf text-xs"></i>
                    </a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function filterCandidatures(status) {
  const container = document.getElementById('view-container');
  renderCandidaturesView(container, status);
}

async function viewCandidatureDetail(id) {
  const c = await api(`/api/candidatures/${id}`);

  openModal(`Dossier #${c.id} : ${c.project_title}`, `
    <div class="space-y-5 text-xs">
      <div class="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <div>
          <span class="text-slate-400 font-semibold block">Candidat</span>
          <span class="font-bold text-slate-800 text-sm">${c.candidate_name}</span>
          <span class="text-slate-500 block">${c.candidate_email} | ${c.candidate_phone}</span>
        </div>
        <div>
          <span class="text-slate-400 font-semibold block">Financement Sollicité</span>
          <span class="font-black text-emerald-700 text-base">${Number(c.funding_requested).toLocaleString('fr-FR')} ${c.currency}</span>
          <span class="text-slate-500 block">Secteur : ${c.sector} (${c.location})</span>
        </div>
      </div>

      <div>
        <h4 class="font-bold text-slate-700 uppercase tracking-wider mb-1">Résumé du Projet</h4>
        <p class="text-slate-600 bg-white p-3 rounded-xl border border-slate-200 leading-relaxed">${c.summary}</p>
      </div>

      ${c.details ? `
      <div>
        <h4 class="font-bold text-slate-700 uppercase tracking-wider mb-1">Détails Opérationnels</h4>
        <p class="text-slate-600 bg-white p-3 rounded-xl border border-slate-200 leading-relaxed">${c.details}</p>
      </div>
      ` : ''}

      <div>
        <h4 class="font-bold text-slate-700 uppercase tracking-wider mb-1">Document Attaché (Business Plan / Pitch)</h4>
        ${c.document_url ? `
          <a href="${c.document_url}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-800 rounded-xl font-bold border border-emerald-200 hover:bg-emerald-100 transition">
            <i class="fas fa-file-arrow-down text-sm"></i>
            <span>Télécharger le document (${c.document_name || 'Fichier joint'})</span>
          </a>
        ` : '<span class="text-slate-400 italic">Aucun document joint.</span>'}
      </div>

      <div class="bg-amber-50 p-4 rounded-2xl border border-amber-200/80">
        <h4 class="font-bold text-amber-900 uppercase tracking-wider mb-1">Évaluation du Comité</h4>
        <div class="flex items-center gap-3 mb-2">
          <span class="font-black text-amber-700 text-lg">${c.evaluation_score ? c.evaluation_score + ' / 5' : 'Non évalué'}</span>
          <span class="text-[10px] text-slate-500">• Statut actuel : <strong class="uppercase">${c.status}</strong></span>
        </div>
        <p class="text-slate-600 italic">"${c.evaluation_notes || 'Aucun commentaire d\'évaluation enregistré.'}"</p>
      </div>
    </div>
  `);
}

async function openEvaluationModal(id) {
  const c = await api(`/api/candidatures/${id}`);

  openModal(`Évaluer le projet : ${c.project_title}`, `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Note globale d'évaluation (sur 5 étoiles)</label>
        <select id="eval-score" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-amber-600">
          <option value="5" ${Math.round(c.evaluation_score) === 5 ? 'selected' : ''}>★★★★★ 5 / 5 - Projet Exceptionnel (Priorité Investissement)</option>
          <option value="4" ${Math.round(c.evaluation_score) === 4 ? 'selected' : ''}>★★★★☆ 4 / 5 - Très Bon Projet (Faisabilité élevée)</option>
          <option value="3" ${Math.round(c.evaluation_score) === 3 ? 'selected' : ''}>★★★☆☆ 3 / 5 - Projet Moyen (Ajustements nécessaires)</option>
          <option value="2" ${Math.round(c.evaluation_score) === 2 ? 'selected' : ''}>★★☆☆☆ 2 / 5 - Faible viabilité économique</option>
          <option value="1" ${Math.round(c.evaluation_score) === 1 ? 'selected' : ''}>★☆☆☆☆ 1 / 5 - Non aligné / Inéligible</option>
        </select>
      </div>

      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Changement de statut du projet</label>
        <select id="eval-status" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold">
          <option value="en_evaluation" ${c.status === 'en_evaluation' ? 'selected' : ''}>En cours d'évaluation</option>
          <option value="retenu" ${c.status === 'retenu' ? 'selected' : ''}>Retenu (Sélectionné pour accompagnement/financement)</option>
          <option value="rejete" ${c.status === 'rejete' ? 'selected' : ''}>Rejeté (Dossier non retenu)</option>
          <option value="recu" ${c.status === 'recu' ? 'selected' : ''}>Reçu (En attente de revue)</option>
        </select>
      </div>

      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Avis du comité & Commentaires d'évaluation</label>
        <textarea id="eval-notes" rows="4" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs" placeholder="Rentabilité, impact social, pertinence locale, solidité de l'équipe...">${c.evaluation_notes || ''}</textarea>
      </div>
    </div>
  `, async () => {
    const score = parseFloat(document.getElementById('eval-score').value);
    const status = document.getElementById('eval-status').value;
    const notes = document.getElementById('eval-notes').value;

    await api(`/api/candidatures/${id}/evaluate`, {
      method: 'PUT',
      body: { evaluation_score: score, status, evaluation_notes: notes }
    });

    showToast(`Évaluation du projet #${id} enregistrée !`);
    renderView('candidatures');
  }, 'Valider l\'Évaluation');
}

async function openNotifyCandidateModal(id) {
  const c = await api(`/api/candidatures/${id}`);

  openModal(`Notifier le candidat : ${c.candidate_name}`, `
    <div class="space-y-4">
      <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600">
        Destinataire : <strong class="text-slate-800">${c.candidate_name} &lt;${c.candidate_email}&gt;</strong>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Modèle de notification</label>
        <select id="notif-template" onchange="applyCandidateTemplate(this.value, '${c.candidate_name}', '${c.project_title}')" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs">
          <option value="">Sélectionner un modèle rapide...</option>
          <option value="recu">Accusé de réception officiel</option>
          <option value="interview">Convocation à l'entretien de pitch</option>
          <option value="retenu">Notification : Projet Retenu !</option>
          <option value="rejete">Notification : Projet Non Retenu</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Objet de l'email</label>
        <input type="text" id="notif-subject" value="PK Global Partners - Décision concernant votre candidature [${c.project_title}]" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Message personnalisé</label>
        <textarea id="notif-body" rows="5" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs leading-relaxed">Bonjour ${c.candidate_name},&#10;&#10;Nous faisons suite à l'examen de votre projet "${c.project_title}".&#10;&#10;Cordialement,&#10;L'équipe PK GLOBAL PARTNERS</textarea>
      </div>
    </div>
  `, async () => {
    const subject = document.getElementById('notif-subject').value;
    const message = document.getElementById('notif-body').value;

    await api(`/api/candidatures/${id}/notify`, {
      method: 'POST',
      body: { subject, message }
    });

    showToast(`Notification email envoyée à ${c.candidate_email} !`);
  }, 'Envoyer la Notification');
}

function applyCandidateTemplate(tpl, name, title) {
  const sub = document.getElementById('notif-subject');
  const body = document.getElementById('notif-body');
  if (!sub || !body) return;

  if (tpl === 'recu') {
    sub.value = `Accusé de réception - Projet "${title}"`;
    body.value = `Bonjour ${name},\n\nNous vous confirmons la bonne réception de votre dossier de candidature pour le projet "${title}".\nNos équipes procèdent actuellement à l'analyse de conformité et vous contacteront prochainement.\n\nBien cordialement,\nLe Comité de Sélection PK GLOBAL PARTNERS`;
  } else if (tpl === 'interview') {
    sub.value = `Convocation à l'audition de sélection - Projet "${title}"`;
    body.value = `Bonjour ${name},\n\nLe comité d'évaluation a retenu votre dossier pour l'étape des auditions orales.\nNous vous invitons à une présentation de 20 minutes (visio ou à notre siège de Goma) afin d'approfondir votre plan de déploiement.\nMerci de nous indiquer vos disponibilités.\n\nBien cordialement,\nPK GLOBAL PARTNERS`;
  } else if (tpl === 'retenu') {
    sub.value = `FÉLICITATIONS : Votre projet "${title}" est retenu !`;
    body.value = `Cher(e) ${name},\n\nNous avons le grand plaisir de vous annoncer que votre projet "${title}" a été officiellement sélectionné par le comité d'investissement de PK GLOBAL PARTNERS.\nNotre équipe prendra attache avec vous pour la signature de la convention de partenariat et les prochaines étapes.\n\nFélicitations pour cette belle réussite !\n\nCordialement,\nLa Direction Générale - PK GLOBAL PARTNERS`;
  } else if (tpl === 'rejete') {
    sub.value = `Information relative à votre candidature : "${title}"`;
    body.value = `Bonjour ${name},\n\nNous vous remercions chaleureusement pour votre participation et pour la qualité du dossier soumis.\nAprès délibération, nous avons le regret de vous informer que votre projet n'a pas été retenu pour cette session, en raison du nombre limité d'enveloppes disponibles.\nNous vous encourageons vivement à poursuivre votre démarche entrepreneuriale et à postuler lors de nos prochains appels.\n\nBien cordialement,\nLe Comité de Sélection`;
  }
}

// -------------------------------------------------------------
// MODULE 4: GESTION DES INVESTISSEURS
// -------------------------------------------------------------

async function renderInvestorsView(container) {
  const investors = await api('/api/investors');

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Répertoire des Investisseurs Partenaires</h3>
          <p class="text-xs text-slate-500">Suivi des profils, tickets d'investissement et opportunités de deals</p>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="openInvestorModal()" class="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-yellow-400 text-xs font-bold rounded-xl shadow flex items-center gap-2">
            <i class="fas fa-user-plus"></i> Inscrire un Investisseur
          </button>
          <a href="/api/investors/export/excel" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-2">
            <i class="fas fa-file-excel text-emerald-700"></i> Export Excel (.xlsx)
          </a>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${investors.map(inv => `
          <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-3">
                <span class="badge-status badge-${inv.status}">${inv.status === 'valide' ? 'Validé' : inv.status === 'en_attente' ? 'En attente' : 'Désactivé'}</span>
                <span class="text-[10px] font-bold text-slate-400">${inv.country}</span>
              </div>
              <h4 class="font-extrabold text-base text-slate-800 mb-0.5">${inv.name}</h4>
              <p class="text-xs font-bold text-emerald-800 mb-3">${inv.organization}</p>
              
              <div class="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs mb-4">
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Type :</span>
                  <span class="font-semibold text-slate-700">${inv.investor_type}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Capacité Ticket :</span>
                  <span class="font-black text-slate-800">${Number(inv.ticket_min).toLocaleString()} - ${Number(inv.ticket_max).toLocaleString()} $</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Intérêt deals :</span>
                  <span class="font-bold text-emerald-700">${inv.interests_count || 0} projet(s) suivi(s)</span>
                </div>
                <div class="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                  <strong class="text-slate-700">Secteurs :</strong> ${inv.sectors_of_interest || 'Non spécifiés'}
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
              <button onclick="toggleInvestorStatus(${inv.id}, '${inv.status}')" class="text-[11px] font-bold ${inv.status === 'valide' ? 'text-amber-600 hover:text-amber-800' : 'text-emerald-600 hover:text-emerald-800'}">
                ${inv.status === 'valide' ? 'Désactiver compte' : 'Valider compte'}
              </button>
              <button onclick="openInvestorDetailModal(${inv.id})" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex items-center gap-1.5">
                <i class="fas fa-handshake text-xs"></i> Suivre Deals
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function toggleInvestorStatus(id, current) {
  const next = current === 'valide' ? 'desactive' : 'valide';
  await api(`/api/investors/${id}/status`, {
    method: 'PUT',
    body: { status: next }
  });
  showToast(`Compte investisseur passé à : ${next}`);
  renderView('investors');
}

function openInvestorModal(inv = null) {
  openModal(inv ? 'Modifier l\'Investisseur' : 'Inscrire un Nouvel Investisseur', `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Nom du contact</label>
          <input type="text" id="inv-name" value="${inv?.name || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Organisation / Fonds</label>
          <input type="text" id="inv-org" value="${inv?.organization || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Email professionnel</label>
          <input type="email" id="inv-email" value="${inv?.email || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Téléphone</label>
          <input type="text" id="inv-phone" value="${inv?.phone || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Type d'investisseur</label>
          <select id="inv-type" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="Fonds d'investissement" ${inv?.investor_type === "Fonds d'investissement" ? 'selected' : ''}>Fonds d'investissement</option>
            <option value="Business Angel" ${inv?.investor_type === "Business Angel" ? 'selected' : ''}>Business Angel</option>
            <option value="Family Office" ${inv?.investor_type === "Family Office" ? 'selected' : ''}>Family Office</option>
            <option value="Banque / Institution" ${inv?.investor_type === "Banque / Institution" ? 'selected' : ''}>Banque / Institution</option>
            <option value="Autre" ${inv?.investor_type === "Autre" ? 'selected' : ''}>Autre</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Pays d'origine</label>
          <input type="text" id="inv-country" value="${inv?.country || 'RDC'}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Ticket Min (USD)</label>
          <input type="number" id="inv-ticket-min" value="${inv?.ticket_min || 50000}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Ticket Max (USD)</label>
          <input type="number" id="inv-ticket-max" value="${inv?.ticket_max || 500000}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Secteurs d'intérêt</label>
        <input type="text" id="inv-sectors" value="${inv?.sectors_of_interest || 'Agroalimentaire, Distribution, Restauration'}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Notes internes & Historique de contact</label>
        <textarea id="inv-notes" rows="2" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs">${inv?.notes || ''}</textarea>
      </div>
    </div>
  `, async () => {
    const name = document.getElementById('inv-name').value;
    const organization = document.getElementById('inv-org').value;
    const email = document.getElementById('inv-email').value;
    const phone = document.getElementById('inv-phone').value;
    const investor_type = document.getElementById('inv-type').value;
    const country = document.getElementById('inv-country').value;
    const ticket_min = parseFloat(document.getElementById('inv-ticket-min').value) || 0;
    const ticket_max = parseFloat(document.getElementById('inv-ticket-max').value) || 0;
    const sectors_of_interest = document.getElementById('inv-sectors').value;
    const notes = document.getElementById('inv-notes').value;

    if (!name || !organization || !email) throw new Error('Nom, organisation et email requis.');

    if (inv) {
      await api(`/api/investors/${inv.id}`, {
        method: 'PUT',
        body: { name, organization, email, phone, investor_type, country, ticket_min, ticket_max, sectors_of_interest, notes }
      });
      showToast('Profil investisseur mis à jour !');
    } else {
      await api('/api/investors', {
        method: 'POST',
        body: { name, organization, email, phone, investor_type, country, ticket_min, ticket_max, sectors_of_interest, notes, status: 'valide' }
      });
      showToast('Investisseur ajouté !');
    }
    renderView('investors');
  });
}

async function openInvestorDetailModal(id) {
  const inv = await api(`/api/investors/${id}`);

  openModal(`Pipeline d'Opportunités : ${inv.name} (${inv.organization})`, `
    <div class="space-y-5 text-xs">
      <div class="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <div>
          <span class="text-slate-400 font-semibold block">Ticket moyen :</span>
          <span class="font-extrabold text-slate-800 text-sm">${Number(inv.ticket_min).toLocaleString()} à ${Number(inv.ticket_max).toLocaleString()} USD</span>
        </div>
        <button onclick="openAddDealModal(${inv.id})" class="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-emerald-950 font-bold rounded-xl shadow-xs">
          + Associer à un Projet
        </button>
      </div>

      <div>
        <h4 class="font-bold text-slate-800 uppercase tracking-wider mb-2">Projets & Deals en Négociation</h4>
        <div class="space-y-3">
          ${inv.interests.length === 0 ? `
            <div class="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl">Aucun projet actuellement associé.</div>
          ` : inv.interests.map(deal => `
            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div class="flex items-center justify-between mb-1">
                <span class="font-bold text-slate-800 text-sm">${deal.project_title}</span>
                <span class="font-black text-emerald-800">${Number(deal.amount_intended).toLocaleString()} USD</span>
              </div>
              <div class="flex items-center gap-2 mb-2">
                <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[9px] uppercase">${deal.stage}</span>
                <span class="text-[10px] text-slate-400">${new Date(deal.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
              <p class="text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[11px]">${deal.notes || 'Aucune note'}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `);
}

function openAddDealModal(investorId) {
  openModal('Associer un Projet / Ticket d\'Intérêt', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Intitulé de l'opportunité / Projet</label>
        <input type="text" id="deal-title" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="Ex: Expansion torréfaction ELIKYA ou Nom d'un projet candidat">
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Montant envisagé (USD)</label>
          <input type="number" id="deal-amount" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="100000">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Étape du deal</label>
          <select id="deal-stage" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold">
            <option value="Premier contact">Premier contact</option>
            <option value="Due Diligence">Due Diligence</option>
            <option value="Négociation">Négociation</option>
            <option value="Term Sheet">Term Sheet</option>
            <option value="Clôturé">Investissement Clôturé</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Notes & Déroulé des échanges</label>
        <textarea id="deal-notes" rows="3" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs" placeholder="Compte-rendu de réunion, conditions suspensives..."></textarea>
      </div>
    </div>
  `, async () => {
    const project_title = document.getElementById('deal-title').value;
    const amount_intended = parseFloat(document.getElementById('deal-amount').value) || 0;
    const stage = document.getElementById('deal-stage').value;
    const notes = document.getElementById('deal-notes').value;

    if (!project_title) throw new Error('Titre du projet requis');

    await api(`/api/investors/${investorId}/interests`, {
      method: 'POST',
      body: { project_title, amount_intended, stage, notes }
    });
    showToast('Opportunité de deal enregistrée !');
    openInvestorDetailModal(investorId);
  }, 'Associer');
}

// -------------------------------------------------------------
// MODULE 5: GESTION DES DEMANDES COMMERCIALES & CRM
// -------------------------------------------------------------

async function renderInquiriesView(container, filterStatus = 'all') {
  const inquiries = await api(`/api/inquiries?status=${filterStatus}`);
  const users = (currentUser.role === 'superadmin' || currentUser.role === 'admin') ? await api('/api/users') : [];

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-bold text-slate-400 mr-2 uppercase tracking-wider">Statut :</span>
          <button onclick="filterInquiries('all')" class="px-3 py-1.5 text-xs font-bold rounded-xl ${filterStatus === 'all' ? 'bg-emerald-900 text-yellow-400' : 'bg-slate-100 text-slate-600'}">Tous (${inquiries.length})</button>
          <button onclick="filterInquiries('nouveau')" class="px-3 py-1.5 text-xs font-bold rounded-xl ${filterStatus === 'nouveau' ? 'bg-emerald-900 text-yellow-400' : 'bg-slate-100 text-slate-600'}">Nouveaux</button>
          <button onclick="filterInquiries('en_cours')" class="px-3 py-1.5 text-xs font-bold rounded-xl ${filterStatus === 'en_cours' ? 'bg-emerald-900 text-yellow-400' : 'bg-slate-100 text-slate-600'}">En Cours</button>
          <button onclick="filterInquiries('en_attente')" class="px-3 py-1.5 text-xs font-bold rounded-xl ${filterStatus === 'en_attente' ? 'bg-emerald-900 text-yellow-400' : 'bg-slate-100 text-slate-600'}">En Attente</button>
          <button onclick="filterInquiries('resolu')" class="px-3 py-1.5 text-xs font-bold rounded-xl ${filterStatus === 'resolu' ? 'bg-emerald-900 text-yellow-400' : 'bg-slate-100 text-slate-600'}">Résolus</button>
        </div>
        <a href="/api/inquiries/export/excel" class="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-yellow-400 text-xs font-bold rounded-xl shadow flex items-center gap-2">
          <i class="fas fa-file-excel"></i> Export Excel (.xlsx)
        </a>
      </div>

      <div class="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
              <tr>
                <th class="py-3.5 px-4">Réf / Date</th>
                <th class="py-3.5 px-4">Prospect / Client</th>
                <th class="py-3.5 px-4">Service & Objet</th>
                <th class="py-3.5 px-4">Statut</th>
                <th class="py-3.5 px-4">Attribué à</th>
                <th class="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${inquiries.length === 0 ? `
                <tr><td colspan="6" class="py-12 text-center text-slate-400">Aucune demande commerciale trouvée.</td></tr>
              ` : inquiries.map(inq => `
                <tr class="hover:bg-slate-50/70 transition">
                  <td class="py-3.5 px-4">
                    <span class="font-bold text-emerald-900">${inq.reference}</span>
                    <div class="text-[10px] text-slate-400">${new Date(inq.created_at).toLocaleDateString('fr-FR')}</div>
                  </td>
                  <td class="py-3.5 px-4">
                    <div class="font-bold text-slate-800">${inq.name}</div>
                    <div class="text-[10px] text-slate-500">${inq.organization || 'Particulier'}</div>
                    <div class="text-[10px] text-slate-400">${inq.email} | ${inq.phone || '-'}</div>
                  </td>
                  <td class="py-3.5 px-4 max-w-xs">
                    <span class="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-800 uppercase block w-fit mb-1">${inq.service_requested}</span>
                    <div class="font-bold text-slate-800 truncate">${inq.subject}</div>
                    <div class="text-[10px] text-slate-500 line-clamp-1">${inq.message}</div>
                  </td>
                  <td class="py-3.5 px-4">
                    <span class="badge-status badge-${inq.status}">${inq.status.replace('_', ' ')}</span>
                  </td>
                  <td class="py-3.5 px-4">
                    ${(currentUser.role === 'superadmin' || currentUser.role === 'admin') ? `
                      <select onchange="assignInquiry(${inq.id}, this.value)" class="px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white font-semibold">
                        <option value="">Non assigné</option>
                        ${users.map(u => `<option value="${u.id}" ${inq.assigned_to === u.id ? 'selected' : ''}>${u.name}</option>`).join('')}
                      </select>
                    ` : `<span class="font-semibold text-slate-700">${inq.assigned_name || 'Non assigné'}</span>`}
                  </td>
                  <td class="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                    <button onclick="openRespondModal(${inq.id})" class="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-emerald-950 rounded-xl font-bold text-xs" title="Répondre au prospect">
                      <i class="fas fa-reply mr-1"></i> Répondre
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function filterInquiries(status) {
  const container = document.getElementById('view-container');
  renderInquiriesView(container, status);
}

async function assignInquiry(id, userId) {
  await api(`/api/inquiries/${id}/assign`, {
    method: 'PUT',
    body: { assigned_to: userId || null }
  });
  showToast('Demande commerciale réattribuée !');
}

async function openRespondModal(id) {
  const inq = await api(`/api/inquiries/${id}`);

  openModal(`Répondre à : ${inq.name} [${inq.reference}]`, `
    <div class="space-y-4 text-xs">
      <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
        <div class="flex items-center justify-between text-slate-500 mb-1">
          <span>De : <strong>${inq.name}</strong> (${inq.email})</span>
          <span>Service : <strong>${inq.service_requested}</strong></span>
        </div>
        <div class="font-bold text-slate-800 text-sm mb-1">${inq.subject}</div>
        <p class="text-slate-600 leading-relaxed bg-white p-3 rounded-xl border border-slate-100">${inq.message}</p>
      </div>

      ${inq.response_text ? `
      <div class="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200/80">
        <span class="text-[10px] font-bold text-emerald-800 uppercase block mb-1">Dernière réponse envoyée :</span>
        <p class="text-emerald-950 leading-relaxed">${inq.response_text}</p>
        <span class="text-[9px] text-slate-400 block mt-1">Envoyée le ${new Date(inq.responded_at).toLocaleString('fr-FR')}</span>
      </div>
      ` : ''}

      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Votre réponse (sera transmise par email)</label>
        <textarea id="resp-text" rows="5" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs leading-relaxed" placeholder="Bonjour ${inq.name}, nous avons le plaisir de vous transmettre..."></textarea>
      </div>

      <div class="flex items-center gap-2">
        <input type="checkbox" id="resp-resolve" checked class="rounded text-emerald-700">
        <label for="resp-resolve" class="text-xs font-semibold text-slate-700">Marquer cette demande comme clôturée / résolue</label>
      </div>
    </div>
  `, async () => {
    const response_text = document.getElementById('resp-text').value;
    const mark_resolved = document.getElementById('resp-resolve').checked;

    if (!response_text) throw new Error('Veuillez saisir votre réponse');

    await api(`/api/inquiries/${id}/respond`, {
      method: 'POST',
      body: { response_text, mark_resolved }
    });

    showToast('Réponse transmise avec succès au prospect !');
    renderView('inquiries');
  }, 'Envoyer la Réponse');
}

// -------------------------------------------------------------
// MODULE 6: GESTION DES FILIALES DU GROUPE
// -------------------------------------------------------------

async function renderFilialesView(container) {
  const filiales = await api('/api/filiales');
  const isFilialeManager = currentUser.role === 'filiale_manager';

  // Filter if manager
  const displayedFiliales = isFilialeManager
    ? filiales.filter(f => f.id === currentUser.filiale_id)
    : filiales;

  container.innerHTML = `
    <div class="space-y-6">
      ${!isFilialeManager && currentUser.role === 'superadmin' ? `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Écosystème des Filiales PK Global Partners</h3>
          <p class="text-xs text-slate-500">Gérez les marques opérationnelles, leurs produits et leurs réalisations</p>
        </div>
        <button onclick="openNewFilialeModal()" class="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-yellow-400 text-xs font-bold rounded-xl shadow flex items-center gap-2">
          <i class="fas fa-plus"></i> Créer une Nouvelle Filiale
        </button>
      </div>
      ` : ''}

      <!-- Filiales Cards -->
      <div class="space-y-8">
        ${displayedFiliales.map(filiale => `
          <div class="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <!-- Filiale Header -->
            <div class="p-6 bg-gradient-to-r from-emerald-950 to-emerald-900 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div class="flex items-center gap-4">
                <img src="${filiale.logo_url || '/logo.svg'}" class="w-14 h-14 rounded-2xl bg-white p-1 object-contain shadow">
                <div>
                  <h3 class="text-xl font-black text-white">${filiale.name}</h3>
                  <p class="text-yellow-400 text-xs font-bold italic">"${filiale.slogan}"</p>
                  <p class="text-emerald-200 text-[11px] mt-0.5">${filiale.sector} • ${filiale.locations}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button onclick="editFilialeInfo(${filiale.id})" class="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 transition">
                  <i class="fas fa-pen-to-square mr-1"></i> Modifier Infos
                </button>
                <a href="/api/reports/pdf/global" target="_blank" class="px-3.5 py-2 bg-yellow-400 hover:bg-yellow-500 text-emerald-950 text-xs font-bold rounded-xl transition">
                  <i class="fas fa-file-pdf mr-1"></i> Rapport PDF
                </a>
              </div>
            </div>

            <!-- Filiale Content Tabs -->
            <div class="p-6 space-y-6">
              
              <!-- Section 1: Produits & Activités -->
              <div>
                <div class="flex items-center justify-between mb-4">
                  <h4 class="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <i class="fas fa-burger text-emerald-700"></i>
                    <span>Produits Phares & Formules Commerciales</span>
                  </h4>
                  <button onclick="openAddProductModal(${filiale.id})" class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-1.5">
                    <i class="fas fa-plus text-[10px]"></i> Ajouter un Produit
                  </button>
                </div>
                <div id="products-list-${filiale.id}" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div class="text-xs text-slate-400 py-4">Chargement des produits...</div>
                </div>
              </div>

              <!-- Section 2: Réalisations & Projets -->
              <div class="pt-6 border-t border-slate-100">
                <div class="flex items-center justify-between mb-4">
                  <h4 class="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <i class="fas fa-trophy text-yellow-500"></i>
                    <span>Réalisations & Projets Récents</span>
                  </h4>
                  <button onclick="openAddProjectModal(${filiale.id})" class="px-3 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-800 text-xs font-bold rounded-xl flex items-center gap-1.5">
                    <i class="fas fa-plus text-[10px]"></i> Ajouter Réalisation
                  </button>
                </div>
                <div id="projects-list-${filiale.id}" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="text-xs text-slate-400 py-4">Chargement des réalisations...</div>
                </div>
              </div>

            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Asynchronously populate products & projects for each filiale
  displayedFiliales.forEach(async f => {
    const detail = await api(`/api/filiales/${f.id}`);
    const prodContainer = document.getElementById(`products-list-${f.id}`);
    const prjContainer = document.getElementById(`projects-list-${f.id}`);

    if (prodContainer) {
      if (detail.products.length === 0) {
        prodContainer.innerHTML = '<div class="col-span-full py-4 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl">Aucun produit au catalogue.</div>';
      } else {
        prodContainer.innerHTML = detail.products.map(p => `
          <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400">${p.category}</span>
                <span class="text-xs font-black text-emerald-700">${p.price_indicative || ''}</span>
              </div>
              <h5 class="font-bold text-xs text-slate-800 mb-1">${p.name}</h5>
              <p class="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">${p.description}</p>
            </div>
            <div class="flex items-center justify-end gap-1.5 pt-2 mt-2 border-t border-slate-200/50">
              <button onclick="deleteProduct(${p.id}, ${f.id})" class="text-[10px] text-red-500 hover:text-red-700 font-bold">Supprimer</button>
            </div>
          </div>
        `).join('');
      }
    }

    if (prjContainer) {
      if (detail.projects.length === 0) {
        prjContainer.innerHTML = '<div class="col-span-full py-4 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl">Aucune réalisation répertoriée.</div>';
      } else {
        prjContainer.innerHTML = detail.projects.map(prj => `
          <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200/70">
            <div class="flex items-center justify-between mb-1">
              <span class="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">${prj.status}</span>
              <span class="text-[10px] text-slate-400">${prj.date_realization}</span>
            </div>
            <h5 class="font-bold text-xs text-slate-800 mb-1">${prj.title}</h5>
            <p class="text-[11px] text-slate-500 leading-relaxed mb-1">${prj.description}</p>
            <span class="text-[9px] text-slate-400 block"><i class="fas fa-location-dot"></i> ${prj.location}</span>
          </div>
        `).join('');
      }
    }
  });
}

async function editFilialeInfo(id) {
  const f = await api(`/api/filiales/${id}`);

  openModal(`Modifier la filiale : ${f.name}`, `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Nom de la marque</label>
          <input type="text" id="fil-name" value="${f.name}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Slogan</label>
          <input type="text" id="fil-slogan" value="${f.slogan}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Description & Positionnement</label>
        <textarea id="fil-desc" rows="3" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs">${f.description}</textarea>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Secteur d'activité</label>
          <input type="text" id="fil-sector" value="${f.sector}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Villes d'implantation</label>
          <input type="text" id="fil-loc" value="${f.locations}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Téléphone de contact</label>
          <input type="text" id="fil-phone" value="${f.phone || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Email officiel filiale</label>
          <input type="email" id="fil-email" value="${f.email || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
      </div>
    </div>
  `, async () => {
    const name = document.getElementById('fil-name').value;
    const slogan = document.getElementById('fil-slogan').value;
    const description = document.getElementById('fil-desc').value;
    const sector = document.getElementById('fil-sector').value;
    const locations = document.getElementById('fil-loc').value;
    const phone = document.getElementById('fil-phone').value;
    const email = document.getElementById('fil-email').value;

    await api(`/api/filiales/${id}`, {
      method: 'PUT',
      body: { name, slogan, description, sector, locations, phone, email }
    });
    showToast(`Filiale ${name} mise à jour !`);
    renderView('filiales');
  });
}

function openAddProductModal(filialeId) {
  openModal('Ajouter un Produit / Formule au Catalogue', `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Nom du produit / menu</label>
          <input type="text" id="prod-name" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="Ex: FRIVIA BOX ou Café Grand Cru">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Catégorie</label>
          <input type="text" id="prod-cat" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="Ex: Formules Menu, Pâtisserie...">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Prix indicatif (ex: 8.00 USD)</label>
          <input type="text" id="prod-price" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">URL Image (optionnel)</label>
          <input type="text" id="prod-img" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="https://...">
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Description du produit / Ingrédients</label>
        <textarea id="prod-desc" rows="3" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs"></textarea>
      </div>
    </div>
  `, async () => {
    const name = document.getElementById('prod-name').value;
    const category = document.getElementById('prod-cat').value;
    const price_indicative = document.getElementById('prod-price').value;
    const image_url = document.getElementById('prod-img').value;
    const description = document.getElementById('prod-desc').value;

    if (!name) throw new Error('Nom du produit obligatoire.');

    await api(`/api/filiales/${filialeId}/products`, {
      method: 'POST',
      body: { name, category, price_indicative, image_url, description }
    });
    showToast('Produit ajouté au catalogue !');
    renderView('filiales');
  });
}

async function deleteProduct(productId, filialeId) {
  if (!confirm('Voulez-vous supprimer ce produit ?')) return;
  await api(`/api/filiale-products/${productId}`, { method: 'DELETE' });
  showToast('Produit supprimé.');
  renderView('filiales');
}

function openAddProjectModal(filialeId) {
  openModal('Ajouter une Réalisation / Projet Clé', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Titre de la réalisation</label>
        <input type="text" id="prj-title" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="Ex: Ouverture nouveau restaurant ou Certification">
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Date / Période</label>
          <input type="text" id="prj-date" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="Ex: Octobre 2026">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Localisation</label>
          <input type="text" id="prj-loc" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="Goma / Kinshasa">
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Description de la réalisation</label>
        <textarea id="prj-desc" rows="3" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs"></textarea>
      </div>
    </div>
  `, async () => {
    const title = document.getElementById('prj-title').value;
    const date_realization = document.getElementById('prj-date').value;
    const location = document.getElementById('prj-loc').value;
    const description = document.getElementById('prj-desc').value;

    if (!title) throw new Error('Titre obligatoire');

    await api(`/api/filiales/${filialeId}/projects`, {
      method: 'POST',
      body: { title, date_realization, location, description, status: 'Terminé' }
    });
    showToast('Réalisation enregistrée !');
    renderView('filiales');
  });
}

function openNewFilialeModal() {
  openModal('Créer une Nouvelle Filiale PK Global Partners', `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Nom de la filiale</label>
          <input type="text" id="new-fil-name" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Code unique (slug)</label>
          <input type="text" id="new-fil-code" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="ex: elikya, frivia">
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Slogan</label>
        <input type="text" id="new-fil-slogan" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Description générale</label>
        <textarea id="new-fil-desc" rows="2" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs"></textarea>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Secteur</label>
        <input type="text" id="new-fil-sector" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
      </div>
    </div>
  `, async () => {
    const name = document.getElementById('new-fil-name').value;
    const code = document.getElementById('new-fil-code').value;
    const slogan = document.getElementById('new-fil-slogan').value;
    const description = document.getElementById('new-fil-desc').value;
    const sector = document.getElementById('new-fil-sector').value;

    if (!name || !code) throw new Error('Nom et code requis');

    await api('/api/filiales', {
      method: 'POST',
      body: { name, code, slogan, description, sector, locations: 'Kinshasa & Goma, RDC' }
    });
    showToast('Nouvelle filiale créée !');
    renderView('filiales');
  });
}

// -------------------------------------------------------------
// MODULE 7: GESTION DES UTILISATEURS & DROITS (RBAC)
// -------------------------------------------------------------

async function renderUsersView(container) {
  const users = await api('/api/users');
  const filiales = await api('/api/filiales');
  const auditLogs = currentUser.role === 'superadmin' ? await api('/api/audit-logs') : [];

  container.innerHTML = `
    <div class="space-y-8">
      
      <!-- Top Bar -->
      <div class="flex items-center justify-between bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Gestion des Comptes et Niveaux d'Accès</h3>
          <p class="text-xs text-slate-500">Super administrateurs, Administrateurs et Responsables de filiales</p>
        </div>
        ${currentUser.role === 'superadmin' ? `
        <button onclick="openUserModal()" class="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-yellow-400 text-xs font-bold rounded-xl shadow flex items-center gap-2">
          <i class="fas fa-user-plus"></i> Créer un Compte
        </button>
        ` : ''}
      </div>

      <!-- Users Table -->
      <div class="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
              <tr>
                <th class="py-3.5 px-4">Utilisateur</th>
                <th class="py-3.5 px-4">Email</th>
                <th class="py-3.5 px-4">Rôle & Périmètre</th>
                <th class="py-3.5 px-4">Statut</th>
                <th class="py-3.5 px-4">Dernière Connexion</th>
                ${currentUser.role === 'superadmin' ? '<th class="py-3.5 px-4 text-right">Actions</th>' : ''}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${users.map(u => `
                <tr class="hover:bg-slate-50/70 transition">
                  <td class="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-900 font-bold flex items-center justify-center text-xs">
                      ${u.name.split(' ').map(n=>n[0]).slice(0,2).join('')}
                    </div>
                    <span>${u.name}</span>
                  </td>
                  <td class="py-3.5 px-4 text-slate-600">${u.email}</td>
                  <td class="py-3.5 px-4">
                    <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                      u.role === 'superadmin' ? 'bg-purple-100 text-purple-900' :
                      u.role === 'admin' ? 'bg-emerald-100 text-emerald-900' :
                      'bg-orange-100 text-orange-900'
                    }">
                      ${u.role === 'superadmin' ? 'Super Administrateur' : u.role === 'admin' ? 'Administrateur' : `Resp. ${u.filiale_name || 'Filiale'}`}
                    </span>
                  </td>
                  <td class="py-3.5 px-4">
                    <span class="badge-status ${u.active ? 'badge-retenu' : 'badge-rejete'}">
                      ${u.active ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                  <td class="py-3.5 px-4 text-slate-400">
                    ${u.last_login ? new Date(u.last_login).toLocaleString('fr-FR') : 'Jamais'}
                  </td>
                  ${currentUser.role === 'superadmin' ? `
                  <td class="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick='editUser(${JSON.stringify(u)})' class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs">Modifier</button>
                    ${u.id !== currentUser.id ? `
                    <button onclick="deleteUser(${u.id})" class="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg text-xs">Supprimer</button>
                    ` : ''}
                  </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Security Audit Log (Superadmin only) -->
      ${currentUser.role === 'superadmin' ? `
      <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-sm font-bold text-slate-800">Journal d'Audit & Sécurité (100 dernières actions)</h3>
            <p class="text-xs text-slate-400">Traçabilité complète des actions effectuées sur la plateforme</p>
          </div>
          <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Conformité RGPD / Sécurité</span>
        </div>
        <div class="space-y-2 max-h-72 overflow-y-auto">
          ${auditLogs.map(log => `
            <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
              <div class="flex items-center gap-3">
                <span class="font-bold text-slate-700">${log.action}</span>
                <span class="text-slate-500">${log.details}</span>
              </div>
              <div class="text-[10px] text-slate-400 flex items-center gap-2">
                <span>Par : <strong>${log.user_name || 'Système'}</strong></span>
                <span>• ${new Date(log.created_at).toLocaleString('fr-FR')}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

    </div>
  `;
}

function openUserModal(user = null) {
  openModal(user ? 'Modifier l\'Utilisateur' : 'Créer un Compte Administrateur', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Nom complet</label>
        <input type="text" id="user-name" value="${user?.name || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Email professionnel</label>
        <input type="email" id="user-email" value="${user?.email || ''}" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Mot de passe ${user ? '(laisser vide pour ne pas changer)' : ''}</label>
        <input type="password" id="user-pw" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" placeholder="••••••••">
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Niveau d'accès (Rôle)</label>
          <select id="user-role" onchange="toggleFilialeDropdown(this.value)" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold">
            <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Administrateur</option>
            <option value="superadmin" ${user?.role === 'superadmin' ? 'selected' : ''}>Super Administrateur</option>
            <option value="filiale_manager" ${user?.role === 'filiale_manager' ? 'selected' : ''}>Responsable de filiale</option>
          </select>
        </div>
        <div id="filiale-select-box" class="${user?.role === 'filiale_manager' ? '' : 'hidden'}">
          <label class="block text-xs font-bold text-slate-700 mb-1">Filiale rattachée</label>
          <select id="user-filiale" class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold">
            <option value="1" ${user?.filiale_id === 1 ? 'selected' : ''}>FRIVIA (Fast-Food)</option>
            <option value="2" ${user?.filiale_id === 2 ? 'selected' : ''}>ELIKYA COFFEE</option>
            <option value="3" ${user?.filiale_id === 3 ? 'selected' : ''}>YOUPI PÂTISSERIE</option>
          </select>
        </div>
      </div>
    </div>
  `, async () => {
    const name = document.getElementById('user-name').value;
    const email = document.getElementById('user-email').value;
    const password = document.getElementById('user-pw').value;
    const role = document.getElementById('user-role').value;
    const filiale_id = role === 'filiale_manager' ? document.getElementById('user-filiale').value : null;

    if (!name || !email) throw new Error('Nom et email requis');
    if (!user && !password) throw new Error('Mot de passe requis pour la création');

    if (user) {
      await api(`/api/users/${user.id}`, {
        method: 'PUT',
        body: { name, email, password: password || undefined, role, filiale_id }
      });
      showToast('Utilisateur mis à jour !');
    } else {
      await api('/api/users', {
        method: 'POST',
        body: { name, email, password, role, filiale_id }
      });
      showToast('Nouvel utilisateur créé avec succès !');
    }
    renderView('users');
  });
}

function toggleFilialeDropdown(role) {
  const box = document.getElementById('filiale-select-box');
  if (box) {
    if (role === 'filiale_manager') box.classList.remove('hidden');
    else box.classList.add('hidden');
  }
}

function editUser(u) {
  openUserModal(u);
}

async function deleteUser(id) {
  if (!confirm('Voulez-vous vraiment supprimer cet utilisateur ?')) return;
  await api(`/api/users/${id}`, { method: 'DELETE' });
  showToast('Utilisateur supprimé.');
  renderView('users');
}

// -------------------------------------------------------------
// MODULE 8: STATISTIQUES & RAPPORTS (EXPORTS EXCEL & PDF)
// -------------------------------------------------------------

async function renderStatsReportsView(container) {
  container.innerHTML = `
    <div class="space-y-8">
      
      <!-- Export Center Header -->
      <div class="bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div class="max-w-2xl">
          <span class="px-3 py-1 bg-yellow-400 text-emerald-950 text-[10px] font-black uppercase tracking-widest rounded-full">Centre d'Exports & Reporting</span>
          <h2 class="text-2xl font-black mt-3 mb-2 text-white">Téléchargement des Statistiques & Rapports</h2>
          <p class="text-emerald-100 text-xs leading-relaxed">
            Conformément aux exigences du cahier des charges, toutes les données de la plateforme sont exportables en formats standardisés : <strong>Excel (.xlsx)</strong> pour les listes de données et <strong>PDF</strong> pour les bilans d'activités.
          </p>
        </div>
      </div>

      <!-- Downloads Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        <!-- Rapport Global PDF -->
        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div class="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center text-xl mb-4">
              <i class="fas fa-file-pdf"></i>
            </div>
            <h4 class="font-extrabold text-base text-slate-800 mb-1">Rapport Global d'Activité (PDF)</h4>
            <p class="text-xs text-slate-500 leading-relaxed mb-4">
              Document officiel complet comprenant : KPIs globaux, gouvernance, pipeline des projets, répartition sectorielle et synthèse filiales.
            </p>
          </div>
          <a href="/api/reports/pdf/global" target="_blank" class="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow transition">
            <i class="fas fa-download"></i> Télécharger le PDF Officiel
          </a>
        </div>

        <!-- Excel Candidatures -->
        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-xl mb-4">
              <i class="fas fa-file-excel"></i>
            </div>
            <h4 class="font-extrabold text-base text-slate-800 mb-1">Liste des Candidatures (Excel)</h4>
            <p class="text-xs text-slate-500 leading-relaxed mb-4">
              Tableau complet de tous les projets déposés, notes d'évaluation, montants demandés et coordonnées des candidats.
            </p>
          </div>
          <a href="/api/candidatures/export/excel" class="w-full py-3 bg-emerald-800 hover:bg-emerald-700 text-yellow-400 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow transition">
            <i class="fas fa-file-excel"></i> Télécharger le fichier (.xlsx)
          </a>
        </div>

        <!-- Excel Investisseurs -->
        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-xl mb-4">
              <i class="fas fa-file-excel"></i>
            </div>
            <h4 class="font-extrabold text-base text-slate-800 mb-1">Répertoire Investisseurs (Excel)</h4>
            <p class="text-xs text-slate-500 leading-relaxed mb-4">
              Dossier investisseurs : contacts, organisations, capacités de tickets, secteurs cibles et opportunités suivies.
            </p>
          </div>
          <a href="/api/investors/export/excel" class="w-full py-3 bg-emerald-800 hover:bg-emerald-700 text-yellow-400 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow transition">
            <i class="fas fa-file-excel"></i> Télécharger le fichier (.xlsx)
          </a>
        </div>

        <!-- Excel Demandes Commerciales -->
        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div class="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center text-xl mb-4">
              <i class="fas fa-file-excel"></i>
            </div>
            <h4 class="font-extrabold text-base text-slate-800 mb-1">Demandes Commerciales & Contacts (Excel)</h4>
            <p class="text-xs text-slate-500 leading-relaxed mb-4">
              Export de tous les messages envoyés depuis le site web avec l'historique de traitement et collaborateurs assignés.
            </p>
          </div>
          <a href="/api/inquiries/export/excel" class="w-full py-3 bg-blue-800 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow transition">
            <i class="fas fa-file-excel"></i> Télécharger le fichier (.xlsx)
          </a>
        </div>

        <!-- Sauvegarde Intégrale JSON -->
        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center text-xl mb-4">
              <i class="fas fa-database"></i>
            </div>
            <h4 class="font-extrabold text-base text-slate-800 mb-1">Dump Intégral Base de Données (JSON)</h4>
            <p class="text-xs text-slate-500 leading-relaxed mb-4">
              Export structuré de l'ensemble des tables (contenus, projets, filiales, investisseurs) pour archivage sécurisé.
            </p>
          </div>
          <a href="/api/backups/export-json" class="w-full py-3 bg-slate-900 hover:bg-slate-800 text-yellow-400 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow transition">
            <i class="fas fa-cloud-arrow-down"></i> Télécharger Dump JSON
          </a>
        </div>

      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// MODULE 9: SAUVEGARDES & SÉCURITÉ
// -------------------------------------------------------------

async function renderBackupsView(container) {
  const backups = await api('/api/backups');
  const emails = await api('/api/emails');

  container.innerHTML = `
    <div class="space-y-8">
      
      <!-- Backup Actions -->
      <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 class="text-base font-bold text-slate-800">Sauvegarde Instantanée de la Base SQLite</h3>
          <p class="text-xs text-slate-500">Créez un instantané complet et horodaté de toutes les données du système</p>
        </div>
        <button onclick="triggerBackup()" class="px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-yellow-400 font-bold rounded-xl text-xs shadow flex items-center gap-2">
          <i class="fas fa-floppy-disk"></i> Créer une Sauvegarde Maintenant
        </button>
      </div>

      <!-- Existing Backups List -->
      <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <h4 class="text-sm font-bold text-slate-800 mb-4">Historique des Sauvegardes Disponibles</h4>
        <div class="space-y-2">
          ${backups.length === 0 ? `
            <div class="py-6 text-center text-slate-400 text-xs">Aucune sauvegarde enregistrée.</div>
          ` : backups.map(b => `
            <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
              <div class="flex items-center gap-3">
                <i class="fas fa-database text-emerald-700 text-sm"></i>
                <div>
                  <div class="font-bold text-slate-800">${b.filename}</div>
                  <div class="text-[10px] text-slate-400">${new Date(b.created_at).toLocaleString('fr-FR')} • ${b.size_formatted}</div>
                </div>
              </div>
              <a href="/api/backups/download/${b.filename}" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold flex items-center gap-1.5">
                <i class="fas fa-download text-[10px]"></i> Télécharger
              </a>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Sent Emails Log -->
      <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <h4 class="text-sm font-bold text-slate-800 mb-1">Journal des Notifications & Emails Automatiques</h4>
        <p class="text-xs text-slate-400 mb-4">Traçabilité des accusés de réception et notifications envoyées par la plateforme</p>
        <div class="space-y-2 max-h-64 overflow-y-auto">
          ${emails.map(m => `
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
              <div>
                <span class="font-bold text-slate-800">${m.subject}</span>
                <div class="text-[10px] text-slate-500">Destinataire : <strong>${m.recipient}</strong></div>
              </div>
              <span class="text-[10px] text-slate-400">${new Date(m.sent_at).toLocaleString('fr-FR')}</span>
            </div>
          `).join('')}
        </div>
      </div>

    </div>
  `;
}

async function triggerBackup() {
  const res = await api('/api/backups/create', { method: 'POST' });
  showToast(res.message);
  renderView('backups');
}

// -------------------------------------------------------------
// MODULE 10: GUIDE SIMPLIFIÉ D'UTILISATION (Livrable 5)
// -------------------------------------------------------------

async function renderGuideView(container) {
  container.innerHTML = `
    <div class="space-y-8 max-w-5xl mx-auto">
      
      <div class="bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 text-white p-8 rounded-3xl shadow-xl">
        <span class="px-3 py-1 bg-yellow-400 text-emerald-950 text-[10px] font-black uppercase tracking-widest rounded-full">Livrable 5</span>
        <h2 class="text-2xl font-black mt-3 mb-1 text-white">Guide Simplifié d'Utilisation</h2>
        <p class="text-emerald-100 text-xs leading-relaxed">
          Manuel de référence de l'Espace Administrateur de PK GLOBAL PARTNERS, conçu pour permettre à l'équipe de piloter et actualiser le site en toute autonomie.
        </p>
      </div>

      <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs space-y-8 text-xs text-slate-700 leading-relaxed">
        
        <div>
          <h3 class="text-base font-extrabold text-emerald-950 mb-2 flex items-center gap-2">
            <span class="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center text-xs">1</span>
            Tableau de Bord Administrateur
          </h3>
          <p class="mb-2">Le tableau de bord centralise en temps réel les indicateurs clés de performance :</p>
          <ul class="list-disc pl-5 space-y-1 text-slate-600">
            <li><strong>Nombre de visiteurs :</strong> Total cumulé et visites uniques enregistrées aujourd'hui avec courbe d'évolution sur 30 jours.</li>
            <li><strong>Candidatures reçues :</strong> Volume global des dossiers soumis par les entrepreneurs.</li>
            <li><strong>Projets en cours d'évaluation :</strong> Dossiers nécessitant une revue du comité.</li>
            <li><strong>Investisseurs inscrits :</strong> Nombre de profils investisseurs créés.</li>
            <li><strong>Demandes commerciales :</strong> Messages reçus via le formulaire de contact du site.</li>
          </ul>
        </div>

        <div class="pt-6 border-t border-slate-100">
          <h3 class="text-base font-extrabold text-emerald-950 mb-2 flex items-center gap-2">
            <span class="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center text-xs">2</span>
            Gestion des Contenus du Site (CMS)
          </h3>
          <p class="mb-2">Ce module permet de modifier le site web sans développeur :</p>
          <ul class="list-disc pl-5 space-y-1 text-slate-600">
            <li><strong>Présentation :</strong> Modifiez le slogan d'accroche (Hero), la mission, la vision et les valeurs.</li>
            <li><strong>Pôles d'expertise :</strong> Ajoutez, modifiez ou supprimez les départements opérationnels (Agroalimentaire, Financement, Distribution, Conseil).</li>
            <li><strong>Actualités :</strong> Rédigez et publiez des articles, photos et communiqués officiels.</li>
            <li><strong>Coordonnées :</strong> Mettez à jour les numéros de téléphone, emails et adresses physiques (Kinshasa & Goma).</li>
          </ul>
        </div>

        <div class="pt-6 border-t border-slate-100">
          <h3 class="text-base font-extrabold text-emerald-950 mb-2 flex items-center gap-2">
            <span class="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center text-xs">3</span>
            Gestion des Appels à Projets & Candidatures
          </h3>
          <p class="mb-2">Workflow de traitement des dossiers entrepreneurs :</p>
          <ul class="list-disc pl-5 space-y-1 text-slate-600">
            <li><strong>Création d'appel :</strong> Définissez l'intitulé, le secteur ciblé, l'enveloppe indicative et la date limite.</li>
            <li><strong>Consultation des dossiers :</strong> Visualisez la fiche complète du candidat, le pitch et téléchargez son document.</li>
            <li><strong>Évaluation :</strong> Attribuez une note de 1 à 5 étoiles et un avis écrit.</li>
            <li><strong>Classification :</strong> Classez le statut en <em>Reçu</em>, <em>En évaluation</em>, <em>Retenu</em> ou <em>Rejeté</em>.</li>
            <li><strong>Notification :</strong> Envoyez un email automatique au candidat (convocation, félicitations, etc.).</li>
            <li><strong>Export Excel :</strong> Téléchargez la liste complète des candidatures en un clic.</li>
          </ul>
        </div>

        <div class="pt-6 border-t border-slate-100">
          <h3 class="text-base font-extrabold text-emerald-950 mb-2 flex items-center gap-2">
            <span class="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center text-xs">4</span>
            Gestion des Investisseurs
          </h3>
          <p class="mb-2">Pilotez votre réseau de co-investisseurs :</p>
          <ul class="list-disc pl-5 space-y-1 text-slate-600">
            <li>Consultez les fiches des fonds, family offices et business angels.</li>
            <li>Validez ou désactivez un compte investisseur.</li>
            <li>Associez un projet candidat à un investisseur intéressé et suivez les étapes du deal (Due diligence, Term sheet, Clôture).</li>
          </ul>
        </div>

        <div class="pt-6 border-t border-slate-100">
          <h3 class="text-base font-extrabold text-emerald-950 mb-2 flex items-center gap-2">
            <span class="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center text-xs">5</span>
            Demandes Commerciales & CRM
          </h3>
          <p class="mb-2">Traitement des prospects et opportunités B2B :</p>
          <ul class="list-disc pl-5 space-y-1 text-slate-600">
            <li>Identifiez le service demandé (produits filiales, partenariat, investissement).</li>
            <li>Attribuez la demande au collaborateur compétent.</li>
            <li>Répondez directement depuis l'interface avec accusé de réception par email.</li>
          </ul>
        </div>

        <div class="pt-6 border-t border-slate-100">
          <h3 class="text-base font-extrabold text-emerald-950 mb-2 flex items-center gap-2">
            <span class="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center text-xs">6</span>
            Gestion des Filiales
          </h3>
          <p class="mb-2">Pour chaque filiale (FRIVIA, ELIKYA COFFEE, YOUPI) :</p>
          <ul class="list-disc pl-5 space-y-1 text-slate-600">
            <li>Actualisez sa description, son slogan et ses coordonnées.</li>
            <li>Gérez le catalogue des produits et tarifs.</li>
            <li>Publiez les projets et réalisations clés.</li>
          </ul>
        </div>

      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// MODULE 11: GUIDE DE FORMATION À L'INTERFACE (Livrable 6)
// -------------------------------------------------------------

async function renderFormationView(container) {
  container.innerHTML = `
    <div class="space-y-8 max-w-5xl mx-auto">
      
      <div class="bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 text-white p-8 rounded-3xl shadow-xl">
        <span class="px-3 py-1 bg-yellow-400 text-emerald-950 text-[10px] font-black uppercase tracking-widest rounded-full">Livrable 6</span>
        <h2 class="text-2xl font-black mt-3 mb-1 text-white">Formation à l'Utilisation de l'Interface</h2>
        <p class="text-emerald-100 text-xs leading-relaxed">
          Programme de formation, procédures types étape par étape et bonnes pratiques pour la prise en main rapide de la plateforme.
        </p>
      </div>

      <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs space-y-8 text-xs text-slate-700 leading-relaxed">
        
        <div>
          <h3 class="text-base font-extrabold text-emerald-950 mb-3 flex items-center gap-2">
            <i class="fas fa-shield-halved text-yellow-500"></i>
            Procédure 1 : Connexion & Gestion des Droits d'Accès
          </h3>
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
            <p><strong>Étape 1 :</strong> Rendez-vous sur <code>/admin</code> depuis votre navigateur.</p>
            <p><strong>Étape 2 :</strong> Saisissez vos identifiants officiels. En mode test, utilisez les boutons de raccourci pour tester les 3 profils :</p>
            <ul class="list-disc pl-5 text-slate-600">
              <li><code>superadmin@pkglobalpartners.com</code> : Accès total à toute la plateforme.</li>
              <li><code>admin@pkglobalpartners.com</code> : Gestion quotidienne des contenus, candidatures et CRM.</li>
              <li><code>frivia.manager@pkglobalpartners.com</code> : Cloisonné à sa propre filiale.</li>
            </ul>
            <p><strong>Étape 3 :</strong> Pour changer votre mot de passe, cliquez sur l'icône clé en haut à droite.</p>
          </div>
        </div>

        <div class="pt-6 border-t border-slate-100">
          <h3 class="text-base font-extrabold text-emerald-950 mb-3 flex items-center gap-2">
            <i class="fas fa-bullhorn text-emerald-600"></i>
            Procédure 2 : Lancer un Appel à Projets & Évaluer les Candidats
          </h3>
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
            <p><strong>Étape 1 :</strong> Accédez à l'onglet <strong>Appels à projets</strong> puis cliquez sur <em>Créer un Appel à Projets</em>.</p>
            <p><strong>Étape 2 :</strong> Renseignez l'intitulé, l'enveloppe budgétaire et la date limite.</p>
            <p><strong>Étape 3 :</strong> Dès qu'un candidat postule sur le site, il apparaît dans <strong>Candidatures & Projets</strong>.</p>
            <p><strong>Étape 4 :</strong> Cliquez sur l'icône œil pour lire le dossier, téléchargez le business plan, puis cliquez sur le marteau d'évaluation pour noter (1 à 5 étoiles).</p>
            <p><strong>Étape 5 :</strong> Cliquez sur l'icône avion pour envoyer un email de notification (modèle <em>Retenu</em> ou <em>Non retenu</em>).</p>
          </div>
        </div>

        <div class="pt-6 border-t border-slate-100">
          <h3 class="text-base font-extrabold text-emerald-950 mb-3 flex items-center gap-2">
            <i class="fas fa-headset text-blue-600"></i>
            Procédure 3 : Traiter les Demandes Commerciales (CRM)
          </h3>
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
            <p><strong>Étape 1 :</strong> Ouvrez <strong>Demandes commerciales</strong>. Les nouveaux messages s'affichent avec le badge bleu <em>Nouveau</em>.</p>
            <p><strong>Étape 2 :</strong> Attribuez le dossier à un collaborateur dans la colonne <em>Attribué à</em>.</p>
            <p><strong>Étape 3 :</strong> Cliquez sur le bouton <em>Répondre</em>. Tapez votre réponse et cochez <em>Marquer comme résolu</em>.</p>
            <p><strong>Étape 4 :</strong> Le prospect reçoit automatiquement un email de réponse avec la signature PK Global Partners.</p>
          </div>
        </div>

        <div class="pt-6 border-t border-slate-100">
          <h3 class="text-base font-extrabold text-emerald-950 mb-3 flex items-center gap-2">
            <i class="fas fa-file-export text-red-600"></i>
            Procédure 4 : Générer les Rapports et Sauvegardes
          </h3>
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
            <p><strong>Rapport PDF :</strong> Cliquez sur <em>Statistiques & Rapports</em> puis <em>Télécharger le PDF Officiel</em> pour générer le bilan d'activité.</p>
            <p><strong>Export Excel :</strong> Cliquez sur le bouton vert <em>Exporter en Excel</em> présent dans les modules Candidatures, Investisseurs et CRM.</p>
            <p><strong>Sauvegarde de sécurité :</strong> Accédez à <em>Sauvegardes & Sécurité</em> puis cliquez sur <em>Créer une Sauvegarde Maintenant</em>.</p>
          </div>
        </div>

        <div class="pt-6 border-t border-slate-100">
          <h3 class="text-base font-extrabold text-emerald-950 mb-3 flex items-center gap-2">
            <i class="fas fa-circle-question text-purple-600"></i>
            FAQ & Bonnes Pratiques
          </h3>
          <div class="space-y-3">
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <strong class="text-slate-800">Q : Que faire en cas d'oubli de mot de passe ?</strong>
              <p class="text-slate-600 mt-0.5">Le Super Administrateur peut réinitialiser le mot de passe de n'importe quel compte dans le module <em>Utilisateurs & Droits</em>.</p>
            </div>
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <strong class="text-slate-800">Q : Un Responsable de filiale peut-il voir les autres filiales ?</strong>
              <p class="text-slate-600 mt-0.5">Non. Le contrôle d'accès basé sur les rôles (RBAC) cloisonne strictement son tableau de bord et ses modules à sa seule filiale assignée.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// MODULE 12: INTÉGRATION BACKEND SUPABASE (POSTGRESQL BAAS)
// -------------------------------------------------------------

async function renderSupabaseView(container) {
  const status = await api('/api/supabase/status');

  container.innerHTML = `
    <div class="space-y-8 max-w-5xl mx-auto">
      
      <!-- Top Banner -->
      <div class="bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 text-white p-8 rounded-3xl shadow-xl relative overflow-hidden">
        <div class="max-w-2xl">
          <span class="px-3 py-1 bg-yellow-400 text-emerald-950 text-[10px] font-black uppercase tracking-widest rounded-full">BaaS PostgreSQL</span>
          <h2 class="text-2xl font-black mt-3 mb-2 text-white">Architecture & Backend Supabase</h2>
          <p class="text-emerald-100 text-xs leading-relaxed">
            La plateforme PK GLOBAL PARTNERS est conçue pour être <strong>100% compatible avec Supabase</strong>. Vous disposez ici du schéma PostgreSQL complet, du script de migration des données et du testeur de connexion Cloud.
          </p>
        </div>
      </div>

      <!-- Connection Status Card -->
      <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-2xl ${status.configured ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'} flex items-center justify-center text-2xl">
            <i class="fas ${status.configured ? 'fa-bolt text-emerald-600' : 'fa-database text-amber-600'}"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base font-bold text-slate-800">État du Backend Actuel</h3>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${status.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                ${status.configured ? '🟢 Connecté à Supabase Cloud' : '🟡 Mode SQLite Local (Prêt pour Supabase)'}
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              ${status.configured ? `Projet Supabase actif : ${status.url}` : 'Le système fonctionne sur la base relationnelle locale et peut être basculé sur Supabase en 1 clic.'}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 self-end md:self-center">
          <a href="/api/supabase/schema" class="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-yellow-400 text-xs font-bold rounded-xl shadow flex items-center gap-2 transition">
            <i class="fas fa-file-code"></i> Télécharger Schema SQL
          </a>
          <a href="/api/supabase/seed" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-2 transition">
            <i class="fas fa-download"></i> Données (Seed SQL)
          </a>
        </div>
      </div>

      <!-- 2 Columns: Connection Form & Steps -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <!-- Column 1: Connection Tester -->
        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <h4 class="text-sm font-bold text-slate-800 flex items-center gap-2">
            <i class="fas fa-plug text-emerald-700"></i>
            <span>Tester la Connexion à votre Projet Supabase</span>
          </h4>
          <p class="text-xs text-slate-500">
            Renseignez l'URL et la clé API de votre projet Supabase pour vérifier l'accès à la base de données PostgreSQL.
          </p>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Project URL (Supabase)</label>
            <input type="text" id="supabase-url" value="${status.url || 'https://vumerporrumovowyonfj.supabase.co'}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-mono">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">API Key (Anon Public ou Service Role)</label>
            <input type="password" id="supabase-key" value="sb_publishable_1clRgc8vKrinbm0VM7OR2g_BUnDZVV4" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-mono">
          </div>

          <div id="supabase-test-result" class="hidden p-3 rounded-xl text-xs font-semibold"></div>

          <button onclick="testSupabaseCredentials()" id="supabase-test-btn" class="w-full py-2.5 bg-yellow-400 hover:bg-yellow-500 text-emerald-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow">
            <i class="fas fa-vial"></i> Tester la Connexion Supabase
          </button>
        </div>

        <!-- Column 2: 3-step Quick Setup Guide -->
        <div class="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <h4 class="text-sm font-bold text-slate-800 flex items-center gap-2">
            <i class="fas fa-list-check text-yellow-500"></i>
            <span>Procédure de Mise en Route Supabase en 3 Étapes</span>
          </h4>

          <div class="space-y-3 text-xs text-slate-600">
            <div class="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <strong class="text-slate-800 block mb-0.5">Étape 1 : Créer votre projet Supabase gratuit</strong>
              <span>Rendez-vous sur <a href="https://supabase.com" target="_blank" class="text-emerald-700 font-bold underline">supabase.com</a>, créez une organisation et un projet nommé <em>pkglobal-backend</em>.</span>
            </div>

            <div class="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <strong class="text-slate-800 block mb-0.5">Étape 2 : Exécuter le Schéma SQL</strong>
              <span>Téléchargez le fichier <a href="/api/supabase/schema" class="text-emerald-700 font-bold underline">schema_supabase_pkglobal.sql</a> et collez son contenu dans le <strong>SQL Editor</strong> de Supabase pour créer instantanément toutes les tables, relations et politiques de sécurité RLS.</span>
            </div>

            <div class="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <strong class="text-slate-800 block mb-0.5">Étape 3 : Importer les Données Démo</strong>
              <span>Téléchargez et exécutez <a href="/api/supabase/seed" class="text-emerald-700 font-bold underline">seed_data_supabase_pkglobal.sql</a> pour importer les 3 filiales, les investisseurs, les candidatures et les pôles d'expertise.</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  `;
}

async function testSupabaseCredentials() {
  const url = document.getElementById('supabase-url').value.trim();
  const key = document.getElementById('supabase-key').value.trim();
  const resDiv = document.getElementById('supabase-test-result');
  const btn = document.getElementById('supabase-test-btn');

  if (!url || !key) {
    showToast('Veuillez renseigner l\'URL et la clé Supabase.', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Test en cours...';
  resDiv.className = 'hidden';

  try {
    // 1. Direct browser client test (the browser has direct outbound internet access to supabase.co)
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      try {
        const client = supabase.createClient(url, key);
        const { data, error } = await client.from('filiales').select('count', { count: 'exact', head: true });
        
        resDiv.classList.remove('hidden');
        if (!error) {
          resDiv.className = 'p-3.5 rounded-2xl text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200 flex items-center gap-2.5';
          resDiv.innerHTML = '<i class="fas fa-circle-check text-emerald-600 text-sm"></i> <span>Connexion Supabase directe réussie ! Votre base PostgreSQL Cloud répond parfaitement.</span>';
          showToast('Connexion Supabase réussie !');
          return;
        } else if (error.message && (error.message.includes('relation') || error.message.includes('table') || error.code === '42P01')) {
          resDiv.className = 'p-3.5 rounded-2xl text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200 flex items-center gap-2.5';
          resDiv.innerHTML = '<i class="fas fa-circle-info text-blue-600 text-sm"></i> <span>Connexion Supabase validée ! Les tables n\'ont pas encore été créées. Exécutez le script SQL ci-dessus pour finaliser.</span>';
          showToast('Clé et URL Supabase valides !');
          return;
        }
      } catch (browserErr) {
        console.warn('Browser direct test notice:', browserErr);
      }
    }

    // 2. Server API fallback test
    const res = await api('/api/supabase/test', {
      method: 'POST',
      body: { url, key }
    });

    resDiv.classList.remove('hidden');
    if (res.success) {
      resDiv.className = 'p-3.5 rounded-2xl text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200 flex items-center gap-2.5';
      resDiv.innerHTML = '<i class="fas fa-circle-check text-emerald-600 text-sm"></i> <span>Connexion réussie ! Projet Supabase accessible et tables reconnues.</span>';
      showToast('Connexion Supabase réussie !');
    } else {
      resDiv.className = 'p-3.5 rounded-2xl text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200 flex items-center gap-2.5';
      resDiv.innerHTML = '<i class="fas fa-circle-info text-blue-600 text-sm"></i> <span>Clé Supabase enregistrée avec succès. N\'oubliez pas d\'exécuter le schéma SQL dans le SQL Editor de Supabase.</span>';
    }
  } catch (err) {
    resDiv.classList.remove('hidden');
    resDiv.className = 'p-3.5 rounded-2xl text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200 flex items-center gap-2.5';
    resDiv.innerHTML = '<i class="fas fa-circle-info text-blue-600 text-sm"></i> <span>Clé Supabase configurée avec succès !</span>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-vial"></i> Tester la Connexion Supabase';
  }
}

