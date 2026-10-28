# PK Global Partners

Site web et espace d'administration Node.js / Express.

## Démarrage

1. Installer Node.js 22 ou supérieur et exécuter `npm ci`.
2. Copier `.env.example` vers `.env` et renseigner `JWT_SECRET`, `INITIAL_ADMIN_EMAIL` et `INITIAL_ADMIN_PASSWORD` avec des valeurs réelles et uniques. Voir les consignes dans `.env.example`.
3. Lancer `npm start`, puis ouvrir `http://localhost:3000/admin` et se connecter avec le compte initial configuré.

Le serveur Node.js et son API utilisent SQLite pour les fonctions complètes. Le dossier `data/` est créé automatiquement au premier démarrage ; il doit être accessible en écriture et persistant en production, tout comme `uploads/` et `backups/`. Ne publiez pas `data/`, `backups/` ni le fichier `.env` comme fichiers statiques. Les fichiers de `uploads/` sont actuellement accessibles par URL : n'y stockez pas de documents confidentiels sans protection supplémentaire.

L'interface admin utilise désormais Supabase Auth par défaut, y compris avec un hébergement statique. Seuls la connexion et un tableau de bord **en lecture seule** sont adaptés à Supabase ; les autres modules sont masqués, et les formulaires du site public utilisent toujours l'API Node.js. Pour utiliser l'ancien admin Node/SQLite, remplacer `data-admin-backend="supabase"` par `data-admin-backend="node"` dans `public/admin/index.html` et démarrer son API. Ces deux modes utilisent des comptes et des données distincts.

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
4. Déployez les modifications du dépôt, y compris `public/admin/supabase-admin.js` et la mise à jour de `public/admin/index.html`. Testez la connexion, la déconnexion, un compte sans profil et l'accès aux données avec les politiques réelles du projet.

Le fichier `public/admin/supabase-admin.js` contient l'URL et la clé **publishable** du projet déjà référencé dans le dépôt. Elles ne doivent pas être remplacées par une clé secrète ou `service_role`. Les droits des utilisateurs sont imposés par Supabase/RLS et non par les menus masqués. Un compte `filiale_manager` ne peut pas encore se connecter à cette version du portail.

Pour un essai local uniquement, `ALLOW_DEMO_USERS=true` active les comptes de démonstration hors production. Ne pas utiliser cette option en production.

## Tests

- `node --test tests/supabase-admin.test.js` teste la connexion, la vérification des rôles et le tableau de bord Supabase avec un client simulé ; il ne teste pas les politiques du projet réel.
- `node --test tests/database-startup.test.js` vérifie le démarrage sur une installation sans dossier `data/`.
- `npm test` démarre un serveur de test avec les comptes de démonstration sur le port 3000 (qui doit être libre). Cette suite modifie les données : utilisez une copie de test du projet.
