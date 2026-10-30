-- ========================================================================
-- PK GLOBAL PARTNERS — RELATION ADMIN ↔ SITE PUBLIC (VITRINE)
-- À exécuter dans le SQL Editor de Supabase, UNE SEULE FOIS.
--
-- Pourquoi ce script ?
--   L'espace administrateur peut désormais gérer TOUT ce que le visiteur
--   voit sur le site. Mais les tables qui alimentent la vitrine
--   (textes, pôles d'expertise, actualités) n'avaient aucune politique
--   d'écriture pour les administrateurs : ce que vous enregistriez dans
--   l'admin ne pouvait donc pas apparaître sur le site.
--
-- Ce script, sans rien casser :
--   1. crée les tables manquantes (site_content, services_poles, news) ;
--   2. active la lecture publique (le visiteur voit ce qui est publié) ;
--   3. donne aux profils actifs « superadmin » / « admin » le droit de
--      créer, modifier, publier et supprimer ces contenus ;
--   4. donne à l'admin la lecture et la suppression des messages reçus
--      depuis les formulaires publics (inquiries, investors) ;
--   5. insère les 4 pôles d'expertise de PK GLOBAL PARTNERS pour que la
--      section « Nos Pôles d'Expertise » de la page d'accueil soit remplie.
--
-- Idempotent : peut être rejoué sans risque. N'insère aucune donnée
-- de démonstration (les 4 pôles sont les pôles réels de la holding,
-- déjà décrits dans supabase/schema.sql).
-- ========================================================================

BEGIN;

-- ------------------------------------------------------------------------
-- 0. Prérequis : fonction d'autorisation et maintien de « updated_at »
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_pk_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role IN ('superadmin', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_pk_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_pk_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_crm_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------
-- 1. TABLES DU SITE PUBLIC (créées seulement si elles n'existent pas)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_content (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

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

-- Colonne « updated_at » : ajoutée si la table existait déjà sans elle.
ALTER TABLE public.site_content ADD COLUMN IF NOT EXISTS updated_at
  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- ------------------------------------------------------------------------
-- 2. SÉCURITÉ : RLS activé partout
-- ------------------------------------------------------------------------
ALTER TABLE public.site_content   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_poles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news           ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------
-- 3. LECTURE PUBLIQUE : le visiteur voit uniquement ce qui est publié
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read content" ON public.site_content;
CREATE POLICY "Public read content" ON public.site_content
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read services" ON public.services_poles;
CREATE POLICY "Public read services" ON public.services_poles
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "Public read news" ON public.news;
CREATE POLICY "Public read news" ON public.news
  FOR SELECT USING (status = 'published');

-- ------------------------------------------------------------------------
-- 4. ÉCRITURE ADMIN : c'est ce qui manquait pour que les modifications
--    faites dans l'administration apparaissent réellement sur le site.
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "PK admins manage content" ON public.site_content;
CREATE POLICY "PK admins manage content" ON public.site_content
  FOR ALL TO authenticated
  USING (public.is_pk_admin())
  WITH CHECK (public.is_pk_admin());

DROP POLICY IF EXISTS "PK admins manage services" ON public.services_poles;
CREATE POLICY "PK admins manage services" ON public.services_poles
  FOR ALL TO authenticated
  USING (public.is_pk_admin())
  WITH CHECK (public.is_pk_admin());

DROP POLICY IF EXISTS "PK admins manage news" ON public.news;
CREATE POLICY "PK admins manage news" ON public.news
  FOR ALL TO authenticated
  USING (public.is_pk_admin())
  WITH CHECK (public.is_pk_admin());

-- ------------------------------------------------------------------------
-- 5. MESSAGES REÇUS DEPUIS LE SITE (formulaire de contact et formulaire
--    investisseurs) : l'admin peut les lire et les supprimer.
-- ------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.inquiries') IS NOT NULL THEN
    ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "PK admins manage inquiries" ON public.inquiries;
    CREATE POLICY "PK admins manage inquiries" ON public.inquiries
      FOR ALL TO authenticated
      USING (public.is_pk_admin())
      WITH CHECK (public.is_pk_admin());
  END IF;

  IF to_regclass('public.investors') IS NOT NULL THEN
    ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "PK admins manage investors" ON public.investors;
    CREATE POLICY "PK admins manage investors" ON public.investors
      FOR ALL TO authenticated
      USING (public.is_pk_admin())
      WITH CHECK (public.is_pk_admin());
  END IF;
END $$;

-- ------------------------------------------------------------------------
-- 6. LES 4 PÔLES D'EXPERTISE DE LA HOLDING
--    (ils remplissent la section « Nos Pôles d'Expertise » de l'accueil ;
--     modifiez-les ensuite depuis Administrateur > Contenus du site)
-- ------------------------------------------------------------------------
INSERT INTO public.services_poles (title, category, description, icon, active, display_order)
SELECT * FROM (VALUES
  ('Agroalimentaire & Transformation', 'Pôle Industriel',
   'Valorisation locale de la production agricole congolaise, café d''excellence et restauration structurée.',
   'fa-utensils', true, 1),
  ('Investissement & Financement', 'Pôle Financier',
   'Structuration de véhicules de co-investissement, capital développement pour PME émergentes.',
   'fa-chart-line', true, 2),
  ('Distribution & Logistique', 'Pôle Opérationnel',
   'Maîtrise de la chaîne du froid, circuits de distribution urbains et liaison bassins agricoles - métropoles.',
   'fa-truck-fast', true, 3),
  ('Conseil Stratégique & Incubation', 'Pôle Accélération',
   'Gouvernance, due diligence et mentorat pour les entrepreneurs lauréats des appels à projets.',
   'fa-lightbulb', true, 4)
) AS v(title, category, description, icon, active, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.services_poles);

COMMIT;

-- ========================================================================
-- VÉRIFICATION (à exécuter séparément)
-- ========================================================================
-- SELECT title, category, active, display_order FROM public.services_poles ORDER BY display_order;
-- SELECT key, value FROM public.site_content;
-- SELECT id, title, status FROM public.news ORDER BY published_at DESC;
