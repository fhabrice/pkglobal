# GUIDE COMPLET D'INTÉGRATION BACKEND SUPABASE
## Plateforme Web PK GLOBAL PARTNERS
**Date :** Octobre 2026 — Version 1.0  
**Technologie :** PostgreSQL / Supabase Backend-as-a-Service (BaaS)

---

## 1. Vue d'Ensemble
La plateforme web et l'espace administrateur de **PK GLOBAL PARTNERS** ont été structurés selon un modèle relationnel PostgreSQL standard. Ce guide explique comment déployer et connecter votre projet Supabase en quelques minutes.

---

## 2. Procédure de Déploiement Supabase en 5 Étapes

### Étape 1 : Création du Projet sur Supabase
1. Rendez-vous sur [https://supabase.com](https://supabase.com) et connectez-vous (ou créez un compte gratuit).
2. Cliquez sur **New Project**.
3. Renseignez :
   - **Name :** `pkglobal-backend`
   - **Database Password :** Choisissez un mot de passe sécurisé (et conservez-le précieusement).
   - **Region :** Choisissez la région la plus proche (ex: *Frankfurt (eu-central-1)* ou *South Africa (af-south-1)*).
   - **Pricing Plan :** *Free Tier* (0$/mois).
4. Cliquez sur **Create new project** et patientez environ 2 minutes pendant l'initialisation de PostgreSQL.

---

### Étape 2 : Exécution du Schéma de Base de Données
1. Dans le tableau de bord Supabase de votre projet, cliquez sur l'icône **SQL Editor** dans le menu de gauche.
2. Cliquez sur **New query**.
3. Ouvrez le fichier `supabase/schema.sql` (ou téléchargez-le depuis l'espace admin dans l'onglet **Backend Supabase**).
4. Copiez l'intégralité du contenu SQL et collez-le dans l'éditeur.
5. Cliquez sur le bouton vert **Run**.
6. **Résultat :** Toutes les tables (`filiales`, `profiles`, `candidatures`, `investors`, `inquiries`, `news`, `services_poles`, etc.) sont créées avec leurs politiques de sécurité **Row Level Security (RLS)**. Sur un projet déjà en production, ne réexécutez pas tout le schéma sans sauvegarde et revue des politiques existantes.

---

### Étape 3 : Accès administrateur et migration CRM
1. Créez l'utilisateur dans **Authentication → Users**, confirmez son e-mail, puis créez son profil actif `superadmin` ou `admin` dans `public.profiles` (voir `README.md`).
2. Après sauvegarde et revue RLS, exécutez `supabase/admin-access.sql` pour le tableau de bord.
3. Exécutez ensuite `supabase/crm.sql`. Cette migration idempotente crée `crm_contacts`, `crm_opportunities` et `crm_activities`, leurs index et des politiques d'accès complet réservées aux administrateurs actifs. Elle n'injecte aucune donnée.
4. Connectez-vous à `/admin`, ouvrez **CRM — Contacts & Pipeline**, puis cliquez sur **Synchroniser les sources** pour importer sans doublons les demandes, investisseurs et candidatures déjà présents dans Supabase.

### Données de démonstration (option local uniquement)
`supabase/seed-data.sql` contient des appels, candidatures, investisseurs et demandes fictifs. Ne l'appliquez jamais à une base de production. En production, les appels doivent être créés et publiés par l'équipe ; une page Appels vide est correcte tant qu'aucun appel réel n'est publié.

---

### Étape 4 : Configuration des Variables d'Environnement
1. Dans Supabase, allez dans **Project Settings** (icône engrenage) > **API**.
2. Copiez les deux valeurs :
   - **Project URL** (ex: `https://abcdefghijklm.supabase.co`)
   - **anon / publishable key** uniquement pour le navigateur. Ne mettez jamais une clé `service_role` ou secrète dans le site, le dépôt ou l'espace admin web.
3. Dans votre projet ou sur votre serveur d'hébergement, créez ou modifiez le fichier `.env` :
```env
SUPABASE_URL=https://abcdefghijklm.supabase.co
SUPABASE_KEY=votre_cle_anon_ou_publishable
```

---

## 3. Sécurité et Contrôle d'Accès (Row Level Security - RLS)

Supabase applique la sécurité directement au niveau du moteur PostgreSQL :

1. **Visiteurs publics (Site Web Vitrine) :**
   - Peuvent lire les filiales, les actualités publiées et les appels à projets publiés (`open` ou `closed`, jamais `draft`).
   - Peuvent insérer de nouvelles candidatures et messages de contact.
   - Ne peuvent **jamais** lire les dossiers des autres candidats ni les coordonnées des investisseurs.

2. **Administrateurs (Superadmin & Admin) :**
   - Accès selon les politiques RLS du projet. Pour le CRM, `supabase/crm.sql` accorde l'accès complet uniquement aux profils actifs `superadmin`/`admin` et une lecture des sources nécessaires à la synchronisation.

3. **Responsables de filiale (ex: FRIVIA) :**
   - Accès restreint par politique PostgreSQL RLS :
   ```sql
   CREATE POLICY "Filiale manager read own filiale" ON public.filiales FOR SELECT USING (
       id = (SELECT filiale_id FROM public.profiles WHERE id = auth.uid())
   );
   ```
   Un responsable de filiale ne peut techniquement pas lire ni modifier les données des autres filiales.

---

## 4. Gestion des Fichiers et Documents (Supabase Storage)

Supabase intègre des compartiments de stockage (*Storage Buckets*) compatibles S3 :

1. **Bucket `candidature-documents` :**
   - Stockage des business plans, statuts et pitch decks déposés par les porteurs de projets (jusqu'à 20 Mo par document).
   - Accès privé : seuls les administrateurs et membres du comité peuvent télécharger les documents.
2. **Bucket `public-assets` :**
   - Logos des filiales, photos de produits (*FRIVIA Box*, *Café Arabica*, *YOUPI Cookies*), bannières d'actualités.
   - Accès public en lecture via URL CDN rapide.

---

## 5. Téléchargement depuis l'Espace Administrateur

Dans votre espace admin Node, rendez-vous dans le menu **Backend Supabase** (`#/supabase`) :
- *Télécharger Schema SQL* (`schema_supabase_pkglobal.sql`)
- *Accès Admin SQL* (`admin-access_supabase_pkglobal.sql`)
- *Migration CRM SQL* (`crm_supabase_pkglobal.sql`)
- *Données DÉMO (Seed SQL)* : local uniquement, jamais en production.
- **Testeur intégré :** Saisissez l'URL et uniquement une clé anon/publishable pour tester la connectivité Cloud.
