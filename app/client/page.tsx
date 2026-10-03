"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, badgeClass, statusLabel, categoryLabel } from "@/lib/supabase";

type Profile = {
  id: string;
  full_name: string;
  role: string;
  company_id: string | null;
  branch_id: string | null;
};

type Contract = {
  id: string;
  contract_name: string;
  owner_company_id: string;
  service_category: string;
  contract_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  billing_model: string | null;
  notes: string | null;
};

type ContractBranch = {
  id: string;
  contract_id: string;
  branch_id: string;
  tenant_company_id: string | null;
  status: string;
  notes: string | null;
};

type ClientJob = {
  id: string;
  job_number: string | null;
  job_type: string;
  service_category: string | null;
  priority: string;
  status: string;
  complaint: string | null;
  scope_of_work: string | null;
  recommendations: string | null;
  contract_id: string | null;
  company_id: string | null;
  branch_id: string | null;
  equipment_id: string | null;
  requested_by_company_id: string | null;
  bill_to_company_id: string | null;
  site_company_id: string | null;
  visibility_scope: string;
  created_at: string;
};

type Company = { id: string; name: string; company_type: string | null };
type Branch = { id: string; name: string; branch_code: string | null; company_id: string | null };
type Equipment = { id: string; equipment_name: string; asset_code: string | null };

type StatCard = {
  label: string;
  value: number;
  caption: string;
  icon: string;
  tone: string;
};

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function byId<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isOpenStatus(status: string) {
  return ["created", "assigned", "awaiting_manager_approval", "approved", "quotation_required", "parts_required"].includes(status);
}

function isInProgressStatus(status: string) {
  return ["in_progress", "awaiting_leadman_review", "awaiting_client_signoff"].includes(status);
}

