/* =============================================================================
 * PK GLOBAL PARTNERS — CONFIGURATION UNIQUE DU SITE
 * -----------------------------------------------------------------------------
 * C'EST LE SEUL FICHIER À MODIFIER POUR BRANCHER LE SITE À VOTRE BASE.
 *
 * 1. Ouvrez ce fichier avec le Bloc-notes (ou n'importe quel éditeur).
 * 2. Remplacez, si besoin, « supabaseUrl » et « supabaseAnonKey » par ceux
 *    fournis dans votre projet Supabase :
 *      Supabase > Project Settings > API
 *        - Project URL            -> supabaseUrl
 *        - anon / publishable key -> supabaseAnonKey   (clé PUBLIQUE, sans danger)
 * 3. Enregistrez et envoyez le fichier sur votre hébergeur (FTP).
 *
 * Aucune autre modification n'est nécessaire : le site fonctionne alors en
 * « mode statique » (HTML + JS), c'est-à-dire sur n'importe quel hébergeur
 * mutualisé (cPanel, OVH, PlanetHoster, Hostinger, Netlify, Vercel, GitHub
 * Pages, …) SANS serveur Node.js.
 *
 * dataSource :
 *   'auto'     -> essaie l'API Node si elle existe, sinon Supabase (recommandé)
 *   'supabase' -> interroge uniquement Supabase (hébergement 100 % statique,
 *                 un tout petit peu plus rapide : pas d'appel /api/)
 *   'node'     -> interroge uniquement le serveur Node (hébergement VPS/Node)
 * ========================================================================== */

