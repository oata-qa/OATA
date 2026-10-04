"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, badgeClass, categoryLabel, statusLabel } from "@/lib/supabase";
import { OataHero, OataLoading, OataPageShell } from "@/components/oata-page-shell";

type Profile = { id: string; full_name: string; role: string; status: string };

type ServiceRequest = {
  id: string;
  request_number: string | null;
  company_id: string | null;
  branch_id: string | null;
  equipment_id: string | null;
  contract_id: string | null;
  service_category: string;
  problem_category: string;
  submitted_from_area: string | null;
  description: string;
  submitted_by_name_snapshot: string;
  submitted_at: string;
  hermes_priority: string | null;
  hermes_priority_reason: string | null;
  hermes_priority_confidence: string | null;
  hermes_priority_rule: string | null;
  status: string;
  manager_approval_status: string;
  approved_by_name_snapshot: string | null;
  approved_at: string | null;
  converted_work_order_id: string | null;
  converted_at: string | null;
};

type Company = { id: string; name: string };
type Branch = { id: string; name: string; branch_code: string | null; company_id: string | null };
type Equipment = { id: string; equipment_name: string; asset_code: string | null };
type Contract = { id: string; contract_name: string };
type Technician = { id: string; full_name: string; role: string };

type DispatchResponse = {
  request?: Pick<ServiceRequest, "id" | "request_number" | "status" | "converted_work_order_id" | "converted_at">;
  job?: { id: string; job_number: string | null; status: string; priority: string; service_category: string; created_at: string };
  error?: string;
};

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function byId<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-QA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Qatar",
  }).format(new Date(value));
}

function priorityClass(priority: string | null) {
  if (priority === "emergency") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "urgent") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

