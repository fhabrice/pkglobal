/**
 * PK GLOBAL PARTNERS - Client Site Integration Script
 * Connects public website forms to the dynamic backend administration API
 * and tracks real-time visitor metrics.
 */

(function () {
  // 1. Automatic visitor page tracking
  try {
    const pagePath = window.location.pathname;
    let pageName = 'accueil';
    if (pagePath.includes('about')) pageName = 'about';
    else if (pagePath.includes('filiales')) pageName = 'filiales';
    else if (pagePath.includes('investors')) pageName = 'investors';
    else if (pagePath.includes('careers')) pageName = 'careers';
    else if (pagePath.includes('contact')) pageName = 'contact';

    fetch('/api/track-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: pageName,
        referrer: document.referrer || 'direct'
      })
    }).catch(() => {});
  } catch (e) {}

  // 2. Add floating / accessible Admin Portal shortcut button
  document.addEventListener('DOMContentLoaded', function () {
    // Inject floating Admin shortcut button (bottom-right)
    const adminBtn = document.createElement('a');
    adminBtn.href = '/admin';
    adminBtn.className = 'fixed bottom-5 right-5 z-40 bg-emerald-950/90 hover:bg-emerald-800 text-yellow-400 border border-yellow-400/40 px-4 py-2.5 rounded-full shadow-2xl backdrop-blur-md text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all transform hover:scale-105';
    adminBtn.innerHTML = '<i class="fas fa-shield-alt text-sm"></i> <span>Espace Admin</span>';
    adminBtn.title = 'Accéder à l\'espace d\'administration PK Global';
    document.body.appendChild(adminBtn);

    // Apply CMS-managed public content without injecting administrator text as HTML.
    syncManagedPublicContent();

    // 3. Intercept Contact Form if present
    const contactForm = document.getElementById('contact-form') || document.querySelector('form[action*="contact"]');
    if (contactForm) {
      contactForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const submitBtn = contactForm.querySelector('button[type="submit"]') || contactForm.querySelector('button');
        const origText = submitBtn ? submitBtn.innerHTML : 'Envoyer';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Envoi en cours...';
        }

        const formData = new FormData(contactForm);
        const payload = {};
        formData.forEach((val, key) => { payload[key] = val; });

        // Fallbacks for inputs without standard names
        if (!payload.name && !payload.nom) {
          const nameInput = contactForm.querySelector('input[type="text"]');
          if (nameInput) payload.name = nameInput.value;
        }
        if (!payload.email) {
          const emailInput = contactForm.querySelector('input[type="email"]');
          if (emailInput) payload.email = emailInput.value;
        }
        if (!payload.message) {
          const msgInput = contactForm.querySelector('textarea');
          if (msgInput) payload.message = msgInput.value;
        }

        try {
          const resp = await fetch('/api/inquiries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const res = await resp.json();

          if (resp.ok && res.success) {
            showModal({
              title: 'Message Transmis avec Succès !',
              icon: 'fa-check-circle text-emerald-500',
              message: `Votre demande a bien été enregistrée sous la référence <span class="font-bold text-emerald-800">${res.reference}</span>.<br><br>${res.email_status === 'sent' ? 'Un email d\'accusé de réception vous a été adressé.' : 'La demande est enregistrée ; la confirmation email n\'est pas disponible actuellement.'} Notre équipe vous recontactera dans les plus brefs délais.`
            });
            contactForm.reset();
          } else {
            alert(res.error || 'Une erreur est survenue lors de l\'envoi.');
          }
        } catch (err) {
          alert('Impossible de contacter le serveur. Veuillez réessayer.');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
          }
        }
      });
    }

    // 4. Intercept Investor Form if present on investors.html
    const investorForm = document.querySelector('form[action*="investor"]') || (window.location.pathname.includes('investors') ? document.querySelector('form') : null);
    if (investorForm && !contactForm) {
      investorForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const submitBtn = investorForm.querySelector('button[type="submit"]') || investorForm.querySelector('button');
        const origText = submitBtn ? submitBtn.innerHTML : 'Envoyer';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Traitement...';
        }

        const inputs = investorForm.querySelectorAll('input, select, textarea');
        const payload = {
          name: '',
          organization: '',
          email: '',
          phone: '',
          country: 'RDC',
          investor_type: 'Fonds d\'investissement',
          ticket_min: 50000,
          ticket_max: 500000,
          sectors_of_interest: 'Agroalimentaire, Distribution, Infrastructures',
          project_interest: 'Développement Agroalimentaire & Expansion Filiales',
          message: ''
        };

        inputs.forEach(inp => {
          const n = (inp.name || inp.placeholder || inp.getAttribute('aria-label') || '').toLowerCase();
          const val = inp.value;
          if (inp.type === 'email' || n.includes('email')) payload.email = val;
          else if (n.includes('nom') || n.includes('name')) payload.name = val;
          else if (n.includes('org') || n.includes('soci')) payload.organization = val;
          else if (inp.type === 'tel' || n.includes('tel') || n.includes('phone')) payload.phone = val;
          else if (n.includes('pays') || n.includes('country')) payload.country = val;
          else if (n.includes('ticket') || n.includes('montant') || n.includes('capacit')) {
            payload.ticket_max = parseFloat(val) || 500000;
          }
          else if (inp.tagName === 'TEXTAREA' || n.includes('mess')) payload.message = val;
        });

        try {
          const resp = await fetch('/api/investors/interest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const res = await resp.json();

          if (resp.ok && res.success) {
            showModal({
              title: 'Profil Investisseur Enregistré',
              icon: 'fa-handshake text-yellow-500',
              message: `Merci pour votre manifestation d'intérêt. Notre Direction des Relations Investisseurs vous contactera sous peu afin de vous transmettre le teaser des opportunités et le dossier de présentation.`
            });
            investorForm.reset();
          } else {
            alert(res.error || 'Une erreur est survenue.');
          }
        } catch (err) {
          alert('Impossible de contacter le serveur.');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
          }
        }
      });
    }

    // 5. Intercept Careers / Candidature Form on careers.html
    const careersForm = (window.location.pathname.includes('careers') ? document.querySelector('form') : null);
    if (careersForm && careersForm !== contactForm && careersForm !== investorForm) {
      careersForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const submitBtn = careersForm.querySelector('button[type="submit"]') || careersForm.querySelector('button');
        const origText = submitBtn ? submitBtn.innerHTML : 'Envoyer';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Dépôt du dossier...';
        }

        const formData = new FormData(careersForm);
        const nameVal = careersForm.querySelector('input[type="text"]')?.value || 'Candidat';
        const emailVal = careersForm.querySelector('input[type="email"]')?.value || '';
        const phoneVal = careersForm.querySelector('input[type="tel"]')?.value || '';
        const msgVal = careersForm.querySelector('textarea')?.value || 'Candidature spontanée';

        const payload = {
          candidate_name: nameVal,
          candidate_email: emailVal,
          candidate_phone: phoneVal,
          project_title: 'Candidature Talents / Carrières PK Global',
          sector: 'Ressources Humaines & Opérations',
          location: 'RDC',
          funding_requested: 0,
          currency: 'USD',
          summary: msgVal,
          details: 'Dossier déposé via le formulaire Carrières'
        };

        try {
          const resp = await fetch('/api/candidatures', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const res = await resp.json();

          if (resp.ok && res.success) {
            showModal({
              title: 'Candidature Bien Reçue !',
              icon: 'fa-id-badge text-emerald-500',
              message: `Votre candidature a été transmise à notre service Ressources Humaines (Réf: #CAND-${res.id}). ${res.email_status === 'sent' ? 'Un email de confirmation vous a été envoyé.' : 'La confirmation par email n\'a pas pu être délivrée pour le moment.'}`
            });
            careersForm.reset();
          } else {
            alert(res.error || 'Erreur lors du dépôt.');
          }
        } catch (err) {
          alert('Impossible de joindre le serveur.');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
          }
        }
      });
    }
  });

  async function syncManagedPublicContent() {
    try {
      const [contentResponse, servicesResponse, newsResponse] = await Promise.all([
        fetch('/api/content'),
        fetch('/api/services'),
        fetch('/api/news?status=published')
      ]);

      const content = contentResponse.ok ? await contentResponse.json() : {};
      const services = servicesResponse.ok ? await servicesResponse.json() : [];
      const news = newsResponse.ok ? await newsResponse.json() : [];

      document.querySelectorAll('[data-cms]').forEach((element) => {
        const value = String(element.getAttribute('data-cms') || '').split('.').reduce((item, key) => item && item[key], content);
        if (typeof value === 'string' && value.trim()) element.textContent = value;
      });

      renderPublicServices(Array.isArray(services) ? services.filter((service) => Number(service.active) === 1) : []);
      renderPublicNews(Array.isArray(news) ? news : []);
      applyPublicContactInfo(content.contact_info || {});
    } catch (error) {
      console.warn('Unable to load CMS-managed public content:', error);
    }
  }

  function renderPublicServices(services) {
    const grid = document.getElementById('public-services-grid');
    if (!grid) return;
    grid.replaceChildren();

    if (!services.length) {
      const empty = document.createElement('p');
      empty.className = 'text-emerald-100/70 text-sm';
      empty.textContent = 'Nos pôles d’expertise seront bientôt présentés ici.';
      grid.appendChild(empty);
      return;
    }

    services.forEach((service) => {
      const card = document.createElement('article');
      card.className = 'bg-white/5 border border-white/10 p-10 rounded-3xl hover:bg-emerald-900 transition duration-500 group';
      const iconBox = document.createElement('div');
      iconBox.className = 'w-16 h-16 bg-emerald-800 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-yellow-400 group-hover:text-emerald-900 transition-colors';
      const icon = document.createElement('i');
      const iconTokens = String(service.icon || 'fa-briefcase').split(/\s+/).filter((token) => /^[a-z0-9_-]+$/i.test(token));
      icon.className = `fas ${iconTokens.join(' ') || 'fa-briefcase'} text-2xl`;
      iconBox.appendChild(icon);

      const title = document.createElement('h3');
      title.className = 'text-xl font-bold mb-4';
      title.textContent = service.title || '';
      const description = document.createElement('p');
      description.className = 'text-emerald-100/60 text-sm leading-relaxed';
      description.textContent = service.description || '';
      card.append(iconBox, title, description);
      grid.appendChild(card);
    });
  }

  function renderPublicNews(items) {
    const section = document.getElementById('public-news');
    const grid = document.getElementById('public-news-grid');
    if (!section || !grid) return;
    grid.replaceChildren();

    if (!items.length) {
      section.classList.add('hidden');
      return;
    }

    items.slice(0, 3).forEach((item) => {
      const card = document.createElement('article');
      card.className = 'bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden';
      if (item.image_url) {
        try {
          const imageUrl = new URL(item.image_url, window.location.origin);
          if (imageUrl.protocol === 'http:' || imageUrl.protocol === 'https:') {
            const image = document.createElement('img');
            image.src = imageUrl.href;
            image.alt = item.title || 'Actualité PK Global Partners';
            image.loading = 'lazy';
            image.className = 'w-full h-52 object-cover';
            card.appendChild(image);
          }
        } catch (_) {}
      }
      const contentBox = document.createElement('div');
      contentBox.className = 'p-6';
      const category = document.createElement('p');
      category.className = 'text-emerald-700 text-xs font-bold uppercase tracking-widest mb-2';
      category.textContent = item.category || 'Actualité';
      const title = document.createElement('h3');
      title.className = 'text-xl font-bold text-emerald-950 mb-3';
      title.textContent = item.title || '';
      const summary = document.createElement('p');
      summary.className = 'text-sm text-slate-600 leading-relaxed';
      summary.textContent = item.summary || item.content || '';
      contentBox.append(category, title, summary);
      card.appendChild(contentBox);
      grid.appendChild(card);
    });
    section.classList.remove('hidden');
  }

  function applyPublicContactInfo(info) {
    if (info.whatsapp) {
      const whatsappNumber = String(info.whatsapp).replace(/\\D/g, '');
      document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]').forEach((link) => {
        link.setAttribute('href', `https://wa.me/${whatsappNumber}`);
      });
    }

    if (info.phone) {
      const phoneUri = `tel:${String(info.phone).replace(/[^+\\d]/g, '')}`;
      document.querySelectorAll('a[href^="tel:"], [data-site-phone]').forEach((link) => {
        link.setAttribute('href', phoneUri);
        const textNode = Array.from(link.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (textNode) textNode.textContent = ` ${info.phone}`;
        else if (!link.querySelector('i')) link.textContent = info.phone;
      });
    }

    document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      let email = info.email_general;
      if (/investors/i.test(href)) email = info.email_investors || email;
      else if (/careers/i.test(href)) email = info.email_careers || email;
      else if (/partnerships/i.test(href)) email = info.email_partnerships || email;
      if (!email) return;
      link.setAttribute('href', `mailto:${email}`);
      const textNode = Array.from(link.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (textNode) textNode.textContent = ` ${email}`;
    });
  }

  // Modal helper
  function showModal({ title, message, icon }) {
    const existing = document.getElementById('pkgp-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'pkgp-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-emerald-950/70 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-emerald-100 text-center transform transition-all">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 flex items-center justify-center text-3xl">
          <i class="fas ${icon || 'fa-check text-emerald-600'}"></i>
        </div>
        <h3 class="text-2xl font-bold text-emerald-950 mb-3">${title}</h3>
        <p class="text-sm text-gray-600 leading-relaxed mb-6">${message}</p>
        <button id="pkgp-modal-close" class="w-full bg-emerald-900 hover:bg-emerald-800 text-yellow-400 font-bold py-3.5 px-6 rounded-xl transition duration-200">
          Fermer
        </button>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('pkgp-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }
})();
