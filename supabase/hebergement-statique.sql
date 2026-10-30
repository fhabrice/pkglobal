-- =============================================================================
-- PK GLOBAL PARTNERS — HÉBERGEMENT STATIQUE (sans serveur Node.js)
-- -----------------------------------------------------------------------------
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run
--
-- Ce script est AUTONOME et IDÉMPOTENT :
--   • il crée les tables manquantes (sans jamais écraser celles qui existent) ;
--   • il active la sécurité (RLS) et crée les politiques d'accès ;
--   • il insère 3 appels à projets et les 3 images des filiales.
-- Vous pouvez le relancer autant de fois que vous voulez : rien n'est dupliqué
-- et une table absente ne provoque plus d'erreur.
--
-- Si une ligne du résultat indique « NOTICE : Table absente » , ce n'est pas
-- une erreur : la table est créée juste après.
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 — CRÉER LES TABLES MANQUANTES
-- (CREATE TABLE IF NOT EXISTS ne modifie jamais une table déjà présente)
-- =============================================================================

-- Textes du site (CMS)
CREATE TABLE IF NOT EXISTS public.site_content (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Pôles d'expertise
CREATE TABLE IF NOT EXISTS public.services_poles (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT DEFAULT 'fa-briefcase',
    active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Actualités
CREATE TABLE IF NOT EXISTS public.news (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    category TEXT NOT NULL,
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    status TEXT DEFAULT 'published' CHECK (status IN ('published', 'draft')),
    published_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Appels à projets
CREATE TABLE IF NOT EXISTS public.call_for_projects (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT NOT NULL,
    target_sector TEXT NOT NULL,
    budget_indicatif TEXT NOT NULL,
    eligibility TEXT NOT NULL,
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('open', 'closed', 'draft')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Candidatures déposées depuis le site
CREATE TABLE IF NOT EXISTS public.candidatures (
    id BIGSERIAL PRIMARY KEY,
    call_id BIGINT,
    candidate_name TEXT NOT NULL,
    candidate_email TEXT NOT NULL,
    candidate_phone TEXT,
    project_title TEXT NOT NULL,
    sector TEXT NOT NULL,
    location TEXT NOT NULL,
    funding_requested NUMERIC NOT NULL,
    currency TEXT DEFAULT 'USD',
    summary TEXT NOT NULL,
    details TEXT,
    document_url TEXT,
    document_name TEXT,
    status TEXT DEFAULT 'recu' CHECK (status IN ('recu', 'en_evaluation', 'retenu', 'rejete')),
    evaluation_score NUMERIC DEFAULT 0,
    evaluation_notes TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    evaluated_at TIMESTAMP WITH TIME ZONE
);

-- Investisseurs
CREATE TABLE IF NOT EXISTS public.investors (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    organization TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    country TEXT DEFAULT 'RDC',
    investor_type TEXT NOT NULL,
    ticket_min NUMERIC DEFAULT 0,
    ticket_max NUMERIC DEFAULT 0,
    sectors_of_interest TEXT,
    status TEXT DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'valide', 'desactive')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Manifestations d'intérêt
CREATE TABLE IF NOT EXISTS public.investor_interests (
    id BIGSERIAL PRIMARY KEY,
    investor_id BIGINT,
    candidature_id BIGINT,
    project_title TEXT NOT NULL,
    amount_intended NUMERIC DEFAULT 0,
    stage TEXT DEFAULT 'Premier contact',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Demandes de contact
CREATE TABLE IF NOT EXISTS public.inquiries (
    id BIGSERIAL PRIMARY KEY,
    reference TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    organization TEXT,
    service_requested TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'nouveau' CHECK (status IN ('nouveau', 'en_cours', 'en_attente', 'resolu')),
    response_text TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Statistiques de visites
CREATE TABLE IF NOT EXISTS public.visitor_stats (
    id BIGSERIAL PRIMARY KEY,
    page TEXT NOT NULL,
    ip_hash TEXT,
    user_agent TEXT,
    referrer TEXT,
    visited_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Médiathèque (images du site gérées depuis l'admin)
CREATE TABLE IF NOT EXISTS public.site_media (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    alt_text TEXT,
    image_url TEXT NOT NULL,
    storage_path TEXT,
    section TEXT NOT NULL DEFAULT 'galerie'
      CHECK (section IN ('galerie', 'hero', 'filiales', 'general')),
    placement TEXT,
    link_url TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS site_media_public_idx
  ON public.site_media (active, section, display_order);


-- =============================================================================
-- ÉTAPE 2 — SÉCURITÉ : activer RLS sur les tables qui existent
-- =============================================================================
DO $$
DECLARE
  nom text;
BEGIN
  FOREACH nom IN ARRAY ARRAY[
    'site_content', 'services_poles', 'news', 'call_for_projects',
    'candidatures', 'investors', 'investor_interests', 'inquiries',
    'visitor_stats', 'site_media'
  ]
  LOOP
    IF to_regclass('public.' || nom) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', nom);
      RAISE NOTICE 'RLS activée sur %', nom;
    ELSE
      RAISE NOTICE 'Table absente (ignorée) : %', nom;
    END IF;
  END LOOP;
END $$;


-- =============================================================================
-- ÉTAPE 3 — LECTURE PUBLIQUE (les visiteurs voient ce qui est publié)
-- =============================================================================
DO $$
BEGIN
  IF to_regclass('public.site_media') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public read active media" ON public.site_media;
    CREATE POLICY "Public read active media" ON public.site_media
      FOR SELECT USING (active = true);
  END IF;

  IF to_regclass('public.call_for_projects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public read calls" ON public.call_for_projects;
    CREATE POLICY "Public read calls" ON public.call_for_projects
      FOR SELECT USING (status IN ('open', 'closed'));
  END IF;

  IF to_regclass('public.services_poles') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public read services" ON public.services_poles;
    CREATE POLICY "Public read services" ON public.services_poles
      FOR SELECT USING (active = true);
  END IF;

  IF to_regclass('public.news') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public read news" ON public.news;
    CREATE POLICY "Public read news" ON public.news
      FOR SELECT USING (status = 'published');
  END IF;

  IF to_regclass('public.site_content') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public read content" ON public.site_content;
    CREATE POLICY "Public read content" ON public.site_content
      FOR SELECT USING (true);
  END IF;
END $$;


-- =============================================================================
-- ÉTAPE 4 — DÉPÔT DES FORMULAIRES (insertion uniquement, aucune lecture)
-- =============================================================================
DO $$
BEGIN
  IF to_regclass('public.inquiries') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public insert inquiries" ON public.inquiries;
    CREATE POLICY "Public insert inquiries" ON public.inquiries
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;

  IF to_regclass('public.candidatures') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public insert candidatures" ON public.candidatures;
    CREATE POLICY "Public insert candidatures" ON public.candidatures
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;

  IF to_regclass('public.investors') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public insert investors" ON public.investors;
    CREATE POLICY "Public insert investors" ON public.investors
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;

  IF to_regclass('public.investor_interests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public insert interests" ON public.investor_interests;
    CREATE POLICY "Public insert interests" ON public.investor_interests
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;

  IF to_regclass('public.visitor_stats') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public insert visits" ON public.visitor_stats;
    CREATE POLICY "Public insert visits" ON public.visitor_stats
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $$;


-- =============================================================================
-- ÉTAPE 5 — TROIS APPELS À PROJETS DE DÉPART
-- =============================================================================
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


-- =============================================================================
-- ÉTAPE 6 — IMAGES DES FILIALES (FRIVIA, ELIKYA, YOUPI)
--   Visibles ensuite dans : Admin > Médiathèque > section « Filiales ».
--   Pour les remplacer par vos photos : Médiathèque > Modifier (crayon) >
--   téléverser votre image.
-- =============================================================================
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


-- =============================================================================
-- ÉTAPE 7 — CARRIÈRES : offres d'emploi gérables depuis l'admin
--   (même contenu que le fichier supabase/careers.sql)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.job_offers (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    department TEXT,
    location TEXT,
    contract_type TEXT DEFAULT 'CDI',
    level TEXT DEFAULT 'Confirmé',
    description TEXT NOT NULL,
    profile TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('open', 'closed', 'draft')),
    display_order INT NOT NULL DEFAULT 0,
    deadline TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS job_offers_public_idx
  ON public.job_offers (status, display_order);

DO $$
BEGIN
  ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Public read open jobs" ON public.job_offers;
  CREATE POLICY "Public read open jobs" ON public.job_offers
    FOR SELECT USING (status = 'open');
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.is_pk_admin()') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "PK admins manage jobs" ON public.job_offers';
    EXECUTE 'CREATE POLICY "PK admins manage jobs" ON public.job_offers
             FOR ALL TO authenticated
             USING (public.is_pk_admin())
             WITH CHECK (public.is_pk_admin())';
  ELSIF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins full access jobs" ON public.job_offers';
    EXECUTE 'CREATE POLICY "Admins full access jobs" ON public.job_offers
             FOR ALL USING (
               EXISTS (SELECT 1 FROM public.profiles p
                       WHERE p.id = auth.uid() AND p.active = true
                         AND p.role IN (''superadmin'', ''admin''))
             )';
  END IF;
END $$;

INSERT INTO public.job_offers
  (title, department, location, contract_type, level, description, status, display_order)
SELECT * FROM (VALUES
  ('Responsable Investissement & Structuration', 'Finance', 'Goma', 'CDI', 'Senior',
   'Pilotage de projets d''investissement, ingénierie financière et structuration de SPV. Expérience 5+ ans en finance structurée.',
   'open', 1),
  ('Directeur Opérations - RAKA Logistique', 'Logistique', 'Kinshasa', 'CDI', 'Senior',
   'Management opérationnel de la plateforme RAKA, gestion des livreurs, optimisation des routes. Expérience en logistique urbaine.',
   'open', 2),
  ('Responsable Commercial - ELVO Mobilité', 'Ventes', 'Goma', 'CDI', 'Confirmé',
   'Développement réseau distribution, gestion clients flotte, targets commerciales. Expérience mobilité/secteur automobile.',
   'open', 3),
  ('Ingénieur Logiciel Fullstack', 'Technologie', 'Goma / Remote', 'CDI', 'Confirmé',
   'Développement plateformes digitales (frontend React/Vue, backend Node/Python), API REST, bases de données. Stack tech moderne.',
   'open', 4),
  ('Assistant Ressources Humaines', 'RH', 'Goma', 'CDI', 'Débutant',
   'Support RH, traitement candidatures, gestion paie/absences, événements internes. Excellent relationnel et organisation.',
   'open', 5)
) AS v(title, department, location, contract_type, level, description, status, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.job_offers j WHERE j.title = v.title
);


-- =============================================================================
-- ÉTAPE 8 — CONTRÔLE : exécutez ces lignes seules pour vérifier.
--   Vous devez obtenir 3 appels, 3 images de filiales et 5 offres d'emploi.
--     SELECT title, status, deadline FROM public.call_for_projects ORDER BY id;
--     SELECT placement, image_url, active FROM public.site_media ORDER BY display_order;
--     SELECT title, department, status FROM public.job_offers ORDER BY display_order;
-- =============================================================================
