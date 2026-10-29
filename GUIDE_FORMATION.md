# GUIDE DE FORMATION À L'INTERFACE ADMINISTRATEUR
## Plateforme Web PK GLOBAL PARTNERS
**Livrable 6 — Formation des Utilisateurs**
**Date :** Octobre 2026 — Version 1.0

---

## 1. Objectifs Pédagogiques de la Formation
À l'issue de cette session de formation, chaque participant sera capable de :
1. Se connecter et naviguer dans l'espace administrateur selon son rôle.
2. Actualiser les contenus éditoriaux et publier des actualités.
3. Créer un appel à projets réel en brouillon, le publier, évaluer les candidatures et notifier les porteurs de projets.
4. Utiliser le CRM : synchroniser les sources, suivre les contacts, déplacer les opportunités dans le pipeline et traiter les relances.
5. Gérer les investisseurs, traiter les demandes commerciales entrantes et répondre aux clients.
6. Mettre à jour les informations, produits et réalisations de sa filiale.
7. Télécharger les rapports PDF et exporter les données au format Excel.
8. Exécuter une sauvegarde complète des données.

---

## 2. Programme du Module de Formation

### Module A : Prise en main et Sécurité (Durée : 30 min)
- **Présentation de l'architecture :** Différence entre le site public (`www.pkglobalpartners.com`) et l'espace administrateur (`/admin`).
- **Gestion des accès et rôles (RBAC) :**
  - **Super Administrateur :** Tous les droits (gouvernance, utilisateurs, sauvegardes, base de données).
  - **Administrateur :** Gestion des contenus, projets, investisseurs, filiales et CRM.
  - **Responsable de filiale :** Espace dédié à sa filiale (FRIVIA, ELIKYA ou YOUPI).
- **Bonnes pratiques de sécurité :** Utilisez un mot de passe unique de 12 caractères ou plus, ne le partagez pas, déconnectez-vous sur un appareil partagé et vérifiez les notifications de connexion.

---

### Module B : Gestion Opérationnelle des Contenus & Communication (Durée : 45 min)
- **Atelier pratique 1 :** Modification du texte de présentation et de la mission de PK Global Partners.
- **Atelier pratique 2 :** Publication d'un communiqué officiel ou d'un événement avec image d'illustration.
- **Atelier pratique 3 :** Mise à jour des numéros de téléphone et adresses des sièges de Goma et Kinshasa.

---

### Module C : Workflow Appels à Projets & Candidatures (Durée : 1 h)
- **Atelier pratique 1 :** Création d'un appel réel en **Brouillon**, vérification des critères, du budget et de la date limite, puis publication en **Ouvert**. La page publique n'affiche jamais un brouillon ni d'appel fictif.
- **Atelier pratique 2 :** Réception et revue d'une candidature soumise via le site web.
- **Atelier pratique 3 :** Grille d'évaluation du comité : notation sur 5 étoiles et rédaction de l'avis de sélection.
- **Atelier pratique 4 :** Envoi d'un email de notification automatique au candidat (sélection ou rejet).
- **Atelier pratique 5 :** Génération de la fiche détaillée d'évaluation au format PDF et export de la liste complète en Excel.

---

### Module D : CRM, Investisseurs & Demandes Commerciales (Durée : 1 h)
- **Atelier pratique 1 :** Enregistrement d'un nouvel investisseur (fonds ou business angel) et validation du compte.
- **Atelier pratique 2 :** Association d'un projet candidat à un investisseur et suivi des étapes de négociation (*Due Diligence*, *Term Sheet*).
- **Atelier pratique 3 :** Synchronisation CRM des demandes, investisseurs et candidatures ; ouverture d'une fiche contact ; déplacement d'une opportunité dans le pipeline ; création puis clôture d'une relance.
- **Atelier pratique 4 :** Traitement d'une demande commerciale reçue du site web, affectation à un collaborateur et envoi de la réponse officielle.

---

### Module E : Supervision des Filiales & Rapports (Durée : 30 min)
- **Atelier pratique 1 :** Mise à jour du catalogue produit et des tarifs indicatifs (ex: menus FRIVIA, café moulu ELIKYA, pains YOUPI).
- **Atelier pratique 2 :** Publication d'une réalisation récente (ex: ouverture d'un point de vente).
- **Atelier pratique 3 :** Génération et téléchargement du Rapport Global d'Activité en PDF.
- **Atelier pratique 4 :** Création d'une sauvegarde instantanée de la base SQLite et export du dump JSON.

---

## 3. Fiches de Procédures Pas-à-Pas (Cheatsheets)