function ClientSidebar({ profile }: { profile: Profile | null }) {
  const nav = [
    ["Dashboard", "/client", "⌂"],
    ["Jobs", "#recent-jobs", "▣"],
    ["Requests", "/client/request", "+"],
    ["Approvals", "/client/approvals", "✓"],
    ["Reports", "/reports", "◷"],
    ["Sign-off", "/client/signoff", "✎"],
  ];

  return (
    <aside className="hidden min-h-screen w-[280px] flex-col bg-[#052f4f] text-white lg:flex">
      <div className="px-7 py-7">
        <div className="flex items-center gap-3">
          <img src="/oata-logo.png" alt="OATA" className="h-12 w-auto rounded-xl bg-white/95 p-1" />
          <div>
            <p className="text-lg font-semibold leading-none">OATA | أواتا</p>
            <p className="mt-1 text-[11px] text-cyan-100/70">Maintenance and Cleaning</p>
          </div>
        </div>
      </div>

      <nav className="space-y-1 px-4">
        {nav.map(([label, href, icon], index) => (
          <Link
            key={label}
            href={href}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              index === 0 ? "bg-[#0872c9] text-white shadow-lg shadow-blue-950/25" : "text-cyan-50/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 text-sm">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto px-7 py-7">
        <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-4">
          <p className="text-xs text-cyan-100/65">Signed in as</p>
          <p className="mt-1 text-sm font-semibold">{profile?.full_name ?? "Client User"}</p>
          <p className="mt-1 text-xs text-cyan-100/65">{fmt(profile?.role)}</p>
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
            <p className="text-[11px] text-slate-500">Client Portal</p>
          </div>
        </div>
        <Link href="/client/request" className="rounded-full bg-[#0872c9] px-4 py-2 text-xs font-bold text-white shadow-sm">
          New
        </Link>
      </div>
      <p className="mt-3 text-sm font-semibold text-[#123747]">Good morning, {profile?.full_name?.split(" ")[0] ?? "Client"}</p>
    </header>
  );
}

function StatTile({ stat }: { stat: StatCard }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl text-base ${stat.tone}`}>{stat.icon}</p>
          <p className="mt-4 text-sm font-semibold text-slate-500">{stat.label}</p>
          <p className="mt-1 text-3xl font-bold tracking-[-0.05em] text-[#123747]">{stat.value}</p>
          <p className="mt-1 text-xs font-medium text-slate-400">{stat.caption}</p>
        </div>
      </div>
    </article>
  );
}

function DonutChart({ distribution }: { distribution: { label: string; value: number; color: string }[] }) {
  const total = distribution.reduce((sum, item) => sum + item.value, 0);
  let running = 0;
  const gradient = distribution
    .map((item) => {
      const start = total > 0 ? (running / total) * 100 : 0;
      running += item.value;
      const end = total > 0 ? (running / total) * 100 : 0;
      return `${item.color} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="grid gap-6 sm:grid-cols-[160px_1fr] sm:items-center">
      <div className="relative mx-auto h-36 w-36 rounded-full" style={{ background: total > 0 ? `conic-gradient(${gradient})` : "#e2e8f0" }}>
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
          <p className="text-3xl font-bold tracking-[-0.05em] text-[#123747]">{total}</p>
          <p className="text-xs font-semibold text-slate-400">Total Jobs</p>
        </div>
      </div>
      <div className="space-y-3">
        {distribution.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="font-medium text-slate-600">{item.label}</span>
            </div>
            <span className="font-bold text-[#123747]">{total > 0 ? Math.round((item.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ClientPortalPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractBranches, setContractBranches] = useState<ContractBranch[]>([]);
  const [jobs, setJobs] = useState<ClientJob[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadClientPortal() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
          window.location.href = "/";
          return;
        }

        const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, role, company_id, branch_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setMessage(`Profile error: ${profileError.message}`);
      }

      setProfile(
        profileData ?? {
          id: user.id,
          full_name: user.email ?? "Client User",
          role: "client_user",
          company_id: null,
          branch_id: null,
        },
      );

      const [contractsRes, contractBranchesRes, jobsRes] = await Promise.all([
        supabase
          .from("contracts")
          .select("id, contract_name, owner_company_id, service_category, contract_type, status, start_date, end_date, billing_model, notes")
          .order("contract_name", { ascending: true }),
        supabase.from("contract_branches").select("id, contract_id, branch_id, tenant_company_id, status, notes").order("created_at", { ascending: true }),
        supabase
          .from("service_jobs")
          .select(
            "id, job_number, job_type, service_category, priority, status, complaint, scope_of_work, recommendations, contract_id, company_id, branch_id, equipment_id, requested_by_company_id, bill_to_company_id, site_company_id, visibility_scope, created_at",
          )
          .order("created_at", { ascending: false }),
      ]);

      if (contractsRes.error) setMessage(`Contracts error: ${contractsRes.error.message}`);
      if (contractBranchesRes.error) setMessage(`Contract branches error: ${contractBranchesRes.error.message}`);
      if (jobsRes.error) setMessage(`Jobs error: ${jobsRes.error.message}`);

      const loadedContracts = (contractsRes.data ?? []) as Contract[];
      const loadedContractBranches = (contractBranchesRes.data ?? []) as ContractBranch[];
      const loadedJobs = (jobsRes.data ?? []) as ClientJob[];

      setContracts(loadedContracts);
      setContractBranches(loadedContractBranches);
      setJobs(loadedJobs);

      const companyIds = [
        ...loadedContracts.map((contract) => contract.owner_company_id),
        ...loadedContractBranches.map((row) => row.tenant_company_id).filter(Boolean),
        ...loadedJobs.flatMap((job) => [job.company_id, job.requested_by_company_id, job.bill_to_company_id, job.site_company_id]).filter(Boolean),
      ] as string[];
      const branchIds = [...loadedContractBranches.map((row) => row.branch_id), ...loadedJobs.map((job) => job.branch_id).filter(Boolean)] as string[];
      const equipmentIds = loadedJobs.map((job) => job.equipment_id).filter(Boolean) as string[];

      const [companiesRes, branchesRes, equipmentRes] = await Promise.all([
        companyIds.length ? supabase.from("companies").select("id, name, company_type").in("id", [...new Set(companyIds)]) : Promise.resolve({ data: null, error: null }),
        branchIds.length ? supabase.from("branches").select("id, name, branch_code, company_id").in("id", [...new Set(branchIds)]) : Promise.resolve({ data: null, error: null }),
        equipmentIds.length ? supabase.from("equipment").select("id, equipment_name, asset_code").in("id", [...new Set(equipmentIds)]) : Promise.resolve({ data: null, error: null }),
      ]);

      setCompanies((companiesRes.data ?? []) as Company[]);
      setBranches((branchesRes.data ?? []) as Branch[]);
      setEquipment((equipmentRes.data ?? []) as Equipment[]);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown client dashboard error";
        setMessage(`Client dashboard error: ${detail}`);
      } finally {
        setLoading(false);
      }
    }

    loadClientPortal();
  }, []);

  const companyMap = useMemo(() => byId(companies), [companies]);
  const branchMap = useMemo(() => byId(branches), [branches]);
  const equipmentMap = useMemo(() => byId(equipment), [equipment]);

  const urgentJobs = useMemo(() => jobs.filter((job) => ["urgent", "emergency", "critical"].includes(job.priority)), [jobs]);
  const openJobs = useMemo(() => jobs.filter((job) => isOpenStatus(job.status)), [jobs]);
  const inProgressJobs = useMemo(() => jobs.filter((job) => isInProgressStatus(job.status)), [jobs]);
  const completedJobs = useMemo(() => jobs.filter((job) => job.status === "completed"), [jobs]);
  const recentJobs = useMemo(() => jobs.slice(0, 7), [jobs]);
  const directJobs = useMemo(() => jobs.filter((job) => !job.contract_id), [jobs]);

  const stats: StatCard[] = [
    { label: "Urgent", value: urgentJobs.length, caption: "Needs attention", icon: "△", tone: "bg-red-50 text-red-600" },
    { label: "Open", value: openJobs.length, caption: "Pending / assigned", icon: "◷", tone: "bg-blue-50 text-blue-600" },
    { label: "In Progress", value: inProgressJobs.length, caption: "On site / review", icon: "◉", tone: "bg-cyan-50 text-cyan-700" },
    { label: "Completed", value: completedJobs.length, caption: "Ready for reports", icon: "✓", tone: "bg-emerald-50 text-emerald-600" },
  ];

  const distribution = [
    { label: "Hood Cleaning", value: jobs.filter((job) => job.service_category === "hood_cleaning").length, color: "#0872c9" },
    { label: "HVAC", value: jobs.filter((job) => job.service_category === "hvac").length, color: "#22C8D8" },
    { label: "Kitchen Equipment", value: jobs.filter((job) => job.service_category === "kitchen_equipment").length, color: "#D6A641" },
    { label: "Refrigeration", value: jobs.filter((job) => job.service_category === "refrigeration").length, color: "#22c55e" },
    { label: "Other", value: jobs.filter((job) => !["hood_cleaning", "hvac", "kitchen_equipment", "refrigeration"].includes(job.service_category ?? "")).length, color: "#94a3b8" },
  ];

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef5f8]">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-[#123747]">Loading OATA Client Portal...</p>
          <p className="mt-1 text-xs text-slate-400">Checking your secure access.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef5f8] text-slate-950 lg:flex">
      <ClientSidebar profile={profile} />
      <section className="min-w-0 flex-1">
        <MobileHeader profile={profile} />

        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <header className="hidden items-center justify-between gap-5 lg:flex">
            <div>
              <p className="text-sm font-semibold text-[#0872c9]">Welcome back, {profile?.full_name ?? "Client"}</p>
              <h1 className="mt-1 text-3xl font-bold tracking-[-0.05em] text-[#123747]">Client Dashboard</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden w-[330px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 xl:flex">
                <span>⌕</span>
                <span>Search clients, locations, or jobs...</span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#123747]">
                {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date())}
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#052f4f] text-sm font-bold text-white">
                  {(profile?.full_name ?? "C").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-[#123747]">{profile?.full_name ?? "Client"}</p>
                  <p className="text-xs text-slate-400">{fmt(profile?.role)}</p>
                </div>
              </div>
            </div>
          </header>

          <section className="mt-3 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:mt-7 lg:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#327482]">Reliable care. Lasting quality.</p>
                <h2 className="mt-3 text-2xl font-bold tracking-[-0.05em] text-[#123747] sm:text-4xl">Your OATA service control center</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                  Track open work, monitor contract jobs, approve completion, and download reports from one secure client dashboard.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/client/request" className="rounded-2xl bg-[#0872c9] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#065fa8]">
                  Create New Request
                </Link>
                <Link href="/reports" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-[#123747] transition hover:border-[#0872c9]/40 hover:bg-blue-50">
                  View Reports
                </Link>
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <StatTile key={stat.label} stat={stat} />
            ))}
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_370px]">
            <article id="recent-jobs" className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-bold tracking-[-0.04em] text-[#123747]">Recent Jobs</h3>
                  <p className="mt-1 text-sm text-slate-500">Visible according to your company, branch, and contract access.</p>
                </div>
                <Link href="/reports" className="text-sm font-bold text-[#0872c9] hover:text-[#052f4f]">
                  View all →
                </Link>
              </div>

              <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
                <div className="hidden grid-cols-[120px_1.1fr_1fr_1fr_110px] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400 md:grid">
                  <span>Status</span>
                  <span>Client / Job</span>
                  <span>Location</span>
                  <span>Service</span>
                  <span>Time</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {recentJobs.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">No jobs visible for this account.</div>
                  ) : (
                    recentJobs.map((job) => {
                      const branch = job.branch_id ? branchMap.get(job.branch_id) : null;
                      const siteCompany = job.site_company_id ? companyMap.get(job.site_company_id) : null;
                      const asset = job.equipment_id ? equipmentMap.get(job.equipment_id) : null;

                      return (
                        <Link
                          key={job.id}
                          href={`/jobs/${job.id}`}
                          className="grid gap-3 px-4 py-4 transition hover:bg-[#f7fcff] md:grid-cols-[120px_1.1fr_1fr_1fr_110px] md:items-center"
                        >
                          <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-bold ${badgeClass(job.status)}`}>{statusLabel(job.status)}</span>
                          <div>
                            <p className="text-sm font-bold text-[#123747]">{job.complaint ?? job.job_number ?? categoryLabel(job.job_type)}</p>
                            <p className="mt-1 text-xs text-slate-400">{siteCompany?.name ?? job.job_number ?? job.id.slice(0, 8)}</p>
                          </div>
                          <p className="text-sm font-semibold text-slate-600">{branch?.name ?? "No branch"}</p>
                          <div>
                            <p className="text-sm font-semibold text-slate-600">{categoryLabel(job.service_category ?? job.job_type)}</p>
                            <p className="mt-1 text-xs text-slate-400">{asset?.equipment_name ?? (job.contract_id ? "Contract job" : "Direct job")}</p>
                          </div>
                          <p className="text-xs font-semibold text-slate-400">{shortDate(job.created_at)}</p>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            </article>

            <aside className="space-y-5">
              <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
                <h3 className="text-lg font-bold tracking-[-0.04em] text-[#123747]">Job Distribution</h3>
                <div className="mt-5">
                  <DonutChart distribution={distribution} />
                </div>
              </article>

              <article className="rounded-[2rem] border border-[#bfe7ee] bg-[#eefcff] p-5 shadow-sm">
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-xl text-[#0872c9]">☏</div>
                  <div>
                    <h3 className="text-base font-bold text-[#123747]">Need immediate assistance?</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Submit a new service request and attach photo evidence so OATA can diagnose faster.</p>
                    <Link href="/client/request" className="mt-4 inline-flex rounded-2xl bg-[#0872c9] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#065fa8]">
                      Create New Request
                    </Link>
                  </div>
                </div>
              </article>
            </aside>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-3">
            <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2 lg:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-bold tracking-[-0.04em] text-[#123747]">Contract Coverage</h3>
                  <p className="mt-1 text-sm text-slate-500">Contract work is separated from private restaurant/direct work.</p>
                </div>
                <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">RLS controlled</span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {contracts.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500 md:col-span-2">No contract access found for this account.</p>
                ) : (
                  contracts.map((contract) => {
                    const coveredBranches = contractBranches.filter((row) => row.contract_id === contract.id);
                    return (
                      <div key={contract.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-[#123747]">{contract.contract_name}</p>
                            <p className="mt-1 text-xs text-slate-500">Owner: {companyMap.get(contract.owner_company_id)?.name ?? "—"}</p>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badgeClass(contract.status)}`}>{fmt(contract.status)}</span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-2xl bg-white p-3">
                            <p className="text-xs text-slate-400">Service</p>
                            <p className="mt-1 text-sm font-bold text-[#123747]">{categoryLabel(contract.service_category)}</p>
                          </div>
                          <div className="rounded-2xl bg-white p-3">
                            <p className="text-xs text-slate-400">Restaurants</p>
                            <p className="mt-1 text-sm font-bold text-[#123747]">{coveredBranches.length}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
              <h3 className="text-xl font-bold tracking-[-0.04em] text-[#123747]">Access Summary</h3>
              <div className="mt-5 space-y-3">
                {[
                  ["Visible Jobs", jobs.length],
                  ["Contract Jobs", jobs.filter((job) => job.contract_id).length],
                  ["Direct Jobs", directJobs.length],
                  ["Contracts", contracts.length],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                    <span className="text-sm font-semibold text-slate-500">{label}</span>
                    <span className="text-lg font-bold text-[#123747]">{value}</span>
                  </div>
                ))}
              </div>
              {message && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">{message}</p>}
            </article>
          </section>
        </div>

        <nav className="sticky bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-500 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] lg:hidden">
          {[
            ["Home", "/client", "⌂"],
            ["Jobs", "#recent-jobs", "▣"],
            ["Request", "/client/request", "+"],
            ["Reports", "/reports", "◷"],
            ["More", "/client/signoff", "⋯"],
          ].map(([label, href, icon], index) => (
            <Link key={label} href={href} className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 ${index === 0 ? "bg-blue-50 text-[#0872c9]" : ""}`}>
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
