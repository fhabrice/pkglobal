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
              message: `Votre demande a bien été enregistrée sous la référence <span class="font-bold text-emerald-800">${res.reference}</span>.<br><br>Un email d'accusé de réception vous a été adressé et notre équipe vous recontactera dans les plus brefs délais.`
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
              message: `Votre candidature a été transmise à notre service Ressources Humaines (Réf: #CAND-${res.id}). Un email de confirmation vous a été envoyé.`
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
