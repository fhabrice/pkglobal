-- ========================================================================
-- PK GLOBAL PARTNERS - SCHÉMA DE BASE DE DONNÉES SUPABASE (POSTGRESQL)
-- Version 1.0 - Prêt pour exécution dans le SQL Editor de Supabase
-- ========================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. SUPPRESSION PRÉALABLE (SI NÉCESSAIRE POUR RÉINITIALISATION)
-- DROP TABLE IF EXISTS public.audit_logs CASCADE;
-- DROP TABLE IF EXISTS public.email_logs CASCADE;
-- DROP TABLE IF EXISTS public.notifications CASCADE;
-- DROP TABLE IF EXISTS public.visitor_stats CASCADE;
-- DROP TABLE IF EXISTS public.filiale_projects CASCADE;
-- DROP TABLE IF EXISTS public.filiale_products CASCADE;
-- DROP TABLE IF EXISTS public.inquiries CASCADE;
-- DROP TABLE IF EXISTS public.investor_interests CASCADE;
-- DROP TABLE IF EXISTS public.investors CASCADE;
-- DROP TABLE IF EXISTS public.candidatures CASCADE;
-- DROP TABLE IF EXISTS public.call_for_projects CASCADE;
-- DROP TABLE IF EXISTS public.news CASCADE;
-- DROP TABLE IF EXISTS public.services_poles CASCADE;
-- DROP TABLE IF EXISTS public.site_content CASCADE;
-- DROP TABLE IF EXISTS public.profiles CASCADE;
-- DROP TABLE IF EXISTS public.filiales CASCADE;

-- 3. TABLE DES FILIALES DU GROUPE
CREATE TABLE IF NOT EXISTS public.filiales (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    slogan TEXT NOT NULL,
    description TEXT NOT NULL,
    sector TEXT NOT NULL,
    logo_url TEXT DEFAULT '/logo.svg',
    cover_image_url TEXT,
    phone TEXT,
    email TEXT,
    locations TEXT DEFAULT 'Kinshasa & Goma, RDC',
    manager_id UUID NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. PROFILS UTILISATEURS (RBAC RELIÉ À SUPABASE AUTH)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'filiale_manager')),
    filiale_id BIGINT REFERENCES public.filiales(id) ON DELETE SET NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_login TIMESTAMP WITH TIME ZONE
);

