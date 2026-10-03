import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ReportData } from "./report-service";

const teal = "#123747";
const cyan = "#327482";
const gold = "#D6A641";
const slate = "#334155";
const muted = "#64748b";
const line = "#e2e8f0";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    color: "#0f172a",
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontSize: 10,
  },
  header: {
    backgroundColor: teal,
    color: "#ffffff",
    paddingVertical: 20,
    paddingHorizontal: 40,
    marginHorizontal: -40,
    marginBottom: 24,
    borderBottomWidth: 4,
    borderBottomColor: gold,
  },
  headerBrand: {
    fontSize: 9,
    letterSpacing: 2,
    color: "#9deaf2",
    textTransform: "uppercase",
  },
  headerTitle: {
    fontSize: 20,
    marginTop: 4,
    fontWeight: "bold",
  },
  headerSub: {
    fontSize: 9,
    color: "#cbd5e1",
    marginTop: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 12,
  },
  priorityBadge: {
    fontSize: 8,
    color: teal,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: cyan,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 6,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cell: {
    width: "31%",
    borderWidth: 1,
    borderColor: line,
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
  },
  cellLabel: {
    fontSize: 7,
    color: muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cellValue: {
    fontSize: 9,
    marginTop: 2,
    fontWeight: "bold",
  },
  block: {
    borderWidth: 1,
    borderColor: line,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#f8fafc",
  },
  blockLabel: {
    fontSize: 7,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: muted,
    marginBottom: 4,
  },
  blockText: {
    fontSize: 9,
    lineHeight: 1.5,
    color: slate,
  },
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoBox: {
    width: "48%",
    borderWidth: 1,
    borderColor: line,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 8,
  },
  photoImg: {
    width: "100%",
    height: 120,
    objectFit: "cover",
  },
  photoCap: {
    fontSize: 7,
    color: muted,
    padding: 6,
    textTransform: "uppercase",
  },
  timelineItem: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#f8fafc",
    padding: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  timelineIndex: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: cyan,
    color: "#ffffff",
    fontSize: 8,
    textAlign: "center",
    paddingTop: 3,
  },
  timelineBody: {
    flex: 1,
  },
  timelineStatus: {
    fontSize: 9,
    fontWeight: "bold",
    color: slate,
  },
  timelineReason: {
    fontSize: 8,
    color: muted,
    marginTop: 2,
  },
  timelineDate: {
    fontSize: 7,
    color: "#94a3b8",
    marginTop: 2,
  },
  signoffRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  signoffBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: line,
    borderRadius: 6,
    padding: 10,
  },
  signoffGreen: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    backgroundColor: "#ecfdf5",
    borderRadius: 6,
    padding: 10,
  },
  footer: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: line,
    paddingTop: 10,
    textAlign: "center",
  },
  footerTagline: {
    fontSize: 9,
    fontWeight: "bold",
    color: teal,
  },
  footerMeta: {
    fontSize: 7,
    color: muted,
    marginTop: 3,
  },
});

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Block({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.block}>
      <Text style={styles.blockLabel}>{label}</Text>
      <Text style={styles.blockText}>{value}</Text>
    </View>
  );
}

export function ReportPdf({ report }: { report: ReportData }) {
  const job = report.job;
  const reportTitle = job.job_number
    ? `${job.job_number} — ${labelize(job.service_category ?? job.job_type)}`
    : `${labelize(job.service_category ?? job.job_type)} Report`;

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

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerBrand}>OATA Maintenance & Cleaning</Text>
          <Text style={styles.headerTitle}>Service Report & Certificate</Text>
          <Text style={styles.headerSub}>
            {report.company_name ?? "Client"} · Report status: {labelize(job.report_status ?? "ready")}
          </Text>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.title}>{reportTitle}</Text>
          <Text style={styles.priorityBadge}>{labelize(job.priority)} priority</Text>
        </View>

        <View style={styles.grid}>
          {cells.map(([label, value]) => (
            <View key={label} style={styles.cell}>
              <Text style={styles.cellLabel}>{label}</Text>
              <Text style={styles.cellValue}>{value}</Text>
            </View>
          ))}
        </View>

        <Block label="Complaint / Issue Reported" value={job.complaint} />
        <Block label="Scope of Work" value={job.scope_of_work} />
        <Block label="Diagnosis" value={job.diagnosis} />
        <Block label="Root Cause" value={job.root_cause} />
        <Block label="Work Performed" value={job.work_performed} />
        <Block label="Recommendations" value={job.recommendations} />

        {report.photos.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Evidence Photos</Text>
            <View style={styles.photoRow}>
              {report.photos.map((photo, i) =>
                photo.signed_url ? (
                  <View key={i} style={styles.photoBox}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image src={photo.signed_url} style={styles.photoImg} />
                    <Text style={styles.photoCap}>{labelize(photo.photo_type)}</Text>
                  </View>
                ) : null,
              )}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Service Timeline</Text>
        {report.history.map((step, i) => (
          <View key={i} style={styles.timelineItem}>
            <Text style={styles.timelineIndex}>{i + 1}</Text>
            <View style={styles.timelineBody}>
              <Text style={styles.timelineStatus}>
                {step.old_status ? `${labelize(step.old_status)} → ` : ""}{labelize(step.new_status)}
              </Text>
              {step.change_reason ? <Text style={styles.timelineReason}>{step.change_reason}</Text> : null}
              <Text style={styles.timelineDate}>{fmt(step.created_at)}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Verification & Sign-off</Text>
        <View style={styles.signoffRow}>
          <View style={styles.signoffBox}>
            <Text style={styles.blockLabel}>OATA Quality Review</Text>
            <Text style={styles.cellValue}>Leadman / Reviewer: {report.leadman_name ?? "—"}</Text>
            <Text style={styles.blockText}>Technician: {report.technician_name ?? "—"}</Text>
          </View>
          <View style={styles.signoffGreen}>
            <Text style={styles.blockLabel}>Client Sign-off</Text>
            <Text style={styles.cellValue}>{job.client_signoff_name ?? "—"}</Text>
            <Text style={styles.blockText}>{fmt(job.client_signoff_at)}</Text>
            {job.verification_result ? <Text style={styles.blockText}>{job.verification_result}</Text> : null}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTagline}>Reliable care. Lasting quality.</Text>
          <Text style={styles.footerMeta}>OATA Maintenance and Cleaning · Doha, Qatar · care.oata.qa</Text>
          <Text style={styles.footerMeta}>
            Generated from structured OATA work-order data and valid with the recorded client sign-off.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
