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

type SignoffJob = {
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
  accepted_at: string | null;
  on_site_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  client_signoff_name: string | null;
  client_signoff_at: string | null;
  verification_result: string | null;
  report_status: string | null;
  created_at: string;
};

type Company = { id: string; name: string };
type Branch = { id: string; name: string; branch_code: string | null };
type Equipment = { id: string; equipment_name: string; asset_code: string | null; location_description: string | null };
type PhotoCount = { job_id: string; photo_type: string };
type StatusResult = { job?: Partial<SignoffJob>; error?: string };

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

function evidenceGates(job: SignoffJob, photos: PhotoCount[]) {
  const jobPhotos = photos.filter((photo) => photo.job_id === job.id);
  const before = jobPhotos.some((photo) => photo.photo_type === "before");
  const after = jobPhotos.some((photo) => photo.photo_type === "after");
  const signoff = jobPhotos.some((photo) => photo.photo_type === "client_signoff");
  return [
    { label: "OATA accepted", done: Boolean(job.accepted_at) },
    { label: "Technician on site", done: Boolean(job.on_site_at) },
    { label: "Diagnosis recorded", done: Boolean(job.diagnosis) },
    { label: "Work performed", done: Boolean(job.work_performed) },
    { label: "Before photo", done: before },
    { label: "After photo", done: after },
    { label: "Sign-off evidence", done: signoff || job.status === "completed" },
  ];
}

