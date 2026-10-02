-- OATA Care Portal: Contract-based client/sub-client access
-- Purpose: West Walk can see only kitchen hood cleaning jobs inside its contract;
-- restaurants can see their own branch jobs and direct OATA work.

-- 0) Required helper functions -----------------------------------------------
CREATE OR REPLACE FUNCTION public.is_oata_staff()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT role IN ('oata_admin', 'oata_manager', 'head_of_technical', 'hvac_ecology_supervisor', 'leadman', 'technician')
     FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.is_oata_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated, service_role;

-- 1) Contract model ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_name TEXT NOT NULL,
  owner_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_category TEXT NOT NULL,
  contract_type TEXT NOT NULL DEFAULT 'service_contract',
  status TEXT NOT NULL DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  billing_model TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, branch_id)
);

CREATE TABLE IF NOT EXISTS public.contract_user_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL DEFAULT 'viewer',
  can_request BOOLEAN NOT NULL DEFAULT true,
  can_approve BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, contract_id)
);

CREATE TABLE IF NOT EXISTS public.branch_user_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL DEFAULT 'branch_viewer',
  can_request BOOLEAN NOT NULL DEFAULT true,
  can_approve BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, branch_id)
);

-- 2) Job ownership/visibility columns ---------------------------------------
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS service_category TEXT;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS requested_by_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS bill_to_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS site_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'company';

UPDATE public.service_jobs
SET
  service_category = COALESCE(service_category, job_type),
  requested_by_company_id = COALESCE(requested_by_company_id, company_id),
  bill_to_company_id = COALESCE(bill_to_company_id, company_id),
  site_company_id = COALESCE(site_company_id, company_id)
