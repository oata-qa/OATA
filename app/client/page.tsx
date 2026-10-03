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

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function byId<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
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
      const { data: { user } } = await supabase.auth.getUser();
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

      setProfile(profileData ?? {
        id: user.id,
        full_name: user.email ?? "Client User",
        role: "client_user",
        company_id: null,
        branch_id: null,
      });

      const [contractsRes, contractBranchesRes, jobsRes] = await Promise.all([
        supabase
          .from("contracts")
          .select("id, contract_name, owner_company_id, service_category, contract_type, status, start_date, end_date, billing_model, notes")
          .order("contract_name", { ascending: true }),
        supabase
          .from("contract_branches")
          .select("id, contract_id, branch_id, tenant_company_id, status, notes")
          .order("created_at", { ascending: true }),
        supabase
          .from("service_jobs")
          .select("id, job_number, job_type, service_category, priority, status, complaint, scope_of_work, recommendations, contract_id, company_id, branch_id, equipment_id, requested_by_company_id, bill_to_company_id, site_company_id, visibility_scope, created_at")
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
      const branchIds = [
        ...loadedContractBranches.map((row) => row.branch_id),
        ...loadedJobs.map((job) => job.branch_id).filter(Boolean),
      ] as string[];
      const equipmentIds = loadedJobs.map((job) => job.equipment_id).filter(Boolean) as string[];

      const [companiesRes, branchesRes, equipmentRes] = await Promise.all([
        companyIds.length
          ? supabase.from("companies").select("id, name, company_type").in("id", [...new Set(companyIds)])
          : Promise.resolve({ data: null, error: null }),
        branchIds.length
          ? supabase.from("branches").select("id, name, branch_code, company_id").in("id", [...new Set(branchIds)])
          : Promise.resolve({ data: null, error: null }),
        equipmentIds.length
          ? supabase.from("equipment").select("id, equipment_name, asset_code").in("id", [...new Set(equipmentIds)])
          : Promise.resolve({ data: null, error: null }),
      ]);

      setCompanies((companiesRes.data ?? []) as Company[]);
      setBranches((branchesRes.data ?? []) as Branch[]);
      setEquipment((equipmentRes.data ?? []) as Equipment[]);
      setLoading(false);
    }

    loadClientPortal();
  }, []);

  const companyMap = useMemo(() => byId(companies), [companies]);
  const branchMap = useMemo(() => byId(branches), [branches]);
  const equipmentMap = useMemo(() => byId(equipment), [equipment]);

  const contractJobs = useMemo(() => jobs.filter((job) => job.contract_id), [jobs]);
  const directJobs = useMemo(() => jobs.filter((job) => !job.contract_id), [jobs]);
  const hoodContractJobs = useMemo(() => contractJobs.filter((job) => job.service_category === "hood_cleaning"), [contractJobs]);
  const urgentJobs = useMemo(() => jobs.filter((job) => ["urgent", "emergency"].includes(job.priority)), [jobs]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f7f8]">
        <p className="text-slate-500">Loading client portal...</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#327482]">Client Portal</p>
              <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[#123747]">Contracts, Restaurants, Reports</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
              {profile?.full_name ?? "Client"} · <span className="font-semibold text-[#327482]">{fmt(profile?.role)}</span>
            </div>
            <Link href="/client/request" className="rounded-full bg-[#D6A641] px-4 py-2 text-sm font-semibold text-[#123747] hover:bg-[#e3bb62]">
              New Request
            </Link>
            <Link href="/" className="rounded-full bg-[#123747] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a4b5d]">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        <div className="rounded-[2rem] bg-[#123747] p-6 text-white shadow-xl shadow-slate-900/10 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#9deaf2]">Contract-based visibility</p>
              <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
                Corporate clients see contract work. Restaurants see their own restaurants.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72">
                West Walk can see hood-cleaning work under its contract only. A restaurant still sees its own direct OATA work separately.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Visible Jobs", String(jobs.length), "Jobs allowed by your access"],
                ["Hood Contract", String(hoodContractJobs.length), "Kitchen hood cleaning scope"],
                ["Urgent", String(urgentJobs.length), "Needs attention"],
                ["Contracts", String(contracts.length), "Active contract access"],
              ].map(([label, value, detail]) => (
                <div key={label} className="rounded-2xl border border-white/12 bg-white/[0.08] p-4">
                  <p className="text-sm text-white/66">{label}</p>
                  <p className="mt-1 text-3xl font-semibold tracking-[-0.05em] text-white">{value}</p>
                  <p className="mt-1 text-xs text-white/58">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Corporate contracts</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#123747]">Covered scope</h3>
            <div className="mt-5 space-y-4">
              {contracts.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No contract access found for this account.</p>
              ) : (
                contracts.map((contract) => {
                  const coveredBranches = contractBranches.filter((row) => row.contract_id === contract.id);
                  return (
                    <article key={contract.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-950">{contract.contract_name}</p>
                          <p className="mt-1 text-sm text-slate-500">Owner: {companyMap.get(contract.owner_company_id)?.name ?? "—"}</p>
                        </div>
                        <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(contract.status)}`}>{fmt(contract.status)}</span>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <div className="rounded-xl bg-white p-3">
                          <span className="text-slate-400">Service scope</span>
                          <p className="font-semibold text-[#123747]">{categoryLabel(contract.service_category)}</p>
                        </div>
                        <div className="rounded-xl bg-white p-3">
                          <span className="text-slate-400">Covered restaurants</span>
                          <p className="font-semibold text-[#123747]">{coveredBranches.length}</p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {coveredBranches.map((row) => (
                          <div key={row.id} className="rounded-xl bg-white px-3 py-2 text-sm">
                            <p className="font-medium text-slate-800">{branchMap.get(row.branch_id)?.name ?? "Unknown branch"}</p>
                            <p className="text-slate-500">Tenant: {row.tenant_company_id ? companyMap.get(row.tenant_company_id)?.name ?? "—" : "—"}</p>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Job visibility</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#123747]">What this user can see</h3>
              </div>
              <span className="rounded-full border border-[#bfe7ee] bg-[#eefcff] px-3 py-1 text-xs font-semibold text-[#0f6f7e]">
                RLS controlled
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {jobs.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No jobs visible for this account.</p>
              ) : (
                jobs.map((job) => {
                  const branch = job.branch_id ? branchMap.get(job.branch_id) : null;
                  const siteCompany = job.site_company_id ? companyMap.get(job.site_company_id) : null;
                  const billTo = job.bill_to_company_id ? companyMap.get(job.bill_to_company_id) : null;
                  const asset = job.equipment_id ? equipmentMap.get(job.equipment_id) : null;
                  const contract = job.contract_id ? contracts.find((item) => item.id === job.contract_id) : null;

                  return (
                    <Link key={job.id} href={`/jobs/${job.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#22C8D8] hover:bg-[#f7feff]">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-500">{job.job_number ?? job.id.slice(0, 8)}</span>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(job.priority)}`}>{fmt(job.priority)}</span>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(job.status)}`}>{statusLabel(job.status)}</span>
                          </div>
                          <p className="mt-3 font-semibold text-slate-950">{job.complaint ?? categoryLabel(job.job_type)}</p>
                          <p className="mt-1 text-sm text-slate-500">{branch?.name ?? "No branch"} · {asset?.equipment_name ?? "No asset"}</p>
                        </div>
                        <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${job.contract_id ? "border-[#bfe7ee] bg-[#eefcff] text-[#0f6f7e]" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                          {job.contract_id ? "Contract job" : "Direct restaurant job"}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <span className="text-slate-400">Scope</span>
                          <p className="font-medium text-slate-700">{categoryLabel(job.service_category ?? job.job_type)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <span className="text-slate-400">Site company</span>
                          <p className="font-medium text-slate-700">{siteCompany?.name ?? "—"}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <span className="text-slate-400">Bill to</span>
                          <p className="font-medium text-slate-700">{billTo?.name ?? "—"}</p>
                        </div>
                      </div>

                      {contract && (
                        <p className="mt-3 rounded-xl bg-[#eefcff] px-3 py-2 text-sm text-[#0f6f7e]">
                          Visible through: {contract.contract_name}
                        </p>
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Request rules</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#123747]">How requests should route</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ["West Walk", "Can request/track hood cleaning only for covered restaurants."],
                ["Restaurant", "Can request and approve its own restaurant work, including direct jobs."],
                ["OATA", "Sees all work, controls contract setup, reports, certificates, and approvals."],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-[#123747]">{title}</p>
                  <p className="mt-2 text-sm text-slate-500">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Protection rule</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              West Walk does not see a restaurant&apos;s private direct jobs unless the job is attached to the West Walk contract.
            </p>
            {message && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
