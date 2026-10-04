import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

// pdfmake 0.2.x ships fonts as a flat map of filename -> base64.
pdfMake.vfs = pdfFonts as unknown as Record<string, string>;

const TEAL = "#123747";
const CYAN = "#327482";
const GOLD = "#D6A641";
const SLATE = "#334155";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

type PdfJob = {
  job_number?: string | null;
  job_type?: string;
  service_category?: string | null;
  priority?: string;
  complaint?: string | null;
  scope_of_work?: string | null;
  diagnosis?: string | null;
  root_cause?: string | null;
  work_performed?: string | null;
  recommendations?: string | null;
  created_at?: string | null;
  scheduled_at?: string | null;
  on_site_at?: string | null;
  completed_at?: string | null;
  closed_at?: string | null;
  client_signoff_name?: string | null;
  client_signoff_at?: string | null;
  verification_result?: string | null;
  report_status?: string | null;
};

export type PdfReport = {
  job: PdfJob;
  company_name?: string | null;
  branch_name?: string | null;
  branch_code?: string | null;
  equipment_name?: string | null;
  asset_code?: string | null;
  technician_name?: string | null;
  leadman_name?: string | null;
  photos?: { photo_type: string }[];
  history?: { old_status: string | null; new_status: string; change_reason: string | null; created_at: string }[];
};

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function section(title: string, value: string | null | undefined) {
  if (!value) return null;
  return {
    margin: [0, 10, 0, 0],
    table: {
      widths: ["*"],
      body: [
        [{ text: title.toUpperCase(), style: "sectionLabel", fillColor: "#f8fafc", border: [true, true, true, true], borderColor: [LINE, LINE, LINE, LINE] }],
        [{ text: value, style: "body", border: [true, true, true, true], borderColor: [LINE, LINE, LINE, LINE] }],
      ],
    },
    layout: { defaultBorder: false, hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
  } as any;
}

export function downloadReportPdf(report: PdfReport) {
  const job = report.job ?? {};
  const reportTitle = job.job_number
    ? `${job.job_number} — ${labelize(job.service_category ?? job.job_type ?? "service")}`
    : `${labelize(job.service_category ?? job.job_type ?? "service")} Report`;

  const cells: [string, string][] = [
    ["Client", report.company_name ?? "—"],
    ["Branch / Site", report.branch_name ? `${report.branch_name}${report.branch_code ? ` · ${report.branch_code}` : ""}` : "—"],
    ["Equipment / Asset", report.equipment_name ? `${report.equipment_name}${report.asset_code ? ` · ${report.asset_code}` : ""}` : "—"],
    ["Created", fmt(job.created_at)],
    ["Scheduled", fmt(job.scheduled_at)],
    ["Technician on site", fmt(job.on_site_at)],
    ["Completed", fmt(job.completed_at)],
    ["Closed", fmt(job.closed_at)],
    ["Technician", report.technician_name ?? "—"],
  ];

  const summaryRows: any[][] = [];
  for (let i = 0; i < cells.length; i += 3) {
    summaryRows.push(
      cells.slice(i, i + 3).map(([label, value]) => ({
        stack: [
          { text: label.toUpperCase(), style: "cellLabel" },
          { text: value, style: "cellValue" },
        ],
        border: [true, true, true, true],
        borderColor: [LINE, LINE, LINE, LINE],
        margin: [0, 0, 6, 6],
        fillColor: "#ffffff",
      })),
    );
  }

  const photoSummary = (report.photos ?? []).reduce<Record<string, number>>((acc, p) => {
    const key = labelize(p.photo_type);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const photoText = Object.entries(photoSummary)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");

  const timeline = (report.history ?? []).map((step, i) => ({
    margin: [0, 2, 0, 0],
    columns: [
      { width: 20, text: String(i + 1), style: "timelineIndex" },
      {
        width: "*",
        stack: [
          { text: `${step.old_status ? `${labelize(step.old_status)} → ` : ""}${labelize(step.new_status)}`, style: "timelineStatus" },
          ...(step.change_reason ? [{ text: step.change_reason, style: "timelineReason" }] : []),
          { text: fmt(step.created_at), style: "timelineDate" },
        ],
      },
    ],
  }));

  const content: any[] = [
    // Header band
    {
      table: {
        widths: ["*"],
        body: [[
          {
            stack: [
              { text: "OATA MAINTENANCE & CLEANING", color: "#9deaf2", fontSize: 8, letterSpacing: 2, bold: true },
              { text: "Service Report & Certificate", color: "#ffffff", fontSize: 20, bold: true, margin: [0, 4, 0, 0] },
              { text: `${report.company_name ?? "Client"} · Report status: ${labelize(job.report_status ?? "ready")}`, color: "#cbd5e1", fontSize: 9, margin: [0, 4, 0, 0] },
            ],
            border: [false, false, false, true],
            borderColor: [GOLD, GOLD, GOLD, GOLD],
            fillColor: TEAL,
            margin: [0, 0, 0, 0],
          },
        ]],
      },
      layout: { defaultBorder: false, paddingLeft: () => 16, paddingRight: () => 16, paddingTop: () => 14, paddingBottom: () => 14, hLineWidth: () => 0, vLineWidth: () => 0 },
    },
    // Title + priority
    {
      margin: [0, 14, 0, 6],
      columns: [
        { text: reportTitle, style: "title", width: "*" },
        { text: `${labelize(job.priority ?? "normal")} priority`.toUpperCase(), style: "priorityBadge", width: "auto" },
      ],
    },
    // Summary grid
    { table: { widths: ["*", "*", "*"], body: summaryRows }, layout: { defaultBorder: false, hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 } },
  ];

  const narrative = [
    section("Complaint / Issue Reported", job.complaint),
    section("Scope of Work", job.scope_of_work),
    section("Diagnosis", job.diagnosis),
    section("Root Cause", job.root_cause),
    section("Work Performed", job.work_performed),
    section("Recommendations", job.recommendations),
  ].filter(Boolean);
  content.push(...narrative);

  if (photoText) {
    content.push({ text: "EVIDENCE PHOTOS", style: "sectionTitle", margin: [0, 14, 0, 2] });
    content.push({ text: photoText, style: "body" });
  }

  if (timeline.length) {
    content.push({ text: "SERVICE TIMELINE", style: "sectionTitle", margin: [0, 14, 0, 4] });
    content.push({ stack: timeline });
  }

  content.push({ text: "VERIFICATION & SIGN-OFF", style: "sectionTitle", margin: [0, 14, 0, 4] });
  content.push({
    columns: [
      {
        width: "*",
        stack: [
          { text: "OATA QUALITY REVIEW", style: "sectionLabel" },
          { text: `Supervisor / Reviewer: ${report.leadman_name ?? "—"}`, style: "cellValue" },
          { text: `Technician: ${report.technician_name ?? "—"}`, style: "body" },
        ],
        border: [true, true, true, true],
        borderColor: [LINE, LINE, LINE, LINE],
        margin: [0, 0, 4, 0],
      },
      {
        width: "*",
        stack: [
          { text: "CLIENT SIGN-OFF", style: "sectionLabel", color: "#065f46" },
          { text: job.client_signoff_name ?? "—", style: "cellValue" },
          { text: fmt(job.client_signoff_at), style: "body" },
          ...(job.verification_result ? [{ text: job.verification_result, style: "body", color: "#065f46" }] : []),
        ],
        border: [true, true, true, true],
        borderColor: ["#a7f3d0", "#a7f3d0", "#a7f3d0", "#a7f3d0"],
        fillColor: "#ecfdf5",
        margin: [4, 0, 0, 0],
      },
    ],
  });

  const docDefinition = {
    pageSize: "A4" as const,
    pageMargins: [40, 40, 40, 56],
    info: {
      title: reportTitle,
      author: "OATA Maintenance and Cleaning",
    },
    content,
    styles: {
      title: { fontSize: 15, bold: true, color: SLATE },
      priorityBadge: { fontSize: 8, bold: true, color: TEAL, alignment: "right", margin: [4, 4, 0, 0] },
      sectionTitle: { fontSize: 10, bold: true, color: CYAN, letterSpacing: 1 },
      sectionLabel: { fontSize: 7, bold: true, color: MUTED, letterSpacing: 0.5 },
      cellLabel: { fontSize: 7, color: MUTED },
      cellValue: { fontSize: 9, bold: true, color: SLATE, margin: [0, 2, 0, 0] },
      body: { fontSize: 9, color: SLATE, lineHeight: 1.4 },
      timelineIndex: { fontSize: 8, bold: true, color: "#ffffff", alignment: "center", background: CYAN, margin: [0, 2, 0, 0], width: 16, height: 16 },
      timelineStatus: { fontSize: 9, bold: true, color: SLATE },
      timelineReason: { fontSize: 8, color: MUTED },
      timelineDate: { fontSize: 7, color: "#94a3b8" },
    },
    defaultStyle: { fontSize: 10, color: SLATE },
    footer: (currentPage: number, pageCount: number) => ({
      margin: [40, 12, 40, 0],
      columns: [
        { text: "OATA Maintenance and Cleaning · Doha, Qatar · care.oata.qa", style: "cellLabel", width: "*" },
        { text: `${currentPage} / ${pageCount}`, style: "cellLabel", alignment: "right", width: "auto" },
      ],
    }),
  };

  const filename = `${job.job_number ?? "work-order"}-report.pdf`;
  pdfMake.createPdf(docDefinition as any).download(filename);
}
