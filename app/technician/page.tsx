"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, badgeClass, categoryLabel, statusLabel } from "@/lib/supabase";

type Profile = {
  id: string;
  full_name: string;
  role: string;
  status: string;
};

type WorkOrder = {
  id: string;
  job_number: string | null;
  job_type: string;
  service_category: string | null;
  priority: string;
  status: string;
  complaint: string | null;
  scope_of_work: string | null;
  diagnosis: string | null;
  work_performed: string | null;
  recommendations: string | null;
  company_id: string | null;
  branch_id: string | null;
  equipment_id: string | null;
  assigned_to: string | null;
  leadman_id: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  accepted_at: string | null;
  on_site_at: string | null;
  created_at: string;
};

type Company = { id: string; name: string };
type Branch = { id: string; name: string; branch_code: string | null };
type Equipment = { id: string; equipment_name: string; asset_code: string | null; location_description: string | null };

type StatusResult = {
  job?: Partial<WorkOrder>;
  error?: string;
};

const OPEN_STATUSES = ["created", "assigned", "in_progress", "awaiting_leadman_review", "awaiting_client_signoff", "parts_required", "quotation_required"];

function byId<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function dateLabel(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-QA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Qatar",
  }).format(new Date(value));
}

function nextAction(status: string) {
  if (status === "created") return "Accept or start job";
  if (status === "assigned") return "Start / mark on site";
  if (status === "in_progress") return "Add notes and submit for review";
  if (status === "awaiting_leadman_review") return "Waiting for leadman review";
  if (status === "awaiting_client_signoff") return "Waiting for client sign-off";
  if (status === "parts_required") return "Parts approval required";
  if (status === "quotation_required") return "Quotation approval required";
  return "Review job";
}

function evidenceGates(job: WorkOrder) {
  return [
    { label: "Accepted", done: Boolean(job.accepted_at) || ["assigned", "in_progress", "awaiting_leadman_review", "awaiting_client_signoff", "completed"].includes(job.status) },
    { label: "On site", done: Boolean(job.on_site_at) || ["in_progress", "awaiting_leadman_review", "awaiting_client_signoff", "completed"].includes(job.status) },
    { label: "Diagnosis", done: Boolean(job.diagnosis) },
    { label: "Work notes", done: Boolean(job.work_performed) },
    { label: "Review", done: ["awaiting_leadman_review", "awaiting_client_signoff", "completed"].includes(job.status) },
    { label: "Sign-off", done: ["awaiting_client_signoff", "completed"].includes(job.status) },
  ];
}

