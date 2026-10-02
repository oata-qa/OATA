"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

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
  assignedTo: string;
  sla: string;
  nextAction: string;
  evidence: string;
  approval: string;
  reportScore: string;
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

// ─── Static config (design elements, not data) ───────────────────────────────

const navGroups = [
  {
    label: "Main Work",
    items: ["Dashboard", "Work Orders", "Dispatch Board", "Schedule", "Approvals", "Reports & Certificates"],
  },
  {
    label: "Assets & Sites",
    items: ["Clients / Projects", "Sites / Branches", "Asset Hierarchy", "Asset Register", "Asset History", "QR Codes"],
  },
  {
    label: "Evidence & Compliance",
    items: ["Inspection Register", "Media Register", "Certificate Register", "Checklists / Templates"],
  },
  {
    label: "Admin Setup",
    items: ["Issue Types", "Service Setup", "User Administration", "Reference Data", "Settings"],
  },
];

const roleDashboards = [
  {
    role: "Management",
    focus: "Margin, SLA risk, approvals, repeat failures",
    actions: ["Assign technician", "Approve quote", "Review completed job", "Send invoice package"],
  },
  {
    role: "Operations",
    focus: "New requests, unassigned jobs, today schedule, missing evidence",
    actions: ["Dispatch", "Reschedule", "Request missing photo", "Prepare certificate"],
  },
  {
    role: "Technician",
    focus: "Today jobs, start job, QR scan, photos, checklist, signature",
    actions: ["Start Job", "Scan QR", "Upload photos", "Submit report"],
  },
  {
    role: "Client",
    focus: "Requests, ETA, approvals, reports, invoices, PM calendar",
    actions: ["Create request", "Approve quote", "Confirm completion", "Download report"],
  },
  {
    role: "Finance",
    focus: "Invoice packages, approved extras, unpaid invoices, renewal risk",
    actions: ["Review invoice package", "Track payment", "Flag missing approval", "Check margin"],
  },
];

const inspectionTemplates = [
  { title: "Kitchen Equipment", count: 6, detail: "Symptoms, diagnosis, parts, readings", progress: "72%" },
  { title: "HVAC/R & Cold Rooms", count: 4, detail: "Temperatures, pressures, airflow, leakage", progress: "64%" },
  { title: "Hood / Duct Cleaning", count: 8, detail: "Before/after photos, grease level, certificate", progress: "81%" },
  { title: "Grease Trap / Drainage", count: 3, detail: "Blockage, odor, waste, disposal notes", progress: "55%" },
];

const checklistGates = [
  "QR / asset identified",
  "Before photo",
  "Finding / defect recorded",
  "Measurements added",
  "Corrective action",
  "After photo",
  "Client sign-off",
  "Report issued",
];

const commercialControls = [
  { label: "Ready to Invoice", value: "QAR 21.6k", detail: "11 jobs have complete evidence" },
  { label: "Approved Extras", value: "QAR 8.4k", detail: "Parts / out-of-scope work approved" },
  { label: "At-Risk Margin", value: "3 clients", detail: "High usage or unpaid extras" },
  { label: "Renewals", value: "5", detail: "Contracts expiring within 90 days" },
];

const assetIntelligence = [
  { label: "Digital Identity", detail: "QR code, brand, model, serial, location, warranty, AMC coverage" },
  { label: "Technical Brain", detail: "Manuals, wiring diagrams, common failures, technician notes" },
  { label: "Health & History", detail: "Repeat failures, readings trend, parts replaced, repair cost" },
  { label: "Next Action", detail: "PM due, replacement recommendation, corrective job, certificate renewal" },
];

const aiControls = [
  { label: "Request Triage", detail: "Classify service, urgency, missing info, suggested priority" },
  { label: "Technician Assistant", detail: "Draft diagnosis, report text, missing evidence check" },
  { label: "PM Intelligence", detail: "Overdue PM, repeat failure, monthly client summary" },
  { label: "Operations Watchdog", detail: "SLA risk, stale jobs, approvals stuck, invoices missing proof" },
];

const commercialPanels = [
  "Contract scope: Included / Chargeable / Quotation required / Out of scope",
  "Job cost: labour hours, parts cost, consumables, transport, subcontract",
  "Approval gate: spare parts, extra visits, emergency overtime, major repair",
  "Invoice package: report, photos, sign-off, approved extras, suggested amount",
];

