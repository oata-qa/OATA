"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  full_name: string;
  role: string;
  status: string;
};

type ServiceJobRow = {
  id: string;
  job_number: string | null;
  job_type: string;
  priority: string;
  status: string;
  complaint: string | null;
  scope_of_work: string | null;
  diagnosis: string | null;
  root_cause: string | null;
  work_performed: string | null;
  recommendations: string | null;
  created_at: string;
  scheduled_at: string | null;
  companies: { id: string; name: string }[] | null;
  branches: { id: string; name: string }[] | null;
  equipment: { id: string; equipment_name: string; asset_code: string | null }[] | null;
};

type ApprovalRow = {
  id: string;
  approval_type: string;
  decision: string;
  amount_qar: number | null;
  currency: string;
  comment: string | null;
  job_id: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string;
  role: string;
  status: string;
  email: string;
};

type WorkQueueItem = {
  id: string;
  job_number: string;
  job_type: string;
  priority: string;
  status: string;
  complaint: string | null;
  client: string;
  branch: string;
  asset: string;
  nextAction: string;
};

const technicalTypes = ["kitchen_equipment", "refrigeration", "hvac", "coffee_machine", "mep"];
const cleaningTypes = ["hood_cleaning", "duct_cleaning", "grease_trap", "drainage", "water_tank", "ecology_unit"];

const primaryActions = [
  { label: "Dispatch Queue", detail: "Approved requests to work orders", href: "/oata/dispatch" },
  { label: "Client Portal", detail: "Contracts, restaurants, approvals", href: "/client" },
  { label: "Equipment Register", detail: "Assets, QR codes, history", href: "/equipment" },
  { label: "Approvals", detail: "Requests, quotes, parts", href: "/client/approvals" },
];

