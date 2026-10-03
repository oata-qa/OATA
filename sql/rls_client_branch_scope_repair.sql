-- OATA Care Portal — client branch-scope RLS tightening
-- Purpose: company-wide client visibility is only for client_gm/client_finance.
-- Branch managers/users must have explicit branch or contract access.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;

ALTER TABLE public.service_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_jobs_client_read_scoped" ON public.service_jobs;
DROP POLICY IF EXISTS "service_jobs_client_update_scoped" ON public.service_jobs;

CREATE POLICY "service_jobs_client_read_scoped"
ON public.service_jobs
FOR SELECT
TO authenticated
USING (
  public.is_oata_staff()
  OR (
    public.get_my_role() IN ('client_gm', 'client_finance')
    AND (
      company_id = public.get_my_company_id()
      OR requested_by_company_id = public.get_my_company_id()
      OR bill_to_company_id = public.get_my_company_id()
      OR site_company_id = public.get_my_company_id()
    )
  )
  OR (contract_id IS NOT NULL AND public.has_contract_access(contract_id))
  OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
);

CREATE POLICY "service_jobs_client_update_scoped"
ON public.service_jobs
FOR UPDATE
TO authenticated
USING (
  NOT public.is_oata_staff()
  AND (
    (
      public.get_my_role() IN ('client_gm', 'client_finance')
      AND (
        company_id = public.get_my_company_id()
        OR requested_by_company_id = public.get_my_company_id()
        OR bill_to_company_id = public.get_my_company_id()
        OR site_company_id = public.get_my_company_id()
      )
    )
    OR (contract_id IS NOT NULL AND public.has_contract_access(contract_id))
    OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
  )
)
WITH CHECK (
  NOT public.is_oata_staff()
  AND (
    (
      public.get_my_role() IN ('client_gm', 'client_finance')
      AND (
        company_id = public.get_my_company_id()
        OR requested_by_company_id = public.get_my_company_id()
        OR bill_to_company_id = public.get_my_company_id()
        OR site_company_id = public.get_my_company_id()
      )
    )
    OR (contract_id IS NOT NULL AND public.has_contract_access(contract_id))
    OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
  )
);