const technicianToday = [
  { time: "09:00", title: "Hood Cleaning", site: "Pearl Hotel Doha · Main Kitchen", status: "Scheduled", action: "Start pre-cleaning inspection" },
  { time: "11:30", title: "Fryer Diagnosis", site: "Al Noor Restaurant · West Bay", status: "In Progress", action: "Add temperature reading" },
  { time: "14:00", title: "Cold Room Emergency", site: "Marina Catering · CPU", status: "Awaiting Approval", action: "Follow up spare-part approval" },
];

const technicianSteps = [
  "Open job",
  "Navigate / call client",
  "Start job",
  "Scan QR",
  "Before photos",
  "Checklist",
  "Readings",
  "Parts / approval",
  "After photos",
  "Client signature",
  "Submit report",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapJobToWorkQueue(job: ServiceJobRow): WorkQueueItem {
  const clientName = job.companies?.[0]?.name ?? "Unassigned";
  const branchName = job.branches?.[0]?.name ?? "No branch";
  const assetName = job.equipment?.[0]
    ? `${job.equipment[0].equipment_name}${job.equipment[0].asset_code ? ` (${job.equipment[0].asset_code})` : ""}`
    : "No asset linked";

  const techTypes = ["kitchen_equipment", "refrigeration", "hvac", "coffee_machine", "mep"];
  const isTechnical = techTypes.includes(job.job_type);

  return {
    id: job.id,
    job_number: job.job_number ?? job.id.slice(0, 8),
    job_type: job.job_type.replace(/_/g, " "),
    priority: job.priority,
    status: job.status.replace(/_/g, " "),
    complaint: job.complaint,
    client: clientName,
    branch: branchName,
    asset: assetName,
    assignedTo: "OATA Operations",
    sla: "Set SLA",
    nextAction: job.status === "created"
      ? "Assign technician and schedule visit"
      : job.status === "assigned"
      ? "Technician to start job on site"
      : job.status === "in_progress"
      ? "Complete diagnosis and record findings"
      : job.status === "awaiting_leadman_review"
      ? "Leadman to review and verify quality"
      : job.status === "awaiting_client_signoff"
      ? "Client to sign off completion"
      : job.status === "awaiting_manager_approval"
      ? "Manager to approve completion"
      : job.status === "completed"
      ? "Job completed — generate certificate/report"
      : "Review and assign",
    evidence: job.status === "completed" ? "Complete" : "Pending",
    approval: job.status.includes("approval") ? "Pending approval" : "Not required",
    reportScore: job.status === "completed" ? "Complete" : `${isTechnical ? "7" : "5"}/11 complete`,
  };
}

function badgeClass(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("emergency") || lower.includes("critical") || lower.includes("risk")) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (lower.includes("awaiting") || lower.includes("approval") || lower.includes("high")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (lower.includes("scheduled") || lower.includes("progress") || lower.includes("assigned")) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function statTone(tone: string) {
  if (tone === "red") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Home() {
  const [email, setEmail] = useState("abdixashi91@gmail.com");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);

  // Real data from Supabase
  const [jobs, setJobs] = useState<ServiceJobRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [allProfiles, setAllProfiles] = useState<ProfileRow[]>([]);
  const [activityLog, setActivityLog] = useState<string[]>([]);

  const normalizedJobs = useMemo(() => jobs.map(mapJobToWorkQueue), [jobs]);

  // Computed stats from real data
  const inspectionStats = useMemo(() => {
    const open = jobs.filter((j) => !["completed", "cancelled"].includes(j.status));
    const technicalTypes = ["kitchen_equipment", "refrigeration", "hvac", "coffee_machine", "mep"];
    const cleaningTypes = ["hood_cleaning", "duct_cleaning", "grease_trap", "drainage", "water_tank", "ecology_unit"];
    const techCount = open.filter((j) => technicalTypes.includes(j.job_type)).length;
    const cleanCount = open.filter((j) => cleaningTypes.includes(j.job_type)).length;
    const critical = open.filter((j) => ["emergency", "urgent"].includes(j.priority)).length;
    const pendingAppr = approvals.filter((a) => a.decision === "pending").length;
    const completed = jobs.filter((j) => j.status === "completed").length;

    return [
      { label: "Open Inspections", value: String(open.length), detail: `${techCount} technical · ${cleanCount} cleaning`, tone: "blue" },
      { label: "Critical Findings", value: String(critical), detail: critical > 0 ? "Emergency / urgent priority" : "No critical items", tone: critical > 0 ? "red" : "green" },
      { label: "Pending Approvals", value: String(pendingAppr), detail: pendingAppr > 0 ? "Awaiting decision" : "No pending approvals", tone: pendingAppr > 0 ? "amber" : "green" },
      { label: "Reports Ready", value: String(completed), detail: completed > 0 ? "Completed jobs ready for review" : "No completed jobs yet", tone: "green" },
    ];
  }, [jobs, approvals]);

  async function loadDashboardData(authUser?: User) {
    const user = authUser ?? (await supabase.auth.getUser()).data.user;

    if (!user) {
      setProfile(null);
      setJobs([]);
      setApprovals([]);
      setAllProfiles([]);
      setActivityLog([]);
      setMessage("No active Supabase session. Please sign in again.");
      return;
    }

    // ─── Profile ─────────────────────────────────────────────────────────
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role, status")
      .eq("id", user.id)
      .maybeSingle();

    const fallbackProfile: Profile = {
      id: user.id,
      full_name:
        typeof user.user_metadata?.full_name === "string"
          ? (user.user_metadata.full_name as string)
          : user.email ?? "Demo admin",
      role: "oata_admin",
      status: "demo access",
    };

    setProfile(profileData ?? fallbackProfile);

    const profileMsg = profileError
      ? "Signed in with demo access. Profile permissions still being configured."
      : profileData
        ? "Signed in successfully."
        : "Signed in with demo access. No profile row exists yet for this user.";

    // ─── Service Jobs (flat, no joins — more reliable) ─────────────────
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
      setMessage(`${profileMsg} Jobs load error: ${jobsError.message}`);
      return;
    }

    // ─── Fetch company/branch/equipment names separately ────────────────
    const companyIds = [...new Set((jobsData ?? []).map((j: any) => j.company_id).filter(Boolean))] as string[];
    const branchIds = [...new Set((jobsData ?? []).map((j: any) => j.branch_id).filter(Boolean))] as string[];
    const equipmentIds = [...new Set((jobsData ?? []).map((j: any) => j.equipment_id).filter(Boolean))] as string[];

    const [companiesRes, branchesRes, equipmentRes] = await Promise.all([
      companyIds.length > 0
        ? supabase.from("companies").select("id, name").in("id", companyIds)
        : Promise.resolve({ data: null, error: null }),
      branchIds.length > 0
        ? supabase.from("branches").select("id, name").in("id", branchIds)
        : Promise.resolve({ data: null, error: null }),
      equipmentIds.length > 0
        ? supabase.from("equipment").select("id, equipment_name, asset_code").in("id", equipmentIds)
        : Promise.resolve({ data: null, error: null }),
    ]);

    const companyMap = new Map<string, string>();
    (companiesRes.data ?? []).forEach((c: any) => companyMap.set(c.id, c.name));

    const branchMap = new Map<string, string>();
    (branchesRes.data ?? []).forEach((b: any) => branchMap.set(b.id, b.name));

    const equipmentMap = new Map<string, { name: string; asset_code: string | null }>();
    (equipmentRes.data ?? []).forEach((e: any) =>
      equipmentMap.set(e.id, { name: e.equipment_name, asset_code: e.asset_code }),
    );

    // ─── Merge into ServiceJobRow format ────────────────────────────────
    const mergedJobs: ServiceJobRow[] = (jobsData ?? []).map((j: any) => ({
      ...j,
      companies: companyMap.has(j.company_id) ? [{ id: j.company_id, name: companyMap.get(j.company_id)! }] : null,
      branches: branchMap.has(j.branch_id) ? [{ id: j.branch_id, name: branchMap.get(j.branch_id)! }] : null,
      equipment: equipmentMap.has(j.equipment_id)
        ? [{ id: j.equipment_id, equipment_name: equipmentMap.get(j.equipment_id)!.name, asset_code: equipmentMap.get(j.equipment_id)!.asset_code }]
        : null,
    }));

    setJobs(mergedJobs);

    // ─── Approvals ───────────────────────────────────────────────────────
    const { data: apprData, error: apprError } = await supabase
      .from("approvals")
      .select("id, approval_type, decision, amount_qar, currency, comment, job_id")
      .order("requested_at", { ascending: false })
      .limit(20);

    if (!apprError && apprData) {
      setApprovals(apprData as ApprovalRow[]);
    }

    // ─── All profiles (admin only) ───────────────────────────────────────
    if ((profileData ?? fallbackProfile).role === "oata_admin") {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, role, status")
        .order("full_name", { ascending: true });

      if (!profilesError && profilesData) {
        // Get emails from auth.users via user_metadata — Supabase doesn't expose auth.users
        // through the anon key, so we map what we can.
        const mapped: ProfileRow[] = profilesData.map((p: any) => ({
          id: p.id,
          full_name: p.full_name,
          role: p.role,
          status: p.status,
          email: p.id === user.id ? (user.email ?? "—") : "—",
        }));
        setAllProfiles(mapped);
      }
    }

    // ─── Audit logs (recent activity) ────────────────────────────────────
    const { data: logsData, error: logsError } = await supabase
      .from("audit_logs")
      .select("action, entity_type, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (!logsError && logsData && logsData.length > 0) {
      setActivityLog(logsData.map((l: any) => `${l.action} — ${l.entity_type}`));
    } else {
      setActivityLog([
        "Portal session started",
        `Loaded ${jobsData?.length ?? 0} service jobs`,
      ]);
    }

    setMessage(profileMsg);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      setMessage("Login failed: email is required.");
      return;
    }

    if (!password) {
      setMessage("Login failed: password is required.");
      return;
    }

    setMessage("Checking Supabase login...");
    setIsSigningIn(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage(`Login failed: ${error.message}`);
        return;
      }

      if (!data.user) {
        setMessage("Login failed: Supabase did not return a user session.");
        return;
      }

      await loadDashboardData(data.user);
    } catch (error) {
      setMessage(`Login failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function createDemoAccount() {
    if (!email.trim()) {
      setMessage("Signup failed: email is required.");
      return;
    }

    if (!password) {
      setMessage("Signup failed: password is required.");
      return;
    }

    setMessage("Creating demo Supabase account...");
    setIsSigningUp(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: "Abdirahman Hussien Hashi",
            role: "oata_admin",
          },
        },
      });

      if (error) {
        setMessage(`Signup failed: ${error.message}`);
        return;
      }

      if (!data.user) {
        setMessage("Signup failed: Supabase did not return a user.");
        return;
      }

      if (!data.session) {
        setMessage("Demo account created. Supabase requires email confirmation before sign in.");
        return;
      }

      setProfile({
        id: data.user.id,
        full_name:
          typeof data.user.user_metadata?.full_name === "string"
            ? (data.user.user_metadata.full_name as string)
            : data.user.email ?? "Demo admin",
        role: "oata_admin",
        status: "demo auth active / profile row not required",
      });
      setMessage("Demo account created and signed in. Loading dashboard...");
      await loadDashboardData(data.user);
    } catch (error) {
      setMessage(`Signup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsSigningUp(false);
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

  // ─── Render ─────────────────────────────────────────────────────────────

  const approvalsDisplay = approvals.length > 0
    ? approvals.map((a) => ({
        type: a.approval_type.replace(/_/g, " "),
        job: a.job_id?.slice(0, 8) ?? "—",
        owner: "Pending",
        wait: a.decision === "pending" ? "Awaiting" : a.decision,
        amount: a.amount_qar ? `QAR ${a.amount_qar.toLocaleString()}` : a.comment ?? "—",
      }))
    : [
        { type: "No approvals", job: "—", owner: "—", wait: "—", amount: "No pending approvals" },
      ];

  return (
    <main className="min-h-screen bg-[#eef3f6] text-slate-950">
      {!profile ? (
        <section className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_0.9fr]">
          <div className="relative overflow-hidden bg-[#0b3341] px-6 py-10 text-white sm:px-10 lg:px-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_10%,rgba(34,211,238,0.28),transparent_35%),radial-gradient(circle_at_70%_75%,rgba(16,185,129,0.24),transparent_35%)]" />
            <div className="relative z-10 flex h-full flex-col justify-between gap-12">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.45em] text-cyan-200">OATA Inspection Portal</p>
                <h1 className="mt-8 max-w-3xl text-5xl font-semibold tracking-[-0.06em] text-white sm:text-6xl lg:text-7xl">
                  Inspect. Correct. Certify.
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-cyan-50/80">
                  Inspectivity-style layout for OATA: asset hierarchy, inspection registers, templates,
                  issue types, media evidence, certificates, schedules, and user administration.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Field first", "Inspection checklists and evidence"],
                  ["Action driven", "Findings, approvals, corrective actions"],
                  ["Audit ready", "Reports, certificates, account review"],
                ].map(([title, detail]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.08] p-5 backdrop-blur">
                    <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">{title}</p>
                    <p className="mt-3 text-sm leading-6 text-cyan-50/80">{detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center px-6 py-10 sm:px-10">
            <section className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-7 shadow-2xl shadow-slate-900/10">
              <div className="mb-8">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700">Secure access</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Admin Login</h2>
                <p className="mt-2 text-sm text-slate-500">Sign in with your Supabase email and password.</p>
              </div>

              <form onSubmit={signIn}>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none ring-cyan-500/20 transition focus:border-cyan-600 focus:ring-4"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <label className="mt-5 block text-sm font-medium text-slate-700">Password</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none ring-cyan-500/20 transition focus:border-cyan-600 focus:ring-4"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <button
                  type="submit"
                  disabled={isSigningIn || isSigningUp}
                  className="mt-6 w-full rounded-xl bg-cyan-700 px-4 py-3 font-semibold text-white shadow-lg shadow-cyan-700/20 transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isSigningIn ? "Signing in..." : "Sign in"}
                </button>

                <button
                  type="button"
                  onClick={createDemoAccount}
                  disabled={isSigningIn || isSigningUp}
                  className="mt-3 w-full rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  {isSigningUp ? "Creating account..." : "Create demo account"}
                </button>
              </form>

              <p className="mt-4 min-h-5 text-sm text-amber-700" aria-live="polite">
                {message || "Enter your Supabase email/password, then sign in or create a demo account."}
              </p>
            </section>
          </div>
        </section>
      ) : (
        <section className="flex min-h-screen">
          <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-[#123747] px-5 py-6 text-white xl:block">
            <div className="mb-10">
              <p className="text-xs font-semibold uppercase tracking-[0.45em] text-cyan-200">OATA</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-[-0.05em]">Inspect</h1>
              <p className="mt-2 text-sm text-cyan-50/70">Reliable care. Lasting quality.</p>
            </div>

            <nav className="space-y-5 text-sm">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item, index) => (
                      <button
                        key={item}
                        className={`w-full rounded-xl px-4 py-2.5 text-left transition ${
                          group.label === "Main Work" && index === 0
                            ? "bg-white text-slate-950"
                            : "text-cyan-50/80 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-10 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Inspection rule</p>
              <p className="mt-3 text-sm leading-6 text-cyan-50/80">
                Admin can view all accounts for audit and support, but cannot modify accounts from this screen.
              </p>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#eef3f6]/90 px-5 py-4 backdrop-blur lg:px-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-700">Inspection Command Center</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-3xl">
                    Work packs, findings, actions, reports
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
                    {profile.full_name} · <span className="font-medium text-cyan-700">{profile.role}</span>
                  </div>
                  <a href="/technician" className="rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-100">
                    Technician App
                  </a>
                  <button onClick={signOut} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                    Sign out
                  </button>
                </div>
              </div>
            </header>

            <main className="space-y-8 px-5 py-6 lg:px-8">
              {/* Stats */}
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {inspectionStats.map((card) => (
                  <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className={`mb-5 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statTone(card.tone)}`}>
                      {card.label}
                    </div>
                    <p className="text-4xl font-semibold tracking-[-0.06em] text-slate-950">{card.value}</p>
                    <p className="mt-2 text-sm text-slate-500">{card.detail}</p>
                  </div>
                ))}
              </section>

              {/* Role-based home screens */}
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-700">Role-based home screens</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">One portal, different daily priorities</h3>
                  </div>
                  <p className="max-w-2xl text-sm text-slate-500">
                    Keep the Inspectivity-style registers for control, but show technicians and clients simple MaintainX-style next actions.
                  </p>
                </div>
                <div className="mt-5 grid gap-3 lg:grid-cols-5">
                  {roleDashboards.map((view) => (
                    <div key={view.role} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-semibold text-slate-950">{view.role}</p>
                      <p className="mt-2 min-h-12 text-sm text-slate-500">{view.focus}</p>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {view.actions.slice(0, 3).map((action) => (
                          <span key={action} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                            {action}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Technician portal preview */}
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-700">Technician Portal Preview</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Mobile-first daily work screen</h3>
                  </div>
                  <p className="max-w-2xl text-sm text-slate-500">
                    Technicians should not see admin registers first. They need today's jobs, start button, QR scan, evidence gates, readings, and signature.
                  </p>
                </div>

                <div className="mt-5 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                  <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-4 text-white shadow-xl">
                    <div className="rounded-[1.5rem] bg-[#f7fafc] p-4 text-slate-950">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Technician</p>
                          <h4 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">Today</h4>
                        </div>
                        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">1 Emergency</span>
                      </div>

                      <button className="mt-5 w-full rounded-2xl bg-cyan-700 px-4 py-4 text-center text-sm font-semibold text-white">
                        Scan QR / Start Job
                      </button>

                      <div className="mt-5 space-y-3">
                        {technicianToday.map((job) => (
                          <div key={`${job.time}-${job.title}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-950">{job.time} · {job.title}</p>
                                <p className="mt-1 text-sm text-slate-500">{job.site}</p>
                              </div>
                              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(job.status)}`}>
                                {job.status}
                              </span>
                            </div>
                            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Next: {job.action}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <h4 className="text-lg font-semibold tracking-[-0.03em]">Technician job flow</h4>
                    <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {technicianSteps.map((step, index) => (
                        <div key={step} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-cyan-700">
                            {index + 1}
                          </span>
                          <p className="mt-3 font-medium text-slate-700">{step}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      Rule: technician cannot complete a job until required QR scan, photos, checklist, readings, and signature are complete or a supervisor-approved exception is recorded.
                    </p>
                  </div>
                </div>
              </section>

              {/* Inspection Work Packs — REAL DATA */}
              <section className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-xl font-semibold tracking-[-0.03em]">Inspection Work Packs</h3>
                      <p className="text-sm text-slate-500">
                        {normalizedJobs.length > 0
                          ? `${normalizedJobs.length} live job${normalizedJobs.length === 1 ? "" : "s"} from Supabase`
                          : "No live jobs yet — showing empty state"}
                      </p>
                    </div>
                    <button onClick={() => window.location.href = '/equipment'} className="rounded-full bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600">Equipment Register</button>
                  </div>

                  <div className="space-y-3">
                    {normalizedJobs.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
                        <p className="text-slate-400">No service jobs found in Supabase.</p>
                        <p className="mt-2 text-sm text-slate-400">Create jobs in Supabase or via the portal to see them here.</p>
                      </div>
                    ) : (
                      normalizedJobs.map((job) => (
                        <article key={job.id} className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-cyan-300 hover:bg-cyan-50" onClick={() => window.location.href = `/jobs/${job.id}`}>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-slate-500">{job.job_number}</span>
                                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(job.priority)}`}>{job.priority}</span>
                                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(job.status)}`}>{job.status}</span>
                              </div>
                              <h4 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-slate-950">{job.client} · {job.branch}</h4>
                              <p className="mt-1 text-sm text-slate-600">{job.job_type} · {job.asset}{job.complaint ? ` · ${job.complaint}` : ""}</p>
                            </div>
                            <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm lg:w-72">
                              <p className="font-medium text-slate-950">Next action</p>
                              <p className="mt-1">{job.nextAction}</p>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                            <div><span className="text-slate-400">Inspector / Team</span><p className="font-medium">{job.assignedTo}</p></div>
                            <div><span className="text-slate-400">SLA</span><p className="font-medium">{job.sla}</p></div>
                            <div><span className="text-slate-400">Evidence</span><p className="font-medium">{job.evidence}</p></div>
                            <div><span className="text-slate-400">Checklist</span><p className="font-medium">{job.reportScore}</p></div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>

                {/* Approvals — REAL DATA */}
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-xl font-semibold tracking-[-0.03em]">Asset Hierarchy</h3>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                      <p className="font-semibold text-slate-950">OATA Services</p>
                      <div className="mt-3 space-y-2 border-l border-slate-300 pl-4 text-slate-600">
                        <p>OATA Main Office / OATA-HQ</p>
                        <p>Equipment: Demo Kitchen Hood, Demo Refrigeration, Demo Coffee Machine</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-xl font-semibold tracking-[-0.03em]">Findings & Approvals</h3>
                    <div className="mt-4 space-y-3">
                      {approvalsDisplay.map((item, idx) => (
                        <div key={`${item.type}-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-950">{item.type}</p>
                              <p className="mt-1 text-sm text-slate-500">{item.job} · {item.owner}</p>
                            </div>
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{item.wait}</span>
                          </div>
                          <p className="mt-3 text-sm font-medium text-slate-700">{item.amount}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Inspection Templates */}
              <section className="grid gap-6 xl:grid-cols-3">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">Inspection Templates</h3>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {inspectionTemplates.map((template) => (
                      <div key={template.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{template.title}</p>
                            <p className="mt-1 text-sm text-slate-500">{template.detail}</p>
                          </div>
                          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">{template.count}</span>
                        </div>
                        <div className="mt-4 h-2 rounded-full bg-slate-200">
                          <div className="h-2 rounded-full bg-cyan-600" style={{ width: template.progress }} />
                        </div>
                        <p className="mt-2 text-xs font-medium text-slate-500">Checklist completion {template.progress}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">Checklist Gates</h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {checklistGates.map((gate) => (
                      <span key={gate} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{gate}</span>
                    ))}
                  </div>
                </div>
              </section>

              {/* Asset Intelligence & Commercial Control */}
              <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-700">Asset Intelligence</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">The asset record is the heart of OATA Care</h3>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {assetIntelligence.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="font-semibold text-slate-950">{item.label}</p>
                        <p className="mt-2 text-sm text-slate-500">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-700">Commercial Control</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Protect margin before work becomes free work</h3>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {commercialControls.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-600">{item.label}</p>
                        <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{item.value}</p>
                        <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    {commercialPanels.map((item) => (
                      <p key={item} className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{item}</p>
                    ))}
                  </div>
                </div>
              </section>

              {/* AI Core & Audit Trail — REAL DATA */}
              <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                <div className="rounded-3xl border border-slate-200 bg-[#123747] p-5 text-white shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200">OATA AI Core</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Lady AI recommends · OATA team approves · OATA Care records every action</h3>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {aiControls.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-cyan-200/20 bg-white/10 p-4">
                        <p className="font-semibold text-white">{item.label}</p>
                        <p className="mt-2 text-sm text-cyan-50/80">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                    Human approval remains required for spare parts, quotations, invoices, user permissions, disputes, and contract changes.
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">Activity / Audit Trail</h3>
                  <div className="mt-4 space-y-3">
                    {activityLog.length === 0 ? (
                      <p className="text-sm text-slate-400">No recent activity.</p>
                    ) : (
                      activityLog.map((activity, idx) => (
                        <div key={idx} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan-600" />
                          <p>{activity}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>

              {/* User Administration — REAL DATA */}
              {profile.role === "oata_admin" && (
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-700">User Administration</p>
                      <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">All Accounts Directory</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {allProfiles.length > 0
                          ? `${allProfiles.length} profile${allProfiles.length === 1 ? "" : "s"} in Supabase`
                          : "No profiles found or profile permissions not yet configured"}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">Read-only · no modify actions</span>
                  </div>

                  <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                    <div className="hidden grid-cols-[1.15fr_0.9fr_0.8fr_1fr_0.65fr] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid">
                      <span>Account</span><span>Role</span><span>Status</span><span>Scope</span><span>Control</span>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {allProfiles.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-slate-400">
                          No profiles loaded. Check RLS policies on the profiles table.
                        </div>
                      ) : (
                        allProfiles.map((account) => (
                          <div key={account.id} className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[1.15fr_0.9fr_0.8fr_1fr_0.65fr] lg:items-center">
                            <div>
                              <p className="font-semibold text-slate-950">{account.full_name}</p>
                              <p className="mt-1 text-slate-500">{account.email}</p>
                            </div>
                            <p className="font-mono text-xs text-slate-700">{account.role}</p>
                            <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{account.status}</span>
                            <p className="text-slate-600">{account.role === "oata_admin" ? "All OATA operations" : account.role}</p>
                            <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">View only</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>
              )}

              {message && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{message}</p>}
            </main>
          </div>
        </section>
      )}
    </main>
  );
}