WHERE service_category IS NULL
   OR requested_by_company_id IS NULL
   OR bill_to_company_id IS NULL
   OR site_company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_owner_company ON public.contracts(owner_company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_service_category ON public.contracts(service_category);
CREATE INDEX IF NOT EXISTS idx_contract_branches_contract ON public.contract_branches(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_branches_branch ON public.contract_branches(branch_id);
CREATE INDEX IF NOT EXISTS idx_contract_user_access_user ON public.contract_user_access(user_id);
CREATE INDEX IF NOT EXISTS idx_contract_user_access_contract ON public.contract_user_access(contract_id);
CREATE INDEX IF NOT EXISTS idx_branch_user_access_user ON public.branch_user_access(user_id);
CREATE INDEX IF NOT EXISTS idx_branch_user_access_branch ON public.branch_user_access(branch_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_contract ON public.service_jobs(contract_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_site_company ON public.service_jobs(site_company_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_bill_to_company ON public.service_jobs(bill_to_company_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_service_category ON public.service_jobs(service_category);

-- 3) RLS helper functions ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_contract_access(p_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT public.is_oata_staff()
    OR EXISTS (
      SELECT 1
      FROM public.contract_user_access cua
      WHERE cua.contract_id = p_contract_id
        AND cua.user_id = auth.uid()
        AND cua.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      WHERE c.id = p_contract_id
        AND c.owner_company_id = public.get_my_company_id()
        AND c.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.has_branch_access(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT public.is_oata_staff()
    OR EXISTS (
      SELECT 1
      FROM public.branch_user_access bua
      WHERE bua.branch_id = p_branch_id
        AND bua.user_id = auth.uid()
        AND bua.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = p_branch_id
        AND b.company_id = public.get_my_company_id()
        AND b.status = 'active'
    );
$$;

-- 4) Grants and RLS ----------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_branches TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_user_access TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_user_access TO authenticated, service_role;
GRANT SELECT ON public.contracts TO anon;
GRANT SELECT ON public.contract_branches TO anon;
GRANT EXECUTE ON FUNCTION public.has_contract_access(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_branch_access(UUID) TO authenticated, service_role;

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_user_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_staff_all" ON public.contracts;
DROP POLICY IF EXISTS "contracts_client_read" ON public.contracts;
CREATE POLICY "contracts_staff_all" ON public.contracts FOR ALL TO authenticated USING (public.is_oata_staff()) WITH CHECK (public.is_oata_staff());
CREATE POLICY "contracts_client_read" ON public.contracts FOR SELECT TO authenticated USING (public.has_contract_access(id));

DROP POLICY IF EXISTS "contract_branches_staff_all" ON public.contract_branches;
DROP POLICY IF EXISTS "contract_branches_client_read" ON public.contract_branches;
CREATE POLICY "contract_branches_staff_all" ON public.contract_branches FOR ALL TO authenticated USING (public.is_oata_staff()) WITH CHECK (public.is_oata_staff());
CREATE POLICY "contract_branches_client_read" ON public.contract_branches FOR SELECT TO authenticated USING (public.has_contract_access(contract_id) OR public.has_branch_access(branch_id));

DROP POLICY IF EXISTS "contract_user_access_staff_all" ON public.contract_user_access;
DROP POLICY IF EXISTS "contract_user_access_self_read" ON public.contract_user_access;
CREATE POLICY "contract_user_access_staff_all" ON public.contract_user_access FOR ALL TO authenticated USING (public.is_oata_staff()) WITH CHECK (public.is_oata_staff());
CREATE POLICY "contract_user_access_self_read" ON public.contract_user_access FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "branch_user_access_staff_all" ON public.branch_user_access;
DROP POLICY IF EXISTS "branch_user_access_self_read" ON public.branch_user_access;
CREATE POLICY "branch_user_access_staff_all" ON public.branch_user_access FOR ALL TO authenticated USING (public.is_oata_staff()) WITH CHECK (public.is_oata_staff());
CREATE POLICY "branch_user_access_self_read" ON public.branch_user_access FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Additive job visibility policy. Existing OATA/admin policies remain.
DROP POLICY IF EXISTS "service_jobs_contract_client_read" ON public.service_jobs;
CREATE POLICY "service_jobs_contract_client_read" ON public.service_jobs
FOR SELECT TO authenticated
USING (
  public.is_oata_staff()
  OR (contract_id IS NOT NULL AND public.has_contract_access(contract_id))
  OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
  OR (site_company_id IS NOT NULL AND site_company_id = public.get_my_company_id())
);

-- 5) Demo data: West Walk + restaurants -------------------------------------
DO $$
DECLARE
  west_walk_id UUID;
  burger_id UUID;
  sushi_id UUID;
  outside_branch_id UUID;
  burger_branch_id UUID;
  sushi_branch_id UUID;
  v_contract_id UUID;
  equipment_burger_id UUID;
  equipment_sushi_id UUID;
  equipment_outside_id UUID;
BEGIN
  INSERT INTO public.companies (name, legal_name, company_type, country, status, notes)
  SELECT 'West Walk Real Estate', 'West Walk Real Estate', 'client', 'Qatar', 'active', 'Corporate client for West Walk hood-cleaning contract.'
  WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE name = 'West Walk Real Estate');
  SELECT id INTO west_walk_id FROM public.companies WHERE name = 'West Walk Real Estate' ORDER BY created_at LIMIT 1;

  INSERT INTO public.companies (name, legal_name, company_type, country, status, notes)
  SELECT 'West Walk Burger House', 'West Walk Burger House', 'client', 'Qatar', 'active', 'Restaurant tenant inside West Walk.'
  WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE name = 'West Walk Burger House');
  SELECT id INTO burger_id FROM public.companies WHERE name = 'West Walk Burger House' ORDER BY created_at LIMIT 1;

  INSERT INTO public.companies (name, legal_name, company_type, country, status, notes)
  SELECT 'West Walk Sushi Kitchen', 'West Walk Sushi Kitchen', 'client', 'Qatar', 'active', 'Restaurant tenant inside West Walk.'
  WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE name = 'West Walk Sushi Kitchen');
  SELECT id INTO sushi_id FROM public.companies WHERE name = 'West Walk Sushi Kitchen' ORDER BY created_at LIMIT 1;

  INSERT INTO public.branches (company_id, name, branch_code, address, city, country, contact_name, status, notes)
  SELECT burger_id, 'Burger House - West Walk', 'WW-BURGER-01', 'West Walk, Doha', 'Doha', 'Qatar', 'Restaurant Manager', 'active', 'Tenant branch covered under West Walk hood-cleaning contract.'
  WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_code = 'WW-BURGER-01');
  SELECT id INTO burger_branch_id FROM public.branches WHERE branch_code = 'WW-BURGER-01' LIMIT 1;

  INSERT INTO public.branches (company_id, name, branch_code, address, city, country, contact_name, status, notes)
  SELECT sushi_id, 'Sushi Kitchen - West Walk', 'WW-SUSHI-01', 'West Walk, Doha', 'Doha', 'Qatar', 'Restaurant Manager', 'active', 'Tenant branch covered under West Walk hood-cleaning contract.'
  WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_code = 'WW-SUSHI-01');
  SELECT id INTO sushi_branch_id FROM public.branches WHERE branch_code = 'WW-SUSHI-01' LIMIT 1;

  INSERT INTO public.branches (company_id, name, branch_code, address, city, country, contact_name, status, notes)
  SELECT burger_id, 'Burger House - The Pearl', 'BH-PEARL-01', 'The Pearl, Doha', 'Doha', 'Qatar', 'Restaurant Manager', 'active', 'Direct restaurant branch outside West Walk; West Walk must not see this branch.'
  WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_code = 'BH-PEARL-01');
  SELECT id INTO outside_branch_id FROM public.branches WHERE branch_code = 'BH-PEARL-01' LIMIT 1;

  INSERT INTO public.contracts (contract_name, owner_company_id, service_category, contract_type, status, billing_model, notes)
  SELECT 'West Walk Kitchen Hood Cleaning Contract', west_walk_id, 'hood_cleaning', 'corporate_tenant_contract', 'active', 'corporate_contract', 'West Walk can see only hood-cleaning jobs attached to this contract.'
  WHERE NOT EXISTS (SELECT 1 FROM public.contracts WHERE contract_name = 'West Walk Kitchen Hood Cleaning Contract');
  SELECT id INTO v_contract_id FROM public.contracts WHERE contract_name = 'West Walk Kitchen Hood Cleaning Contract' LIMIT 1;

  INSERT INTO public.contract_branches (contract_id, branch_id, tenant_company_id, status, notes)
  VALUES
    (v_contract_id, burger_branch_id, burger_id, 'active', 'Burger House West Walk branch is covered.'),
    (v_contract_id, sushi_branch_id, sushi_id, 'active', 'Sushi Kitchen West Walk branch is covered.')
  ON CONFLICT (contract_id, branch_id) DO NOTHING;

  INSERT INTO public.equipment (company_id, branch_id, asset_code, qr_code, service_category, equipment_name, location_description, status, notes)
  SELECT burger_id, burger_branch_id, 'WW-BURGER-HOOD-01', 'QR-WW-BURGER-HOOD-01', 'hood_cleaning', 'Main Kitchen Hood System', 'Burger House West Walk main kitchen', 'active', 'Covered under West Walk hood-cleaning contract.'
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE asset_code = 'WW-BURGER-HOOD-01');
  SELECT id INTO equipment_burger_id FROM public.equipment WHERE asset_code = 'WW-BURGER-HOOD-01' LIMIT 1;

  INSERT INTO public.equipment (company_id, branch_id, asset_code, qr_code, service_category, equipment_name, location_description, status, notes)
  SELECT sushi_id, sushi_branch_id, 'WW-SUSHI-HOOD-01', 'QR-WW-SUSHI-HOOD-01', 'hood_cleaning', 'Sushi Kitchen Hood System', 'Sushi Kitchen West Walk hot line', 'active', 'Covered under West Walk hood-cleaning contract.'
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE asset_code = 'WW-SUSHI-HOOD-01');
  SELECT id INTO equipment_sushi_id FROM public.equipment WHERE asset_code = 'WW-SUSHI-HOOD-01' LIMIT 1;

  INSERT INTO public.equipment (company_id, branch_id, asset_code, qr_code, service_category, equipment_name, location_description, status, notes)
  SELECT burger_id, outside_branch_id, 'BH-PEARL-FRYER-01', 'QR-BH-PEARL-FRYER-01', 'kitchen_equipment', 'Gas Fryer', 'Burger House Pearl branch kitchen', 'active', 'Direct restaurant work outside West Walk visibility.'
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE asset_code = 'BH-PEARL-FRYER-01');
  SELECT id INTO equipment_outside_id FROM public.equipment WHERE asset_code = 'BH-PEARL-FRYER-01' LIMIT 1;

  INSERT INTO public.service_jobs (
    company_id, branch_id, equipment_id, contract_id, service_category,
    requested_by_company_id, bill_to_company_id, site_company_id, visibility_scope,
    job_number, job_type, priority, status, complaint, scope_of_work, recommendations
  )
  SELECT west_walk_id, burger_branch_id, equipment_burger_id, v_contract_id, 'hood_cleaning',
    west_walk_id, west_walk_id, burger_id, 'contract',
    'JOB-WW-HOOD-001', 'hood_cleaning', 'normal', 'assigned',
    'Scheduled hood and exhaust cleaning under West Walk contract.',
    'Clean canopy, filters, accessible duct section, and exhaust fan; provide before/after photos and certificate.',
    'Restaurant branch to confirm access timing before visit.'
  WHERE NOT EXISTS (SELECT 1 FROM public.service_jobs WHERE job_number = 'JOB-WW-HOOD-001');

  INSERT INTO public.service_jobs (
    company_id, branch_id, equipment_id, contract_id, service_category,
    requested_by_company_id, bill_to_company_id, site_company_id, visibility_scope,
    job_number, job_type, priority, status, complaint, scope_of_work, recommendations
  )
  SELECT west_walk_id, sushi_branch_id, equipment_sushi_id, v_contract_id, 'hood_cleaning',
    west_walk_id, west_walk_id, sushi_id, 'contract',
    'JOB-WW-HOOD-002', 'hood_cleaning', 'urgent', 'created',
    'Heavy grease accumulation reported at sushi hot line hood.',
    'Inspect hood, filters, duct access, and fan; clean under West Walk contract if access is available.',
    'Check if cleaning frequency should be increased for this tenant.'
  WHERE NOT EXISTS (SELECT 1 FROM public.service_jobs WHERE job_number = 'JOB-WW-HOOD-002');

  INSERT INTO public.service_jobs (
    company_id, branch_id, equipment_id, contract_id, service_category,
    requested_by_company_id, bill_to_company_id, site_company_id, visibility_scope,
    job_number, job_type, priority, status, complaint, scope_of_work, recommendations
  )
  SELECT burger_id, outside_branch_id, equipment_outside_id, NULL, 'kitchen_equipment',
    burger_id, burger_id, burger_id, 'company',
    'JOB-BH-DIRECT-001', 'kitchen_equipment', 'high', 'created',
    'Gas fryer not reaching temperature at Burger House Pearl branch.',
    'Diagnose fryer thermostat, gas pressure, burner, and safety controls.',
    'Direct restaurant job; West Walk must not see this work.'
  WHERE NOT EXISTS (SELECT 1 FROM public.service_jobs WHERE job_number = 'JOB-BH-DIRECT-001');
END $$;

SELECT 'OATA contract client/sub-client model installed' AS status;
