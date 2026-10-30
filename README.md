# PK Global Partners

Site web et espace d'administration Node.js / Express.

## Démarrage

1. Installer Node.js 22 ou supérieur et exécuter `npm ci`.
2. Copier `.env.example` vers `.env` et renseigner `JWT_SECRET`, `INITIAL_ADMIN_EMAIL` et `INITIAL_ADMIN_PASSWORD` avec des valeurs réelles et uniques. Voir les consignes dans `.env.example`.
3. Lancer `npm start`, puis ouvrir `http://localhost:3000/admin` et se connecter avec le compte initial configuré.

Le serveur Node.js et son API utilisent SQLite pour les fonctions complètes. Le dossier `data/` est créé automatiquement au premier démarrage ; il doit être accessible en écriture et persistant en production, tout comme `uploads/` et `backups/`. Ne publiez pas `data/`, `backups/` ni le fichier `.env` comme fichiers statiques. Les fichiers de `uploads/` sont actuellement accessibles par URL : n'y stockez pas de documents confidentiels sans protection supplémentaire.

L'interface admin utilise désormais Supabase Auth par défaut, y compris avec un hébergement statique. En mode Supabase, la connexion, le tableau de bord, le **CRM complet** (contacts, pipeline, activités et synchronisation des sources), les **Appels à projets** (création et publication vers la page publique) et la **Médiathèque** (poster, modifier et supprimer les images du site) sont disponibles ; les autres modules historiques sont masqués. Le tableau de bord affiche l'état réel de chaque module et la migration SQL à exécuter si l'un d'eux n'est pas encore installé. En hébergement statique, la page des appels à projets et les images gérées en admin sont lues directement depuis Supabase. Pour utiliser l'ancien admin Node/SQLite, remplacer `data-admin-backend="supabase"` par `data-admin-backend="node"` dans `public/admin/index.html` et démarrer son API. Ces deux modes utilisent des comptes et des données distincts.

### Hébergement statique (sans Node.js)

Le site fonctionne également en **pur statique** : les pages HTML interrogent
Supabase directement depuis le navigateur, sans serveur Node. C'est le mode
recommandé pour un hébergement mutualisé.

1. Envoyer par FTP les pages HTML, `logo.svg`, le dossier `public/`, `.htaccess`
   (et le dossier `images/` si vous utilisez des photos locales). Ne jamais
   publier `server.js`, `node_modules/`, `data/`, `backups/`, `supabase/`,
   `tests/` ni `.env`.
2. Vérifier `public/js/pk-config.js` : c'est le seul fichier contenant l'URL du
   projet Supabase et sa clé **publishable** (jamais `service_role`).
   `dataSource` vaut `'auto'` (Supabase puis API Node si elle existe),
   `'supabase'` (100 % statique) ou `'node'`.
3. Exécuter `supabase/hebergement-statique.sql` dans le SQL Editor : il crée
   les politiques de lecture publique et d'insertion des formulaires, 3 appels
   à projets de départ et les 3 images des filiales (`filiale-frivia`,
   `filiale-elikya`, `filiale-youpi`). Le script est idempotent.
4. En cas de problème, ajouter `?pkdebug=1` à l'URL d'une page et ouvrir la
   console (F12) : le diagnostic indique table par table ce qui est lu.

Pages pilotées depuis l'administration (Supabase) : **Appels à projets**
(`call_for_projects`), **Médiathèque / images** (`site_media`), **Carrières /
offres d'emploi** (`job_offers`, migration `supabase/careers.sql`), textes
(`site_content`), pôles d'expertise (`services_poles`) et actualités (`news`).
Chaque module fonctionne sans serveur Node et possède son propre script SQL
idempotent.

Procédure complète, tableau de dépannage et gestion des images : voir
**[`GUIDE_HEBERGEUR.md`](GUIDE_HEBERGEUR.md)**.

### Hébergement LiteSpeed / Apache

