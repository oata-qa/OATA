"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase, badgeClass, statusLabel, categoryLabel } from "@/lib/supabase";
import { downloadReportPdf } from "@/lib/report-pdf";

type ReportJob = {
  job_number: string | null;
  job_type: string;
  service_category: string | null;
  priority: string;
  status: string;
  complaint: string | null;
  scope_of_work: string | null;
  diagnosis: string | null;
  root_cause: string | null;
  work_performed: string | null;
  recommendations: string | null;
  created_at: string | null;
  scheduled_at: string | null;
  accepted_at: string | null;
  on_site_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  client_signoff_name: string | null;
  client_signoff_at: string | null;
  verification_result: string | null;
  report_status: string | null;
};

type ReportPhoto = {
  photo_type: string;
  caption: string | null;
  uploaded_at: string | null;
  signed_url: string | null;
};

type ReportHistory = {
  old_status: string | null;
  new_status: string;
  change_reason: string | null;
  created_at: string;
};

type ReportData = {
  job: ReportJob;
  company_name: string | null;
  branch_name: string | null;
  branch_code: string | null;
  equipment_name: string | null;
  asset_code: string | null;
  technician_name: string | null;
  leadman_name: string | null;
  photos: ReportPhoto[];
  history: ReportHistory[];
};

function fmt(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-QA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Qatar",
  }).format(new Date(value));
}

function block(label: string, value: string | null, tone: "amber" | "blue" | "slate" | "emerald" | "cyan") {
  if (!value) return null;
  const tones: Record<string, string> = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    slate: "border-slate-200 bg-slate-50 text-slate-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-900",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{value}</p>
    </div>
  );
}

