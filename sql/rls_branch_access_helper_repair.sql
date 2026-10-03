-- OATA Care Portal — tighten has_branch_access helper
-- Purpose: branch access must be explicit, not inferred from same company.
-- Company-wide visibility is handled separately for client_gm/client_finance.

CREATE OR REPLACE FUNCTION public.has_branch_access(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_oata_staff()
    OR EXISTS (
      SELECT 1
      FROM public.branch_user_access bua
      WHERE bua.branch_id = p_branch_id
        AND bua.user_id = auth.uid()
        AND bua.status = 'active'
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_branch_access(UUID) TO authenticated, service_role;