export default function ClientSignoffPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<SignoffJob[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [photos, setPhotos] = useState<PhotoCount[]>([]);
  const [signerNames, setSignerNames] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadSignoffQueue() {
    setLoading(true);
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

    if (profileError || !profileData || profileData.status !== "active") {
      setMessage(profileError?.message ?? "Active profile required.");
      setLoading(false);
      return;
    }

    const activeProfile = profileData as Profile;
    setProfile(activeProfile);

    const { data: jobData, error: jobError } = await supabase
      .from("service_jobs")
      .select("id, job_number, job_type, service_category, priority, status, complaint, scope_of_work, diagnosis, work_performed, recommendations, company_id, branch_id, equipment_id, accepted_at, on_site_at, started_at, completed_at, client_signoff_name, client_signoff_at, verification_result, report_status, created_at")
      .in("status", ["awaiting_client_signoff", "completed"])
      .order("updated_at", { ascending: false })
      .limit(80);

    if (jobError) {
      setMessage(`Sign-off queue error: ${jobError.message}`);
      setLoading(false);
      return;
    }

    const loadedJobs = (jobData ?? []) as SignoffJob[];
    setJobs(loadedJobs);

    const defaults: Record<string, string> = {};
    loadedJobs.forEach((job) => {
      defaults[job.id] = job.client_signoff_name ?? activeProfile.full_name;
    });
    setSignerNames((prev) => ({ ...defaults, ...prev }));

    const companyIds = [...new Set(loadedJobs.map((job) => job.company_id).filter(Boolean))] as string[];
    const branchIds = [...new Set(loadedJobs.map((job) => job.branch_id).filter(Boolean))] as string[];
    const equipmentIds = [...new Set(loadedJobs.map((job) => job.equipment_id).filter(Boolean))] as string[];
    const jobIds = loadedJobs.map((job) => job.id);

    const [companiesRes, branchesRes, equipmentRes, photosRes] = await Promise.all([
      companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: null, error: null }),
      branchIds.length ? supabase.from("branches").select("id, name, branch_code").in("id", branchIds) : Promise.resolve({ data: null, error: null }),
      equipmentIds.length ? supabase.from("equipment").select("id, equipment_name, asset_code, location_description").in("id", equipmentIds) : Promise.resolve({ data: null, error: null }),
      jobIds.length ? supabase.from("job_photos").select("job_id, photo_type").in("job_id", jobIds) : Promise.resolve({ data: null, error: null }),
    ]);

    setCompanies((companiesRes.data ?? []) as Company[]);
    setBranches((branchesRes.data ?? []) as Branch[]);
    setEquipment((equipmentRes.data ?? []) as Equipment[]);
    setPhotos((photosRes.data ?? []) as PhotoCount[]);
    setLoading(false);
  }

  useEffect(() => {
    loadSignoffQueue();
  }, []);

  const companyMap = useMemo(() => byId(companies), [companies]);
  const branchMap = useMemo(() => byId(branches), [branches]);
  const equipmentMap = useMemo(() => byId(equipment), [equipment]);

  async function signOff(job: SignoffJob) {
    const signerName = (signerNames[job.id] ?? "").trim();
    if (!signerName) {
      setMessage("Signer name is required before client sign-off.");
      return;
    }

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
        action: "client_signoff",
        signer_name: signerName,
        notes: comments[job.id] || null,
      }),
    });

    const result = (await response.json()) as StatusResult;
    setBusyId(null);

    if (!response.ok) {
      setMessage(result.error ?? "Client sign-off failed.");
      return;
    }

    setMessage(`${job.job_number ?? "Work order"} signed off. Report status: ${statusLabel(result.job?.report_status ?? "ready")}.`);
    await loadSignoffQueue();
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700"><p>Loading client sign-off queue...</p></main>;
  }

  const waitingJobs = jobs.filter((job) => job.status === "awaiting_client_signoff");
  const completedJobs = jobs.filter((job) => job.status === "completed");

  return (
    <main className="min-h-screen bg-[#eef3f6] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">Client Completion</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-slate-950">Client Sign-off</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Review OATA work evidence and approve completed work. After sign-off, the job is closed and report/certificate readiness is marked.
              </p>
              {profile && <p className="mt-3 text-xs text-slate-500">Signed in: {profile.full_name} · {profile.role.replace(/_/g, " ")}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/client" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Client Portal</Link>
              <Link href="/oata/review" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">OATA Review</Link>
              <Link href="/" className="rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white">Dashboard</Link>
            </div>
          </div>
        </header>

        {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{message}</div>}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Waiting sign-off</p>
            <p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{waitingJobs.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Completed</p>
            <p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{completedJobs.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Report readiness</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">Client sign-off sets report status to Ready and closes the work order.</p>
          </div>
        </section>

        <section className="space-y-4">
          {jobs.length === 0 ? (
            <article className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 shadow-sm">
              No work orders are waiting for client sign-off.
            </article>
          ) : jobs.map((job) => {
            const branch = job.branch_id ? branchMap.get(job.branch_id) : null;
            const asset = job.equipment_id ? equipmentMap.get(job.equipment_id) : null;
            const gates = evidenceGates(job, photos);
            const passed = gates.filter((gate) => gate.done).length;
            const isCompleted = job.status === "completed";
            return (
              <article key={job.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-[-0.04em]">{job.job_number ?? "Work Order"}</h2>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(job.priority)}`}>{statusLabel(job.priority)}</span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(job.status)}`}>{statusLabel(job.status)}</span>
                      {job.report_status && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Report: {statusLabel(job.report_status)}</span>}
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{categoryLabel(job.service_category ?? job.job_type)} · {job.company_id ? (companyMap.get(job.company_id)?.name ?? "Unknown client") : "No client"}</p>
                    <p className="mt-1 text-sm text-slate-500">{branch?.name ?? "No branch"} {asset ? `· ${asset.equipment_name}${asset.asset_code ? ` · ${asset.asset_code}` : ""}` : ""}</p>
                  </div>
                  <Link href={`/jobs/${job.id}`} className="rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white">Open Evidence</Link>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-amber-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Complaint</p>
                      <p className="mt-1 text-sm leading-6 text-amber-950">{job.complaint ?? "No complaint recorded."}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Diagnosis</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{job.diagnosis ?? "No diagnosis recorded."}</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Work Performed</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-emerald-950">{job.work_performed ?? "No work notes recorded."}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">Completion evidence</p>
                        <p className="text-xs text-slate-500">{passed}/{gates.length} passed</p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {gates.map((gate) => (
                          <div key={gate.label} className={`rounded-2xl border p-3 text-sm font-semibold ${gate.done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
                            {gate.done ? "✓ " : "○ "}{gate.label}
                          </div>
                        ))}
                      </div>
                    </div>

                    {isCompleted ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                        <p className="font-semibold">Signed off by {job.client_signoff_name ?? "client"}</p>
                        <p className="mt-1">Date: {dateLabel(job.client_signoff_at)}</p>
                        <p className="mt-1">Report / certificate status: {statusLabel(job.report_status ?? "ready")}</p>
                        <Link href={`/reports/${job.id}`} className="mt-3 inline-block rounded-xl bg-[#123747] px-4 py-2 text-sm font-semibold text-white">
                          View Report / Certificate
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <input
                          value={signerNames[job.id] ?? ""}
                          onChange={(event) => setSignerNames((prev) => ({ ...prev, [job.id]: event.target.value }))}
                          placeholder="Signer name"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-600"
                        />
                        <textarea
                          value={comments[job.id] ?? ""}
                          onChange={(event) => setComments((prev) => ({ ...prev, [job.id]: event.target.value }))}
                          rows={3}
                          placeholder="Client comment / completion note"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-600"
                        />
                        <button onClick={() => signOff(job)} disabled={busyId === job.id} className="w-full rounded-2xl bg-cyan-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                          Approve Completion / Sign Off
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
