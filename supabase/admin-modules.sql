-- ========================================================================
-- PK GLOBAL PARTNERS — MODULES ADMIN : APPELS À PROJETS + MÉDIATHÈQUE
-- À exécuter dans le SQL Editor après sauvegarde et revue des politiques RLS.
--
-- Objectifs :
--   1. Donner aux profils actifs « superadmin » / « admin » le droit de
--      créer, modifier, publier et supprimer les appels à projets
--      (table public.call_for_projects, déjà créée par supabase/schema.sql).
--   2. Créer la table public.site_media (médiathèque du dashboard admin)
--      et le bucket de stockage public « site-media » pour les images.
--
-- Cette migration est idempotente et n'insère AUCUNE donnée de démonstration.
-- Les autres politiques permissives déjà présentes dans le projet ne sont
-- pas supprimées : auditez-les séparément avant la mise en production.
-- ========================================================================

BEGIN;

-- Fonction d'autorisation (identique à supabase/crm.sql, créée si absente).
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

-- Maintien automatique de updated_at (fonction partagée avec le CRM).
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
-- 1. APPELS À PROJETS : gestion complète depuis l'espace admin
-- ------------------------------------------------------------------------
ALTER TABLE public.call_for_projects ENABLE ROW LEVEL SECURITY;

-- Lecture publique : uniquement les appels publiés (ouverts ou clôturés).
-- La politique « Public read calls » de schema.sql est conservée si elle
-- existe ; on (re)crée ici uniquement les politiques préfixées « PK admin ».
DROP POLICY IF EXISTS "PK admins manage calls" ON public.call_for_projects;
CREATE POLICY "PK admins manage calls" ON public.call_for_projects
  FOR ALL TO authenticated
  USING (public.is_pk_admin())
  WITH CHECK (public.is_pk_admin());

-- ------------------------------------------------------------------------
-- 2. MÉDIATHÈQUE : images du site gérées depuis le dashboard admin
-- ------------------------------------------------------------------------
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
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS site_media_public_idx
  ON public.site_media (active, section, display_order);
CREATE INDEX IF NOT EXISTS site_media_placement_idx
  ON public.site_media (placement)
  WHERE placement IS NOT NULL;

DROP TRIGGER IF EXISTS site_media_set_updated_at ON public.site_media;
CREATE TRIGGER site_media_set_updated_at
  BEFORE UPDATE ON public.site_media
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_updated_at();

ALTER TABLE public.site_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PK public read active media" ON public.site_media;
CREATE POLICY "PK public read active media" ON public.site_media
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "PK admins manage media" ON public.site_media;
CREATE POLICY "PK admins manage media" ON public.site_media
  FOR ALL TO authenticated
  USING (public.is_pk_admin())
  WITH CHECK (public.is_pk_admin());

-- ------------------------------------------------------------------------
-- 3. STOCKAGE DES FICHIERS IMAGES (Supabase Storage, bucket public)
-- ------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-media', 'site-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "PK public read site-media" ON storage.objects;
CREATE POLICY "PK public read site-media" ON storage.objects
  FOR SELECT USING (bucket_id = 'site-media');

DROP POLICY IF EXISTS "PK admins upload site-media" ON storage.objects;
CREATE POLICY "PK admins upload site-media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-media' AND public.is_pk_admin());

DROP POLICY IF EXISTS "PK admins update site-media" ON storage.objects;
CREATE POLICY "PK admins update site-media" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'site-media' AND public.is_pk_admin())
  WITH CHECK (bucket_id = 'site-media' AND public.is_pk_admin());

DROP POLICY IF EXISTS "PK admins delete site-media" ON storage.objects;
CREATE POLICY "PK admins delete site-media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'site-media' AND public.is_pk_admin());

COMMIT;