### Fiche 1 : Évaluer un projet candidat en 3 étapes
1. Rendez-vous dans **Candidatures & Projets** (`#/candidatures`).
2. Cliquez sur l'icône **Œil** pour lire le résumé et télécharger le business plan.
3. Cliquez sur l'icône **Marteau d'évaluation** :
   - Sélectionnez la note (ex: *4/5 - Très Bon Projet*).
   - Choisissez le statut (*Retenu* ou *Rejeté*).
   - Rédigez le commentaire du comité et cliquez sur **Valider l'Évaluation**.

### Fiche 2 : Répondre à une demande client en 2 minutes
1. Rendez-vous dans **Demandes commerciales** (`#/inquiries`).
2. Repérez la demande (marquée du badge bleu *Nouveau*).
3. Cliquez sur **Répondre** :
   - Rédigez votre réponse dans le champ dédié.
   - Laissez la case *Marquer comme résolu* cochée.
   - Cliquez sur **Envoyer la Réponse**. Le prospect reçoit automatiquement un email horodaté.

### Fiche 3 : Publier un appel à projets réel
1. Rendez-vous dans **Appels à Projets** (`#/calls`) en mode Node, puis cliquez sur **Créer un appel**.
2. Saisissez uniquement les informations officielles validées et laissez le statut **Brouillon** pendant la relecture.
3. Passez le statut à **Ouvert** pour le publier. Vérifiez la page publique : seuls les appels `open`/`closed` de la base y apparaissent.
4. À la fin de la période, passez l'appel à **Clôturé**. Un appel avec candidatures ne doit pas être supprimé.

### Fiche 4 : Travailler dans le CRM
1. Ouvrez **CRM — Contacts & Pipeline** (`#/crm`).
2. Cliquez sur **Synchroniser les sources** si l'indicateur signale des enregistrements non synchronisés (Node) ou pour importer les sources Supabase existantes.
3. Dans **Contacts**, ouvrez la fiche, vérifiez les coordonnées, le responsable et l'historique.
4. Dans **Pipeline**, déplacez l'opportunité à l'étape réelle (qualification, réunion, proposition, négociation, gagné ou perdu).
5. Dans **Activités & tâches**, créez la relance avec une échéance, puis marquez-la terminée après l'action.

### Fiche 5 : Effectuer la sauvegarde hebdomadaire
1. Rendez-vous dans **Sauvegardes & Sécurité** (`#/backups`).
2. Cliquez sur le bouton **Créer une Sauvegarde Maintenant**.
3. Le fichier horodaté `backup_pkglobal_AAAA-MM-JJ....sqlite` est créé instantanément et s'affiche dans la liste des archives téléchargeables.

---

## 4. Foire Aux Questions (FAQ)

**Q1 : Comment tester les différents niveaux d'accès ?**
*R :* En environnement local de test, utilisez les comptes de démonstration seedés par l'application. En production, créez un compte distinct pour chaque profil depuis **Utilisateurs & Droits** et connectez-vous avec ses propres identifiants. Les comptes et raccourcis de démonstration ne sont pas proposés en production.

**Q2 : Que se passe-t-il si un candidat postule avec un fichier lourd ?**
*R :* Le serveur accepte les documents (PDF, Word, Excel) jusqu'à 20 Mo et les stocke de façon sécurisée dans le répertoire `uploads/`.

**Q3 : Les exports Excel sont-ils compatibles avec Microsoft Excel et Google Sheets ?**
*R :* Oui, tous les fichiers sont générés au format officiel `.xlsx` avec formatage professionnel des colonnes et en-têtes PK Global Partners.

**Q4 : Pourquoi la page Appels à projets peut-elle être vide ?**
*R :* C'est le comportement correct si aucun appel réel n'est publié. Au premier démarrage réel, les anciens appels de démonstration connus sont conservés en brouillon dans l'admin. Créez ou relisez un appel, puis passez-le de **Brouillon** à **Ouvert**. Aucun exemple fictif n'est affiché.

**Q5 : Pourquoi le CRM Supabase affiche-t-il un message de migration ?**
*R :* Les tables CRM ne sont pas encore installées dans le projet. Après sauvegarde et revue RLS, exécutez `supabase/crm.sql` dans le SQL Editor, puis réessayez. Aucune donnée fictive n'est affichée en attendant.

**Q6 : Peut-on ajouter une 4ème ou 5ème filiale à l'avenir ?**
*R :* Oui, le Super Administrateur peut créer une nouvelle filiale d'un simple clic dans le module *Filiales* ; elle disposera immédiatement de son catalogue de produits, de ses réalisations et pourra se voir attribuer son propre responsable.
