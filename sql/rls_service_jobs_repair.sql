-- OATA Care Portal — service_jobs RLS repair
-- Purpose: remove broad/dev service_jobs policies and enforce production client scoping.
-- Staff: OATA staff roles see/manage all jobs.
-- Clients: see only jobs connected to their company, assigned branch access, or assigned contract access.

ALTER TABLE public.service_jobs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service_jobs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.service_jobs', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "service_jobs_staff_all"
ON public.service_jobs
FOR ALL
TO authenticated
USING (public.is_oata_staff())
WITH CHECK (public.is_oata_staff());

CREATE POLICY "service_jobs_client_read_scoped"
ON public.service_jobs
FOR SELECT
TO authenticated
USING (
  public.is_oata_staff()
  OR company_id = public.get_my_company_id()
  OR requested_by_company_id = public.get_my_company_id()
  OR bill_to_company_id = public.get_my_company_id()
  OR site_company_id = public.get_my_company_id()
  OR (contract_id IS NOT NULL AND public.has_contract_access(contract_id))
  OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
);

-- Client sign-off is still done through /api/work-orders/status; this policy allows the
-- server/client visibility check to resolve the job under the signed-in client's RLS.
CREATE POLICY "service_jobs_client_update_scoped"
ON public.service_jobs
FOR UPDATE
TO authenticated
USING (
  NOT public.is_oata_staff()
  AND (
    company_id = public.get_my_company_id()
    OR requested_by_company_id = public.get_my_company_id()
    OR bill_to_company_id = public.get_my_company_id()
    OR site_company_id = public.get_my_company_id()
    OR (contract_id IS NOT NULL AND public.has_contract_access(contract_id))
    OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
  )
)
WITH CHECK (
  NOT public.is_oata_staff()
  AND (
    company_id = public.get_my_company_id()
    OR requested_by_company_id = public.get_my_company_id()
    OR bill_to_company_id = public.get_my_company_id()
    OR site_company_id = public.get_my_company_id()
    OR (contract_id IS NOT NULL AND public.has_contract_access(contract_id))
    OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
  )
);
