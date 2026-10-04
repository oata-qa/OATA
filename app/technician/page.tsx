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

type TechStat = {
  label: string;
  value: number;
  caption: string;
  tone: string;
  icon: string;
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

function shortTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-QA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Qatar",
  }).format(new Date(value));
}

function nextAction(status: string) {
  if (status === "created") return "Accept job";
  if (status === "assigned") return "Start / mark on site";
  if (status === "in_progress") return "Submit for review";
  if (status === "awaiting_leadman_review") return "Supervisor review";
  if (status === "awaiting_client_signoff") return "Client sign-off";
  if (status === "parts_required") return "Parts required";
  if (status === "quotation_required") return "Quotation required";
  return "Review job";
}

function evidenceGates(job: WorkOrder) {
  return [
    { label: "Accepted", done: Boolean(job.accepted_at) || ["assigned", "in_progress", "awaiting_leadman_review", "awaiting_client_signoff", "completed"].includes(job.status) },
    { label: "On site", done: Boolean(job.on_site_at) || ["in_progress", "awaiting_leadman_review", "awaiting_client_signoff", "completed"].includes(job.status) },
    { label: "Diagnosis", done: Boolean(job.diagnosis) },
    { label: "Work notes", done: Boolean(job.work_performed) },
    { label: "Photos", done: ["awaiting_leadman_review", "awaiting_client_signoff", "completed"].includes(job.status) },
    { label: "Review", done: ["awaiting_leadman_review", "awaiting_client_signoff", "completed"].includes(job.status) },
  ];
}