Le fichier `.htaccess` fournit les règles pour servir `/admin` et ses fichiers depuis `public/admin/`. Si le serveur possède déjà un `.htaccess`, fusionner ces règles avant les règles générales plutôt que de remplacer la configuration existante ; la réécriture doit être autorisée par l'hébergeur. Déployer également les fichiers `public/admin/` et `public/css/` et `public/js/` à la racine du site.

Ces règles corrigent uniquement l'accès à la page. Le mode Supabase nécessite également les étapes de configuration ci-dessous. Le mode Node et les formulaires publics nécessitent toujours l'API `/api/*`. Ne publiez jamais de clé secrète ou `service_role` dans le navigateur.

### Connexion administrateur Supabase

1. Faites sauvegarder et vérifier le schéma et toutes les politiques RLS existantes par l'administrateur du projet. `supabase/admin-access.sql` repose sur les tables de `supabase/schema.sql`, active RLS sur cinq tables et ajoute des politiques de lecture pour les comptes administrateurs actifs. Il remplace uniquement ses propres politiques nommées ; d'autres politiques permissives peuvent toujours donner accès aux données. Vérifiez toutes les politiques et les permissions de rôle dans votre projet avant toute application. Ne réexécutez pas `schema.sql` ou `seed-data.sql` sur une base de production sans examen préalable.
2. Dans Supabase **Authentication → Users**, créez ou vérifiez l'utilisateur `admin@pkglobal.com`, confirmez son e-mail et définissez un mot de passe fort et unique (au moins 12 caractères) sans le partager. Ne réutilisez pas un mot de passe faible ou déjà divulgué.
3. Après sauvegarde et validation des politiques, exécutez `supabase/admin-access.sql` dans le SQL Editor. Il ne crée pas le compte. Ajoutez ensuite un profil pour le compte existant, uniquement s'il n'en a pas déjà un :

   ```sql
   INSERT INTO public.profiles (id, email, full_name, role, active)
   SELECT id, email, 'Administrateur', 'superadmin', true
   FROM auth.users
   WHERE lower(email) = lower('admin@pkglobal.com') AND email_confirmed_at IS NOT NULL
   ON CONFLICT (id) DO NOTHING;
   ```

   Si aucune ligne n'est ajoutée, vérifiez que l'utilisateur existe et que son adresse est confirmée ; s'il a déjà un profil, vérifiez son rôle et son statut sans écraser ses droits. Cette requête doit être exécutée uniquement par un administrateur dans le SQL Editor, jamais depuis le navigateur.
4. Après la même sauvegarde et revue RLS, exécutez `supabase/crm.sql` dans le SQL Editor pour créer les tables CRM et leurs politiques réservées aux profils actifs `superadmin`/`admin`. La migration est idempotente et n'injecte aucune donnée.
5. Exécutez ensuite `supabase/admin-modules.sql` dans le SQL Editor : elle autorise les profils actifs `superadmin`/`admin` à gérer les appels à projets (`call_for_projects`), crée la table `site_media` de la médiathèque et le bucket public de stockage `site-media`, avec des politiques réservées aux mêmes profils. La migration est idempotente et n'injecte aucune donnée. Sans elle, le tableau de bord signale les modules concernés comme « À installer ».
6. Déployez les modifications du dépôt, y compris `public/admin/supabase-admin.js`, `public/admin/admin.js`, `public/admin/index.html`, `public/js/site-connect.js`, `appels-a-projets.html` et `index.html`. Testez la connexion, la déconnexion, un compte sans profil, l'accès aux données, le CRM, la publication d'un appel à projets et l'ajout d'une image avec les politiques réelles du projet.

Le fichier `public/admin/supabase-admin.js` contient l'URL et la clé **publishable** du projet déjà référencé dans le dépôt. Elles ne doivent pas être remplacées par une clé secrète ou `service_role`. Les droits des utilisateurs sont imposés par Supabase/RLS et non par les menus masqués. Un compte `filiale_manager` ne peut pas encore se connecter à cette version du portail.

