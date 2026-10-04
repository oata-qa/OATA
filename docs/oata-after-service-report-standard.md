# OATA After-Service Report Standard

Source example reviewed:

```text
/Users/abdirahmanhashi/Desktop/OATA/OPS/WEST WALK/REPORTS/Ecology Cleaning 2/Khashoka/2026-04-21/OATA_KashokaRestaurant_After_Service_Report_2026-04-21.pdf
```

Example report:

```text
OATA_KashokaRestaurant_After_Service_Report_2026-04-21.pdf
Client: KHASHOKA
Site: West Walk-Doha, Qatar
Service date: 21st April, 2026
Service type: Kitchen Hood / Duct / Exhaust / Ecology Cleaning
Report pages: 18
```

## Important workflow correction

Do **not** present the main review stage as "Leadman Review".

Correct portal language:

```text
Execution → Supervisor Review → Client Sign-off → Report
```

Use these labels:

- `Supervisor Review`
- `Technical / Quality Review`
- `Supervisor / Reviewer`
- `Awaiting Supervisor Review`

Leadmen are cleaning field supervisors and may perform operational cleaning QC. Technical verification belongs to the correct supervisor/head based on service type:

| Service type | Correct reviewer |
|---|---|
| Kitchen equipment / hot / coffee | Head of Technical — Kitchen Equipment |
| Refrigeration / cold equipment | HVAC & Ecology Supervisor |
| HVAC/R | HVAC & Ecology Supervisor |
| Ecology technical defects / fan / ventilation issue | HVAC & Ecology Supervisor |
| Hood / duct / grease trap / water tank cleaning | Cleaning Leadman operational QC, escalated to Technical Supervisor if defects are found |

Backend fields may still use legacy names such as `leadman_id`, `awaiting_leadman_review`, or `leadman_approve` until a safe migration is planned. User-facing UI and reports should use supervisor/reviewer language.

## Report structure from Kashoka example

### Page 1 — Certificate + technical summary

The first page acts as both an after-service report and completion certificate.

It includes:

- OATA header and contact details
- Title: `AFTER SERVICE REPORT & COMPLETION CERTIFICATE`
- OATA branding line
- Certificate of service completion
- Client name
- Service date
- Report number
- Site / location
- Service type
- Next cleaning due date
- Service scope
- Work duration / crew
- Completion declaration
- Cleaning certificate section
- Execution date
- Service location
- Service description
- Cleaning standard
- Scope performed
- Service assessment
- Recommendation
- Technical after-service summary table

### Technical after-service summary table

The table should include at least:

| Column | Purpose |
|---|---|
| Area / Component | Hood, baffle filters, duct system, exhaust fan, access panels, ecology unit, etc. |
| Before Condition / Finding | Dirt/grease level, access issue, defect, unsafe observation, abnormal condition |
| Service Completed / After Status | What OATA cleaned/repaired/verified and after-service condition |
| Recommendation | Cleaning frequency, further technical inspection, repair recommendation, access requirement |

For ecology/hood reports, examples include:

- Hood & baffle filters
- Duct system
- Exhaust fan
- Access panels
- Grease accumulation condition
- Cleaning/degreasing status
- Recommended next cleaning date

## Photo record standard

The Kashoka example uses a strong before/after photo evidence format.

Observed structure:

- Pages 2–17: four photos per page
- Each page has two photo sets
- Each photo set has one BEFORE photo and one AFTER photo
- Layout is a 2x2 grid:

```text
Photo Set N — BEFORE        Photo Set N — AFTER
[before image]              [after image]

Photo Set N+1 — BEFORE      Photo Set N+1 — AFTER
[before image]              [after image]
```

- Page header repeats:

```text
BEFORE / AFTER PHOTO RECORD — [CLIENT] — [SERVICE DATE]
```

- Footer repeats OATA contact line and page number.

### Portal report requirement

OATA Care Portal reports should generate photo evidence in this same style:

1. Pair before and after photos by component/location when possible.
2. Use numbered photo sets.
3. Show `BEFORE` and `AFTER` labels clearly.
4. Keep two sets per page / four photos per page for readability.
5. If an after photo is missing, show a clear placeholder: `AFTER PHOTO NOT UPLOADED`.
6. Captions should include component/location if available.
7. Use private Supabase signed URLs at render time; do not expose public storage URLs.

## Recommended report sections for portal

For an OATA after-service report, generate sections in this order:

1. Cover/certificate header
2. Client and site details
3. Service details
4. Completion declaration
5. Cleaning/maintenance certificate section
6. Technical / quality review summary
7. Component findings table
8. Recommendations and next service due
9. Before/after photo record
10. Reviewer and client sign-off
11. Footer with OATA contact details and page numbers

## Data required from portal

To reproduce the Kashoka-style report from structured portal data, each work order should store or resolve:

- Client company
- Branch/site/location
- Service date
- Report number
- Service type/category
- Service scope
- Work duration
- Crew/team
- Components/areas serviced
- Before findings
- After status
- Recommendations
- Next cleaning/service due date
- Reviewer/supervisor name
- Client sign-off name/date
- Before/after photo sets

## UI implications

Technician/Cleaning crew upload screens should ask for photo type:

- Before
- After
- Defect
- Nameplate / asset ID
- Safety
- Other

For cleaning/ecology jobs, the upload flow should also ask for:

- Component/area photographed
- Photo set number or pairing reference
- Before/after pairing

This is necessary to produce professional before/after reports automatically.

## Design note

The report should look like an OATA certificate/report, not a generic ticket export.

Use:

- OATA logo and header
- Navy section bars
- Clean certificate-style first page
- Structured tables
- Before/after photo grids
- Page numbers
- OATA contact footer

