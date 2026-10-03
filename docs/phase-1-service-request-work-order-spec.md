# OATA Care Portal — Phase 1 Technical Specification

**Scope:** Service Request + Hermes Priority + Manager Approval + Work Order MVP  
**Status:** Approved direction — implementation control document  
**Product principle:** Simple at the front. Powerful underneath.  
**OATA operating principle:** Prevent → Detect → Diagnose → Repair → Verify → Document → Prevent recurrence.

---

## 1. Executive Summary

Phase 1 converts OATA Care from a job dashboard into a controlled operating workflow:

```text
Restaurant Staff / Client User
  → Service Request
  → Hermes/OATA Priority Classification
  → Chef / Restaurant Manager Approval
  → OATA Dispatch
  → Work Order
  → Technician Execution
  → Verification
  → Client Sign-off
  → Report / Certificate
  → Closed
```

The foundational rule is:

```text
Service Request ≠ Work Order
```

A **Service Request** is the client-side problem report.  
A **Work Order** is the OATA execution and technical record.

This separation protects OATA operationally, commercially, and legally.

---

## 2. What Phase 1 Includes

Phase 1 includes:

1. Service request database model.
2. Submitter identity capture.
3. Simple restaurant/client request UI.
4. Hermes/OATA priority engine fields.
5. Chef / Manager approval workflow.
6. Controlled emergency bypass.
7. Work order creation from approved requests.
8. Technician execution states.
9. Client sign-off.
10. Basic report readiness state.
11. RLS visibility rules.
12. Audit trail and status history.
13. Acceptance tests for OATA, corporate client, restaurant client, and technician roles.

Phase 1 does **not** include full commercial intelligence, automated dispatch optimization, full report generator, accounting integration, or advanced AI recommendations beyond priority/routing support.

---

## 3. Existing Architecture to Preserve

Do not rebuild or weaken existing foundations:

- Next.js frontend on Vercel.
- Domain: `care.oata.qa`.
- Supabase PostgreSQL / Auth / Storage.
- Cloudflare DNS/security.
- Hermes VPS endpoint: `hermes.oata.qa`.
- Existing pages:
  - `/`
  - `/client`
  - `/technician`
  - `/jobs/[id]`
  - `/equipment`
  - `/equipment/[id]`
- Existing contract visibility model:
  - `contracts`
  - `contract_branches`
  - `contract_user_access`
  - `branch_user_access`
  - job columns: `contract_id`, `service_category`, `requested_by_company_id`, `bill_to_company_id`, `site_company_id`, `visibility_scope`
- Existing security principle:
  - service-role key only server-side.
  - no service-role key in frontend.
  - storage private by default.

---

## 4. Core Entities

### 4.1 Service Request

A service request is created by restaurant staff, a client user, or OATA on behalf of a client.

Purpose:

- Capture the reported problem.
- Capture submitter identity.
- Capture asset/branch/location/photo evidence.
- Let Hermes/OATA classify priority.
- Route to the correct approver.
- Convert to a work order after approval or emergency bypass.

### 4.2 Work Order

A work order is created only after:

- manager approval, or
- controlled emergency bypass by OATA policy.

Purpose:

- Track OATA execution.
- Assign technician/leadman.
- Record diagnosis, root cause, work, evidence, readings, sign-off, and report status.

### 4.3 Approval

An approval is a decision record, not only a status string.

Purpose:

- Store who approved/rejected.
- Store when and why.
- Store authority type.
- Provide audit defense.

### 4.4 Asset History

Asset history must become a first-class operational record.

Every request/work order should strengthen the asset’s history:

```text
Asset
  → PPM
  → Failures
  → Technicians
  → Diagnosis
  → Parts
  → Repairs
  → Costs later
  → Repeat failures
```

---

## 5. Database Specification

### 5.1 New Table: `service_requests`

