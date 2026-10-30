/**
 * PK GLOBAL PARTNERS - Client Site Integration Script
 * ---------------------------------------------------------------------------
 * Fonctionne sur N'IMPORTE QUEL hébergeur (mutualisé, cPanel, OVH, Netlify…)
 * sans serveur Node.js :
 *   • les contenus, images, appels à projets et actualités sont lus dans
 *     Supabase directement depuis le navigateur (voir public/js/pk-config.js) ;
 *   • si un serveur Node est présent (hébergement VPS), l'API /api/... est
 *     utilisée en complément ou en secours.
 * Aucune donnée de démonstration n'est affichée : si rien n'est publié dans
 * l'administration, les contenus d'origine de la page restent en place.
 */

(function () {
  var CONFIG = window.PK_CONFIG || { dataSource: 'auto' };
  var DB = window.PKDB || {
    isConfigured: function () { return false; },
    select: function () { return Promise.resolve(null); },
    insert: function () { return Promise.resolve(null); },
    firstUsable: function (loaders, isUsable) {
      var test = isUsable || function (value) { return value !== null && value !== undefined; };
      return Promise.resolve()
        .then(function () { return loaders.node ? loaders.node() : null; })
        .catch(function () { return null; })
        .then(function (result) { return test(result) ? result : null; });
    },
    log: function () {},
    warn: function () {}
  };

  function debug() {
    if (!CONFIG.debug || typeof console === 'undefined') return;
    console.log.apply(console, ['[PK Global]'].concat(Array.prototype.slice.call(arguments)));
  }

  function warn() {
    if (typeof console === 'undefined') return;
    console.warn.apply(console, ['[PK Global]'].concat(Array.prototype.slice.call(arguments)));
  }

  function currentPageName() {
    var pagePath = window.location.pathname;
    if (pagePath.indexOf('about') !== -1) return 'about';
    if (pagePath.indexOf('filiales') !== -1) return 'filiales';
    if (pagePath.indexOf('investors') !== -1) return 'investors';
    if (pagePath.indexOf('careers') !== -1) return 'careers';
    if (pagePath.indexOf('appels-a-projets') !== -1) return 'appels-a-projets';
    if (pagePath.indexOf('contact') !== -1) return 'contact';
    return 'accueil';
  }

  // -------------------------------------------------------------------------
  // 1. Mesure d'audience (silencieuse : ne bloque jamais la page)
  // -------------------------------------------------------------------------
  function trackVisit() {
    try {
      var payload = {
        page: currentPageName(),
        referrer: document.referrer || 'direct',
        user_agent: (navigator.userAgent || '').slice(0, 250)
      };
      DB.firstUsable({
        supabase: function () { return DB.insert('visitor_stats', payload); },
        node: function () {
          return fetch('/api/track-visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(function () { return { ok: true }; });
        }
      });
    } catch (e) {}
  }

  // -------------------------------------------------------------------------
  // 2. Image de remplacement : évite les icônes « image cassée » sur le site
  //    (par exemple si un fichier local n'a pas été envoyé sur l'hébergeur).
  // -------------------------------------------------------------------------
  var FALLBACK_IMAGE = 'data:image/svg+xml;charset=utf-8,'
    + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">'
      + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#064e3b"/><stop offset="1" stop-color="#022c22"/>'
      + '</linearGradient></defs><rect width="800" height="600" fill="url(#g)"/>'
      + '<text x="50%" y="50%" fill="#facc15" font-family="Arial,sans-serif" font-size="34" '
      + 'font-weight="bold" text-anchor="middle">PK GLOBAL PARTNERS</text></svg>');

  function setupImageFallbacks() {
    document.addEventListener('error', function (event) {
      var element = event.target;
      if (!element || element.tagName !== 'IMG') return;
      if (element.getAttribute('data-pk-fallback') === '1') return;
      element.setAttribute('data-pk-fallback', '1');
      element.src = FALLBACK_IMAGE;
      warn('image introuvable, remplacée par le visuel de substitution :', element.getAttribute('src'));
    }, true);
  }

  // -------------------------------------------------------------------------
  // 3. Initialisation de la page
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    setupImageFallbacks();

    // Raccourci « Espace Admin » (chemin relatif : fonctionne à la racine du
    // domaine comme dans un sous-dossier).
    if (CONFIG.showAdminButton !== false) {
      var adminBtn = document.createElement('a');
      adminBtn.href = 'public/admin/index.html';
      adminBtn.className = 'fixed bottom-5 right-5 z-40 bg-emerald-950/90 hover:bg-emerald-800 text-yellow-400 border border-yellow-400/40 px-4 py-2.5 rounded-full shadow-2xl backdrop-blur-md text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all transform hover:scale-105';
      adminBtn.innerHTML = '<i class="fas fa-shield-alt text-sm"></i> <span>Espace Admin</span>';
      adminBtn.title = 'Accéder à l\'espace d\'administration PK Global';
      document.body.appendChild(adminBtn);
    }

    setupMobileMenu();
    syncManagedPublicContent();
    syncManagedMedia();
    syncPublicJobOffers();
    wireContactForm();
    wireInvestorForm();
    wireCareersForm();
  });

  trackVisit();

  // -------------------------------------------------------------------------
  // Menu mobile (construit à partir des liens du menu principal de la page)
  // -------------------------------------------------------------------------
  function setupMobileMenu() {
    try {
      var navbar = document.getElementById('navbar');
      var toggleBtn = navbar ? navbar.querySelector('button') : null;
      var desktopLinks = navbar ? Array.from(navbar.querySelectorAll('a.nav-link')) : [];
      if (!navbar || !toggleBtn || !desktopLinks.length) return;

      var menuContainer = desktopLinks[0].parentElement;
      var panel = document.createElement('div');
      panel.id = 'mobile-menu';
      panel.className = 'xl:hidden mt-4 bg-emerald-950/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl p-4 flex-col gap-1 max-h-[75vh] overflow-y-auto';
      panel.style.display = 'none';

      Array.from(menuContainer.querySelectorAll('a')).forEach(function (link) {
        var item = document.createElement('a');
        item.href = link.getAttribute('href') || '#';
        item.textContent = link.textContent.trim();
        item.className = link.classList.contains('nav-link')
          ? 'block px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider text-white hover:bg-white/10 hover:text-yellow-400 transition'
          : 'block px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider bg-yellow-400 text-emerald-950 text-center mt-2 hover:bg-white transition';
        if (link.classList.contains('active')) item.classList.add('text-yellow-400');
        item.addEventListener('click', function () { panel.style.display = 'none'; });
        panel.appendChild(item);
      });

      navbar.appendChild(panel);
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.addEventListener('click', function () {
        var isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'flex';
        toggleBtn.setAttribute('aria-expanded', String(!isOpen));
        var icon = toggleBtn.querySelector('i');
        if (icon) icon.className = isOpen ? 'fas fa-bars' : 'fas fa-times';
      });
      window.addEventListener('resize', function () {
        if (window.innerWidth >= 1280) panel.style.display = 'none';
      });
    } catch (e) {}
  }

  // -------------------------------------------------------------------------
  // 4. Sources de données : Supabase (statique) puis API Node (si présente)
  // -------------------------------------------------------------------------
  function fetchJson(path) {
    return fetch(path, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status + ' sur ' + path);
        return response.json();
      });
  }

  function isFilledList(value) { return Array.isArray(value) && value.length > 0; }
  function isFilledObject(value) { return Boolean(value) && typeof value === 'object' && Object.keys(value).length > 0; }

  function loadContent() {
    // « site_content » peut être vide : ce n'est pas une erreur, les textes
    // d'origine de la page sont alors conservés.
    return DB.firstUsable({
      supabase: function () {
        return DB.select('site_content', 'select=key,value').then(function (rows) {
          if (!rows) return null;
          var content = {};
          rows.forEach(function (row) { content[row.key] = row.value; });
          return content;
        });
      },
      node: function () { return fetchJson('/api/content'); }
    }, isFilledObject).catch(function () { return {}; });
  }

  function loadServices() {
    return DB.firstUsable({
      supabase: function () {
        return DB.select('services_poles', 'select=id,title,category,description,icon,active,display_order&active=is.true&order=display_order.asc');
      },
      node: function () { return fetchJson('/api/services'); }
    }, isFilledList).catch(function () { return []; });
  }

  function loadNews() {
    return DB.firstUsable({
      supabase: function () {
        return DB.select('news', 'select=id,title,slug,category,summary,content,image_url,status,published_at&status=eq.published&order=published_at.desc&limit=3');
      },
      node: function () { return fetchJson('/api/news?status=published'); }
    }, isFilledList).catch(function () { return []; });
  }

  async function syncManagedPublicContent() {
    try {
      var content = (await loadContent()) || {};
      var services = (await loadServices()) || [];
      var news = (await loadNews()) || [];

      document.querySelectorAll('[data-cms]').forEach(function (element) {
        var value = String(element.getAttribute('data-cms') || '').split('.').reduce(function (item, key) {
          return item && item[key];
        }, content);
        if (typeof value === 'string' && value.trim()) element.textContent = value;
      });

      renderPublicServices(Array.isArray(services) ? services.filter(function (service) {
        return service.active === true || Number(service.active) === 1;
      }) : []);
      renderPublicNews(Array.isArray(news) ? news : []);
      applyPublicContactInfo(content.contact_info || {});
    } catch (error) {
      warn('contenus dynamiques non chargés :', error && error.message);
    }
  }

  // -------------------------------------------------------------------------
  // 5. Médiathèque : images gérées depuis l'administration
  //    -> remplace l'image d'un emplacement (data-media-slot) et alimente la
  //       galerie de la page d'accueil.
  // -------------------------------------------------------------------------
  function safeImageUrl(rawUrl) {
    try {
      var url = new URL(String(rawUrl || ''), window.location.href);
      return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  async function syncManagedMedia() {
    var media = await DB.firstUsable({
      supabase: function () {
        return DB.select('site_media', 'select=id,title,alt_text,image_url,section,placement,link_url,display_order,active,created_at'
          + '&active=is.true&order=display_order.asc,created_at.desc');
      },
      node: function () { return fetchJson('/api/public/media'); }
    }, isFilledList);

    if (!isFilledList(media)) {
      debug('aucune image active dans la médiathèque : les visuels d\'origine sont conservés.');
      return;
    }

    var activeMedia = media.filter(function (item) {
      return item && item.active !== false && item.active !== 0 && safeImageUrl(item.image_url);
    });
    applyMediaPlacements(activeMedia);
    renderMediaGallery(activeMedia);
  }

  function applyMediaPlacements(media) {
    document.querySelectorAll('[data-media-slot]').forEach(function (element) {
      var slot = element.getAttribute('data-media-slot');
      if (!slot) return;
      var item = media.filter(function (candidate) { return candidate.placement === slot; })[0];
      if (!item) return;
      var imageUrl = safeImageUrl(item.image_url);
      if (!imageUrl) return;
      if (element.tagName === 'IMG') {
        element.setAttribute('src', imageUrl);
        element.setAttribute('alt', item.alt_text || item.title || element.getAttribute('alt') || '');
        debug('image appliquée sur l\'emplacement', slot);
      } else {
        element.style.backgroundImage = 'url("' + imageUrl + '")';
      }
    });
  }

  function renderMediaGallery(media) {
    var grid = document.getElementById('media-gallery-grid');
    if (!grid) return;

    var galleryItems = media.filter(function (item) {
      return item.section === 'galerie' && !item.placement;
    });
    if (!galleryItems.length) return;

    // Les images gérées depuis l'administration remplacent la galerie d'origine.
    grid.replaceChildren();
    galleryItems.forEach(function (item) {
      var imageUrl = safeImageUrl(item.image_url);
      if (!imageUrl) return;
      var card = document.createElement('div');
      card.className = 'gallery-item h-80 group';

      var linkUrl = item.link_url ? safeImageUrl(item.link_url) : null;
      var wrapper = linkUrl ? document.createElement('a') : document.createElement('div');
      if (linkUrl) {
        wrapper.setAttribute('href', linkUrl);
        wrapper.setAttribute('target', '_blank');
        wrapper.setAttribute('rel', 'noopener');
      }
      wrapper.className = 'block w-full h-full relative';

      var image = document.createElement('img');
      image.src = imageUrl;
      image.alt = item.alt_text || item.title || 'Image PK Global Partners';
      image.loading = 'lazy';
      image.className = 'w-full h-full object-cover';
      wrapper.appendChild(image);

      var overlay = document.createElement('div');
      overlay.className = 'gallery-overlay';
      var eyebrow = document.createElement('span');
      eyebrow.className = 'text-yellow-400 text-xs font-bold uppercase tracking-widest mb-1';
      eyebrow.textContent = 'PK Global';
      var caption = document.createElement('h4');
      caption.className = 'text-white font-bold text-lg';
      caption.textContent = item.title || '';
      overlay.appendChild(eyebrow);
      overlay.appendChild(caption);
      wrapper.appendChild(overlay);

      card.appendChild(wrapper);
      grid.appendChild(card);
    });
  }

  // -------------------------------------------------------------------------
  // 5.bis Carrières : offres d'emploi publiées depuis l'administration
  //      (table Supabase « job_offers », statut « open » uniquement).
  //      Si aucune offre n'est publiée, la liste d'origine de la page reste
  //      affichée : aucune offre fictive n'est ajoutée.
  // -------------------------------------------------------------------------
  function loadJobOffers() {
    return DB.firstUsable({
      supabase: function () {
        return DB.select('job_offers', 'select=id,title,department,location,contract_type,level,description,profile,deadline,display_order,status'
          + '&status=eq.open&order=display_order.asc,created_at.desc');
      },
      node: function () { return fetchJson('/api/job-offers?status=open'); }
    }, isFilledList).catch(function () { return []; });
  }

  async function syncPublicJobOffers() {
    var grid = document.getElementById('jobs-grid');
    if (!grid) return;
    var jobs = await loadJobOffers();
    if (!isFilledList(jobs)) {
      debug('aucune offre d\'emploi publiée : la liste d\'origine est conservée.');
      return;
    }
    renderPublicJobOffers(grid, jobs);
  }

  function renderPublicJobOffers(grid, jobs) {
    grid.replaceChildren();
    jobs.forEach(function (job) {
      var card = document.createElement('div');
      card.className = 'job-card bg-white p-8 rounded-2xl';

      var header = document.createElement('div');
      header.className = 'flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-4';

      var headerLeft = document.createElement('div');
      var title = document.createElement('h3');
      title.className = 'text-2xl font-bold text-emerald-950';
      title.textContent = job.title || 'Offre d\'emploi';
      headerLeft.appendChild(title);

      var badges = document.createElement('div');
      badges.className = 'flex flex-wrap gap-3 mt-3';
      [
        [job.department, 'bg-emerald-100 text-emerald-700'],
        [job.location, 'bg-blue-100 text-blue-700'],
        [job.level, 'bg-yellow-100 text-yellow-700'],
        [job.contract_type, 'bg-slate-100 text-slate-700']
      ].forEach(function (pair) {
        if (!pair[0]) return;
        var badge = document.createElement('span');
        badge.className = pair[1] + ' text-xs px-4 py-2 rounded-full font-semibold';
        badge.textContent = pair[0];
        badges.appendChild(badge);
      });
      headerLeft.appendChild(badges);
      header.appendChild(headerLeft);

      // Bouton « Postuler » : renvoie vers le formulaire et pré-remplit le poste.
      var apply = document.createElement('a');
      apply.href = '#contact';
      apply.className = 'btn-gold px-8 py-3 rounded-xl font-bold text-sm whitespace-nowrap';
      apply.textContent = 'Postuler';
      apply.addEventListener('click', function () {
        var target = document.getElementById('target-position');
        if (target && !target.value) target.value = job.title || '';
      });
      header.appendChild(apply);

      card.appendChild(header);

      if (job.description) {
        var description = document.createElement('p');
        description.className = 'text-gray-600 mb-4';
        description.textContent = job.description;
        card.appendChild(description);
      }
      if (job.profile) {
        var profile = document.createElement('p');
        profile.className = 'text-sm text-gray-600';
        var label = document.createElement('span');
        label.className = 'font-bold text-emerald-950';
        label.textContent = 'Profil recherché : ';
        profile.appendChild(label);
        profile.appendChild(document.createTextNode(job.profile));
        card.appendChild(profile);
      }
      grid.appendChild(card);
    });
    debug(jobs.length + ' offre(s) d\'emploi chargée(s) depuis l\'administration.');
  }

  // -------------------------------------------------------------------------
  // 6. Formulaires publics
  //    En mode statique, les réponses sont enregistrées DIRECTEMENT dans
  //    Supabase (politiques « Public insert … »). Aucun email automatique
  //    n'est envoyé dans ce mode : le visiteur est prévenu et la demande est
  //    bien enregistrée dans l'espace admin.
  // -------------------------------------------------------------------------
  function buildReference() {
    var now = new Date();
    var stamp = now.getFullYear()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0');
    var random = Math.random().toString(36).slice(2, 7).toUpperCase();
    return 'WEB-' + stamp + '-' + random;
  }

  /**
   * Enregistre une soumission : Supabase d'abord, API Node ensuite.
   * @returns {Promise<{ok:boolean, mode:'supabase'|'node'|null, data:Object|null}>}
   */
  async function submitEntry(table, payload, nodePath, nodeBody) {
    var result = { ok: false, mode: null, data: null };
    var order = (CONFIG.dataSource === 'node') ? ['node', 'supabase'] : ['supabase', 'node'];

    for (var i = 0; i < order.length; i += 1) {
      var mode = order[i];
      try {
        if (mode === 'supabase') {
          var row = await DB.insert(table, payload);
          if (row) {
            result.ok = true; result.mode = 'supabase'; result.data = row;
            return result;
          }
        } else {
          var response = await fetch(nodePath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nodeBody || payload)
          });
          var body = await response.json().catch(function () { return null; });
          if (response.ok && body && body.success !== false) {
            result.ok = true; result.mode = 'node'; result.data = body;
            return result;
          }
          if (body && body.error) result.error = body.error;
        }
      } catch (error) {
        warn('envoi impossible via ' + mode + ' :', error && error.message);
      }
    }
    return result;
  }

  function wireContactForm() {
    var contactForm = document.getElementById('contact-form') || document.querySelector('form[action*="contact"]');
    if (!contactForm) return;

    contactForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      var submitBtn = contactForm.querySelector('button[type="submit"]') || contactForm.querySelector('button');
      var origText = submitBtn ? submitBtn.innerHTML : 'Envoyer';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Envoi en cours...';
      }

      var formData = new FormData(contactForm);
      var payload = {};
      formData.forEach(function (value, key) { payload[key] = value; });

      if (!payload.name && !payload.nom) {
        var nameInput = contactForm.querySelector('input[type="text"]');
        if (nameInput) payload.name = nameInput.value;
      }
      if (!payload.email) {
        var emailInput = contactForm.querySelector('input[type="email"]');
        if (emailInput) payload.email = emailInput.value;
      }
      if (!payload.message) {
        var msgInput = contactForm.querySelector('textarea');
        if (msgInput) payload.message = msgInput.value;
      }

      var reference = buildReference();
      var record = {
        reference: reference,
        name: payload.name || payload.nom || 'Visiteur du site',
        email: payload.email || '',
        phone: payload.phone || payload.telephone || null,
        organization: payload.organization || payload.societe || null,
        service_requested: payload.service_requested || payload.service || payload.sujet || 'Contact site web',
        subject: payload.subject || payload.objet || 'Demande depuis le site web',
        message: payload.message || ''
      };

      var result = await submitEntry('inquiries', record, '/api/inquiries');

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
      }

      if (result.ok) {
        var ref = escapeHtml((result.mode === 'node' && result.data.reference) ? result.data.reference : reference);
        showModal({
          title: 'Message transmis avec succès !',
          icon: 'fa-check-circle text-emerald-500',
          message: 'Votre demande a bien été enregistrée sous la référence <span class="font-bold text-emerald-800">' + ref + '</span>.<br><br>'
            + (result.mode === 'supabase'
              ? 'Elle est visible dans l\'espace admin (module Demandes / CRM). Notre équipe vous recontactera dans les plus brefs délais.'
              : (result.data.email_status === 'sent'
                ? 'Un email d\'accusé de réception vous a été adressé.'
                : 'La confirmation par email n\'est pas disponible actuellement, mais votre demande est bien enregistrée.'))
        });
        contactForm.reset();
      } else {
        alert(result.error || 'Impossible d\'enregistrer votre message pour le moment. Veuillez réessayer ou nous écrire à info@pkglobalpartners.com.');
      }
    });
  }

  function wireInvestorForm() {
    var investorForm = document.querySelector('form[action*="investor"]')
      || (window.location.pathname.indexOf('investors') !== -1 ? document.querySelector('form') : null);
    if (!investorForm || document.getElementById('contact-form')) return;

    investorForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      var submitBtn = investorForm.querySelector('button[type="submit"]') || investorForm.querySelector('button');
      var origText = submitBtn ? submitBtn.innerHTML : 'Envoyer';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Traitement...';
      }

      var inputs = investorForm.querySelectorAll('input, select, textarea');
      var record = {
        name: '',
        organization: '',
        email: '',
        phone: '',
        country: 'RDC',
        investor_type: 'Fonds d\'investissement',
        ticket_min: 0,
        ticket_max: 0,
        sectors_of_interest: 'Agroalimentaire, Distribution, Infrastructures',
        notes: ''
      };

      inputs.forEach(function (input) {
        var label = (input.name || input.placeholder || input.getAttribute('aria-label') || '').toLowerCase();
        var value = input.value;
        if (input.type === 'email' || label.indexOf('email') !== -1) record.email = value;
        else if (label.indexOf('nom') !== -1 || label.indexOf('name') !== -1) record.name = value;
        else if (label.indexOf('org') !== -1 || label.indexOf('soci') !== -1) record.organization = value;
        else if (input.type === 'tel' || label.indexOf('tel') !== -1 || label.indexOf('phone') !== -1) record.phone = value;
        else if (label.indexOf('pays') !== -1 || label.indexOf('country') !== -1) record.country = value;
        else if (label.indexOf('ticket') !== -1 || label.indexOf('montant') !== -1 || label.indexOf('capacit') !== -1) record.ticket_max = parseFloat(value) || 0;
        else if (input.tagName === 'TEXTAREA' || label.indexOf('mess') !== -1) record.notes = value;
      });

      var result = await submitEntry('investors', record, '/api/investors/interest');

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
      }

      if (result.ok) {
        showModal({
          title: 'Profil investisseur enregistré',
          icon: 'fa-handshake text-yellow-500',
          message: 'Merci pour votre manifestation d\'intérêt. Notre Direction des Relations Investisseurs vous contactera sous peu afin de vous transmettre le teaser des opportunités et le dossier de présentation.'
        });
        investorForm.reset();
      } else {
        alert(result.error || 'Impossible d\'enregistrer votre demande pour le moment. Veuillez réessayer ou nous écrire à info@pkglobalpartners.com.');
      }
    });
  }

  function wireCareersForm() {
    if (window.location.pathname.indexOf('careers') === -1) return;
    var careersForm = document.querySelector('form');
    if (!careersForm) return;

    careersForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      var submitBtn = careersForm.querySelector('button[type="submit"]') || careersForm.querySelector('button');
      var origText = submitBtn ? submitBtn.innerHTML : 'Envoyer';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Envoi en cours...';
      }

      var nameVal = careersForm.querySelector('input[type="text"]');
      var emailVal = careersForm.querySelector('input[type="email"]');
      var phoneVal = careersForm.querySelector('input[type="tel"]');
      var msgVal = careersForm.querySelector('textarea');
      var selects = careersForm.querySelectorAll('select');
      var domain = selects[0];           // Domaine d'expertise
      var availability = selects[1];     // Disponibilité
      var positionInput = document.getElementById('target-position');
      var cvInput = document.getElementById('cv-input') || document.getElementById('cv-upload');

      var poste = (positionInput && positionInput.value.trim()) || '';
      var domaine = (domain && (domain.selectedOptions[0] ? domain.selectedOptions[0].textContent : domain.value)) || '';

      var details = 'Déposée depuis la page Carrières du site web.';
      if (availability && availability.value) {
        details += '\nDisponibilité : ' + (availability.selectedOptions[0] ? availability.selectedOptions[0].textContent : availability.value);
      }
      var cvName = cvInput && cvInput.files && cvInput.files.length ? cvInput.files[0].name : null;
      if (cvName) {
        details += '\n[CV annoncé : « ' + cvName + ' » — à recevoir par email]';
      }

      var record = {
        candidate_name: (nameVal && nameVal.value) || 'Candidat',
        candidate_email: (emailVal && emailVal.value) || '',
        candidate_phone: (phoneVal && phoneVal.value) || null,
        project_title: 'Candidature — ' + (poste || domaine || 'candidature spontanée'),
        sector: domaine || 'Carrières',
        location: 'Non précisé',
        funding_requested: 0,
        currency: 'USD',
        summary: (msgVal && msgVal.value) || 'Candidature spontanée déposée depuis la page Carrières.',
        details: details
      };

      var result = await submitEntry('candidatures', record, '/api/candidatures');

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
      }

      if (result.ok) {
        var id = result.data && result.data.id;
        var reference = id ? ' (référence #CAND-' + id + ')' : '';
        showModal({
          title: 'Candidature enregistrée',
          icon: 'fa-check-circle text-emerald-500',
          message: 'Merci, votre candidature a bien été transmise' + reference + '. '
            + (cvName
              ? 'Pour joindre votre CV « ' + escapeHtml(cvName) + ' », envoyez-le par email à carrieres@pkglobalpartners.com en rappelant cette référence.'
              : 'Notre équipe RH reviendra vers vous rapidement.')
        });
        careersForm.reset();
      } else {
        alert(result.error || 'Impossible d\'enregistrer votre candidature pour le moment. Veuillez réessayer ou nous écrire à carrieres@pkglobalpartners.com.');
      }
    });
  }

  // -------------------------------------------------------------------------
  // 7. Rendu des contenus dynamiques (texte uniquement : jamais de HTML)
  // -------------------------------------------------------------------------
  function renderPublicServices(services) {
    var grid = document.getElementById('public-services-grid');
    if (!grid) return;
    grid.replaceChildren();

    if (!services.length) {
      var empty = document.createElement('p');
      empty.className = 'text-emerald-100/70 text-sm';
      empty.textContent = 'Nos pôles d’expertise seront bientôt présentés ici.';
      grid.appendChild(empty);
      return;
    }

    services.forEach(function (service) {
      var card = document.createElement('article');
      card.className = 'bg-white/5 border border-white/10 p-10 rounded-3xl hover:bg-emerald-900 transition duration-500 group';
      var iconBox = document.createElement('div');
      iconBox.className = 'w-16 h-16 bg-emerald-800 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-yellow-400 group-hover:text-emerald-900 transition-colors';
      var icon = document.createElement('i');
      var iconTokens = String(service.icon || 'fa-briefcase').split(/\s+/).filter(function (token) { return /^[a-z0-9_-]+$/i.test(token); });
      icon.className = 'fas ' + (iconTokens.join(' ') || 'fa-briefcase') + ' text-2xl';
      iconBox.appendChild(icon);

      var title = document.createElement('h3');
      title.className = 'text-xl font-bold mb-4';
      title.textContent = service.title || '';
      var description = document.createElement('p');
      description.className = 'text-emerald-100/60 text-sm leading-relaxed';
      description.textContent = service.description || '';
      card.appendChild(iconBox);
      card.appendChild(title);
      card.appendChild(description);
      grid.appendChild(card);
    });
  }

  function renderPublicNews(items) {
    var section = document.getElementById('public-news');
    var grid = document.getElementById('public-news-grid');
    if (!section || !grid) return;
    grid.replaceChildren();

    if (!items.length) {
      section.classList.add('hidden');
      return;
    }

    items.slice(0, 3).forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden';
      if (item.image_url) {
        try {
          var imageUrl = new URL(item.image_url, window.location.origin);
          if (imageUrl.protocol === 'http:' || imageUrl.protocol === 'https:') {
            var image = document.createElement('img');
            image.src = imageUrl.href;
            image.alt = item.title || 'Actualité PK Global Partners';
            image.loading = 'lazy';
            image.className = 'w-full h-52 object-cover';
            card.appendChild(image);
          }
        } catch (_) {}
      }
      var contentBox = document.createElement('div');
      contentBox.className = 'p-6';
      var category = document.createElement('p');
      category.className = 'text-emerald-700 text-xs font-bold uppercase tracking-widest mb-2';
      category.textContent = item.category || 'Actualité';
      var title = document.createElement('h3');
      title.className = 'text-xl font-bold text-emerald-950 mb-3';
      title.textContent = item.title || '';
      var summary = document.createElement('p');
      summary.className = 'text-sm text-slate-600 leading-relaxed';
      summary.textContent = item.summary || item.content || '';
      contentBox.appendChild(category);
      contentBox.appendChild(title);
      contentBox.appendChild(summary);
      card.appendChild(contentBox);
      grid.appendChild(card);
    });
    section.classList.remove('hidden');
  }

  function applyPublicContactInfo(info) {
    if (!info) return;

    if (info.whatsapp) {
      var whatsappNumber = String(info.whatsapp).replace(/\D/g, '');
      document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]').forEach(function (link) {
        link.setAttribute('href', 'https://wa.me/' + whatsappNumber);
      });
    }

    if (info.phone) {
      var phoneUri = 'tel:' + String(info.phone).replace(/[^+\d]/g, '');
      document.querySelectorAll('a[href^="tel:"], [data-site-phone]').forEach(function (link) {
        link.setAttribute('href', phoneUri);
        var textNode = Array.prototype.slice.call(link.childNodes).filter(function (node) {
          return node.nodeType === Node.TEXT_NODE && node.textContent.trim();
        })[0];
        if (textNode) textNode.textContent = ' ' + info.phone;
        else if (!link.querySelector('i')) link.textContent = info.phone;
      });
    }

    document.querySelectorAll('a[href^="mailto:"]').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      var email = info.email_general;
      if (/investors/i.test(href)) email = info.email_investors || email;
      else if (/careers/i.test(href)) email = info.email_careers || email;
      else if (/partnerships/i.test(href)) email = info.email_partnerships || email;
      if (!email) return;
      link.setAttribute('href', 'mailto:' + email);
      var textNode = Array.prototype.slice.call(link.childNodes).filter(function (node) {
        return node.nodeType === Node.TEXT_NODE && node.textContent.trim();
      })[0];
      if (textNode) textNode.textContent = ' ' + email;
    });
  }

  // -------------------------------------------------------------------------
  // 8. Fenêtre de confirmation
  // -------------------------------------------------------------------------
  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showModal(options) {
    var existing = document.getElementById('pkgp-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'pkgp-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-emerald-950/70 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = ''
      + '<div class="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-emerald-100 text-center transform transition-all">'
      + '  <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 flex items-center justify-center text-3xl">'
      + '    <i class="fas ' + (options.icon || 'fa-check text-emerald-600') + '"></i>'
      + '  </div>'
      + '  <h3 class="text-2xl font-bold text-emerald-950 mb-3"></h3>'
      + '  <p class="text-sm text-gray-600 leading-relaxed mb-6"></p>'
      + '  <button id="pkgp-modal-close" class="w-full bg-emerald-900 hover:bg-emerald-800 text-yellow-400 font-bold py-3.5 px-6 rounded-xl transition duration-200">Fermer</button>'
      + '</div>';
    modal.querySelector('h3').textContent = options.title || '';
    modal.querySelector('p').innerHTML = options.message || '';
    document.body.appendChild(modal);
    document.getElementById('pkgp-modal-close').addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (event) {
      if (event.target === modal) modal.remove();
    });
  }
})();
