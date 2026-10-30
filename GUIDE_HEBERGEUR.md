# Guide d'hébergement — PK GLOBAL PARTNERS (sans serveur Node.js)

Ce guide explique comment mettre le site en ligne sur **n'importe quel hébergeur
mutualisé** (cPanel, OVH, PlanetHoster, Hostinger, LWS, Netlify, Vercel,
GitHub Pages, …). Aucun serveur Node.js n'est nécessaire : le site est un
ensemble de fichiers HTML/CSS/JS qui dialogue **directement avec Supabase**.

---

## 1. Ce qu'il faut envoyer sur l'hébergeur (FTP / File Manager)

Déposez à la racine de votre site (`public_html`, `www` ou `htdocs`) :

| À envoyer | Pourquoi |
|-----------|----------|
| `index.html`, `about.html`, `filiales.html`, `investors.html`, `careers.html`, `contact.html`, `appels-a-projets.html`, `404.html` | les pages du site |
| `logo.svg` | le logo affiché dans les menus |
| le dossier **`public/`** (avec `css/`, `js/`, `admin/`) | le style, les scripts et l'espace admin |
| `.htaccess` | règle `/admin` et protections (Apache / LiteSpeed) |
| le dossier **`images/`** si vous avez des photos locales | visuels utilisés par certaines pages |

> **À ne pas envoyer** : `server.js`, `database.js`, `node_modules/`, `data/`,
> `backups/`, `tests/`, `supabase/`, `.env`, `package.json`.
> Ils servent uniquement au mode Node (optionnel) et ne doivent jamais être
> accessibles au public.

**Sous-dossier :** le site fonctionne aussi dans un sous-dossier
(ex. `monsite.com/pkglobal/`) : tous les chemins sont désormais relatifs.

---

## 2. Brancher le site à votre base Supabase (1 fichier, 2 lignes)

Ouvrez **`public/js/pk-config.js`** avec le Bloc-notes et vérifiez ces deux
lignes (elles sont déjà préremplies avec le projet du dépôt) :

```js
supabaseUrl:     'https://vumerporrumovowyonfj.supabase.co',
supabaseAnonKey: 'sb_publishable_1clRgc8vKrinbm0VM7OR2g_BUnDZVV4',
```

Pour les retrouver : **Supabase → Project Settings → API → Project URL** et
**anon / publishable key** (clé **publique** uniquement — jamais la clé
`service_role`).

C'est le **seul** fichier à modifier : le site public, la page des appels à
projets et l'espace admin lisent tous cette configuration.

`dataSource` :

- `'auto'` *(par défaut)* — essaie Supabase, puis l'API Node si elle existe ;
- `'supabase'` — Supabase uniquement (100 % statique, le plus rapide) ;
- `'node'` — API Node uniquement (hébergement VPS).

---

## 3. Exécuter le script SQL (une seule fois)

Dans **Supabase → SQL Editor → New query**, collez le contenu de
**`supabase/hebergement-statique.sql`** puis **Run**.

Il fait cinq choses, sans jamais rien dupliquer (vous pouvez le relancer) :

1. **crée les tables manquantes** (`visitor_stats`, `inquiries`,
   `investor_interests`, …) si votre projet ne les a pas encore — sans jamais
   écraser une table existante ;
2. autorise les visiteurs à **lire** les contenus publiés (images, appels à
   projets, services, actualités, textes) ;
3. autorise les visiteurs à **déposer** leurs formulaires (contact,
   investisseurs, candidatures, statistiques de visites) ;
4. crée **3 appels à projets** de départ (2 ouverts, 1 clôturé) — modifiables
   depuis l'admin ;
5. crée les **3 images des filiales** (FRIVIA, ELIKYA, YOUPI) pour qu'elles
   apparaissent sur le site et dans la médiathèque ;
6. crée la table **Carrières** (`job_offers`) avec les 5 offres d'emploi déjà
   présentes sur le site, gérables depuis le menu « Carrières » de l'admin.

Si vous aviez déjà exécuté `schema.sql`, `crm.sql` et `admin-modules.sql`, ce
script reste compatible et ne casse rien. Les messages « NOTICE : Table absente
(ignorée) » ne sont pas des erreurs.

---

## 4. Ajouter / remplacer les images (notamment les filiales)

1. Ouvrez **`https://votre-domaine.com/admin/`** — ou, si votre hébergeur
   n'applique pas le fichier `.htaccess`, directement
   **`https://votre-domaine.com/public/admin/index.html`**.
   La page cherche automatiquement ses fichiers à plusieurs emplacements :
   elle fonctionne dans tous les cas, sans configuration serveur.
2. Connectez-vous avec votre compte Supabase (créé dans *Authentication →
   Users*, avec un profil `superadmin`/`admin` — voir le README).
3. Menu **Médiathèque**.
4. Cliquez sur **Modifier** (icône crayon) sur la ligne `FRIVIA`, `ELIKYA` ou
   `YOUPI` puis téléversez votre image. Elle remplace aussitôt celle affichée
   sur la page **Filiales**.

Pour une nouvelle image, utilisez **Ajouter** avec :