(function () {
  var CONFIG = {
    supabaseUrl: 'https://vumerporrumovowyonfj.supabase.co',
    supabaseAnonKey: 'sb_publishable_1clRgc8vKrinbm0VM7OR2g_BUnDZVV4',

    // Bucket de stockage des images (Supabase Storage) — ne pas modifier.
    storageBucket: 'site-media',

    // 'auto' | 'supabase' | 'node'
    dataSource: 'auto',

    // Affiche le bouton flottant « Espace Admin » en bas à droite du site.
    showAdminButton: true,

    // Affiche dans la console du navigateur (F12) le détail du chargement des
    // données : très utile pour diagnostiquer « mes images ne s'affichent pas ».
    debug: false
  };

  // ---------------------------------------------------------------------------
  // Petite bibliothèque d'accès à Supabase (REST) — aucune dépendance externe.
  // ---------------------------------------------------------------------------
  function trimSlashes(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  var DB = {
    config: CONFIG,

    // Vrai si l'URL et la clé publique sont renseignées.
    isConfigured: function () {
      return Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
    },

    headers: function (extra) {
      var base = {
        apikey: CONFIG.supabaseAnonKey,
        Authorization: 'Bearer ' + CONFIG.supabaseAnonKey,
        Accept: 'application/json'
      };
      if (extra) {
        Object.keys(extra).forEach(function (key) { base[key] = extra[key]; });
      }
      return base;
    },

    url: function (table, query) {
      return trimSlashes(CONFIG.supabaseUrl) + '/rest/v1/' + table + (query ? '?' + query : '');
    },

    log: function () {
      if (!CONFIG.debug || typeof console === 'undefined') return;
      console.log.apply(console, ['[PK Global]'].concat(Array.prototype.slice.call(arguments)));
    },

    warn: function () {
      if (typeof console === 'undefined') return;
      console.warn.apply(console, ['[PK Global]'].concat(Array.prototype.slice.call(arguments)));
    },

    /**
     * Lecture d'une table.
     * @returns {Promise<Array|null>} null si la lecture échoue.
     */
    select: function (table, query) {
      if (!this.isConfigured()) return Promise.resolve(null);
      var self = this;
      return fetch(this.url(table, query), {
        headers: this.headers(),
        cache: 'no-store'
      }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status + ' sur ' + table);
        return response.json();
      }).then(function (data) {
        if (!Array.isArray(data)) throw new Error('Réponse inattendue sur ' + table);
        self.log('lecture', table, data.length + ' ligne(s)');
        return data;
      }).catch(function (error) {
        self.warn('lecture impossible sur ' + table + ' :', error.message);
        return null;
      });
    },

    /**
     * Insertion d'une ligne (formulaires publics).
     * @returns {Promise<Object|null>} la ligne créée, null si échec.
     */
    insert: function (table, payload) {
      if (!this.isConfigured()) return Promise.resolve(null);
      var self = this;
      return fetch(this.url(table), {
        method: 'POST',
        headers: this.headers({
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        }),
        body: JSON.stringify(payload)
      }).then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            throw new Error('HTTP ' + response.status + ' : ' + text.slice(0, 300));
          });
        }
        return response.json();
      }).then(function (rows) {
        var row = Array.isArray(rows) ? rows[0] : rows;
        self.log('insertion OK dans', table, row);
        return row || null;
      }).catch(function (error) {
        self.warn('insertion impossible dans ' + table + ' :', error.message);
        return null;
      });
    },

    /**
     * Exécute plusieurs sources de données dans l'ordre défini par
     * « dataSource » et renvoie le premier résultat exploitable.
     * @param {Object} loaders { supabase: fn, node: fn } — chaque fn renvoie
     *        une Promise<Array|Object|null>.
     * @param {Function} isUsable — permet d'ignorer un résultat vide.
     */
    firstUsable: function (loaders, isUsable) {
      var order = [];
      if (CONFIG.dataSource === 'node') order = ['node', 'supabase'];
      else order = ['supabase', 'node'];
      if (CONFIG.dataSource === 'supabase') order = ['supabase'];
      if (CONFIG.dataSource === 'node') order = ['node'];

      var test = isUsable || function (value) { return value !== null && value !== undefined; };
      var self = this;

      return order.reduce(function (chain, name) {
        return chain.then(function (result) {
          if (test(result)) return result;
          var loader = loaders[name];
          if (typeof loader !== 'function') return result;
          self.log('source de données essayée :', name);
          return loader().catch(function (error) {
            self.warn('source', name, 'indisponible :', error && error.message);
            return null;
          });
        });
      }, Promise.resolve(null)).then(function (result) {
        return test(result) ? result : null;
      });
    }
  };

  // Diagnostic express : ajoutez « ?pkdebug=1 » à l'adresse de la page puis
  // ouvrez la console (F12) pour voir exactement ce qui est chargé (ou non).
  DB.diagnose = function () {
    var checks = [
      ['site_media', 'select=id,placement,image_url,active&limit=5'],
      ['call_for_projects', 'select=id,title,status&limit=5'],
      ['services_poles', 'select=id,title,active&limit=5'],
      ['news', 'select=id,title,status&limit=5'],
      ['site_content', 'select=key&limit=5']
    ];
    console.log('%c[PK Global] Diagnostic — ' + CONFIG.supabaseUrl, 'font-weight:bold');
    return checks.reduce(function (chain, check) {
      return chain.then(function () {
        return fetch(DB.url(check[0], check[1]), { headers: DB.headers(), cache: 'no-store' })
          .then(function (r) { return r.text(); })
          .then(function (body) {
            console.log('  • ' + check[0] + ' → ' + (body ? body.slice(0, 400) : '(réponse vide)'));
          })
          .catch(function (error) { console.log('  • ' + check[0] + ' → ERREUR : ' + error.message); });
      });
    }, Promise.resolve());
  };

  try {
    if (/(\?|&)pkdebug=1(&|$)/.test(window.location.search)) {
      CONFIG.debug = true;
      window.addEventListener('load', function () { DB.diagnose(); });
    }
  } catch (e) {}

  window.PK_CONFIG = CONFIG;
  window.PKDB = DB;
})();