-- 5. CONTENUS DU SITE (CMS DYNAMIQUE)
CREATE TABLE IF NOT EXISTS public.site_content (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 6. PÔLES D'EXPERTISE & SERVICES
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

-- 7. ACTUALITÉS & ANNONCES
CREATE TABLE IF NOT EXISTS public.news (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    category TEXT NOT NULL,
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    status TEXT DEFAULT 'published' CHECK (status IN ('published', 'draft')),
    published_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 8. APPELS À PROJETS
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

-- 9. CANDIDATURES & PROJETS SOUMIS
CREATE TABLE IF NOT EXISTS public.candidatures (
    id BIGSERIAL PRIMARY KEY,
    call_id BIGINT REFERENCES public.call_for_projects(id) ON DELETE SET NULL,
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
    evaluator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    evaluated_at TIMESTAMP WITH TIME ZONE
);

-- 10. GESTION DES INVESTISSEURS
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

-- 11. MANIFESTATIONS D'INTÉRÊT / DEAL PIPELINE
CREATE TABLE IF NOT EXISTS public.investor_interests (
    id BIGSERIAL PRIMARY KEY,
    investor_id BIGINT REFERENCES public.investors(id) ON DELETE CASCADE,
    candidature_id BIGINT REFERENCES public.candidatures(id) ON DELETE SET NULL,
    project_title TEXT NOT NULL,
    amount_intended NUMERIC DEFAULT 0,
    stage TEXT DEFAULT 'Premier contact',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. DEMANDES COMMERCIALES (SOURCE DU CRM)
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
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    response_text TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. PRODUITS & SERVICES DES FILIALES
CREATE TABLE IF NOT EXISTS public.filiale_products (
    id BIGSERIAL PRIMARY KEY,
    filiale_id BIGINT REFERENCES public.filiales(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    price_indicative TEXT,
    image_url TEXT,
    is_featured BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 14. RÉALISATIONS & PROJETS DES FILIALES
CREATE TABLE IF NOT EXISTS public.filiale_projects (
    id BIGSERIAL PRIMARY KEY,
    filiale_id BIGINT REFERENCES public.filiales(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    date_realization TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'Terminé',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 15. STATISTIQUES DE VISITES
CREATE TABLE IF NOT EXISTS public.visitor_stats (
    id BIGSERIAL PRIMARY KEY,
    page TEXT NOT NULL,
    ip_hash TEXT,
    user_agent TEXT,
    referrer TEXT,
    visited_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 16. NOTIFICATIONS SYSTÈME
CREATE TABLE IF NOT EXISTS public.notifications (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_role TEXT,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 17. JOURNAL D'AUDIT DE SÉCURITÉ
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 18. JOURNAL DES EMAILS ENVOYÉS
CREATE TABLE IF NOT EXISTS public.email_logs (
    id BIGSERIAL PRIMARY KEY,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'sent',
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ========================================================================
-- SÉCURITÉ ROW LEVEL SECURITY (RLS) & POLITIQUES D'ACCÈS
-- ========================================================================

ALTER TABLE public.filiales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_poles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_for_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filiale_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filiale_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Politiques de lecture publique (pour le site web vitrine)
CREATE POLICY "Public read filiales" ON public.filiales FOR SELECT USING (true);
CREATE POLICY "Public read services" ON public.services_poles FOR SELECT USING (active = true);
CREATE POLICY "Public read news" ON public.news FOR SELECT USING (status = 'published');
CREATE POLICY "Public read calls" ON public.call_for_projects FOR SELECT USING (status IN ('open', 'closed'));
CREATE POLICY "Public read content" ON public.site_content FOR SELECT USING (true);
CREATE POLICY "Public read products" ON public.filiale_products FOR SELECT USING (true);
CREATE POLICY "Public read projects" ON public.filiale_projects FOR SELECT USING (true);

-- Politiques d'écriture publique (soumissions de formulaires)
CREATE POLICY "Public insert inquiries" ON public.inquiries FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert candidatures" ON public.candidatures FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert investors" ON public.investors FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert visits" ON public.visitor_stats FOR INSERT WITH CHECK (true);

-- Politiques Administrateurs (Superadmin & Admin)
CREATE POLICY "Admins full access filiales" ON public.filiales FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin'))
);

CREATE POLICY "Admins full access candidatures" ON public.candidatures FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin'))
);

CREATE POLICY "Admins full access investors" ON public.investors FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin'))
);

CREATE POLICY "Admins full access inquiries" ON public.inquiries FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin'))
);

-- Politiques Responsable de filiale (Accès strictement cloisonné)
CREATE POLICY "Filiale manager read own filiale" ON public.filiales FOR SELECT USING (
    id = (SELECT filiale_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Filiale manager update own filiale" ON public.filiales FOR UPDATE USING (
    id = (SELECT filiale_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Filiale manager manage own products" ON public.filiale_products FOR ALL USING (
    filiale_id = (SELECT filiale_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Filiale manager manage own projects" ON public.filiale_projects FOR ALL USING (
    filiale_id = (SELECT filiale_id FROM public.profiles WHERE id = auth.uid())
);

-- ========================================================================
-- DONNÉES DE DÉMARRAGE (SEED DATA)
-- ========================================================================

-- Insertion des 3 filiales de PK Global Partners
INSERT INTO public.filiales (id, code, name, slogan, description, sector, logo_url, cover_image_url, phone, email, locations)
VALUES 
(1, 'frivia', 'FRIVIA', 'Tout simplement délicieux', 'Chaîne moderne de restauration rapide Frites & Viande, alliant goût, hygiène et accessibilité aux normes internationales.', 'Restauration rapide & Fast-food', '/logo.svg', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd', '+243 814 119 635', 'frivia@pkglobalpartners.com', 'Kinshasa & Goma, RDC'),
(2, 'elikya', 'ELIKYA COFFEE', 'L''espoir infusé dans chaque arôme', 'Café de terroir grand cru issu des hauts plateaux volcaniques du Kivu. Arabica et Robusta d''excellence avec fort impact social.', 'Agroalimentaire & Café de Terroir', '/logo.svg', 'https://images.unsplash.com/photo-1559056199-641a0ac8b3f4', '+243 814 119 635', 'elikya@pkglobalpartners.com', 'Kivu, Goma & Kinshasa, RDC'),
(3, 'youpi', 'YOUPI PÂTISSERIE', 'Savourez la vie en douceur', 'Boulangerie-pâtisserie artisanale moderne alliant régularité, gourmandise et fraîcheur quotidienne.', 'Boulangerie & Pâtisserie Moderne', '/logo.svg', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587', '+243 814 119 635', 'youpi@pkglobalpartners.com', 'Goma & Kinshasa, RDC')
ON CONFLICT (id) DO NOTHING;

-- Insertion des Pôles d'expertise
INSERT INTO public.services_poles (title, category, description, icon, active, display_order)
VALUES
('Agroalimentaire & Transformation', 'Pôle Industriel', 'Valorisation locale de la production agricole congolaise, café d''excellence et restauration structurée.', 'fa-utensils', true, 1),
('Investissement & Financement', 'Pôle Financier', 'Structuration de véhicules de co-investissement, capital développement pour PME émergentes.', 'fa-chart-line', true, 2),
('Distribution & Logistique', 'Pôle Opérationnel', 'Maîtrise de la chaîne du froid, circuits de distribution urbains et liaison bassins agricoles - métropoles.', 'fa-truck-fast', true, 3),
('Conseil Stratégique & Incubation', 'Pôle Accélération', 'Gouvernance, due diligence et mentorat pour les entrepreneurs lauréats des appels à projets.', 'fa-lightbulb', true, 4)
ON CONFLICT DO NOTHING;

-- Aucun appel à projets n'est seedé : la page publique doit afficher uniquement
-- les appels réels créés et publiés par l'équipe dans l'espace d'administration.
-- Module CRM : exécutez ensuite supabase/crm.sql (migration idempotente, sans données).