Pour un essai local uniquement, `ALLOW_DEMO_USERS=true` active les comptes de démonstration hors production. Ne pas utiliser cette option en production.

### CRM et appels à projets réels

- En mode Node/SQLite comme en mode Supabase, l'espace admin contient un module **CRM — Contacts & Pipeline** réservé aux rôles `superadmin` et `admin` : contacts, opportunités par étape, activités/relances, synchronisation idempotente des demandes commerciales, investisseurs et candidatures, puis export (Excel en Node, CSV en Supabase).
- Les formulaires publics Node alimentent automatiquement le CRM SQLite. En mode Supabase, utilisez le bouton **Synchroniser les sources** après l'application de `supabase/crm.sql` pour importer les enregistrements Supabase existants sans doublons.
- Les **offres d'emploi se gèrent depuis l'espace admin** (menu « Carrières », en mode Supabase) : création, publication (« Publiée » = visible sur `careers.html`), clôture et suppression. La table `job_offers` et les 5 offres de départ sont créées par `supabase/careers.sql` (également incluses dans `supabase/hebergement-statique.sql`). Le bouton « Postuler » pré-remplit le formulaire de candidature ; en hébergement statique le CV est à transmettre par email avec la référence du dossier.
- Les **appels à projets se postent depuis l'espace admin** (menu « Appels à projets », dans les deux modes) : statut **Brouillon** = visible uniquement en admin, **Ouvert** = publié avec candidatures ouvertes, **Clôturé** = publié comme terminé. La page `appels-a-projets.html` lit `GET /api/public/calls` (mode Node) ou, à défaut d'API, la table Supabase `call_for_projects` en hébergement statique ; dans les deux cas, seuls les appels `open`/`closed` réellement présents en base sont affichés — aucune annonce fictive de secours. En mode statique, le formulaire de candidature dépose aussi directement le dossier dans Supabase (le document joint doit alors être envoyé par email avec la référence du dossier).
- La **Médiathèque** (menu « Médiathèque — Images », dans les deux modes) permet de poster (fichier ou URL), modifier, masquer/publier et supprimer les images du site, sans toucher au code. Les images actives de la section « Galerie » enrichissent la galerie de la page d'accueil ; un *emplacement* (`accueil-hero`, `accueil-presentation`, `galerie-1` à `galerie-5`) remplace l'image par défaut correspondante. Côté public, `public/js/site-connect.js` lit `GET /api/public/media` ou la table Supabase `site_media` ; seuls les éléments actifs sont exposés.
- Hors mode démo explicite, une nouvelle base SQLite démarre sans appels, candidatures, investisseurs, demandes, statistiques ni notifications fictifs. Les bases existantes ne sont jamais purgées automatiquement : au premier démarrage hors mode démo, les trois anciens appels seedés connus passent une seule fois en **brouillon** (sans suppression des candidatures), afin de ne plus être présentés comme officiels. Un administrateur peut ensuite les relire, les renommer et les publier intentionnellement si leur contenu devient réel.

## Tests

- `node --test tests/supabase-admin.test.js` teste la connexion, la vérification des rôles, le tableau de bord et le CRM Supabase avec un client simulé ; il ne teste pas les politiques du projet réel.
- `node --test tests/admin-modules.test.js` teste les appels à projets et la médiathèque Supabase (client et stockage simulés), l'état des modules sur le tableau de bord, la navigation du portail et le câblage Node/public des nouveaux modules.
- `node --test tests/database-startup.test.js` vérifie le démarrage sans dossier `data/` et l'absence de seeds transactionnels fictifs hors mode démo.
- `npm test` démarre un serveur de test avec les comptes de démonstration sur le port 3000 (qui doit être libre). Cette suite modifie les données : utilisez une copie de test du projet.
