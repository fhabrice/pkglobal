# PK Global Partners

Site web et espace d'administration Node.js / Express.

## Démarrage

1. Installer Node.js 22 ou supérieur et exécuter `npm ci`.
2. Copier `.env.example` vers `.env` et renseigner `JWT_SECRET`, `INITIAL_ADMIN_EMAIL` et `INITIAL_ADMIN_PASSWORD` avec des valeurs réelles et uniques. Voir les consignes dans `.env.example`.
3. Lancer `npm start`, puis ouvrir `http://localhost:3000/admin` et se connecter avec le compte initial configuré.

L'espace admin nécessite le serveur Node.js et son API : un hébergement de fichiers HTML statiques seul ne suffit pas. Le dossier `data/` est créé automatiquement au premier démarrage ; il doit être accessible en écriture et persistant en production, tout comme `uploads/` et `backups/`. Ne publiez pas `data/`, `backups/` ni le fichier `.env` comme fichiers statiques. Les fichiers de `uploads/` sont actuellement accessibles par URL : n'y stockez pas de documents confidentiels sans protection supplémentaire.

### Hébergement LiteSpeed / Apache

Le fichier `.htaccess` fournit les règles pour servir `/admin` et ses fichiers depuis `public/admin/`. Si le serveur possède déjà un `.htaccess`, fusionner ces règles avant les règles générales plutôt que de remplacer la configuration existante ; la réécriture doit être autorisée par l'hébergeur. Déployer également les fichiers `public/admin/` et `public/css/` et `public/js/` à la racine du site.

Ces règles corrigent uniquement l'accès à la page. La connexion et les modules appellent `/api/*` : il faut aussi mettre à disposition l'API correspondante ou adapter l'administration pour utiliser Supabase. Le code actuel utilise l'API Node.js et SQLite pour l'authentification et les données, pas Supabase Auth ; renseigner les variables Supabase ne suffit pas à modifier ce fonctionnement. Ne pas exposer les identifiants privilégiés Supabase dans le navigateur.

Pour un essai local uniquement, `ALLOW_DEMO_USERS=true` active les comptes de démonstration hors production. Ne pas utiliser cette option en production.

## Tests

- `node --test tests/database-startup.test.js` vérifie le démarrage sur une installation sans dossier `data/`.
- `npm test` démarre un serveur de test avec les comptes de démonstration sur le port 3000 (qui doit être libre). Cette suite modifie les données : utilisez une copie de test du projet.
