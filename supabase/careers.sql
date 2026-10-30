-- =============================================================================
-- PK GLOBAL PARTNERS — MODULE « CARRIÈRES / OFFRES D'EMPLOI »
-- -----------------------------------------------------------------------------
-- Crée la table « job_offers » gérée depuis l'espace admin (menu Carrières) et
-- affichée automatiquement sur la page publique careers.html.
--
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run
-- Script idempotent : relançable sans rien dupliquer.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLE DES OFFRES D'EMPLOI
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_offers (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    department TEXT,                       -- Pôle / filiale (Finance, Logistique…)
    location TEXT,                         -- Ville (Goma, Kinshasa, Remote…)
    contract_type TEXT DEFAULT 'CDI',      -- CDI, CDD, Stage, Freelance…
    level TEXT DEFAULT 'Confirmé',         -- Débutant, Confirmé, Senior
    description TEXT NOT NULL,             -- Résumé affiché sur le site
    profile TEXT,                          -- Profil / compétences recherchés
    status TEXT DEFAULT 'draft' CHECK (status IN ('open', 'closed', 'draft')),
    display_order INT NOT NULL DEFAULT 0,
    deadline TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS job_offers_public_idx
  ON public.job_offers (status, display_order);

-- Mise à jour automatique de « updated_at » si la fonction du projet existe.
DO $$
BEGIN
  IF to_regprocedure('public.set_crm_updated_at()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS job_offers_set_updated_at ON public.job_offers;
    CREATE TRIGGER job_offers_set_updated_at
      BEFORE UPDATE ON public.job_offers
      FOR EACH ROW EXECUTE FUNCTION public.set_crm_updated_at();
  END IF;
END $$;

ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. ACCÈS
-- -----------------------------------------------------------------------------
-- Lecture publique : uniquement les offres publiées (statut « open »).
DROP POLICY IF EXISTS "Public read open jobs" ON public.job_offers;
CREATE POLICY "Public read open jobs" ON public.job_offers
  FOR SELECT USING (status = 'open');

-- Écriture réservée aux administrateurs du projet.
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
  ELSE
    RAISE NOTICE 'Aucune politique d''écriture créée pour job_offers (ni public.is_pk_admin() ni public.profiles).';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. OFFRES DE DÉPART (reprise des offres déjà présentes sur le site)
--    Modifiez-les, masquez-les ou supprimez-les depuis :
--    Admin > Carrières.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4. CONTRÔLE
--      SELECT title, department, status FROM public.job_offers ORDER BY display_order;
-- =============================================================================
