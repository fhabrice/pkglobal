-- ========================================================================
-- PK GLOBAL PARTNERS — MIGRATION CRM SUPABASE (POSTGRESQL)
-- À exécuter dans le SQL Editor après sauvegarde et revue des politiques RLS.
--
-- Cette migration est idempotente et n'insère AUCUNE donnée de démonstration.
-- Le CRM est réservé aux profils Supabase actifs « superadmin » et « admin ».
-- Les autres politiques permissives déjà présentes dans le projet ne sont
-- pas supprimées : auditez-les séparément avant la mise en production.
-- ========================================================================

BEGIN;

-- Fonction d'autorisation utilisée par les politiques CRM.
-- SECURITY DEFINER évite la récursivité RLS lorsqu'elle lit public.profiles.
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

-- Maintien automatique de updated_at.
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
-- Contacts CRM
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_contacts (
    id BIGSERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    organization TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    type TEXT NOT NULL DEFAULT 'prospect'
      CHECK (type IN ('prospect', 'client', 'partenaire', 'investisseur', 'porteur_projet', 'candidat', 'autre')),
    status TEXT NOT NULL DEFAULT 'nouveau'
      CHECK (status IN ('nouveau', 'actif', 'inactif', 'archive')),
    source TEXT NOT NULL DEFAULT 'manuel',
    source_ref_type TEXT,
    source_ref_id BIGINT,
    country TEXT DEFAULT 'RDC',
    location TEXT,
    sector TEXT,
    tags TEXT,
    notes TEXT,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    last_contacted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_email_unique_idx
  ON public.crm_contacts (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_source_ref_unique_idx
  ON public.crm_contacts (source_ref_type, source_ref_id)
  WHERE source_ref_type IS NOT NULL AND source_ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_contacts_status_type_idx
  ON public.crm_contacts (status, type);
CREATE INDEX IF NOT EXISTS crm_contacts_owner_idx
  ON public.crm_contacts (owner_id);

DROP TRIGGER IF EXISTS crm_contacts_set_updated_at ON public.crm_contacts;
CREATE TRIGGER crm_contacts_set_updated_at
  BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_updated_at();

-- ------------------------------------------------------------------------
-- Opportunités / pipeline CRM
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_opportunities (
    id BIGSERIAL PRIMARY KEY,
    contact_id BIGINT NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'commerciale'
      CHECK (type IN ('commerciale', 'investissement', 'partenariat', 'appel_projet', 'recrutement', 'autre')),
    stage TEXT NOT NULL DEFAULT 'nouveau'
      CHECK (stage IN ('nouveau', 'qualification', 'contacte', 'reunion', 'proposition', 'negociation', 'gagne', 'perdu')),
    amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'USD',
    probability INT NOT NULL DEFAULT 10 CHECK (probability >= 0 AND probability <= 100),
    expected_close_date DATE,
    description TEXT,
    source TEXT NOT NULL DEFAULT 'manuel',
    source_ref_type TEXT,
    source_ref_id BIGINT,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_opportunities_source_ref_unique_idx
  ON public.crm_opportunities (source_ref_type, source_ref_id)
  WHERE source_ref_type IS NOT NULL AND source_ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_opportunities_contact_stage_idx
  ON public.crm_opportunities (contact_id, stage);
CREATE INDEX IF NOT EXISTS crm_opportunities_owner_idx
  ON public.crm_opportunities (owner_id);

DROP TRIGGER IF EXISTS crm_opportunities_set_updated_at ON public.crm_opportunities;
CREATE TRIGGER crm_opportunities_set_updated_at
  BEFORE UPDATE ON public.crm_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_updated_at();

-- ------------------------------------------------------------------------
-- Activités, relances et tâches CRM
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_activities (
    id BIGSERIAL PRIMARY KEY,
    contact_id BIGINT NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
    opportunity_id BIGINT REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'tache'
      CHECK (type IN ('note', 'appel', 'email', 'reunion', 'whatsapp', 'tache', 'autre')),
    status TEXT NOT NULL DEFAULT 'a_faire'
      CHECK (status IN ('a_faire', 'terminee', 'annulee')),
    title TEXT NOT NULL,
    details TEXT,
    due_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS crm_activities_contact_idx
  ON public.crm_activities (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_activities_due_idx
  ON public.crm_activities (status, due_at);
CREATE INDEX IF NOT EXISTS crm_activities_opportunity_idx
  ON public.crm_activities (opportunity_id);

DROP TRIGGER IF EXISTS crm_activities_set_updated_at ON public.crm_activities;
CREATE TRIGGER crm_activities_set_updated_at
  BEFORE UPDATE ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_updated_at();

-- ------------------------------------------------------------------------
-- Privilèges API et Row Level Security
-- ------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_opportunities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.crm_contacts_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.crm_opportunities_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.crm_activities_id_seq TO authenticated;

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PK CRM admins full access contacts" ON public.crm_contacts;
CREATE POLICY "PK CRM admins full access contacts"
  ON public.crm_contacts FOR ALL TO authenticated
  USING (public.is_pk_admin())
  WITH CHECK (public.is_pk_admin());

DROP POLICY IF EXISTS "PK CRM admins full access opportunities" ON public.crm_opportunities;
CREATE POLICY "PK CRM admins full access opportunities"
  ON public.crm_opportunities FOR ALL TO authenticated
  USING (public.is_pk_admin())
  WITH CHECK (public.is_pk_admin());

DROP POLICY IF EXISTS "PK CRM admins full access activities" ON public.crm_activities;
CREATE POLICY "PK CRM admins full access activities"
  ON public.crm_activities FOR ALL TO authenticated
  USING (public.is_pk_admin())
  WITH CHECK (public.is_pk_admin());

-- Permet aux administrateurs de lister les responsables CRM possibles.
DROP POLICY IF EXISTS "PK CRM admins read profiles" ON public.profiles;
CREATE POLICY "PK CRM admins read profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_pk_admin());

-- Lectures nécessaires au bouton « Synchroniser les sources » du CRM.
-- Ces politiques sont en lecture seule et réservées aux administrateurs.
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PK CRM sync read inquiries" ON public.inquiries;
CREATE POLICY "PK CRM sync read inquiries"
  ON public.inquiries FOR SELECT TO authenticated
  USING (public.is_pk_admin());

ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PK CRM sync read investors" ON public.investors;
CREATE POLICY "PK CRM sync read investors"
  ON public.investors FOR SELECT TO authenticated
  USING (public.is_pk_admin());

ALTER TABLE public.investor_interests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PK CRM sync read investor interests" ON public.investor_interests;
CREATE POLICY "PK CRM sync read investor interests"
  ON public.investor_interests FOR SELECT TO authenticated
  USING (public.is_pk_admin());

ALTER TABLE public.candidatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PK CRM sync read candidatures" ON public.candidatures;
CREATE POLICY "PK CRM sync read candidatures"
  ON public.candidatures FOR SELECT TO authenticated
  USING (public.is_pk_admin());

ALTER TABLE public.call_for_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PK CRM sync read calls" ON public.call_for_projects;
CREATE POLICY "PK CRM sync read calls"
  ON public.call_for_projects FOR SELECT TO authenticated
  USING (public.is_pk_admin());

COMMIT;

-- ------------------------------------------------------------------------
-- OPTIONNEL — anciennes bases Supabase seedées en démonstration
-- Après revue manuelle, vous pouvez dépublier (sans supprimer) les trois
-- appels fictifs connus afin qu'ils ne soient pas présentés comme officiels :
--
-- UPDATE public.call_for_projects
-- SET status = 'draft'
-- WHERE slug IN (
--   'appel-projets-agritech-2026',
--   'fonds-jeunes-logistique-dernier-km',
--   'energies-renouvelables-pompage-2025'
-- );
-- ------------------------------------------------------------------------
