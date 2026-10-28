-- Read-only access for the Supabase admin dashboard.
-- Review existing policies and back up the database before applying.
-- This script does not create a user or a profile. Other existing permissive
-- policies remain effective and must be audited separately.
BEGIN;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filiales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "PK dashboard read filiales" ON public.filiales;
CREATE POLICY "PK dashboard read filiales" ON public.filiales FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('superadmin', 'admin')));

DROP POLICY IF EXISTS "PK dashboard read candidatures" ON public.candidatures;
CREATE POLICY "PK dashboard read candidatures" ON public.candidatures FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('superadmin', 'admin')));

DROP POLICY IF EXISTS "PK dashboard read investors" ON public.investors;
CREATE POLICY "PK dashboard read investors" ON public.investors FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('superadmin', 'admin')));

DROP POLICY IF EXISTS "PK dashboard read inquiries" ON public.inquiries;
CREATE POLICY "PK dashboard read inquiries" ON public.inquiries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('superadmin', 'admin')));

COMMIT;