| Champ | Valeur |
|-------|--------|
| Titre | FRIVIA Food *(par exemple)* |
| Section | **Filiales** |
| Emplacement | `filiale-frivia`, `filiale-elikya` ou `filiale-youpi` |
| Image | fichier téléversé **ou** URL complète (`https://…`) |
| Active | cochée |

Emplacements disponibles : `accueil-hero`, `accueil-presentation`,
`galerie-1` … `galerie-5`, `filiale-frivia`, `filiale-elikya`,
`filiale-youpi`.

> Les images de la section **Galerie** (sans emplacement) alimentent la galerie
> de la page d'accueil.

---

## 4 bis. Gérer les offres d'emploi (page Carrières)

1. Ouvrez **`https://votre-domaine.com/admin/`** puis le menu **Carrières —
   Offres d'emploi**.
2. **Créer une offre d'emploi** : intitulé, département/filiale, lieu, type de
   contrat, niveau, description, profil recherché, ordre d'affichage et date
   limite (optionnelle).
3. Statut :
   - **Brouillon** → visible uniquement dans l'admin ;
   - **Publiée** → affichée aussitôt sur `careers.html` ;
   - **Clôturée** → l'offre reste affichée comme terminée… ou dépubliez-la en
     repassant en brouillon pour la retirer du site.
4. Les 5 offres déjà présentes sur le site sont créées automatiquement par le
   script SQL : modifiez-les ou supprimez-les librement.

Le bouton **Postuler** de chaque offre renvoie au formulaire « Envoyez votre CV »
et pré-remplit le champ *Poste convoité*. En mode statique, le CV ne peut pas
être téléversé : le candidat est invité à l'envoyer par email
(`carrieres@pkglobalpartners.com`) en rappelant la référence de sa candidature.
Toutes les candidatures arrivent dans la table `candidatures`, consultable depuis
le CRM (bouton **Synchroniser les sources**).

## 5. Vérifier que tout fonctionne

- Page **Appels à projets** : les 3 appels doivent s'afficher (2 « Ouvert »,
  1 « Clôturé »). Ils sont publiés depuis l'admin (menu *Appels à projets*).
- Page **Filiales** : les 3 visuels viennent de la médiathèque.
- Page **Carrières** : les 5 offres publiées s'affichent (Admin → Carrières).
- Formulaire de **contact** : après envoi, une référence `WEB-…` s'affiche et la
  demande apparaît dans l'admin (module Demandes / CRM).

**En cas de doute**, ajoutez `?pkdebug=1` à l'adresse de la page
(ex. `https://votre-domaine.com/appels-a-projets.html?pkdebug=1`), ouvrez la
console du navigateur (**F12 → Console**) : le diagnostic indique table par
table ce qui est lu, vide ou bloqué.

Erreurs fréquentes :

| Symptôme | Cause probable | Solution |
|----------|----------------|----------|
| « Aucun appel à projets publié » | script SQL non exécuté, ou appels en **Brouillon** | exécuter `hebergement-statique.sql` ; passer le statut à **Ouvert** dans l'admin |
| Les offres d'emploi ne changent pas | module Carrières : offres en **Brouillon** ou script non exécuté | exécuter `supabase/careers.sql` ; statut **Publiée** |
| « Module « Carrières » indisponible » dans l'admin | table `job_offers` absente | exécuter `supabase/careers.sql` dans le SQL Editor |
| « Le client Supabase est indisponible » | ancien fichier `public/admin/index.html` déployé | renvoyer le nouveau `public/admin/index.html` (ou ouvrir `public/admin/index.html` directement) |
| Les images restent celles d'origine | aucune image **active** avec le bon emplacement | Médiathèque → vérifier « Emplacement » et « Active » |
| Image « PK GLOBAL PARTNERS » à la place d'une photo | fichier absent sur l'hébergeur | envoyer le dossier `images/` ou renseigner une URL `https://…` |
| Formulaire : « impossible d'enregistrer » | politiques d'insertion absentes | réexécuter la partie 2 de `hebergement-statique.sql` |
| Écran de connexion admin bloqué | compte sans profil `superadmin` | voir la section « Connexion administrateur Supabase » du README |

---

## 6. Ce qui change en mode statique (à connaître)

- **Aucun email automatique** n'est envoyé (accusés de réception, notifications) :
  il n'y a pas de serveur. Les demandes sont néanmoins enregistrées dans
  Supabase et visibles dans l'admin. Les emails restent possibles en hébergeant
  le serveur Node (mode VPS) ou via une fonction Supabase Edge.
- **Pièces jointes** des candidatures : le candidat est invité à envoyer son
  document par email avec la référence de son dossier (le dépôt se fait en
  direct dans Supabase, sans serveur de fichiers).
- Le **bouton flottant « Espace Admin »** s'affiche en bas à droite ; pour le
  masquer, mettez `showAdminButton: false` dans `public/js/pk-config.js`.

---

## 7. Mise à jour du site après modification

Transférez simplement les fichiers modifiés par FTP. Aucune compilation, aucune
base à migrer. Pensez à vider le cache du navigateur (Ctrl + F5) après une
mise à jour de `public/js/*.js`.
