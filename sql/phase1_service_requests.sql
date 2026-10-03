-- OATA Care Portal — Phase 1 Service Request + Work Order Foundation
-- Safe additive migration. Do not drop existing production tables/data.
-- Purpose: Service Request ≠ Work Order foundation with submitter identity,
-- Hermes/OATA priority fields, manager approval, emergency bypass, audit history,
-- and RLS visibility aligned with contract + branch + company access.

-- 0) Required helper functions ------------------------------------------------
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

CREATE OR REPLACE FUNCTION public.get_my_branch_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.has_contract_access(p_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT p_contract_id IS NOT NULL AND (
    public.is_oata_staff()
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
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_branch_access(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT p_branch_id IS NOT NULL AND (
    public.is_oata_staff()
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
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_oata_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_branch_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_contract_access(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_branch_access(UUID) TO authenticated, service_role;

-- 1) Service requests ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT UNIQUE,

  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  equipment_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,

  service_category TEXT NOT NULL,
  problem_category TEXT NOT NULL,
  submitted_from_area TEXT,
  description TEXT NOT NULL,

  submitted_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_by_name_snapshot TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  hermes_priority TEXT,
  hermes_priority_reason TEXT,
  hermes_priority_confidence TEXT,
  hermes_priority_rule TEXT,
  hermes_priority_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'submitted',

  manager_approval_status TEXT DEFAULT 'pending',
  approved_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by_name_snapshot TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_by_name_snapshot TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  emergency_bypass BOOLEAN NOT NULL DEFAULT false,
  emergency_bypass_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  emergency_bypass_reason TEXT,
  emergency_bypass_at TIMESTAMPTZ,

  converted_work_order_id UUID,
  converted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT service_requests_status_check CHECK (status IN (
    'submitted',
    'priority_assigned',
    'awaiting_manager_approval',
    'approved',
    'rejected',
    'emergency_dispatched',
    'converted_to_work_order',
    'cancelled'
  )),
  CONSTRAINT service_requests_manager_approval_status_check CHECK (manager_approval_status IN (
    'pending', 'approved', 'rejected', 'not_required'
  )),
  CONSTRAINT service_requests_priority_check CHECK (
    hermes_priority IS NULL OR hermes_priority IN ('emergency', 'urgent', 'normal', 'planned', 'ppm')
  ),
  CONSTRAINT service_requests_confidence_check CHECK (
    hermes_priority_confidence IS NULL OR hermes_priority_confidence IN ('low', 'medium', 'high')
  )
);

CREATE INDEX IF NOT EXISTS idx_service_requests_company ON public.service_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_branch ON public.service_requests(branch_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_equipment ON public.service_requests(equipment_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_contract ON public.service_requests(contract_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON public.service_requests(status);
CREATE INDEX IF NOT EXISTS idx_service_requests_submitted_at ON public.service_requests(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_submitted_by ON public.service_requests(submitted_by_user_id);

-- 2) Request media ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_request_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'job-photos',
  storage_path TEXT NOT NULL,
  caption TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_request_media_type_check CHECK (media_type IN ('photo', 'video', 'document', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_service_request_media_request ON public.service_request_media(service_request_id);
CREATE INDEX IF NOT EXISTS idx_service_request_media_uploaded_by ON public.service_request_media(uploaded_by);

-- 3) Request approvals --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.request_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  approval_type TEXT NOT NULL,
  required_role TEXT,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision TEXT NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by_name_snapshot TEXT,
  decided_at TIMESTAMPTZ,
  comment TEXT,
  amount_qar NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'QAR',
  CONSTRAINT request_approvals_decision_check CHECK (decision IN ('pending', 'approved', 'rejected', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_request_approvals_request ON public.request_approvals(service_request_id);
CREATE INDEX IF NOT EXISTS idx_request_approvals_decision ON public.request_approvals(decision);
CREATE INDEX IF NOT EXISTS idx_request_approvals_decided_by ON public.request_approvals(decided_by);

-- 4) Immutable status history -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name_snapshot TEXT,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT job_status_history_entity_type_check CHECK (entity_type IN ('service_request', 'service_job'))
);

CREATE INDEX IF NOT EXISTS idx_job_status_history_entity ON public.job_status_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_job_status_history_created_at ON public.job_status_history(created_at DESC);

-- 5) Extend service_jobs as Phase 1 work orders ------------------------------
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS service_request_id UUID REFERENCES public.service_requests(id) ON DELETE SET NULL;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS on_site_at TIMESTAMPTZ;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS verification_result TEXT;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS report_status TEXT DEFAULT 'not_started';
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS report_generated_at TIMESTAMPTZ;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_service_jobs_service_request ON public.service_jobs(service_request_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_report_status ON public.service_jobs(report_status);

-- 6) Numbering + updated_at + history triggers --------------------------------
CREATE OR REPLACE FUNCTION public.set_service_request_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.request_number IS NULL OR NEW.request_number = '' THEN
    NEW.request_number := 'REQ-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 6));
  END IF;

  IF NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_service_request_defaults ON public.service_requests;
CREATE TRIGGER trg_set_service_request_defaults
BEFORE INSERT OR UPDATE ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_service_request_defaults();

CREATE OR REPLACE FUNCTION public.log_service_request_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  actor_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
    INSERT INTO public.job_status_history (
      entity_type, entity_id, old_status, new_status, changed_by, changed_by_name_snapshot, change_reason
    ) VALUES (
      'service_request',
      NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      NEW.status,
      auth.uid(),
      actor_name,
      CASE WHEN TG_OP = 'INSERT' THEN 'Service request created' ELSE 'Service request status changed' END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_service_request_status_change ON public.service_requests;
CREATE TRIGGER trg_log_service_request_status_change
AFTER INSERT OR UPDATE OF status ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.log_service_request_status_change();

CREATE OR REPLACE FUNCTION public.log_service_job_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  actor_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
    INSERT INTO public.job_status_history (
      entity_type, entity_id, old_status, new_status, changed_by, changed_by_name_snapshot, change_reason
    ) VALUES (
      'service_job',
      NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      NEW.status,
      auth.uid(),
      actor_name,
      CASE WHEN TG_OP = 'INSERT' THEN 'Work order created' ELSE 'Work order status changed' END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_service_job_status_change ON public.service_jobs;
CREATE TRIGGER trg_log_service_job_status_change
AFTER INSERT OR UPDATE OF status ON public.service_jobs
FOR EACH ROW
EXECUTE FUNCTION public.log_service_job_status_change();

GRANT EXECUTE ON FUNCTION public.set_service_request_defaults() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_service_request_status_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_service_job_status_change() TO service_role;

-- 7) RLS and grants -----------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.service_requests TO authenticated, service_role;
GRANT SELECT, INSERT ON public.service_request_media TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.request_approvals TO authenticated, service_role;
GRANT SELECT, INSERT ON public.job_status_history TO authenticated, service_role;
GRANT SELECT ON public.service_requests TO anon;

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_status_history ENABLE ROW LEVEL SECURITY;

-- service_requests policies
DROP POLICY IF EXISTS "service_requests_staff_all" ON public.service_requests;
DROP POLICY IF EXISTS "service_requests_client_read" ON public.service_requests;
DROP POLICY IF EXISTS "service_requests_client_insert" ON public.service_requests;
DROP POLICY IF EXISTS "service_requests_client_update_own_pending" ON public.service_requests;

CREATE POLICY "service_requests_staff_all" ON public.service_requests
FOR ALL TO authenticated
USING (public.is_oata_staff())
WITH CHECK (public.is_oata_staff());

CREATE POLICY "service_requests_client_read" ON public.service_requests
FOR SELECT TO authenticated
USING (
  public.is_oata_staff()
  OR submitted_by_user_id = auth.uid()
  OR (contract_id IS NOT NULL AND public.has_contract_access(contract_id))
  OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
  OR (company_id IS NOT NULL AND company_id = public.get_my_company_id())
);

CREATE POLICY "service_requests_client_insert" ON public.service_requests
FOR INSERT TO authenticated
WITH CHECK (
  public.is_oata_staff()
  OR submitted_by_user_id = auth.uid()
  OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
  OR (company_id IS NOT NULL AND company_id = public.get_my_company_id())
  OR (contract_id IS NOT NULL AND public.has_contract_access(contract_id))
);

-- No client direct UPDATE policy in Phase 1 foundation.
-- Approval/status changes must go through OATA-controlled API/server actions
-- or OATA staff policies to prevent browser-side self-approval/status tampering.

-- media policies
DROP POLICY IF EXISTS "service_request_media_staff_all" ON public.service_request_media;
DROP POLICY IF EXISTS "service_request_media_request_access_read" ON public.service_request_media;
DROP POLICY IF EXISTS "service_request_media_request_access_insert" ON public.service_request_media;

CREATE POLICY "service_request_media_staff_all" ON public.service_request_media
FOR ALL TO authenticated
USING (public.is_oata_staff())
WITH CHECK (public.is_oata_staff());

CREATE POLICY "service_request_media_request_access_read" ON public.service_request_media
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = service_request_media.service_request_id
      AND (
        public.is_oata_staff()
        OR sr.submitted_by_user_id = auth.uid()
        OR (sr.contract_id IS NOT NULL AND public.has_contract_access(sr.contract_id))
        OR (sr.branch_id IS NOT NULL AND public.has_branch_access(sr.branch_id))
        OR (sr.company_id IS NOT NULL AND sr.company_id = public.get_my_company_id())
      )
  )
);

CREATE POLICY "service_request_media_request_access_insert" ON public.service_request_media
FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = service_request_media.service_request_id
      AND (
        public.is_oata_staff()
        OR sr.submitted_by_user_id = auth.uid()
        OR (sr.branch_id IS NOT NULL AND public.has_branch_access(sr.branch_id))
        OR (sr.company_id IS NOT NULL AND sr.company_id = public.get_my_company_id())
      )
  )
);

-- request approval policies
DROP POLICY IF EXISTS "request_approvals_staff_all" ON public.request_approvals;
DROP POLICY IF EXISTS "request_approvals_request_access_read" ON public.request_approvals;
DROP POLICY IF EXISTS "request_approvals_request_access_insert" ON public.request_approvals;
DROP POLICY IF EXISTS "request_approvals_authorized_update" ON public.request_approvals;

CREATE POLICY "request_approvals_staff_all" ON public.request_approvals
FOR ALL TO authenticated
USING (public.is_oata_staff())
WITH CHECK (public.is_oata_staff());

CREATE POLICY "request_approvals_request_access_read" ON public.request_approvals
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = request_approvals.service_request_id
      AND (
        public.is_oata_staff()
        OR sr.submitted_by_user_id = auth.uid()
        OR (sr.contract_id IS NOT NULL AND public.has_contract_access(sr.contract_id))
        OR (sr.branch_id IS NOT NULL AND public.has_branch_access(sr.branch_id))
        OR (sr.company_id IS NOT NULL AND sr.company_id = public.get_my_company_id())
      )
  )
);

-- No client direct INSERT/UPDATE policies for approvals in the foundation.
-- Approval mutations must go through server actions or OATA staff policies so authority,
-- amount thresholds, and audit rules can be enforced centrally.

-- history policies: read by related visibility; inserted by SECURITY DEFINER triggers / staff.
DROP POLICY IF EXISTS "job_status_history_staff_all" ON public.job_status_history;
DROP POLICY IF EXISTS "job_status_history_related_read" ON public.job_status_history;
DROP POLICY IF EXISTS "job_status_history_insert" ON public.job_status_history;

CREATE POLICY "job_status_history_staff_all" ON public.job_status_history
FOR ALL TO authenticated
USING (public.is_oata_staff())
WITH CHECK (public.is_oata_staff());

CREATE POLICY "job_status_history_related_read" ON public.job_status_history
FOR SELECT TO authenticated
USING (
  public.is_oata_staff()
  OR (
    entity_type = 'service_request'
    AND EXISTS (
      SELECT 1 FROM public.service_requests sr
      WHERE sr.id = job_status_history.entity_id
        AND (
          sr.submitted_by_user_id = auth.uid()
          OR (sr.contract_id IS NOT NULL AND public.has_contract_access(sr.contract_id))
          OR (sr.branch_id IS NOT NULL AND public.has_branch_access(sr.branch_id))
          OR (sr.company_id IS NOT NULL AND sr.company_id = public.get_my_company_id())
        )
    )
  )
  OR (
    entity_type = 'service_job'
    AND EXISTS (
      SELECT 1 FROM public.service_jobs sj
      WHERE sj.id = job_status_history.entity_id
        AND (
          (sj.contract_id IS NOT NULL AND public.has_contract_access(sj.contract_id))
          OR (sj.branch_id IS NOT NULL AND public.has_branch_access(sj.branch_id))
          OR (sj.site_company_id IS NOT NULL AND sj.site_company_id = public.get_my_company_id())
        )
    )
  )
);

CREATE POLICY "job_status_history_insert" ON public.job_status_history
FOR INSERT TO authenticated
WITH CHECK (public.is_oata_staff() OR changed_by = auth.uid());

SELECT 'OATA Phase 1 service request foundation installed' AS status;
