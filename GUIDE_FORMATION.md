# GUIDE DE FORMATION À L'INTERFACE ADMINISTRATEUR
## Plateforme Web PK GLOBAL PARTNERS
**Livrable 6 — Formation des Utilisateurs**
**Date :** Octobre 2026 — Version 1.0

---

## 1. Objectifs Pédagogiques de la Formation
À l'issue de cette session de formation, chaque participant sera capable de :
1. Se connecter et naviguer dans l'espace administrateur selon son rôle.
2. Actualiser les contenus éditoriaux et publier des actualités.
3. Créer un appel à projets, évaluer les candidatures et notifier les porteurs de projets.
4. Gérer les investisseurs et le pipeline des opportunités de financement.
5. Traiter les demandes commerciales entrantes et répondre aux clients.
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
- **Atelier pratique 1 :** Lancement d'un appel à projets (paramétrage des critères d'éligibilité, budget et date limite).
- **Atelier pratique 2 :** Réception et revue d'une candidature soumise via le site web.
- **Atelier pratique 3 :** Grille d'évaluation du comité : notation sur 5 étoiles et rédaction de l'avis de sélection.
- **Atelier pratique 4 :** Envoi d'un email de notification automatique au candidat (sélection ou rejet).
- **Atelier pratique 5 :** Génération de la fiche détaillée d'évaluation au format PDF et export de la liste complète en Excel.

---

### Module D : Gestion des Investisseurs & Demandes Commerciales (Durée : 45 min)
- **Atelier pratique 1 :** Enregistrement d'un nouvel investisseur (fonds ou business angel) et validation du compte.
- **Atelier pratique 2 :** Association d'un projet candidat à un investisseur et suivi des étapes de négociation (*Due Diligence*, *Term Sheet*).
- **Atelier pratique 3 :** Traitement d'une demande commerciale reçue du site web, affectation à un collaborateur et envoi de la réponse officielle.

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

### Fiche 3 : Effectuer la sauvegarde hebdomadaire
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

**Q4 : Peut-on ajouter une 4ème ou 5ème filiale à l'avenir ?**
*R :* Oui, le Super Administrateur peut créer une nouvelle filiale d'un simple clic dans le module *Filiales* ; elle disposera immédiatement de son catalogue de produits, de ses réalisations et pourra se voir attribuer son propre responsable.