function TechnicianSidebar({ profile }: { profile: Profile | null }) {
  const nav = [
    ["Dashboard", "/technician", "⌂"],
    ["My Jobs", "#my-jobs", "▣"],
    ["Map", "#quick-actions", "⌖"],
    ["Checklists", "#checklist", "✓"],
    ["Reports", "/reports", "◷"],
    ["Settings", "/", "⚙"],
  ];

  return (
    <aside className="hidden min-h-screen w-[280px] flex-col bg-[#052f4f] text-white lg:flex">
      <div className="px-7 py-7">
        <div className="flex items-center gap-3">
          <img src="/oata-logo.png" alt="OATA" className="h-12 w-auto rounded-xl bg-white/95 p-1" />
          <div>
            <p className="text-lg font-semibold leading-none">OATA | أواتا</p>
            <p className="mt-1 text-[11px] text-cyan-100/70">Technician App</p>
          </div>
        </div>
      </div>

      <nav className="space-y-1 px-4">
        {nav.map(([label, href, icon], index) => (
          <Link
            key={label}
            href={href}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              index === 1 ? "bg-[#0872c9] text-white shadow-lg shadow-blue-950/25" : "text-cyan-50/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 text-sm">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto px-7 py-7">
        <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.07] p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0872c9] text-sm font-bold text-white">
            {(profile?.full_name ?? "AK").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{profile?.full_name ?? "Technician"}</p>
            <p className="mt-1 text-xs capitalize text-cyan-100/65">{profile?.role.replace(/_/g, " ") ?? "Field user"}</p>
          </div>
        </div>
        <p className="mt-6 text-xs text-cyan-100/55">OATA Services</p>
        <p className="mt-1 text-xs text-cyan-100/45">Reliable care. Lasting quality.</p>
      </div>
    </aside>
  );
}

function MobileHeader({ profile }: { profile: Profile | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/oata-logo.png" alt="OATA" className="h-11 w-auto" />
          <div>
            <p className="text-sm font-bold text-[#052f4f]">OATA | أواتا</p>
            <p className="text-[11px] text-slate-500">Technician</p>
          </div>
        </div>
        <Link href="/equipment" className="rounded-full bg-[#0872c9] px-4 py-2 text-xs font-bold text-white shadow-sm">
          Scan QR
        </Link>
      </div>
      <p className="mt-3 text-sm font-semibold text-[#123747]">Good morning, {profile?.full_name?.split(" ")[0] ?? "Technician"}</p>
    </header>
  );
}

function StatTile({ stat }: { stat: TechStat }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
      <p className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl text-base ${stat.tone}`}>{stat.icon}</p>
      <p className="mt-4 text-sm font-semibold text-slate-500">{stat.label}</p>
      <p className="mt-1 text-3xl font-bold tracking-[-0.05em] text-[#123747]">{stat.value}</p>
      <p className="mt-1 text-xs font-medium text-slate-400">{stat.caption}</p>
    </article>
  );
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
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

      const { data: jobData, error: jobError } = await query;

      if (jobError) {
        setMessage(`Work order error: ${jobError.message}`);
        return;
      }

      const loadedJobs = (jobData ?? []) as WorkOrder[];
      setJobs(loadedJobs);
      setOpenJobId((current) => current ?? loadedJobs[0]?.id ?? null);

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
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown technician dashboard error";
      setMessage(`Technician dashboard error: ${detail}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTechnician();
  }, []);

  const companyMap = useMemo(() => byId(companies), [companies]);
  const branchMap = useMemo(() => byId(branches), [branches]);
  const equipmentMap = useMemo(() => byId(equipment), [equipment]);

  const urgentJobs = useMemo(() => jobs.filter((job) => ["emergency", "urgent", "critical"].includes(job.priority)), [jobs]);
  const inProgressJobs = useMemo(() => jobs.filter((job) => job.status === "in_progress"), [jobs]);
  const reviewJobs = useMemo(() => jobs.filter((job) => ["awaiting_leadman_review", "awaiting_client_signoff"].includes(job.status)), [jobs]);
  const upcomingJobs = useMemo(() => jobs.filter((job) => ["created", "assigned"].includes(job.status)), [jobs]);
  const activeJob = jobs.find((job) => job.id === openJobId) ?? jobs[0] ?? null;
  const completedToday = 0;
  const progressPercent = jobs.length > 0 ? Math.round((reviewJobs.length / jobs.length) * 100) : 0;

  const stats: TechStat[] = [
    { label: "My Jobs", value: jobs.length, caption: "Open work orders", icon: "▣", tone: "bg-blue-50 text-blue-600" },
    { label: "In Progress", value: inProgressJobs.length, caption: "Currently active", icon: "◉", tone: "bg-emerald-50 text-emerald-600" },
    { label: "Urgent", value: urgentJobs.length, caption: "Needs priority", icon: "△", tone: "bg-red-50 text-red-600" },
    { label: "Completed", value: completedToday, caption: "Today", icon: "✓", tone: "bg-cyan-50 text-cyan-700" },
  ];

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
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef5f8]">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-[#123747]">Loading OATA Technician App...</p>
          <p className="mt-1 text-xs text-slate-400">Checking assigned work orders.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef5f8] text-slate-950 lg:flex">
      <TechnicianSidebar profile={profile} />
      <section className="min-w-0 flex-1">
        <MobileHeader profile={profile} />

        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <header className="hidden items-center justify-between gap-5 lg:flex">
            <div>
              <p className="text-sm font-semibold text-[#0872c9]">Welcome back, {profile?.full_name ?? "Technician"}</p>
              <h1 className="mt-1 text-3xl font-bold tracking-[-0.05em] text-[#123747]">My Jobs</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden w-[330px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 xl:flex">
                <span>⌕</span>
                <span>Search jobs, clients, locations...</span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#123747]">
                {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date())}
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0872c9] text-sm font-bold text-white">
                  {(profile?.full_name ?? "AK").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-[#123747]">{profile?.full_name ?? "Technician"}</p>
                  <p className="text-xs capitalize text-slate-400">{profile?.role.replace(/_/g, " ") ?? "Field user"}</p>
                </div>
              </div>
            </div>
          </header>

          <section className="mt-3 grid gap-5 lg:mt-7 xl:grid-cols-[1fr_300px]">
            <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#327482]">Technician Layout</p>
                  <h2 className="mt-3 text-2xl font-bold tracking-[-0.05em] text-[#123747] sm:text-4xl">Today&apos;s field work</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                    Start jobs, record findings, upload evidence, and submit completed work for supervisor review.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href="/equipment" className="rounded-2xl bg-[#0872c9] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#065fa8]">
                    Scan QR / Asset
                  </Link>
                  <Link href="/oata/review" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-[#123747] transition hover:border-[#0872c9]/40 hover:bg-blue-50">
                    Review Queue
                  </Link>
                </div>
              </div>
            </article>

            <article className="rounded-[2rem] border border-[#bfe7ee] bg-[#052f4f] p-5 text-white shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-100/70">Current Focus</p>
              <p className="mt-3 text-xl font-bold">{activeJob?.job_number ?? "No active job"}</p>
              <p className="mt-2 text-sm text-cyan-50/70">{activeJob ? nextAction(activeJob.status) : "No open work orders"}</p>
              {activeJob && (
                <button onClick={() => setOpenJobId(activeJob.id)} className="mt-5 w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#052f4f]">
                  Open Active Job
                </button>
              )}
            </article>
          </section>

          <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <StatTile key={stat.label} stat={stat} />
            ))}
          </section>

          {message && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">{message}</div>}

          <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
            <article id="my-jobs" className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-bold tracking-[-0.04em] text-[#123747]">My Jobs</h3>
                  <p className="mt-1 text-sm text-slate-500">Assigned and open work orders visible to your role.</p>
                </div>
                <div className="flex gap-2 rounded-2xl bg-slate-50 p-1 text-xs font-bold text-slate-500">
                  <span className="rounded-xl bg-[#0872c9] px-3 py-2 text-white">Today ({jobs.length})</span>
                  <span className="px-3 py-2">Upcoming ({upcomingJobs.length})</span>
                  <span className="px-3 py-2">All ({jobs.length})</span>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
                <div className="hidden grid-cols-[105px_1.2fr_1fr_95px_96px] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400 md:grid">
                  <span>Status</span>
                  <span>Job / Client</span>
                  <span>Location</span>
                  <span>Time</span>
                  <span>Action</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {jobs.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">No open work orders.</div>
                  ) : (
                    jobs.map((job) => {
                      const branch = job.branch_id ? branchMap.get(job.branch_id) : null;
                      const client = job.company_id ? companyMap.get(job.company_id) : null;
                      const asset = job.equipment_id ? equipmentMap.get(job.equipment_id) : null;
                      const selected = openJobId === job.id;
                      return (
                        <button
                          key={job.id}
                          onClick={() => setOpenJobId(job.id)}
                          className={`grid w-full gap-3 px-4 py-4 text-left transition hover:bg-[#f7fcff] md:grid-cols-[105px_1.2fr_1fr_95px_96px] md:items-center ${selected ? "bg-blue-50/70" : "bg-white"}`}
                        >
                          <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-bold ${badgeClass(job.status)}`}>{statusLabel(job.status)}</span>
                          <div>
                            <p className="text-sm font-bold text-[#123747]">{job.job_number ?? "Work Order"} · {categoryLabel(job.service_category ?? job.job_type)}</p>
                            <p className="mt-1 text-xs text-slate-400">{client?.name ?? "No client"}</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-600">{branch?.name ?? "No branch"}</p>
                            <p className="mt-1 text-xs text-slate-400">{asset?.equipment_name ?? "No asset"}</p>
                          </div>
                          <p className="text-xs font-semibold text-slate-400">{shortTime(job.scheduled_at ?? job.created_at)}</p>
                          <span className="rounded-2xl border border-[#0872c9]/20 bg-white px-4 py-2 text-center text-xs font-bold text-[#0872c9]">
                            View
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </article>

            <aside className="space-y-5">
              <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
                <h3 className="text-lg font-bold tracking-[-0.04em] text-[#123747]">Today&apos;s Progress</h3>
                <div className="mt-5 flex items-center gap-4">
                  <div className="relative h-24 w-24 rounded-full" style={{ background: `conic-gradient(#0872c9 ${progressPercent}%, #e2e8f0 0)` }}>
                    <div className="absolute inset-4 flex items-center justify-center rounded-full bg-white text-lg font-bold text-[#123747]">{progressPercent}%</div>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#123747]">{reviewJobs.length} of {jobs.length} jobs past field step</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Submit completed work for supervisor review after diagnosis, work notes, and evidence photos.</p>
                  </div>
                </div>
              </article>

              <article id="quick-actions" className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
                <h3 className="text-lg font-bold tracking-[-0.04em] text-[#123747]">Quick Actions</h3>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Link href="/equipment" className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-bold text-[#123747]">Scan QR</Link>
                  <Link href="/equipment" className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-bold text-[#123747]">Open Asset</Link>
                  <Link href="/technician" className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-bold text-[#123747]">My Jobs</Link>
                  <Link href="/reports" className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-bold text-[#123747]">Reports</Link>
                </div>
              </article>

              <article className="rounded-[2rem] border border-[#bfe7ee] bg-[#0872c9] p-5 text-white shadow-sm">
                <h3 className="text-lg font-bold">Safety First</h3>
                <p className="mt-2 text-sm leading-6 text-blue-50/85">Use PPE, isolate equipment where required, and never perform unauthorized electrical or mechanical work.</p>
                <Link href="#checklist" className="mt-4 inline-flex rounded-2xl bg-white px-4 py-2 text-sm font-bold text-[#0872c9]">
                  View Checklist
                </Link>
              </article>
            </aside>
          </section>

          {activeJob && (
            <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
              <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badgeClass(activeJob.priority)}`}>{statusLabel(activeJob.priority)}</span>
                    <h3 className="mt-3 text-2xl font-bold tracking-[-0.05em] text-[#123747]">{activeJob.job_number ?? "Work Order"}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{categoryLabel(activeJob.service_category ?? activeJob.job_type)} · {statusLabel(activeJob.status)}</p>
                  </div>
                  <Link href={`/jobs/${activeJob.id}`} className="rounded-2xl border border-[#0872c9]/20 bg-blue-50 px-4 py-3 text-center text-sm font-bold text-[#0872c9]">
                    Upload Photos / Details
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Client</p>
                    <p className="mt-2 font-bold text-[#123747]">{activeJob.company_id ? companyMap.get(activeJob.company_id)?.name ?? "Unknown" : "No client"}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Location</p>
                    <p className="mt-2 font-bold text-[#123747]">{activeJob.branch_id ? branchMap.get(activeJob.branch_id)?.name ?? "No branch" : "No branch"}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Asset</p>
                    <p className="mt-2 font-bold text-[#123747]">{activeJob.equipment_id ? equipmentMap.get(activeJob.equipment_id)?.equipment_name ?? "Unknown" : "No asset"}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Scheduled</p>
                    <p className="mt-2 font-bold text-[#123747]">{dateLabel(activeJob.scheduled_at)}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Complaint / Scope</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{activeJob.complaint ?? activeJob.scope_of_work ?? "No complaint recorded."}</p>
                </div>

                <div className="mt-5 grid gap-3">
                  <textarea value={notes[activeJob.id] ?? ""} onChange={(event) => setNotes((prev) => ({ ...prev, [activeJob.id]: event.target.value }))} rows={2} placeholder="Quick technician notes" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#0872c9]" />
                  <textarea value={diagnosis[activeJob.id] ?? ""} onChange={(event) => setDiagnosis((prev) => ({ ...prev, [activeJob.id]: event.target.value }))} rows={2} placeholder="Diagnosis / finding before review" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#0872c9]" />
                  <textarea value={workPerformed[activeJob.id] ?? ""} onChange={(event) => setWorkPerformed((prev) => ({ ...prev, [activeJob.id]: event.target.value }))} rows={2} placeholder="Work performed / action taken" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#0872c9]" />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Link href={`/jobs/${activeJob.id}`} className="rounded-2xl border border-[#0872c9]/20 bg-blue-50 px-4 py-3 text-center text-sm font-bold text-[#0872c9]">Evidence Photos</Link>
                  {activeJob.status === "created" && <button onClick={() => updateJob(activeJob, "accept")} disabled={busyId === activeJob.id} className="rounded-2xl border border-[#0872c9]/20 bg-blue-50 px-4 py-3 text-sm font-bold text-[#0872c9] disabled:opacity-60">Accept Job</button>}
                  {["created", "assigned"].includes(activeJob.status) && <button onClick={() => updateJob(activeJob, "start")} disabled={busyId === activeJob.id} className="rounded-2xl bg-[#0872c9] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">Start / On Site</button>}
                  {activeJob.status === "in_progress" && <button onClick={() => updateJob(activeJob, "submit_review")} disabled={busyId === activeJob.id} className="rounded-2xl bg-[#052f4f] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">Submit Review</button>}
                </div>
              </article>

              <article id="checklist" className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
                <h3 className="text-xl font-bold tracking-[-0.04em] text-[#123747]">Checklist</h3>
                <p className="mt-1 text-sm text-slate-500">{evidenceGates(activeJob).filter((gate) => gate.done).length}/{evidenceGates(activeJob).length} completed</p>
                <div className="mt-5 space-y-3">
                  {evidenceGates(activeJob).map((gate) => (
                    <div key={gate.label} className={`flex items-center gap-3 rounded-2xl border p-3 text-sm font-bold ${gate.done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${gate.done ? "bg-emerald-500 text-white" : "bg-white text-slate-400"}`}>{gate.done ? "✓" : "○"}</span>
                      {gate.label}
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid gap-3">
                  <Link href={`/jobs/${activeJob.id}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-[#123747]">Upload Photo</Link>
                  <button onClick={() => setNotes((prev) => ({ ...prev, [activeJob.id]: prev[activeJob.id] ?? "" }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#123747]">Add Note</button>
                </div>
              </article>
            </section>
          )}
        </div>

        <nav className="sticky bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-500 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] lg:hidden">
          {[
            ["Home", "/technician", "⌂"],
            ["Jobs", "#my-jobs", "▣"],
            ["Map", "#quick-actions", "⌖"],
            ["Checklist", "#checklist", "✓"],
            ["More", "/", "⋯"],
          ].map(([label, href, icon], index) => (
            <Link key={label} href={href} className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 ${index === 1 ? "bg-blue-50 text-[#0872c9]" : ""}`}>
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
