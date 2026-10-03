"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase, categoryLabel, SERVICE_CATEGORIES } from "@/lib/supabase";

type Profile = {
  id: string;
  full_name: string;
  role: string;
  company_id: string | null;
  branch_id: string | null;
};

type Company = { id: string; name: string };
type Branch = { id: string; name: string; branch_code: string | null; company_id: string | null };
type Equipment = {
  id: string;
  equipment_name: string;
  asset_code: string | null;
  service_category: string;
  branch_id: string | null;
  company_id: string | null;
  status: string;
};
type Contract = { id: string; contract_name: string; service_category: string; status: string; owner_company_id: string };

type CreatedRequest = {
  id: string;
  request_number: string | null;
  status: string;
  manager_approval_status: string;
  hermes_priority: string | null;
  hermes_priority_reason: string | null;
  hermes_priority_confidence: string | null;
  hermes_priority_rule: string | null;
  created_at: string;
};

const PROBLEM_CATEGORIES = [
  { value: "breakdown", label: "Breakdown / not working" },
  { value: "cleaning", label: "Cleaning required" },
  { value: "performance", label: "Poor performance" },
  { value: "leak", label: "Leak / water issue" },
  { value: "noise", label: "Noise / vibration" },
  { value: "ppm", label: "Preventive maintenance" },
  { value: "safety", label: "Safety concern" },
  { value: "other", label: "Other" },
];