function formatLabel(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function mapJobToWorkQueue(job: ServiceJobRow): WorkQueueItem {
  const clientName = job.companies?.[0]?.name ?? "Unassigned client";
  const branchName = job.branches?.[0]?.name ?? "No branch";
  const assetName = job.equipment?.[0]
    ? `${job.equipment[0].equipment_name}${job.equipment[0].asset_code ? ` · ${job.equipment[0].asset_code}` : ""}`
    : "No asset linked";

  return {
    id: job.id,
    job_number: job.job_number ?? job.id.slice(0, 8),
    job_type: formatLabel(job.job_type),
    priority: formatLabel(job.priority),
    status: formatLabel(job.status),
    complaint: job.complaint,
    client: clientName,
    branch: branchName,
    asset: assetName,
    nextAction: job.status === "created"
      ? "Assign team and schedule visit"
      : job.status === "assigned"
      ? "Team to start job on site"
      : job.status === "in_progress"
      ? "Complete findings, photos, and measurements"
      : job.status === "awaiting_leadman_review"
      ? "Leadman to verify quality"
      : job.status === "awaiting_client_signoff"
      ? "Client sign-off required"
      : job.status === "awaiting_manager_approval"
      ? "Management approval required"
      : job.status === "completed"
      ? "Review report and certificate"
      : "Review and update job",
  };
}

function badgeClass(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("emergency") || lower.includes("critical") || lower.includes("urgent")) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (lower.includes("awaiting") || lower.includes("approval") || lower.includes("high")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (lower.includes("progress") || lower.includes("assigned") || lower.includes("scheduled")) {
    return "border-[#bfe7ee] bg-[#eefcff] text-[#0f6f7e]";
  }
  if (lower.includes("completed") || lower.includes("active")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statClass(tone: string) {
  if (tone === "red") return "bg-red-50 text-red-700 ring-red-100";
  if (tone === "amber") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (tone === "green") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  return "bg-[#eefcff] text-[#0f6f7e] ring-[#bfe7ee]";
}

export default function Home() {
  const [email, setEmail] = useState("abdixashi91@gmail.com");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [jobs, setJobs] = useState<ServiceJobRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [allProfiles, setAllProfiles] = useState<ProfileRow[]>([]);
  const [activityLog, setActivityLog] = useState<string[]>([]);

  const normalizedJobs = useMemo(() => jobs.map(mapJobToWorkQueue), [jobs]);
  const openJobs = useMemo(() => jobs.filter((job) => !["completed", "cancelled"].includes(job.status)), [jobs]);
  const completedJobs = useMemo(() => jobs.filter((job) => job.status === "completed"), [jobs]);
  const pendingApprovals = useMemo(() => approvals.filter((approval) => approval.decision === "pending"), [approvals]);
  const urgentJobs = useMemo(() => openJobs.filter((job) => ["emergency", "urgent"].includes(job.priority)), [openJobs]);

  const stats = useMemo(() => {
    const techOpen = openJobs.filter((job) => technicalTypes.includes(job.job_type)).length;
    const cleaningOpen = openJobs.filter((job) => cleaningTypes.includes(job.job_type)).length;

    return [
      { label: "Open Jobs", value: String(openJobs.length), detail: `${techOpen} technical · ${cleaningOpen} cleaning`, tone: "blue" },
      { label: "Urgent", value: String(urgentJobs.length), detail: urgentJobs.length ? "Needs same-day attention" : "No urgent jobs", tone: urgentJobs.length ? "red" : "green" },
      { label: "Approvals", value: String(pendingApprovals.length), detail: pendingApprovals.length ? "Waiting for decision" : "No pending approvals", tone: pendingApprovals.length ? "amber" : "green" },
      { label: "Completed", value: String(completedJobs.length), detail: "Ready for report review", tone: "green" },
    ];
  }, [openJobs, urgentJobs, pendingApprovals, completedJobs]);

  async function loadDashboardData(authUser?: User) {
    const user = authUser ?? (await supabase.auth.getUser()).data.user;

    if (!user) {
      setProfile(null);
      setJobs([]);
      setApprovals([]);
      setAllProfiles([]);
      setActivityLog([]);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      setMessage(`Profile access error: ${profileError.message}`);
    }

    const activeProfile: Profile = profileData ?? {
      id: user.id,
      full_name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "OATA User",
      role: "profile_pending",
      status: "limited access",
    };

    setProfile(activeProfile);

    const { data: jobsData, error: jobsError } = await supabase
      .from("service_jobs")
      .select(`
        id, job_number, job_type, priority, status, complaint, scope_of_work,
        diagnosis, root_cause, work_performed, recommendations,
        created_at, scheduled_at,
        company_id, branch_id, equipment_id
      `)
      .order("created_at", { ascending: false });

    if (jobsError) {
      setMessage(`Jobs load error: ${jobsError.message}`);
      return;
    }

    const rawJobs = jobsData ?? [];
    const companyIds = [...new Set(rawJobs.map((job) => job.company_id).filter(Boolean))] as string[];
    const branchIds = [...new Set(rawJobs.map((job) => job.branch_id).filter(Boolean))] as string[];
    const equipmentIds = [...new Set(rawJobs.map((job) => job.equipment_id).filter(Boolean))] as string[];

    const [companiesRes, branchesRes, equipmentRes] = await Promise.all([
      companyIds.length > 0 ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: null, error: null }),
      branchIds.length > 0 ? supabase.from("branches").select("id, name").in("id", branchIds) : Promise.resolve({ data: null, error: null }),
      equipmentIds.length > 0 ? supabase.from("equipment").select("id, equipment_name, asset_code").in("id", equipmentIds) : Promise.resolve({ data: null, error: null }),
    ]);

    const companyMap = new Map<string, string>();
    (companiesRes.data ?? []).forEach((company) => companyMap.set(company.id, company.name));

    const branchMap = new Map<string, string>();
    (branchesRes.data ?? []).forEach((branch) => branchMap.set(branch.id, branch.name));

    const equipmentMap = new Map<string, { name: string; asset_code: string | null }>();
    (equipmentRes.data ?? []).forEach((equipment) =>
      equipmentMap.set(equipment.id, { name: equipment.equipment_name, asset_code: equipment.asset_code }),
    );

    const mergedJobs: ServiceJobRow[] = rawJobs.map((job) => ({
      ...job,
      companies: companyMap.has(job.company_id) ? [{ id: job.company_id, name: companyMap.get(job.company_id)! }] : null,
      branches: branchMap.has(job.branch_id) ? [{ id: job.branch_id, name: branchMap.get(job.branch_id)! }] : null,
      equipment: equipmentMap.has(job.equipment_id)
        ? [{ id: job.equipment_id, equipment_name: equipmentMap.get(job.equipment_id)!.name, asset_code: equipmentMap.get(job.equipment_id)!.asset_code }]
        : null,
    }));

    setJobs(mergedJobs);

    const { data: approvalsData } = await supabase
      .from("approvals")
      .select("id, approval_type, decision, amount_qar, currency, comment, job_id")
      .order("requested_at", { ascending: false })
      .limit(20);

    setApprovals((approvalsData ?? []) as ApprovalRow[]);

    if (activeProfile.role === "oata_admin") {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, role, status")
        .order("full_name", { ascending: true });

      setAllProfiles((profilesData ?? []).map((account) => ({
        id: account.id,
        full_name: account.full_name,
        role: account.role,
        status: account.status,
        email: account.id === user.id ? user.email ?? "—" : "—",
      })));
    }

    const { data: logsData } = await supabase
      .from("audit_logs")
      .select("action, entity_type, created_at")
      .order("created_at", { ascending: false })
      .limit(6);

    setActivityLog(
      logsData && logsData.length > 0
        ? logsData.map((log) => `${formatLabel(log.action)} · ${formatLabel(log.entity_type)}`)
        : [`Loaded ${rawJobs.length} service jobs`, "Portal session active"],
    );

    setMessage(profileData ? "Dashboard updated." : "Signed in with limited access. Profile setup is required.");
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      setMessage("Email is required.");
      return;
    }

    if (!password) {
      setMessage("Password is required.");
      return;
    }

    setIsSigningIn(true);
    setMessage("Signing in...");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

      if (error) {
        setMessage(`Login failed: ${error.message}`);
        return;
      }

      if (!data.user) {
        setMessage("Login failed: no user session returned.");
        return;
      }

      await loadDashboardData(data.user);
    } catch (error) {
      setMessage(`Login failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setJobs([]);
    setApprovals([]);
    setAllProfiles([]);
    setActivityLog([]);
    setMessage("Signed out.");
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  if (!profile) {
    return (
      <main className="min-h-screen bg-[#f3f7f8] text-slate-950">
        <section className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative overflow-hidden bg-[#123747] px-6 py-10 text-white sm:px-10 lg:px-16">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(34,200,216,0.24),transparent_32%),radial-gradient(circle_at_70%_85%,rgba(214,166,65,0.22),transparent_34%)]" />
            <div className="relative z-10 flex min-h-full flex-col justify-between gap-12">
              <div>
                <img src="/oata-logo.png" alt="OATA Maintenance and Cleaning" className="h-24 w-auto rounded-2xl bg-white p-2" />
                <p className="mt-10 text-sm font-semibold uppercase tracking-[0.34em] text-[#9deaf2]">OATA Care Portal</p>
                <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
                  Reliable care. Lasting quality.
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76">
                  A simple operations portal for service jobs, assets, approvals, reports, and client evidence.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Prevent", "Plan work before failures repeat"],
                  ["Verify", "Photos, readings, sign-off, reports"],
                  ["Document", "One record for every job and asset"],
                ].map(([title, detail]) => (
                  <div key={title} className="rounded-2xl border border-white/12 bg-white/[0.08] p-5 backdrop-blur">
                    <p className="text-sm font-semibold text-[#D6A641]">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/72">{detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center px-6 py-10 sm:px-10">
            <section className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-7 shadow-2xl shadow-slate-900/10">
              <img src="/oata-logo.png" alt="OATA" className="h-20 w-auto" />
              <div className="mt-8">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#327482]">Secure access</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Sign in</h2>
                <p className="mt-2 text-sm text-slate-500">Use your approved OATA Care Portal account.</p>
              </div>

              <form onSubmit={signIn} className="mt-7">
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none ring-[#22C8D8]/20 transition focus:border-[#327482] focus:ring-4"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />

                <label className="mt-5 block text-sm font-medium text-slate-700">Password</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none ring-[#22C8D8]/20 transition focus:border-[#327482] focus:ring-4"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />

                <button
                  type="submit"
                  disabled={isSigningIn}
                  className="mt-6 w-full rounded-xl bg-[#123747] px-4 py-3 font-semibold text-white shadow-lg shadow-[#123747]/20 transition hover:bg-[#1a4b5d] disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isSigningIn ? "Signing in..." : "Sign in"}
                </button>
              </form>

              <p className="mt-4 min-h-5 text-sm text-slate-500" aria-live="polite">
                {message || "Authorized staff and client users only."}
              </p>
            </section>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f7f8] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <img src="/oata-logo.png" alt="OATA" className="h-20 w-auto" />
            <div className="hidden h-10 w-px bg-slate-200 sm:block" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#327482]">Care Portal</p>
              <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[#123747]">Operations Dashboard</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
              {profile.full_name} · <span className="font-semibold text-[#327482]">{formatLabel(profile.role)}</span>
            </div>
            <button onClick={() => loadDashboardData()} className="rounded-full border border-[#bfe7ee] bg-[#eefcff] px-4 py-2 text-sm font-semibold text-[#0f6f7e] hover:bg-white">
              Refresh
            </button>
            <button onClick={signOut} className="rounded-full bg-[#123747] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a4b5d]">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        <div className="rounded-[2rem] bg-[#123747] p-6 text-white shadow-xl shadow-slate-900/10 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#9deaf2]">Today&apos;s control screen</p>
              <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
                See what needs action. Open the job. Close it properly.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72">
                Prevent → Detect → Diagnose → Repair → Verify → Document → Prevent recurrence.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {primaryActions.map((action) => (
                <a
                  key={action.label}
                  href={action.href}
                  className="rounded-2xl border border-white/12 bg-white/[0.08] p-4 transition hover:bg-white/[0.14]"
                >
                  <p className="font-semibold text-white">{action.label}</p>
                  <p className="mt-1 text-sm text-white/66">{action.detail}</p>
                </a>
              ))}
            </div>
          </div>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((card) => (
            <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className={`mb-5 inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statClass(card.tone)}`}>
                {card.label}
              </div>
              <p className="text-4xl font-semibold tracking-[-0.06em] text-[#123747]">{card.value}</p>
              <p className="mt-2 text-sm text-slate-500">{card.detail}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Work queue</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#123747]">Open service jobs</h3>
                <p className="mt-1 text-sm text-slate-500">Click a job to view details, photos, findings, and report status.</p>
              </div>
              <Link href="/equipment" className="rounded-full bg-[#123747] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a4b5d]">
                Equipment Register
              </Link>
            </div>

            <div className="space-y-3">
              {normalizedJobs.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
                  <p className="font-semibold text-slate-700">No service jobs found.</p>
                  <p className="mt-2 text-sm text-slate-500">Create a job to start tracking work, evidence, and reports.</p>
                </div>
              ) : (
                normalizedJobs.slice(0, 8).map((job) => (
                  <article
                    key={job.id}
                    className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#22C8D8] hover:bg-[#f7feff]"
                    onClick={() => { window.location.href = `/jobs/${job.id}`; }}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-500">{job.job_number}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(job.priority)}`}>{job.priority}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(job.status)}`}>{job.status}</span>
                        </div>
                        <h4 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-slate-950">{job.client}</h4>
                        <p className="mt-1 text-sm text-slate-600">{job.branch} · {job.job_type}</p>
                        <p className="mt-1 text-sm text-slate-500">{job.asset}</p>
                        {job.complaint && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{job.complaint}</p>}
                      </div>
                      <div className="rounded-2xl bg-[#f3f7f8] px-4 py-3 text-sm text-slate-600 lg:w-72">
                        <p className="font-semibold text-[#123747]">Next action</p>
                        <p className="mt-1">{job.nextAction}</p>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div id="approvals" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Approvals</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#123747]">Needs decision</h3>
              <div className="mt-5 space-y-3">
                {pendingApprovals.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    No pending approvals.
                  </div>
                ) : (
                  pendingApprovals.slice(0, 5).map((approval) => (
                    <div key={approval.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{formatLabel(approval.approval_type)}</p>
                          <p className="mt-1 text-sm text-amber-800">Job {approval.job_id?.slice(0, 8) ?? "—"}</p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">Pending</span>
                      </div>
                      <p className="mt-3 text-sm text-slate-700">
                        {approval.amount_qar ? `QAR ${approval.amount_qar.toLocaleString()}` : approval.comment ?? "Review required"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Team</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#123747]">Active users</h3>
              <div className="mt-5 space-y-3">
                {allProfiles.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Profile directory not available for this role.</p>
                ) : (
                  allProfiles.slice(0, 5).map((account) => (
                    <div key={account.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3">
                      <div>
                        <p className="font-semibold text-slate-950">{account.full_name}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatLabel(account.role)}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(account.status)}`}>{formatLabel(account.status)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">OATA standard</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#123747]">Every job must close with proof</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ["Diagnose", "Symptom, cause, measurements"],
                ["Verify", "Test result, photos, sign-off"],
                ["Prevent", "Recommendation to stop repeat failure"],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-[#123747]">{title}</p>
                  <p className="mt-2 text-sm text-slate-500">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Recent activity</p>
            <div className="mt-5 space-y-3">
              {activityLog.map((activity, index) => (
                <div key={`${activity}-${index}`} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#22C8D8]" />
                  <p>{activity}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {message && (
          <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
