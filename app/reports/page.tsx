"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, badgeClass, categoryLabel, statusLabel } from "@/lib/supabase";
import { OataLoading, OataPageShell } from "@/components/oata-page-shell";

type ReportJob = {
  id: string;
  job_number: string | null;
  job_type: string;
  service_category: string | null;
  priority: string;
  status: string;
  company_id: string | null;
  branch_id: string | null;
  equipment_id: string | null;
  completed_at: string | null;
  client_signoff_name: string | null;
  report_status: string | null;
  report_generated_at: string | null;
};

type Company = { id: string; name: string };
type Branch = { id: string; name: string; branch_code: string | null };
type Equipment = { id: string; equipment_name: string; asset_code: string | null };

function byId<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-QA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(value));
}

export default function ReportsPage() {
  const [jobs, setJobs] = useState<ReportJob[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/";
        return;
      }
      const { data: jobData, error: jobError } = await supabase
        .from("service_jobs")
        .select("id, job_number, job_type, service_category, priority, status, company_id, branch_id, equipment_id, completed_at, client_signoff_name, report_status, report_generated_at")
        .in("status", ["completed"])
        .order("completed_at", { ascending: false })
        .limit(80);

      if (jobError) {
        setMessage(`Reports error: ${jobError.message}`);
        setLoading(false);
        return;
      }

      const loadedJobs = (jobData ?? []) as ReportJob[];
      setJobs(loadedJobs);

      const companyIds = [...new Set(loadedJobs.map((j) => j.company_id).filter(Boolean))] as string[];
      const branchIds = [...new Set(loadedJobs.map((j) => j.branch_id).filter(Boolean))] as string[];
      const equipmentIds = [...new Set(loadedJobs.map((j) => j.equipment_id).filter(Boolean))] as string[];

      const [companiesRes, branchesRes, equipmentRes] = await Promise.all([
        companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: null, error: null }),
        branchIds.length ? supabase.from("branches").select("id, name, branch_code").in("id", branchIds) : Promise.resolve({ data: null, error: null }),
        equipmentIds.length ? supabase.from("equipment").select("id, equipment_name, asset_code").in("id", equipmentIds) : Promise.resolve({ data: null, error: null }),
      ]);

      setCompanies((companiesRes.data ?? []) as Company[]);
      setBranches((branchesRes.data ?? []) as Branch[]);
      setEquipment((equipmentRes.data ?? []) as Equipment[]);
      setLoading(false);
    }
    load();
  }, []);

  const companyMap = useMemo(() => byId(companies), [companies]);
  const branchMap = useMemo(() => byId(branches), [branches]);
  const equipmentMap = useMemo(() => byId(equipment), [equipment]);

  if (loading) {
    return <OataLoading label="Loading reports..." />;
  }

  return (
    <OataPageShell
      eyebrow="Service Records"
      title="Reports & Certificates"
      description="Completed work orders with client sign-off are ready for report/certificate download."
      actions={[{ label: "Dashboard", href: "/", variant: "primary" }]}
      maxWidth="5xl"
    >
      <div className="space-y-6">

        {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{message}</div>}

        <section className="space-y-4">
          {jobs.length === 0 ? (
            <article className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 shadow-sm">
              No completed work orders yet.
            </article>
          ) : jobs.map((job) => {
            const branch = job.branch_id ? branchMap.get(job.branch_id) : null;
            const asset = job.equipment_id ? equipmentMap.get(job.equipment_id) : null;
            return (
              <article key={job.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold tracking-[-0.03em]">{job.job_number ?? "Work Order"}</h2>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(job.status)}`}>{statusLabel(job.status)}</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Report: {statusLabel(job.report_status ?? "ready")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {categoryLabel(job.service_category ?? job.job_type)} · {job.company_id ? (companyMap.get(job.company_id)?.name ?? "Unknown client") : "No client"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {branch?.name ?? "No branch"}{asset ? ` · ${asset.equipment_name}${asset.asset_code ? ` · ${asset.asset_code}` : ""}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Completed {dateLabel(job.completed_at)}{job.client_signoff_name ? ` · Signed by ${job.client_signoff_name}` : ""}
                    </p>
                  </div>
                  <Link href={`/reports/${job.id}`} className="rounded-2xl bg-[#123747] px-4 py-3 text-center text-sm font-semibold text-white">
                    View Report
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </OataPageShell>
  );
}