function label(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function priorityClass(priority: string | null) {
  if (priority === "emergency") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "urgent") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

export default function ClientRequestPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [createdRequest, setCreatedRequest] = useState<CreatedRequest | null>(null);

  const [companyId, setCompanyId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [contractId, setContractId] = useState("");
  const [serviceCategory, setServiceCategory] = useState("hood_cleaning");
  const [problemCategory, setProblemCategory] = useState("cleaning");
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    async function load() {
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

      if (profileError) setMessage(`Profile error: ${profileError.message}`);
      const activeProfile = (profileData ?? {
        id: user.id,
        full_name: user.email ?? "Client User",
        role: "client_user",
        company_id: null,
        branch_id: null,
      }) as Profile;

      setProfile(activeProfile);
      if (activeProfile.company_id) setCompanyId(activeProfile.company_id);
      if (activeProfile.branch_id) setBranchId(activeProfile.branch_id);

      const [companiesRes, branchesRes, equipmentRes, contractsRes] = await Promise.all([
        supabase.from("companies").select("id, name").order("name", { ascending: true }),
        supabase.from("branches").select("id, name, branch_code, company_id").order("name", { ascending: true }),
        supabase.from("equipment").select("id, equipment_name, asset_code, service_category, branch_id, company_id, status").order("equipment_name", { ascending: true }),
        supabase.from("contracts").select("id, contract_name, service_category, status, owner_company_id").order("contract_name", { ascending: true }),
      ]);

      if (companiesRes.error) setMessage(`Companies error: ${companiesRes.error.message}`);
      if (branchesRes.error) setMessage(`Branches error: ${branchesRes.error.message}`);
      if (equipmentRes.error) setMessage(`Equipment error: ${equipmentRes.error.message}`);
      if (contractsRes.error) setMessage(`Contracts error: ${contractsRes.error.message}`);

      setCompanies((companiesRes.data ?? []) as Company[]);
      setBranches((branchesRes.data ?? []) as Branch[]);
      setEquipment((equipmentRes.data ?? []) as Equipment[]);
      setContracts((contractsRes.data ?? []) as Contract[]);
      setLoading(false);
    }

    load();
  }, []);

  const visibleBranches = useMemo(() => {
    if (!companyId) return branches;
    return branches.filter((branch) => !branch.company_id || branch.company_id === companyId);
  }, [branches, companyId]);

  const visibleEquipment = useMemo(() => {
    return equipment.filter((asset) => {
      const branchMatch = branchId ? asset.branch_id === branchId : true;
      const categoryMatch = serviceCategory ? asset.service_category === serviceCategory || serviceCategory === "other" : true;
      return branchMatch && categoryMatch;
    });
  }, [equipment, branchId, serviceCategory]);

  const visibleContracts = useMemo(() => {
    return contracts.filter((contract) => {
      const active = contract.status === "active";
      const categoryMatch = contract.service_category === serviceCategory || !serviceCategory;
      return active && categoryMatch;
    });
  }, [contracts, serviceCategory]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setCreatedRequest(null);

    if (!description.trim() || description.trim().length < 12) {
      setMessage("Please describe the issue clearly before submitting.");
      return;
    }

    setSubmitting(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setSubmitting(false);
      setMessage("Your session expired. Please sign in again.");
      return;
    }

    const response = await fetch("/api/service-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        company_id: companyId || null,
        branch_id: branchId || null,
        equipment_id: equipmentId || null,
        contract_id: contractId || null,
        service_category: serviceCategory,
        problem_category: problemCategory,
        submitted_from_area: area || null,
        description,
      }),
    });

    const result = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      setMessage(result.error ?? "Service request failed. Please try again.");
      return;
    }

    setCreatedRequest(result.request as CreatedRequest);
    setMessage("Service request submitted. It is awaiting manager approval before OATA converts it to a work order.");
    setDescription("");
    setArea("");
    setEquipmentId("");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f7f8]">
        <p className="text-slate-500">Loading request form...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f7f8] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <img src="/oata-logo.png" alt="OATA" className="h-20 w-auto" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#327482]">New Service Request</p>
              <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[#123747]">Tell OATA what happened</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
              {profile?.full_name ?? "Client User"} · <span className="font-semibold text-[#327482]">{label(profile?.role)}</span>
            </div>
            <Link href="/client" className="rounded-full bg-[#123747] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a4b5d]">
              Client Portal
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[0.72fr_0.28fr] lg:px-8">
        <form onSubmit={handleSubmit} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
          <div className="border-b border-slate-100 pb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Service Request ≠ Work Order</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#123747]">Submit a request for manager approval</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              This creates a client-side service request only. OATA will convert it to a work order after approval and dispatch review.
            </p>
          </div>

          {message && (
            <div className={`mt-5 rounded-2xl border p-4 text-sm ${createdRequest ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {message}
            </div>
          )}

          {createdRequest && (
            <div className="mt-5 rounded-3xl border border-[#327482]/20 bg-[#f0fbfc] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#327482]">Request created</p>
                  <h3 className="mt-2 text-2xl font-semibold text-[#123747]">{createdRequest.request_number ?? "New Request"}</h3>
                  <p className="mt-2 text-sm text-slate-600">Status: {label(createdRequest.status)} · Approval: {label(createdRequest.manager_approval_status)}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityClass(createdRequest.hermes_priority)}`}>
                  {label(createdRequest.hermes_priority)} · {label(createdRequest.hermes_priority_confidence)} confidence
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">{createdRequest.hermes_priority_reason}</p>
            </div>
          )}

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Company / client</span>
              <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#327482]">
                <option value="">Select company</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Branch / restaurant</span>
              <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#327482]">
                <option value="">Select branch</option>
                {visibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.branch_code ? ` · ${branch.branch_code}` : ""}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Service category</span>
              <select value={serviceCategory} onChange={(event) => { setServiceCategory(event.target.value); setEquipmentId(""); setContractId(""); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#327482]">
                {SERVICE_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Problem type</span>
              <select value={problemCategory} onChange={(event) => setProblemCategory(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#327482]">
                {PROBLEM_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Asset / equipment</span>
              <select value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#327482]">
                <option value="">No asset / not sure</option>
                {visibleEquipment.map((asset) => <option key={asset.id} value={asset.id}>{asset.equipment_name}{asset.asset_code ? ` · ${asset.asset_code}` : ""}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Contract / service scope</span>
              <select value={contractId} onChange={(event) => setContractId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#327482]">
                <option value="">Direct request / no contract selected</option>
                {visibleContracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.contract_name}</option>)}
              </select>
            </label>
          </div>

          <label className="mt-5 block">
            <span className="text-sm font-semibold text-slate-700">Area / location inside branch</span>
            <input value={area} onChange={(event) => setArea(event.target.value)} placeholder="Example: Main kitchen, fry station, roof exhaust area" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#327482]" />
          </label>

          <label className="mt-5 block">
            <span className="text-sm font-semibold text-slate-700">What happened?</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={6} placeholder="Example: Main kitchen hood has heavy grease accumulation and the exhaust airflow feels weak during operation." className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#327482]" />
          </label>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
            <p className="max-w-xl text-xs leading-5 text-slate-500">
              OATA will classify the request, route it for approval, and only then create an execution work order. Do not submit life-threatening emergencies only through the portal — call OATA immediately.
            </p>
            <button disabled={submitting} className="rounded-full bg-[#123747] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-[#1a4b5d] disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>

        <aside className="space-y-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">What happens next</p>
            <ol className="mt-4 space-y-3 text-sm text-slate-600">
              {[
                "Request is recorded with submitter identity.",
                "Hermes/OATA priority rule is applied.",
                "Manager approval is required before dispatch.",
                "OATA converts approved request into a work order.",
                "Technician executes, verifies, documents, and closes.",
              ].map((item, index) => (
                <li key={item} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e7f6f8] text-xs font-bold text-[#327482]">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <p className="text-sm font-semibold">Approval control</p>
            <p className="mt-2 text-sm leading-6">
              This page cannot approve its own request and cannot create a work order. That protects the client, the restaurant, and OATA.
            </p>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#123747]">OATA standard</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Prevent → Detect → Diagnose → Repair → Verify → Document → Prevent recurrence.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