export default function TechnicianApp() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [diagnosis, setDiagnosis] = useState<Record<string, string>>({});
  const [workPerformed, setWorkPerformed] = useState<Record<string, string>>({});

  async function loadTechnician() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/";
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) setMessage(`Profile error: ${profileError.message}`);
    const activeProfile = (profileData ?? { id: user.id, full_name: user.email ?? "Technician", role: "authenticated", status: "active" }) as Profile;
    setProfile(activeProfile);

    const query = supabase
      .from("service_jobs")
      .select("id, job_number, job_type, service_category, priority, status, complaint, scope_of_work, diagnosis, work_performed, recommendations, company_id, branch_id, equipment_id, assigned_to, leadman_id, scheduled_at, started_at, accepted_at, on_site_at, created_at")
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: false })
      .limit(80);

    // OATA admins/managers can see all open jobs. Field technicians see jobs RLS permits;
    // once proper user assignment is configured, API actions still enforce assignment/role.
    const { data: jobData, error: jobError } = await query;

    if (jobError) {
      setMessage(`Work order error: ${jobError.message}`);
      setLoading(false);
      return;
    }

    const loadedJobs = (jobData ?? []) as WorkOrder[];
    setJobs(loadedJobs);
    if (!openJobId && loadedJobs[0]) setOpenJobId(loadedJobs[0].id);

    const companyIds = [...new Set(loadedJobs.map((job) => job.company_id).filter(Boolean))] as string[];
    const branchIds = [...new Set(loadedJobs.map((job) => job.branch_id).filter(Boolean))] as string[];
    const equipmentIds = [...new Set(loadedJobs.map((job) => job.equipment_id).filter(Boolean))] as string[];

    const [companiesRes, branchesRes, equipmentRes] = await Promise.all([
      companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: null, error: null }),
      branchIds.length ? supabase.from("branches").select("id, name, branch_code").in("id", branchIds) : Promise.resolve({ data: null, error: null }),
      equipmentIds.length ? supabase.from("equipment").select("id, equipment_name, asset_code, location_description").in("id", equipmentIds) : Promise.resolve({ data: null, error: null }),
    ]);

    setCompanies((companiesRes.data ?? []) as Company[]);
    setBranches((branchesRes.data ?? []) as Branch[]);
    setEquipment((equipmentRes.data ?? []) as Equipment[]);
    setLoading(false);
  }

  useEffect(() => {
    loadTechnician();
  }, []);

  const companyMap = useMemo(() => byId(companies), [companies]);
  const branchMap = useMemo(() => byId(branches), [branches]);
  const equipmentMap = useMemo(() => byId(equipment), [equipment]);

  const emergencyCount = jobs.filter((job) => job.priority === "emergency" || job.priority === "urgent").length;
  const activeJob = jobs.find((job) => job.id === openJobId) ?? jobs[0] ?? null;

  async function updateJob(job: WorkOrder, action: "accept" | "start" | "submit_review") {
    setBusyId(job.id);
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setBusyId(null);
      setMessage("Your session expired. Please sign in again.");
      return;
    }

    const response = await fetch("/api/work-orders/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        job_id: job.id,
        action,
        notes: notes[job.id] || null,
        diagnosis: diagnosis[job.id] || null,
        work_performed: workPerformed[job.id] || null,
      }),
    });

    const result = (await response.json()) as StatusResult;
    setBusyId(null);

    if (!response.ok) {
      setMessage(result.error ?? "Work order update failed. Please try again.");
      return;
    }

    setMessage(`${job.job_number ?? "Work order"} updated to ${statusLabel(result.job?.status ?? "updated")}.`);
    await loadTechnician();
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><p>Loading technician work orders...</p></main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto min-h-screen max-w-md bg-[#f7fafc] text-slate-950 shadow-2xl">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f7fafc]/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-700">OATA Technician</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-[-0.05em]">Today</h1>
              {profile && <p className="mt-1 text-xs text-slate-500">{profile.full_name} · {profile.role.replace(/_/g, " ")}</p>}
            </div>
            <Link href="/" className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Admin</Link>
          </div>
        </header>

        <div className="space-y-5 px-5 py-5">
          <section className="rounded-[2rem] bg-slate-950 p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-cyan-100/80">Open work orders</p>
                <p className="mt-1 text-5xl font-semibold tracking-[-0.08em]">{jobs.length}</p>
              </div>
              <span className="rounded-full bg-red-500 px-3 py-1 text-sm font-semibold">{emergencyCount} Urgent</span>
            </div>
            <Link href="/equipment" className="mt-6 block w-full rounded-2xl bg-cyan-600 px-4 py-4 text-center text-base font-semibold text-white shadow-lg shadow-cyan-900/30">Scan QR / Open Asset</Link>
          </section>

          {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{message}</div>}

          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em]">My Work Orders</h2>
            <div className="mt-3 space-y-3">
              {jobs.length === 0 ? (
                <article className="rounded-3xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500 shadow-sm">No open work orders.</article>
              ) : jobs.map((job) => {
                const branch = job.branch_id ? branchMap.get(job.branch_id) : null;
                const asset = job.equipment_id ? equipmentMap.get(job.equipment_id) : null;
                return (
                  <article key={job.id} className={`rounded-3xl border bg-white p-4 shadow-sm ${openJobId === job.id ? "border-cyan-300" : "border-slate-200"}`}>
                    <button onClick={() => setOpenJobId(job.id)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{job.job_number ?? "Work Order"} · {categoryLabel(job.service_category ?? job.job_type)}</p>
                          <p className="mt-1 text-sm text-slate-500">{job.company_id ? (companyMap.get(job.company_id)?.name ?? "Unknown client") : "No client"}</p>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(job.priority)}`}>{statusLabel(job.priority)}</span>
                      </div>
                      <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                        <p><span className="font-semibold text-slate-800">Site:</span> {branch?.name ?? "No branch"}</p>
                        <p className="mt-1"><span className="font-semibold text-slate-800">Asset:</span> {asset ? `${asset.equipment_name}${asset.asset_code ? ` · ${asset.asset_code}` : ""}` : "No asset"}</p>
                        <p className="mt-1"><span className="font-semibold text-slate-800">Next:</span> {nextAction(job.status)}</p>
                      </div>
                    </button>
                    <div className="mt-4 flex gap-2">
                      <Link href={`/jobs/${job.id}`} className="flex-1 rounded-2xl bg-cyan-700 px-4 py-3 text-center text-sm font-semibold text-white">Open</Link>
                      <span className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${badgeClass(job.status)}`}>{statusLabel(job.status)}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {activeJob && (
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold tracking-[-0.03em]">Active Work Order</h2>
              <p className="mt-1 text-sm text-slate-500">{activeJob.job_number} · {statusLabel(activeJob.status)}</p>
              <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{activeJob.complaint ?? "No complaint recorded."}</p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {evidenceGates(activeJob).map((gate) => (
                  <div key={gate.label} className={`rounded-2xl border p-3 text-sm font-semibold ${gate.done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    {gate.done ? "✓ " : "○ "}{gate.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                <textarea value={notes[activeJob.id] ?? ""} onChange={(event) => setNotes((prev) => ({ ...prev, [activeJob.id]: event.target.value }))} rows={2} placeholder="Quick technician notes" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-600" />
                <textarea value={diagnosis[activeJob.id] ?? ""} onChange={(event) => setDiagnosis((prev) => ({ ...prev, [activeJob.id]: event.target.value }))} rows={2} placeholder="Diagnosis / finding before review" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-600" />
                <textarea value={workPerformed[activeJob.id] ?? ""} onChange={(event) => setWorkPerformed((prev) => ({ ...prev, [activeJob.id]: event.target.value }))} rows={2} placeholder="Work performed / action taken" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-600" />
              </div>

              <div className="mt-4 grid gap-2">
                {activeJob.status === "created" && <button onClick={() => updateJob(activeJob, "accept")} disabled={busyId === activeJob.id} className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-800 disabled:opacity-60">Accept Job</button>}
                {["created", "assigned"].includes(activeJob.status) && <button onClick={() => updateJob(activeJob, "start")} disabled={busyId === activeJob.id} className="rounded-2xl bg-cyan-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">Start / On Site</button>}
                {activeJob.status === "in_progress" && <button onClick={() => updateJob(activeJob, "submit_review")} disabled={busyId === activeJob.id} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">Submit for Leadman Review</button>}
              </div>
            </section>
          )}

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Job Flow</h2>
            <div className="mt-4 space-y-2">
              {["Open work order", "Accept job", "Start / on site", "Before evidence", "Diagnosis", "Work performed", "After evidence", "Submit for review", "Leadman/client sign-off"].map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-cyan-700">{index + 1}</span>{step}
                </div>
              ))}
            </div>
          </section>

          <p className="pb-8 text-center text-xs text-slate-400">OATA Care Technician App · Live Work Orders</p>
        </div>
      </section>
    </main>
  );
}