export default function OataDispatchPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<Record<string, string>>({});
  const [dispatchNotes, setDispatchNotes] = useState<Record<string, string>>({});
  const [assignedTo, setAssignedTo] = useState<Record<string, string>>({});
  const [leadmanId, setLeadmanId] = useState<Record<string, string>>({});

  async function loadDispatch() {
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
    setProfile((profileData ?? { id: user.id, full_name: user.email ?? "OATA User", role: "client_user", status: "unknown" }) as Profile);

    const [requestRes, techRes] = await Promise.all([
      supabase
        .from("service_requests")
        .select("id, request_number, company_id, branch_id, equipment_id, contract_id, service_category, problem_category, submitted_from_area, description, submitted_by_name_snapshot, submitted_at, hermes_priority, hermes_priority_reason, hermes_priority_confidence, hermes_priority_rule, status, manager_approval_status, approved_by_name_snapshot, approved_at, converted_work_order_id, converted_at")
        .in("status", ["approved", "converted_to_work_order"])
        .order("approved_at", { ascending: false, nullsFirst: false })
        .limit(80),
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["technician", "leadman", "head_of_technical", "hvac_ecology_supervisor"])
        .eq("status", "active")
        .order("full_name", { ascending: true }),
    ]);

    if (requestRes.error) {
      setMessage(`Dispatch queue error: ${requestRes.error.message}`);
      setLoading(false);
      return;
    }
    if (techRes.error) setMessage(`Team list error: ${techRes.error.message}`);

    const loadedRequests = (requestRes.data ?? []) as ServiceRequest[];
    setRequests(loadedRequests);
    setTechnicians((techRes.data ?? []) as Technician[]);

    const companyIds = [...new Set(loadedRequests.map((row) => row.company_id).filter(Boolean))] as string[];
    const branchIds = [...new Set(loadedRequests.map((row) => row.branch_id).filter(Boolean))] as string[];
    const equipmentIds = [...new Set(loadedRequests.map((row) => row.equipment_id).filter(Boolean))] as string[];
    const contractIds = [...new Set(loadedRequests.map((row) => row.contract_id).filter(Boolean))] as string[];

    const [companiesRes, branchesRes, equipmentRes, contractsRes] = await Promise.all([
      companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: null, error: null }),
      branchIds.length ? supabase.from("branches").select("id, name, branch_code, company_id").in("id", branchIds) : Promise.resolve({ data: null, error: null }),
      equipmentIds.length ? supabase.from("equipment").select("id, equipment_name, asset_code").in("id", equipmentIds) : Promise.resolve({ data: null, error: null }),
      contractIds.length ? supabase.from("contracts").select("id, contract_name").in("id", contractIds) : Promise.resolve({ data: null, error: null }),
    ]);

    setCompanies((companiesRes.data ?? []) as Company[]);
    setBranches((branchesRes.data ?? []) as Branch[]);
    setEquipment((equipmentRes.data ?? []) as Equipment[]);
    setContracts((contractsRes.data ?? []) as Contract[]);
    setLoading(false);
  }

  useEffect(() => {
    loadDispatch();
  }, []);

  const companyMap = useMemo(() => byId(companies), [companies]);
  const branchMap = useMemo(() => byId(branches), [branches]);
  const equipmentMap = useMemo(() => byId(equipment), [equipment]);
  const contractMap = useMemo(() => byId(contracts), [contracts]);

  const readyRequests = useMemo(() => requests.filter((request) => request.status === "approved" && !request.converted_work_order_id), [requests]);
  const convertedRequests = useMemo(() => requests.filter((request) => request.status === "converted_to_work_order" || request.converted_work_order_id).slice(0, 20), [requests]);
  const urgentReady = readyRequests.filter((request) => ["urgent", "emergency"].includes(request.hermes_priority ?? "")).length;

  async function convertToWorkOrder(request: ServiceRequest) {
    setBusyId(request.id);
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setBusyId(null);
      setMessage("Your session expired. Please sign in again.");
      return;
    }

    const response = await fetch("/api/service-requests/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        service_request_id: request.id,
        priority: selectedPriority[request.id] || request.hermes_priority || "normal",
        assigned_to: assignedTo[request.id] || null,
        leadman_id: leadmanId[request.id] || null,
        dispatch_notes: dispatchNotes[request.id] || "OATA dispatch converted approved request to work order.",
      }),
    });

    const result = (await response.json()) as DispatchResponse;
    setBusyId(null);

    if (!response.ok) {
      setMessage(result.error ?? "Dispatch conversion failed. Please try again.");
      return;
    }

    setMessage(`${request.request_number ?? "Request"} converted to work order ${result.job?.job_number ?? result.job?.id}.`);
    await loadDispatch();
  }

  if (loading) {
    return <OataLoading label="Loading dispatch queue..." />;
  }

  return (
    <OataPageShell
      eyebrow="OATA Dispatch"
      title="Convert approved requests into work orders"
      description="OATA controls the conversion point between client request and execution work order."
      userLabel={`${profile?.full_name ?? "OATA"} · ${fmt(profile?.role)}`}
      actions={[{ label: "Approvals", href: "/client/approvals", variant: "ghost" }, { label: "Dashboard", href: "/", variant: "primary" }]}
    >
        <OataHero
          eyebrow="Dispatch control"
          title="Only OATA converts approved requests into work orders."
          description="This is the separation point: client approval authorizes review; OATA dispatch creates the execution record."
          stats={[["Ready", String(readyRequests.length), "Approved requests"], ["Urgent", String(urgentReady), "Priority dispatch"], ["Converted", String(convertedRequests.length), "Recent work orders"]]}
        />

        {message && <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{message}</div>}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.42fr]">
          <section className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Ready for dispatch</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#123747]">Approved service requests</h3>
            </div>

            {readyRequests.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">No approved requests waiting for dispatch.</div>
            ) : readyRequests.map((request) => {
              const branch = request.branch_id ? branchMap.get(request.branch_id) : null;
              const asset = request.equipment_id ? equipmentMap.get(request.equipment_id) : null;
              const contract = request.contract_id ? contractMap.get(request.contract_id) : null;
              return (
                <article key={request.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityClass(request.hermes_priority)}`}>{fmt(request.hermes_priority)} · {fmt(request.hermes_priority_confidence)}</span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(request.status)}`}>{statusLabel(request.status)}</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{request.request_number ?? "Request"}</span>
                      </div>
                      <h4 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-[#123747]">{categoryLabel(request.service_category)} · {fmt(request.problem_category)}</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{request.description}</p>
                    </div>
                    <div className="min-w-[220px] rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                      <p><span className="font-semibold text-slate-800">Approved:</span> {dateLabel(request.approved_at)}</p>
                      <p className="mt-2"><span className="font-semibold text-slate-800">By:</span> {request.approved_by_name_snapshot ?? "—"}</p>
                      <p className="mt-2"><span className="font-semibold text-slate-800">Branch:</span> {branch?.name ?? "—"}</p>
                      <p className="mt-2"><span className="font-semibold text-slate-800">Area:</span> {request.submitted_from_area ?? "—"}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 md:grid-cols-2">
                    <p><span className="font-semibold text-slate-800">Client/bill scope:</span> {request.company_id ? (companyMap.get(request.company_id)?.name ?? "Unknown") : "—"}</p>
                    <p><span className="font-semibold text-slate-800">Asset:</span> {asset ? `${asset.equipment_name}${asset.asset_code ? ` · ${asset.asset_code}` : ""}` : "Not selected"}</p>
                    <p><span className="font-semibold text-slate-800">Contract:</span> {contract?.contract_name ?? "Direct / no contract"}</p>
                    <p><span className="font-semibold text-slate-800">Rule:</span> {request.hermes_priority_rule ?? "—"}</p>
                  </div>

                  <div className="mt-5 grid gap-4 rounded-2xl border border-[#327482]/15 bg-[#f8fcfd] p-4 md:grid-cols-2">
                    <label className="block text-sm font-semibold text-slate-700">Dispatch priority
                      <select value={selectedPriority[request.id] ?? request.hermes_priority ?? "normal"} onChange={(event) => setSelectedPriority((prev) => ({ ...prev, [request.id]: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#327482]">
                        <option value="emergency">Emergency</option><option value="urgent">Urgent</option><option value="normal">Normal</option>
                      </select>
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">Assign technician
                      <select value={assignedTo[request.id] ?? ""} onChange={(event) => setAssignedTo((prev) => ({ ...prev, [request.id]: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#327482]">
                        <option value="">Assign later</option>
                        {technicians.filter((person) => person.role !== "leadman").map((person) => <option key={person.id} value={person.id}>{person.full_name} · {fmt(person.role)}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">Supervisor / reviewer
                      <select value={leadmanId[request.id] ?? ""} onChange={(event) => setLeadmanId((prev) => ({ ...prev, [request.id]: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#327482]">
                        <option value="">Assign later</option>
                        {technicians.filter((person) => person.role === "leadman" || person.role.includes("supervisor") || person.role.includes("head_of")) .map((person) => <option key={person.id} value={person.id}>{person.full_name} · {fmt(person.role)}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">Dispatch notes
                      <textarea value={dispatchNotes[request.id] ?? ""} onChange={(event) => setDispatchNotes((prev) => ({ ...prev, [request.id]: event.target.value }))} rows={3} placeholder="Optional: access notes, scope clarification, team instruction" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#327482]" />
                    </label>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <p className="max-w-xl text-xs leading-5 text-slate-500">This creates the OATA execution record. Technicians will work from the Work Order, not from the original Service Request.</p>
                    <button onClick={() => convertToWorkOrder(request)} disabled={busyId === request.id} className="rounded-full bg-[#123747] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1a4b5d] disabled:opacity-60">{busyId === request.id ? "Converting..." : "Convert to Work Order"}</button>
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Dispatch rule</p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#123747]">OATA owns work-order creation</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">Clients approve the request. OATA validates scope, discipline, priority, and assignment before creating the execution record.</p>
            </div>
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Recently converted</p>
              <div className="mt-4 space-y-3">
                {convertedRequests.length === 0 ? <p className="text-sm text-slate-500">No converted requests yet.</p> : convertedRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[#123747]">{request.request_number ?? "Request"}</p><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Converted</span></div>
                    <p className="mt-1 text-xs text-slate-500">{categoryLabel(request.service_category)} · {dateLabel(request.converted_at)}</p>
                    {request.converted_work_order_id && <Link href={`/jobs/${request.converted_work_order_id}`} className="mt-2 inline-block text-xs font-semibold text-[#327482]">Open work order →</Link>}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
    </OataPageShell>
  );
}
