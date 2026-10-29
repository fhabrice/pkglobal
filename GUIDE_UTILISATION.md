# GUIDE SIMPLIFIÉ D'UTILISATION
## Administration de la Plateforme Web PK GLOBAL PARTNERS
**Site Web officiel :** [https://www.pkglobalpartners.com/](https://www.pkglobalpartners.com/)  
**URL de l'Espace Administrateur :** `/admin` (ou via le bouton *Admin* dans l'en-tête du site)  
**Date :** Octobre 2026 — Version 1.0

---

## 1. Objectif du Guide
Ce guide s'adresse aux équipes dirigeantes, aux administrateurs de la holding et aux responsables des filiales de **PK GLOBAL PARTNERS**. Il fournit une description opérationnelle de chaque module pour gérer, actualiser et superviser la plateforme web sans nécessiter l'intervention continue d'un développeur.

---

## 2. Accès Sécurisé et Gestion des Profils

### 2.1 Connexion à l'interface
1. Ouvrez votre navigateur et accédez à `https://www.pkglobalpartners.com/admin` (ou `http://localhost:3000/admin` en local).
2. Saisissez votre adresse email professionnelle et votre mot de passe.
3. Cliquez sur **Connexion Sécurisée**.

### 2.2 Profils et création sécurisée des accès
La plateforme applique un modèle RBAC (*Role-Based Access Control*) avec trois profils :

| Profil | Périmètre et responsabilités |
| :--- | :--- |
| **Super Administrateur** | Accès complet : gouvernance, utilisateurs, sauvegardes, audit et tous les modules. |
| **Administrateur** | Gestion des contenus, appels à projets, candidatures, investisseurs, filiales et CRM. |
| **Responsable de filiale** | Gestion limitée aux informations et demandes de sa filiale. |

En production, aucun compte ni mot de passe de démonstration n'est exposé dans l'interface. Le premier Super Administrateur est créé ou sécurisé au démarrage à partir des variables `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL` et `INITIAL_ADMIN_PASSWORD` configurées côté serveur (voir `.env.example`). Choisissez un mot de passe unique d'au moins 12 caractères. Après connexion, le Super Administrateur peut créer les comptes des autres profils depuis **Utilisateurs & Droits**. Les comptes de démonstration ne sont actifs qu'en environnement local de développement.

Pour l'envoi réel des accusés de réception et réponses, configurez également `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD` et `MAIL_FROM` auprès de votre fournisseur SMTP. Sans ces paramètres, les demandes restent enregistrées dans l'administration, mais aucun email n'est prétendu envoyé ; le statut le signale.

---

## 3. Guide des Modules de Gestion

### Module 1 : Tableau de Bord Administrateur (`#/dashboard`)
Le tableau de bord présente la vue d'ensemble de l'activité :
- **Compteur de Visiteurs :** Nombre total de visiteurs uniques et visiteurs du jour, avec graphique d'évolution sur 30 jours.
- **Candidatures et Projets reçus :** Suivi chiffré des dossiers déposés et des projets retenus.
- **Projets en cours d'évaluation :** Projets en attente de délibération par le comité.
- **Investisseurs inscrits :** Nombre de fonds et business angels actifs dans le réseau.
- **Demandes commerciales :** Nouveaux messages clients et prospects reçus via le site.
- **Flux d'activités en direct :** Journal chronologique des soumissions, évaluations et messages.

---

### Module 2 : Gestion des Contenus du Site (`#/contents`)
Ce module permet d'éditer dynamiquement les pages du site web sans toucher au code source :
1. **Présentation & Hero :** Modifier les titres d'accroche, sous-titres, slogans, mission et vision d'impact.
2. **Pôles d'Expertise :** Ajouter, modifier ou masquer les 4 pôles (Agroalimentaire, Financement, Distribution, Conseil).
3. **Actualités & Annonces :** Rédiger et publier des articles, événements et communiqués avec image d'illustration.
4. **Coordonnées :** Actualiser les numéros WhatsApp, téléphones, emails de contact et adresses des sièges de Goma et Kinshasa. Les textes du Hero et de présentation, les pôles actifs, les actualités publiées et les coordonnées sont synchronisés avec les pages publiques lors de leur chargement.

---

### Module 3 : Appels à Projets & Candidatures (`#/calls` et `#/candidatures`)
Ce module gère le processus d'incubation et d'accélération d'entreprises. Il est disponible dans le menu de gauche (**Appels à projets**) en mode Node comme en mode Supabase :
1. **Création d'un Appel à Projets :**
   - Cliquez sur **Créer un Appel à Projets**.
   - Définissez l'intitulé (ex: *Fonds AgriTech 2026*), le secteur ciblé, l'enveloppe budgétaire indicative et la date limite de clôture.
   - **Publication :** choisissez le statut **Ouvert** pour afficher immédiatement l'appel sur la page publique « Appels à projets » du site. Le statut **Brouillon** reste invisible du public ; **Clôturé** reste affiché comme terminé. Les boutons **Publier / Dépublier / Clôturer** de chaque carte permettent de changer ce statut à tout moment.
2. **Suivi des Candidatures :**
   - Filtrez les dossiers par statut : *Tous*, *Reçu*, *En évaluation*, *Retenu*, *Rejeté*.
   - Cliquez sur l'icône **Œil** pour afficher la fiche détaillée du candidat et télécharger son business plan joint.
3. **Évaluation & Notation :**
   - Cliquez sur l'icône **Marteau / Balance**.
   - Attribuez une note de 1 à 5 étoiles selon la viabilité économique et l'impact local.
   - Saisissez les observations du comité et mettez à jour le statut.
