"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, badgeClass, categoryLabel, statusLabel } from "@/lib/supabase";
import { OataHero, OataLoading, OataPageShell } from "@/components/oata-page-shell";

type Profile = {
  id: string;
  full_name: string;
  role: string;
  company_id: string | null;
  branch_id: string | null;
};

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
  rejected_by_name_snapshot: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
};

type Company = { id: string; name: string };
type Branch = { id: string; name: string; branch_code: string | null };
type Equipment = { id: string; equipment_name: string; asset_code: string | null };
type Contract = { id: string; contract_name: string };

type DecisionResult = {
  request?: Pick<ServiceRequest, "id" | "request_number" | "status" | "manager_approval_status" | "rejection_reason">;
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
  if (priority === "planned" || priority === "ppm") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function ClientApprovalsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function loadApprovals() {
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
    setProfile((profileData ?? {
      id: user.id,
      full_name: user.email ?? "Client User",
      role: "client_user",
      company_id: null,
      branch_id: null,
    }) as Profile);

    const { data: requestData, error: requestError } = await supabase
      .from("service_requests")
      .select("id, request_number, company_id, branch_id, equipment_id, contract_id, service_category, problem_category, submitted_from_area, description, submitted_by_name_snapshot, submitted_at, hermes_priority, hermes_priority_reason, hermes_priority_confidence, hermes_priority_rule, status, manager_approval_status, approved_by_name_snapshot, approved_at, rejected_by_name_snapshot, rejected_at, rejection_reason")
      .order("submitted_at", { ascending: false })
      .limit(80);

    if (requestError) {
      setMessage(`Request error: ${requestError.message}`);
      setLoading(false);
      return;
    }

    const loadedRequests = (requestData ?? []) as ServiceRequest[];
    setRequests(loadedRequests);

    const companyIds = [...new Set(loadedRequests.map((row) => row.company_id).filter(Boolean))] as string[];
    const branchIds = [...new Set(loadedRequests.map((row) => row.branch_id).filter(Boolean))] as string[];
    const equipmentIds = [...new Set(loadedRequests.map((row) => row.equipment_id).filter(Boolean))] as string[];
    const contractIds = [...new Set(loadedRequests.map((row) => row.contract_id).filter(Boolean))] as string[];

    const [companiesRes, branchesRes, equipmentRes, contractsRes] = await Promise.all([
      companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: null, error: null }),
      branchIds.length ? supabase.from("branches").select("id, name, branch_code").in("id", branchIds) : Promise.resolve({ data: null, error: null }),
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
    loadApprovals();
  }, []);

  const companyMap = useMemo(() => byId(companies), [companies]);
  const branchMap = useMemo(() => byId(branches), [branches]);
  const equipmentMap = useMemo(() => byId(equipment), [equipment]);
  const contractMap = useMemo(() => byId(contracts), [contracts]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.manager_approval_status === "pending" && request.status === "awaiting_manager_approval"),
    [requests],
  );
  const decidedRequests = useMemo(
    () => requests.filter((request) => request.manager_approval_status !== "pending" || ["approved", "rejected"].includes(request.status)).slice(0, 20),
    [requests],
  );
  const urgentCount = pendingRequests.filter((request) => ["urgent", "emergency"].includes(request.hermes_priority ?? "")).length;

  async function decide(serviceRequestId: string, decision: "approved" | "rejected", comment = "") {
    setBusyId(serviceRequestId);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setBusyId(null);
      setMessage("Your session expired. Please sign in again.");
      return;
    }

    const response = await fetch("/api/service-requests/decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ service_request_id: serviceRequestId, decision, comment }),
    });

    const result = (await response.json()) as DecisionResult;
    setBusyId(null);

    if (!response.ok) {
      setMessage(result.error ?? "Decision failed. Please try again.");
      return;
    }

    setMessage(`${result.request?.request_number ?? "Request"} ${decision}. OATA dispatch can now review the next step.`);
    setRejectingId(null);
    setRejectReason("");
    await loadApprovals();
  }

  if (loading) {
    return <OataLoading label="Loading approvals..." />;
  }

  return (
    <OataPageShell
      eyebrow="Manager Approvals"
      title="Approve requests before work orders"
      description="Approve the request only. OATA dispatch still controls work-order creation."
      userLabel={`${profile?.full_name ?? "Client"} · ${fmt(profile?.role)}`}
      actions={[{ label: "Dispatch Queue", href: "/oata/dispatch", variant: "gold" }, { label: "New Request", href: "/client/request", variant: "gold" }, { label: "Client Portal", href: "/client", variant: "primary" }]}
    >
        <OataHero
          eyebrow="Control point"
          title="Manager approval comes before OATA dispatch and work order creation."
          description="Approving a request does not mean the work is completed. It means the client manager agrees OATA may dispatch/review it."
          stats={[["Pending", String(pendingRequests.length), "Need decision"], ["Urgent", String(urgentCount), "Priority attention"], ["Reviewed", String(decidedRequests.length), "Recent decisions"]]}
        />

        {message && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {message}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.42fr]">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Pending approvals</p>
                <h3 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#123747]">Requests awaiting manager decision</h3>
              </div>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
                No pending service requests.
              </div>
            ) : (
              pendingRequests.map((request) => {
                const branch = request.branch_id ? branchMap.get(request.branch_id) : null;
                const asset = request.equipment_id ? equipmentMap.get(request.equipment_id) : null;
                const contract = request.contract_id ? contractMap.get(request.contract_id) : null;
                return (
                  <article key={request.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityClass(request.hermes_priority)}`}>
                            {fmt(request.hermes_priority)} · {fmt(request.hermes_priority_confidence)}
                          </span>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(request.status)}`}>
                            {statusLabel(request.status)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                            {request.request_number ?? "Request"}
                          </span>
                        </div>
                        <h4 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-[#123747]">
                          {categoryLabel(request.service_category)} · {fmt(request.problem_category)}
                        </h4>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{request.description}</p>
                      </div>

                      <div className="min-w-[210px] rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                        <p><span className="font-semibold text-slate-800">Submitted:</span> {dateLabel(request.submitted_at)}</p>
                        <p className="mt-2"><span className="font-semibold text-slate-800">By:</span> {request.submitted_by_name_snapshot}</p>
                        <p className="mt-2"><span className="font-semibold text-slate-800">Branch:</span> {branch?.name ?? "—"}</p>
                        <p className="mt-2"><span className="font-semibold text-slate-800">Area:</span> {request.submitted_from_area ?? "—"}</p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 md:grid-cols-2">
                      <p><span className="font-semibold text-slate-800">Client:</span> {request.company_id ? (companyMap.get(request.company_id)?.name ?? "Unknown") : "—"}</p>
                      <p><span className="font-semibold text-slate-800">Asset:</span> {asset ? `${asset.equipment_name}${asset.asset_code ? ` · ${asset.asset_code}` : ""}` : "Not selected"}</p>
                      <p><span className="font-semibold text-slate-800">Contract:</span> {contract?.contract_name ?? "Direct / no contract"}</p>
                      <p><span className="font-semibold text-slate-800">Priority rule:</span> {request.hermes_priority_rule ?? "—"}</p>
                    </div>

                    {request.hermes_priority_reason && (
                      <div className="mt-4 rounded-2xl border border-[#327482]/20 bg-[#f0fbfc] p-4 text-sm leading-6 text-slate-700">
                        <span className="font-semibold text-[#123747]">OATA/Hermes priority reason:</span> {request.hermes_priority_reason}
                      </div>
                    )}

                    {rejectingId === request.id ? (
                      <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                        <label className="block text-sm font-semibold text-red-900">Rejection reason</label>
                        <textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-400" placeholder="Explain why this request is rejected." />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => decide(request.id, "rejected", rejectReason)} disabled={busyId === request.id} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                            Confirm Reject
                          </button>
                          <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                        <p className="max-w-xl text-xs leading-5 text-slate-500">
                          Approval allows OATA dispatch to review and convert this request into a work order. It does not close the job.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setRejectingId(request.id)} disabled={busyId === request.id} className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60">
                            Reject
                          </button>
                          <button onClick={() => decide(request.id, "approved", "Manager approved request for OATA dispatch review.")} disabled={busyId === request.id} className="rounded-full bg-[#123747] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1a4b5d] disabled:opacity-60">
                            {busyId === request.id ? "Saving..." : "Approve"}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Decision rule</p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#123747]">Approve the request, not the repair cost</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                This approval authorizes OATA to dispatch/review. Chargeable repair, parts, high-value quotation, completion, and invoice approvals remain separate controls.
              </p>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#327482]">Recent decisions</p>
              <div className="mt-4 space-y-3">
                {decidedRequests.length === 0 ? (
                  <p className="text-sm text-slate-500">No reviewed requests yet.</p>
                ) : (
                  decidedRequests.map((request) => (
                    <div key={request.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#123747]">{request.request_number ?? "Request"}</p>
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeClass(request.manager_approval_status)}`}>
                          {fmt(request.manager_approval_status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{categoryLabel(request.service_category)} · {fmt(request.problem_category)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {request.approved_at ? `Approved by ${request.approved_by_name_snapshot ?? "—"}` : request.rejected_at ? `Rejected by ${request.rejected_by_name_snapshot ?? "—"}` : "Reviewed"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
    </OataPageShell>
  );
}