```sql
CREATE TABLE public.service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT UNIQUE,

  company_id UUID REFERENCES public.companies(id),
  branch_id UUID REFERENCES public.branches(id),
  equipment_id UUID REFERENCES public.equipment(id),
  contract_id UUID REFERENCES public.contracts(id),

  service_category TEXT NOT NULL,
  problem_category TEXT NOT NULL,
  submitted_from_area TEXT,
  description TEXT NOT NULL,

  submitted_by_user_id UUID REFERENCES public.profiles(id),
  submitted_by_name_snapshot TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  hermes_priority TEXT,
  hermes_priority_reason TEXT,
  hermes_priority_confidence TEXT,
  hermes_priority_rule TEXT,
  hermes_priority_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'submitted',

  manager_approval_status TEXT DEFAULT 'pending',
  approved_by_user_id UUID REFERENCES public.profiles(id),
  approved_by_name_snapshot TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by_user_id UUID REFERENCES public.profiles(id),
  rejected_by_name_snapshot TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  emergency_bypass BOOLEAN NOT NULL DEFAULT false,
  emergency_bypass_by UUID REFERENCES public.profiles(id),
  emergency_bypass_reason TEXT,
  emergency_bypass_at TIMESTAMPTZ,

  converted_work_order_id UUID,
  converted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Required indexes

```sql
CREATE INDEX idx_service_requests_company ON public.service_requests(company_id);
CREATE INDEX idx_service_requests_branch ON public.service_requests(branch_id);
CREATE INDEX idx_service_requests_equipment ON public.service_requests(equipment_id);
CREATE INDEX idx_service_requests_contract ON public.service_requests(contract_id);
CREATE INDEX idx_service_requests_status ON public.service_requests(status);
CREATE INDEX idx_service_requests_submitted_at ON public.service_requests(submitted_at DESC);
```

---

### 5.2 New Table: `service_request_media`

For photos/videos attached at request stage.

```sql
CREATE TABLE public.service_request_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'job-photos',
  storage_path TEXT NOT NULL,
  caption TEXT,
  uploaded_by UUID REFERENCES public.profiles(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### 5.3 New Table: `request_approvals`

Approval records for service requests.

```sql
CREATE TABLE public.request_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  approval_type TEXT NOT NULL,
  required_role TEXT,
  requested_by UUID REFERENCES public.profiles(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision TEXT NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES public.profiles(id),
  decided_by_name_snapshot TEXT,
  decided_at TIMESTAMPTZ,
  comment TEXT,
  amount_qar NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'QAR'
);
```

---

### 5.4 New Table: `job_status_history`

Immutable operational timeline.

```sql
CREATE TABLE public.job_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- service_request or service_job
  entity_id UUID NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES public.profiles(id),
  changed_by_name_snapshot TEXT,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Important: normal users should not edit/delete this table.

---

### 5.5 Extend Existing `service_jobs`

The existing `service_jobs` table should be treated as the Phase 1 work order table unless/until OATA decides to rename to `work_orders`.

Add columns if missing:

```sql
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS service_request_id UUID REFERENCES public.service_requests(id);
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS on_site_at TIMESTAMPTZ;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS verification_result TEXT;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS report_status TEXT DEFAULT 'not_started';
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS report_generated_at TIMESTAMPTZ;
ALTER TABLE public.service_jobs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
```

---

## 6. Status Models

### 6.1 Service Request Statuses

```text
submitted
priority_assigned
awaiting_manager_approval
approved
rejected
emergency_dispatched
converted_to_work_order
cancelled
```

Rules:

- `submitted` → request created.
- `priority_assigned` → Hermes/OATA priority fields populated.
- `awaiting_manager_approval` → chef/manager must decide.
- `approved` → may become work order.
- `rejected` → no work order unless OATA overrides.
- `emergency_dispatched` → emergency bypass used.
- `converted_to_work_order` → linked work order exists.
- `cancelled` → admin/OATA-cancelled.

### 6.2 Work Order Statuses

Recommended Phase 1 statuses:

```text
created
assigned
accepted
on_site
diagnosing
awaiting_quote_approval
approved_for_repair
in_progress
verification
awaiting_client_signoff
completed
report_generated
closed
cancelled
on_hold
client_disputed
parts_required
```

Rules:

- Avoid overloading `completed`; completion does not mean closed.
- `closed` should mean report/certificate/sign-off requirements are complete.
- `client_disputed` must pause closure.

---

## 7. Approval Matrix

| Event | Required approver | Notes |
|---|---|---|
| Staff service request | Chef / Restaurant Manager / branch authorized user | Staff cannot self-approve normal requests. |
| Emergency request | OATA dispatch may bypass, manager notified | Bypass reason required. |
| Chargeable repair | Authorized client approver | Approval amount and comment required. |
| High-value repair | GM / Finance / senior authorized client approver | Threshold defined per contract later. |
| Completion sign-off | Branch manager / chef / authorized site user | Sign-off name snapshot required. |
| Invoice package | Client finance / GM | Phase 3+ commercial workflow. |

Phase 1 must implement request approval and completion sign-off. Quote/repair approval can be a basic approval record and expanded later.

---

## 8. Hermes Priority Engine

Priority must be rules-first, not free-form LLM judgment.

### 8.1 Priority values

```text
emergency
urgent
normal
planned
ppm
```

### 8.2 Evaluation factors

Hermes/OATA should evaluate:

1. Safety risk.
2. Food safety / product loss.
3. Business interruption.
4. Asset criticality.
5. Contract SLA.
6. Time/day operational context.
7. Repeat failures.
8. Service category.
9. Client/branch criticality.

### 8.3 Priority output

Every priority decision must store:

```text
priority
reason
confidence
rule_matched
classified_at
```

Example:

```text
Priority: urgent
Reason: Main fryer unavailable during operating hours; business interruption risk.
Rule matched: critical_cooking_equipment_failure
Confidence: high
```

### 8.4 Override rule

Authorized OATA management can override priority, but must store:

```text
old_priority
new_priority
overridden_by
override_reason
overridden_at
```

---

## 9. SLA Model

Priority alone is not enough.

SLA target should be calculated as:

```text
contract SLA + service category + priority + operating context
```

Phase 1 minimum fields can be added later to `service_requests` and/or `service_jobs`:

```text
sla_response_due_at
sla_resolution_due_at
sla_source
sla_status
```

Minimum SLA statuses:

```text
not_applicable
on_track
at_risk
breached
paused
```

Contract-specific SLA must eventually override generic OATA defaults.

---

## 10. UI Specification

### 10.1 Restaurant Staff Request UI

Route suggestion:

```text
/client/request
```

Mobile-first. Very simple.

Fields:

- Branch/location auto-detected from login/QR where possible.
- Asset selected or populated from QR.
- Problem category.
- Short description.
- Photo/video upload.
- Staff name if guest/quick mode.
- Submit.

Do **not** show:

- manual priority dropdown.
- diagnosis.
- root cause.
- technician assignment.
- internal notes.
- OATA cost/margin.

### 10.2 Manager Approval UI

Route suggestion:

```text
/client/approvals
```

Show:

- Submitted by.
- Branch.
- Asset.
- Problem.
- Photos/video.
- Hermes priority.
- Priority reason.
- Approve request.
- Reject request.

Do not use restaurant staff as a normal clarification channel. Internal `info_required` may exist but should route through manager/OATA coordination.

### 10.3 OATA Dispatch UI

Can start inside main dashboard.

Show:

- approved requests waiting for work order.
- emergency bypass requests.
- branch/client/contract.
- priority and reason.
- create/assign work order.

### 10.4 Technician UI

The technician UI should remain mobile-first:

- today jobs.
- start job.
- QR scan.
- before photos.
- checklist.
- readings.
- diagnosis/root cause.
- parts request.
- after photos.
- verification.
- client signature.
- submit report.

Technicians should not navigate through manager/admin dashboards.

---

## 11. Report / Certificate Schema

### 11.1 Kitchen Equipment / Technical Report

Required fields:

- complaint/symptom.
- asset details.
- diagnosis.
- root cause.
- work performed.
- parts used.
- measurements/readings.
- verification result.
- recommendations.
- before/after photos where applicable.
- technician.
- date/time.
- client sign-off.

### 11.2 Hood / Ecology Cleaning Report

Required fields:

- cleaning scope.
- method.
- chemicals/equipment used.
- before photos.
- after photos.
- grease level / condition.
- access limitations.
- defects found.
- recommendations.
- leadman.
- technicians.
- certificate status.
- next due date.
- client sign-off.

---

## 12. RLS / Security Requirements

### 12.1 OATA staff

OATA staff can see operational data according to role. Admin/manager can see all.

### 12.2 Corporate client

Corporate client users see only:

```text
contract_id in contract_user_access
AND branch_id in contract_branches
AND service_category allowed by contract
```

Example: West Walk sees West Walk hood-cleaning contract jobs only.

### 12.3 Restaurant client

Restaurant users see:

```text
own company jobs
OR permitted branch jobs
OR contract jobs at their own branch
```

They must not see other restaurants.

### 12.4 Technician

Technicians see assigned jobs and required asset/service details only.

### 12.5 Storage

Photos, videos, reports, and certificates are private by default. Use signed URLs or authorized server/API routes.

---

## 13. API / Server Action Contracts

Phase 1 should avoid exposing service role in frontend.

Recommended server actions/API routes:

```text
POST /api/service-requests
POST /api/service-requests/[id]/classify-priority
POST /api/service-requests/[id]/approve
POST /api/service-requests/[id]/reject
POST /api/service-requests/[id]/emergency-dispatch
POST /api/service-requests/[id]/convert-to-work-order
POST /api/work-orders/[id]/status
POST /api/work-orders/[id]/signoff
```

Each route must:

- verify user session.
- verify role/access.
- write audit/status history.
- return safe user-facing data only.

---

## 14. Audit Requirements

Record:

- who submitted every request.
- submitter name snapshot.
- Hermes priority decision.
- priority override.
- manager approval/rejection.
- emergency bypass.
- work order creation.
- technician assignment.
- status changes.
- quote/repair approval.
- client sign-off.
- report generation.

Important audit rows should be immutable in the normal UI.

---

## 15. Acceptance Tests

### 15.1 Service request creation

- Restaurant staff can create a request with description and submitter name.
- No priority dropdown appears.
- Request records submitter snapshot.
- Photo upload creates private storage object and media row.

### 15.2 Hermes priority

- Request receives priority, reason, confidence, and rule.
- Manager sees priority before approval.
- OATA admin can override with required reason.

### 15.3 Manager approval

- Chef/manager can approve own branch request.
- Chef/manager can reject own branch request with reason.
- Staff cannot approve their own request unless they also have an authorized manager role.

### 15.4 Work order conversion

- Approved request can convert to service job/work order.
- Converted work order links back to request.
- Request status becomes `converted_to_work_order`.

### 15.5 Emergency bypass

- Emergency request can be dispatched by authorized OATA user.
- Bypass reason is mandatory.
- Manager notification/audit row is recorded.

### 15.6 Visibility

- OATA admin sees all.
- West Walk user sees only West Walk contract hood-cleaning jobs/requests.
- West Walk user does not see Burger House direct fryer repair outside contract.
- Burger House user sees Burger House West Walk hood job and Burger House direct jobs.
- Sushi Kitchen user does not see Burger House jobs.
- Technician sees assigned work orders only.

### 15.7 Report readiness

- Work order cannot close without required sign-off/report readiness state.
- Hood-cleaning jobs require before/after evidence before certificate readiness.

---

## 16. Phase 1 Build Order

1. Add migration for `service_requests`, `service_request_media`, `request_approvals`, `job_status_history`, and service job extensions.
2. Add RLS policies and helper checks.
3. Add API/server actions for request creation and approval.
4. Add `/client/request` UI.
5. Add `/client/approvals` UI.
6. Add OATA dispatch queue section in dashboard.
7. Add request-to-work-order conversion.
8. Add technician status transitions as needed.
9. Add acceptance tests / manual verification script.
10. Deploy to Vercel and test with OATA admin + sample client users.

---

## 17. Non-Negotiable Rules

- Do not put service role keys in frontend.
- Do not weaken RLS to make UI easier.
- Do not let restaurant staff manually set priority.
- Do not let corporate clients see restaurant direct jobs outside their contract.
- Do not let technicians use management screens as their primary workflow.
- Do not create work orders from normal staff requests before manager approval unless emergency bypass is authorized and logged.
- Do not mark jobs closed without verification, sign-off/report readiness, and audit history.

---

## 18. Implementation Decision

This document is approved as the Phase 1 control spec. Coding agents should implement only this Phase 1 scope before expanding to SLA intelligence, commercial controls, full reports/certificates, or advanced Hermes automation.