export default function ReportPage() {
  const params = useParams();
  const jobId = params?.id as string;
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Your session expired. Please sign in again.");
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/reports/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load report.");
        setLoading(false);
        return;
      }
      setReport(data.report as ReportData);
      setLoading(false);
    }
    load();
  }, [jobId]);

  function downloadPdf() {
    if (!report) return;
    setDownloading(true);
    try {
      downloadReportPdf(report);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#eef5f8] text-[#123747]"><div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm"><p className="text-sm font-semibold">Preparing OATA report...</p><p className="mt-1 text-xs text-slate-400">Loading secure report data.</p></div></main>;
  }

  if (error || !report) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef5f8] px-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-lg font-semibold text-red-700">Report unavailable</p>
          <p className="mt-2 text-sm text-red-600">{error ?? "No report data."}</p>
          <Link href="/" className="mt-4 inline-block rounded-xl bg-slate-950 px-4 py-2 text-sm text-white">Back to Dashboard</Link>
        </div>
      </main>
    );
  }

  const job = report.job;
  const reportTitle = job.job_number
    ? `${job.job_number} — ${categoryLabel(job.service_category ?? job.job_type)}`
    : `${categoryLabel(job.service_category ?? job.job_type)} Report`;

  return (
    <main className="min-h-screen bg-[#eef5f8] px-4 py-6 text-slate-950 print:bg-white print:p-0">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print mx-auto mb-4 flex max-w-4xl items-center justify-between">
        <Link href="/" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">← Dashboard</Link>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="rounded-full bg-[#327482] px-5 py-2 text-sm font-semibold text-white hover:bg-[#2a5f6c] disabled:opacity-60"
          >
            {downloading ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-full bg-[#123747] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1a4b5d]"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      <article className="mx-auto max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl print:max-w-none print:rounded-none print:shadow-none">
        {/* Header */}
        <header className="border-b-4 border-[#D6A641] bg-[#123747] px-8 py-8 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <img src="/oata-logo.png" alt="OATA" className="h-16 w-auto" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9deaf2]">OATA Maintenance & Cleaning</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Service Report & Certificate</h1>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm text-white/80">{report.company_name ?? "Client"}</p>
              <p className="text-xs text-white/60">Report status: {statusLabel(job.report_status ?? "ready")}</p>
            </div>
          </div>
        </header>

        <div className="px-8 py-7">
          {/* Title + priority */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-[-0.03em]">{reportTitle}</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(job.priority)}`}>
              {statusLabel(job.priority)} priority
            </span>
          </div>

          {/* Summary grid */}
          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Client", report.company_name],
              ["Branch / Site", report.branch_name ? `${report.branch_name}${report.branch_code ? ` · ${report.branch_code}` : ""}` : null],
              ["Equipment / Asset", report.equipment_name ? `${report.equipment_name}${report.asset_code ? ` · ${report.asset_code}` : ""}` : null],
              ["Created", fmt(job.created_at)],
              ["Scheduled", fmt(job.scheduled_at)],
              ["Technician on site", fmt(job.on_site_at)],
              ["Completed", fmt(job.completed_at)],
              ["Closed", fmt(job.closed_at)],
              ["Technician", report.technician_name],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-medium">{value ?? "—"}</p>
              </div>
            ))}
          </section>

          {/* Narrative blocks */}
          <section className="mt-6 space-y-3">
            {block("Complaint / Issue Reported", job.complaint, "amber")}
            {block("Scope of Work", job.scope_of_work, "blue")}
            {block("Diagnosis", job.diagnosis, "slate")}
            {block("Root Cause", job.root_cause, "slate")}
            {block("Work Performed", job.work_performed, "emerald")}
            {block("Recommendations", job.recommendations, "cyan")}
          </section>

          {/* Evidence photos */}
          {report.photos.length > 0 && (
            <section className="mt-7">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Evidence Photos</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {report.photos.map((photo, index) => (
                  <figure key={index} className="overflow-hidden rounded-xl border border-slate-200">
                    {photo.signed_url ? (
                      <img src={photo.signed_url} alt={photo.caption ?? photo.photo_type} className="h-44 w-full object-cover" />
                    ) : (
                      <div className="flex h-44 items-center justify-center bg-slate-50 text-slate-300">No image</div>
                    )}
                    <figcaption className="flex items-center justify-between px-3 py-2 text-xs text-slate-500">
                      <span className="font-semibold uppercase tracking-wide">{statusLabel(photo.photo_type)}</span>
                      {photo.uploaded_at && <span>{fmt(photo.uploaded_at)}</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {/* Status timeline */}
          <section className="mt-7">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Service Timeline</h3>
            <ol className="mt-3 space-y-2">
              {report.history.map((step, index) => (
                <li key={index} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#327482] text-xs font-semibold text-white">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      {step.old_status ? `${statusLabel(step.old_status)} → ` : ""}{statusLabel(step.new_status)}
                    </p>
                    {step.change_reason && <p className="mt-0.5 text-xs text-slate-500">{step.change_reason}</p>}
                    <p className="mt-0.5 text-xs text-slate-400">{fmt(step.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Verification & sign-off */}
          <section className="mt-7 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">OATA Quality Review</h3>
              <p className="mt-2 text-sm">
                Supervisor / Reviewer: <span className="font-semibold">{report.leadman_name ?? "—"}</span>
              </p>
              <p className="mt-1 text-sm">
                Technician: <span className="font-semibold">{report.technician_name ?? "—"}</span>
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Client Sign-off</h3>
              <p className="mt-2 text-sm font-medium text-emerald-900">
                {job.client_signoff_name ?? "—"}
              </p>
              <p className="mt-1 text-xs text-emerald-700">{fmt(job.client_signoff_at)}</p>
              {job.verification_result && <p className="mt-2 text-xs text-emerald-800">{job.verification_result}</p>}
            </div>
          </section>

          {/* Footer */}
          <footer className="mt-8 border-t border-slate-200 pt-5 text-center">
            <p className="text-sm font-semibold text-[#123747]">Reliable care. Lasting quality.</p>
            <p className="mt-1 text-xs text-slate-400">OATA Maintenance and Cleaning · Doha, Qatar · care.oata.qa</p>
            <p className="mt-1 text-xs text-slate-300">This report is generated from structured OATA work-order data and is valid with the recorded client sign-off.</p>
          </footer>
        </div>
      </article>
    </main>
  );
}