4. **Notification du Candidat :**
   - Cliquez sur l'icône **Avion de papier**.
   - Choisissez un modèle de message rapide (*Accusé de réception*, *Convocation entretien*, *Projet retenu*, *Projet non retenu*).
   - Si le serveur SMTP est configuré, l'email est envoyé au candidat et son état est archivé. L'interface indique explicitement si l'envoi a réussi ou si le SMTP n'est pas configuré.
5. **Export Excel :** Cliquez sur le bouton vert **Exporter en Excel (.xlsx)** pour obtenir le fichier complet des candidatures.

---

### Module 3 bis : Médiathèque — Images du Site (`#/media`)
Ce module (menu de gauche : **Médiathèque — Images**, mode Node comme Supabase) permet de **poster, modifier et supprimer les images du site** sans toucher au code :
1. **Ajouter une image :** téléversez un fichier (JPG, PNG, WEBP ou GIF, 8 Mo max) ou collez son URL, puis renseignez un titre.
2. **Section « Galerie » :** les images actives de cette section s'ajoutent automatiquement à la galerie « Réalisations sur le Terrain » de la page d'accueil.
3. **Emplacement :** indiquez un emplacement connu pour remplacer une image précise du site — `accueil-hero` et `accueil-presentation` (page d'accueil), `galerie-1` à `galerie-5` (les cinq visuels de la galerie). Laissez l'emplacement vide pour simplement enrichir la galerie.
4. **Modifier :** changez le titre, la section, l'emplacement, l'ordre d'affichage ou remplacez le fichier ; **Masquer/Publier** retire ou rétablit l'image sur le site ; **Supprimer** efface aussi le fichier téléversé.

> En mode Supabase, le CRM (**CRM — Contacts & Pipeline**), les **Appels à projets** et la **Médiathèque** apparaissent dans le menu de gauche et sous forme de cartes sur le tableau de bord, avec leur état d'installation. Si une carte indique « À installer », exécutez la migration SQL indiquée (`supabase/crm.sql` ou `supabase/admin-modules.sql`) dans le SQL Editor du projet Supabase, puis rechargez la page.

---

### Module 4 : Gestion des Investisseurs (`#/investors`)
Ce module suit les partenaires financiers de la holding :
- **Consultation des profils :** Fonds d'investissement, Family Offices, Business Angels, pays d'origine et tickets d'investissement (min/max).
- **Validation des comptes :** Activez ou désactivez les comptes investisseurs d'un simple clic.
- **Deal Pipeline :** Associez un projet candidat spécifique à un investisseur intéressé et suivez les étapes de négociation (*Premier contact*, *Due Diligence*, *Term Sheet*, *Clôturé*).
- **Export Excel :** Téléchargement de l'annuaire complet des investisseurs.

---

### Module 5 : Demandes Commerciales & CRM (`#/inquiries`)
Ce module centralise tous les messages émis depuis le formulaire de contact du site :
1. **Boîte de réception :** Visualisez les demandes avec identification automatique du service demandé (*Agroalimentaire*, *Distribution*, *Investissement*, *Carrières*).
2. **Attribution :** Dans la colonne *Attribué à*, affectez la demande à un collaborateur de l'équipe.
3. **Réponse au client :** Cliquez sur **Répondre**, saisissez le message et cochez *Marquer comme résolu*. Avec la configuration SMTP active, le client reçoit l'email officiel ; l'interface signale tout échec ou absence de configuration.
4. **Export Excel :** Téléchargement du journal des demandes.

---

### Module 6 : Gestion des Filiales (`#/filiales`)
Pour chacune des 3 filiales (FRIVIA, ELIKYA COFFEE, YOUPI) :
- **Informations générales :** Nom de marque, slogan officiel, description, adresses et téléphone.
- **Catalogue produits :** Ajout et modification des produits signatures, prix indicatifs et descriptions.
- **Projets & Réalisations :** Publication des réussites (ouverture d'un nouveau restaurant, certifications HACCP, partenariats coopératives caféières).
- *Pour les Responsables de filiale : l'affichage est automatiquement cloisonné à leur seule filiale.*

---

### Module 7 : Utilisateurs & Droits d'Accès (`#/users`)
*(Réservé aux Super Administrateurs et Administrateurs)*
- **Création d'un compte :** Saisissez le nom, l'email, le mot de passe initial et le rôle (*Superadmin*, *Admin* ou *Responsable de filiale* avec sélection de la filiale).
- **Activation / Désactivation :** Bloquez ou réactivez un compte en cas de départ d'un collaborateur.
- **Journal d'audit :** Historique sécurisé des 100 dernières actions effectuées (horodatage, adresse IP, utilisateur).

---

### Module 8 : Statistiques, Rapports & Sauvegardes (`#/stats` et `#/backups`)
- **Génération du Rapport Global PDF :** Cliquez sur **Télécharger le PDF Officiel** pour obtenir un document de synthèse A4 prêt pour présentation au Conseil d'Administration.
- **Fiches Projets Individuelles PDF :** Téléchargeables depuis chaque candidature.
- **Exports Excel :** Disponibles sur tous les modules (Candidatures, Investisseurs, CRM, Filiales).
- **Sauvegarde Instantanée SQLite :** Créez une archive horodatée de la base de données d'un clic dans l'onglet *Sauvegardes*.
- **Dump JSON :** Téléchargez l'intégralité des données en format JSON pour archivage à froid.
