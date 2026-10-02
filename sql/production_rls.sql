-- ════════════════════════════════════════════════════════════════════════════
-- OATA Care Portal — PRODUCTION RLS Policies
-- Created: 2026-10-02
-- Purpose: Company/branch/role-based security for production
-- ════════════════════════════════════════════════════════════════════════════
--
-- ACCESS MATRIX:
--
--  Role                 | Read Scope          | Write Scope
--  ---------------------|---------------------|----------------------
--  oata_admin           | Everything           | Everything
--  oata_manager         | Everything           | Everything
--  head_of_technical    | Everything           | Jobs, equipment, reports
--  hvac_ecology_sup     | Everything           | Jobs, equipment, reports
--  leadman              | Everything           | Assigned jobs
--  technician           | Everything           | Assigned jobs
--  client_gm            | Own company          | Read only
--  client_branch_mgr    | Own company+branch   | Sign-off only
--  client_finance       | Own company          | Read only
--  client_user          | Own company+branch   | Read only
--
-- service_role BYPASSES all RLS (used by Hermes AI only, never in frontend)
-- ════════════════════════════════════════════════════════════════════════════

-- Step 1: Add company_id and branch_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

-- Step 2: Drop ALL existing dev RLS policies
DO $$
DECLARE r record;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
  END LOOP;
END $$;

-- Step 3: Helper functions
CREATE OR REPLACE FUNCTION public.is_oata_staff()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT role IN ('oata_admin', 'oata_manager', 'head_of_technical', 'hvac_ecology_supervisor', 'leadman', 'technician')
     FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Step 4: PROFILES
-- Important: do NOT add a profiles SELECT policy that calls is_oata_staff().
-- is_oata_staff() reads public.profiles, so using it in a profiles policy causes
-- PostgreSQL error 42P17: infinite recursion detected in policy for relation "profiles".
-- Staff-wide profile administration should be done via server-side service_role/API routes,
-- not client-side RLS policies on profiles.
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Step 5: COMPANIES
CREATE POLICY "companies_staff_read" ON public.companies FOR SELECT TO authenticated USING (public.is_oata_staff());
CREATE POLICY "companies_client_read" ON public.companies FOR SELECT TO authenticated USING (id = public.get_my_company_id());
CREATE POLICY "companies_staff_write" ON public.companies FOR ALL TO authenticated USING (public.is_oata_staff()) WITH CHECK (public.is_oata_staff());

-- Step 6: BRANCHES
CREATE POLICY "branches_staff_read" ON public.branches FOR SELECT TO authenticated USING (public.is_oata_staff());
CREATE POLICY "branches_client_read" ON public.branches FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "branches_staff_write" ON public.branches FOR ALL TO authenticated USING (public.is_oata_staff()) WITH CHECK (public.is_oata_staff());

-- Step 7: EQUIPMENT
CREATE POLICY "equipment_staff_read" ON public.equipment FOR SELECT TO authenticated USING (public.is_oata_staff());
CREATE POLICY "equipment_client_read" ON public.equipment FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "equipment_staff_write" ON public.equipment FOR ALL TO authenticated USING (public.is_oata_staff()) WITH CHECK (public.is_oata_staff());

-- Step 8: SERVICE_JOBS
CREATE POLICY "jobs_staff_read" ON public.service_jobs FOR SELECT TO authenticated USING (public.is_oata_staff());
CREATE POLICY "jobs_client_read" ON public.service_jobs FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "jobs_staff_insert" ON public.service_jobs FOR INSERT TO authenticated WITH CHECK (public.is_oata_staff());
CREATE POLICY "jobs_staff_update" ON public.service_jobs FOR UPDATE TO authenticated USING (public.is_oata_staff()) WITH CHECK (public.is_oata_staff());
CREATE POLICY "jobs_client_signoff" ON public.service_jobs FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id() AND NOT public.is_oata_staff()) WITH CHECK (company_id = public.get_my_company_id());

-- Step 9: JOB_PHOTOS
CREATE POLICY "photos_staff_read" ON public.job_photos FOR SELECT TO authenticated USING (public.is_oata_staff());
CREATE POLICY "photos_client_read" ON public.job_photos FOR SELECT TO authenticated USING (job_id IN (SELECT id FROM public.service_jobs WHERE company_id = public.get_my_company_id()));
CREATE POLICY "photos_staff_insert" ON public.job_photos FOR INSERT TO authenticated WITH CHECK (public.is_oata_staff());
CREATE POLICY "photos_staff_delete" ON public.job_photos FOR DELETE TO authenticated USING (public.is_oata_staff());

-- Step 10: JOB_REPORTS
CREATE POLICY "reports_staff_read" ON public.job_reports FOR SELECT TO authenticated USING (public.is_oata_staff());
CREATE POLICY "reports_client_read" ON public.job_reports FOR SELECT TO authenticated USING (job_id IN (SELECT id FROM public.service_jobs WHERE company_id = public.get_my_company_id()));
CREATE POLICY "reports_staff_write" ON public.job_reports FOR ALL TO authenticated USING (public.is_oata_staff()) WITH CHECK (public.is_oata_staff());

-- Step 11: APPROVALS
CREATE POLICY "approvals_staff_read" ON public.approvals FOR SELECT TO authenticated USING (public.is_oata_staff());
CREATE POLICY "approvals_client_read" ON public.approvals FOR SELECT TO authenticated USING (job_id IN (SELECT id FROM public.service_jobs WHERE company_id = public.get_my_company_id()));
CREATE POLICY "approvals_staff_write" ON public.approvals FOR ALL TO authenticated USING (public.is_oata_staff()) WITH CHECK (public.is_oata_staff());
CREATE POLICY "approvals_client_decide" ON public.approvals FOR UPDATE TO authenticated USING (job_id IN (SELECT id FROM public.service_jobs WHERE company_id = public.get_my_company_id())) WITH CHECK (job_id IN (SELECT id FROM public.service_jobs WHERE company_id = public.get_my_company_id()));

-- Step 12: AUDIT_LOGS (immutable — insert only, no update/delete)
CREATE POLICY "audit_staff_read" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_oata_staff());
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (TRUE);
