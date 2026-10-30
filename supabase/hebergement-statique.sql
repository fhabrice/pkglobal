-- =============================================================================
-- PK GLOBAL PARTNERS — HÉBERGEMENT STATIQUE (sans serveur Node.js)
-- -----------------------------------------------------------------------------
-- À exécuter UNE SEULE FOIS dans Supabase :
--     Supabase > votre projet > SQL Editor > New query
--     -> collez tout ce fichier -> Run
--
-- Ce script :
--   1. autorise le site public à LIRE les contenus publiés (images, appels à
--      projets, services, actualités) ;
--   2. autorise les VISITEURS à déposer leurs formulaires (contact,
--      investisseurs, candidatures, statistiques de visites) ;
--   3. crée 3 appels à projets d'exemple (modifiables dans l'admin) ;
--   4. crée les 3 emplacements d'images des FILIALES (FRIVIA, ELIKYA, YOUPI)
--      afin qu'elles apparaissent dans la médiathèque de l'admin et sur le site.
--
-- Le script est « idempotent » : vous pouvez le relancer sans risque, il ne
-- duplique aucune donnée.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ACCÈS EN LECTURE POUR LE SITE PUBLIC (visiteurs non connectés)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.site_media       ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.call_for_projects ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.services_poles   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.news             ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.site_content     ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Certaines tables n''existent pas encore : exécutez d''abord supabase/schema.sql';
END $$;

-- Images de la médiathèque : uniquement les images actives
DROP POLICY IF EXISTS "Public read active media" ON public.site_media;
CREATE POLICY "Public read active media" ON public.site_media
  FOR SELECT USING (active = true);

-- Appels à projets : uniquement ceux publiés (ouverts ou clôturés)
DROP POLICY IF EXISTS "Public read calls" ON public.call_for_projects;
CREATE POLICY "Public read calls" ON public.call_for_projects
  FOR SELECT USING (status IN ('open', 'closed'));

-- Pôles d'expertise actifs
DROP POLICY IF EXISTS "Public read services" ON public.services_poles;
CREATE POLICY "Public read services" ON public.services_poles
  FOR SELECT USING (active = true);

-- Actualités publiées
DROP POLICY IF EXISTS "Public read news" ON public.news;
CREATE POLICY "Public read news" ON public.news
  FOR SELECT USING (status = 'published');

-- Textes du site (CMS)
DROP POLICY IF EXISTS "Public read content" ON public.site_content;
CREATE POLICY "Public read content" ON public.site_content
  FOR SELECT USING (true);

-- -----------------------------------------------------------------------------
-- 2. DÉPÔT DES FORMULAIRES PAR LES VISITEURS (aucune donnée lisible ensuite)
--    En mode statique il n'y a pas de serveur : le navigateur écrit
--    directement dans la base. Seules les insertions sont autorisées.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.inquiries        ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.candidatures     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.investors        ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.visitor_stats    ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Certaines tables n''existent pas encore : exécutez d''abord supabase/schema.sql';
END $$;

DROP POLICY IF EXISTS "Public insert inquiries" ON public.inquiries;
CREATE POLICY "Public insert inquiries" ON public.inquiries
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert candidatures" ON public.candidatures;
CREATE POLICY "Public insert candidatures" ON public.candidatures
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert investors" ON public.investors;
CREATE POLICY "Public insert investors" ON public.investors
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert visits" ON public.visitor_stats;
CREATE POLICY "Public insert visits" ON public.visitor_stats
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert interests" ON public.investor_interests;
CREATE POLICY "Public insert interests" ON public.investor_interests
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 3. APPELS À PROJETS DE DÉPART (modifiables depuis l'espace admin)
-- -----------------------------------------------------------------------------
INSERT INTO public.call_for_projects
  (title, slug, description, target_sector, budget_indicatif, eligibility, deadline, status)
SELECT * FROM (VALUES
  (
    'Appel à Projets 2026 : AgriTech & Transformation Agroalimentaire RDC',
    'appel-projets-agritech-2026',
    'Sélection et financement de 5 projets innovants dans la transformation locale des matières premières agricoles, la chaîne du froid et la distribution.',
    'Agroalimentaire & Chaîne de valeur',
    'Jusqu''à 150 000 USD par lauréat',
    'Entreprises enregistrées en RDC, existence minimum de 1 an, impact social mesurable auprès des producteurs locaux.',
    (now() + interval '75 days')::timestamp,
    'open'
  ),
  (
    'Fonds Jeunes Entrepreneurs : Logistique du Dernier Kilomètre',
    'fonds-jeunes-logistique-dernier-km',
    'Soutien à la création de micro-hubs logistiques et de flottes écologiques pour approvisionner les métropoles de Kinshasa et Goma.',
    'Transport & Logistique Verte',
    '50 000 USD par projet',
    'Équipes de jeunes entrepreneurs (18-35 ans), prototype ou service fonctionnel déjà testé.',
    (now() + interval '30 days')::timestamp,
    'open'
  ),
  (
    'Édition Clôturée : Énergies Renouvelables et Pompage Solaire',
    'energies-renouvelables-pompage-2025',
    'Programme d''accès à l''énergie pour les exploitations agricoles rurales.',
    'Énergie Renouvelable',
    '100 000 USD',
    'Startups et PME d''électrification rurale',
    (now() - interval '60 days')::timestamp,
    'closed'
  )
) AS v(title, slug, description, target_sector, budget_indicatif, eligibility, deadline, status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.call_for_projects c WHERE c.slug = v.slug
);

-- -----------------------------------------------------------------------------
-- 4. IMAGES DES FILIALES (FRIVIA, ELIKYA, YOUPI)
--    Elles apparaissent dans : Admin > Médiathèque > section « Filiales ».
--    Pour les remplacer par vos propres photos :
--      • soit modifiez la ligne « image_url » ci-dessous et relancez ce script ;
--      • soit, plus simple : Admin > Médiathèque > Modifier (icône crayon) puis
--        téléversez votre image — elle remplacera celle-ci automatiquement.
-- -----------------------------------------------------------------------------
INSERT INTO public.site_media (title, alt_text, image_url, section, placement, active, display_order)
SELECT * FROM (VALUES
  ('FRIVIA — Food', 'FRIVIA, la filiale agroalimentaire de PK Global Partners',
   'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1350&q=80',
   'filiales', 'filiale-frivia', true, 1),
  ('ELIKYA — Coffee', 'ELIKYA Coffee, torréfaction et distribution de café',
   'https://images.unsplash.com/photo-1559056199-641a0ac8b3f4?auto=format&fit=crop&w=1350&q=80',
   'filiales', 'filiale-elikya', true, 2),
  ('YOUPI — Bakery', 'YOUPI Bakery, boulangerie-pâtisserie industrielle',
   'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1350&q=80',
   'filiales', 'filiale-youpi', true, 3)
) AS v(title, alt_text, image_url, section, placement, active, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_media m WHERE m.placement = v.placement
);

-- -----------------------------------------------------------------------------
-- 5. CONTRÔLE (facultatif) : copiez-collez ces deux lignes seules pour vérifier
--    que tout est en place. Vous devez obtenir 3 appels et 3 images.
--      SELECT title, status, deadline FROM public.call_for_projects ORDER BY id;
--      SELECT placement, image_url, active FROM public.site_media ORDER BY display_order;
-- -----------------------------------------------------------------------------
