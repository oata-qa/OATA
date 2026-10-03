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

type ReviewJob = {
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
  accepted_at: string | null;
  on_site_at: string | null;
  started_at: string | null;
  created_at: string;
};

type Company = { id: string; name: string };
type Branch = { id: string; name: string; branch_code: string | null };
type Equipment = { id: string; equipment_name: string; asset_code: string | null; location_description: string | null };
type PhotoCount = { job_id: string; photo_type: string };
type StatusResult = { job?: Partial<ReviewJob>; error?: string };

const REVIEW_ROLES = new Set(["oata_admin", "oata_manager", "head_of_technical", "hvac_ecology_supervisor", "leadman"]);

function byId<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function evidenceSummary(job: ReviewJob, photos: PhotoCount[]) {
  const jobPhotos = photos.filter((photo) => photo.job_id === job.id);
  const before = jobPhotos.some((photo) => photo.photo_type === "before");
  const after = jobPhotos.some((photo) => photo.photo_type === "after");
  const defect = jobPhotos.some((photo) => photo.photo_type === "defect");
  return [
    { label: "Accepted", done: Boolean(job.accepted_at) },
    { label: "On site", done: Boolean(job.on_site_at) },
    { label: "Diagnosis", done: Boolean(job.diagnosis) },
    { label: "Work notes", done: Boolean(job.work_performed) },
    { label: "Before photo", done: before },
    { label: "After photo", done: after },
    { label: "Defect evidence", done: defect || before || after },
  ];
}

export default function LeadmanReviewPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<ReviewJob[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [photos, setPhotos] = useState<PhotoCount[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadReviewQueue() {
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
      setMessage(profileError?.message ?? "Active OATA profile required.");
      setLoading(false);
      return;
    }

    const activeProfile = profileData as Profile;
    setProfile(activeProfile);

    if (!REVIEW_ROLES.has(activeProfile.role)) {
      setMessage("Only leadman and OATA operations roles can review work orders.");
      setLoading(false);
      return;
    }

    const { data: jobData, error: jobError } = await supabase
      .from("service_jobs")
      .select("id, job_number, job_type, service_category, priority, status, complaint, scope_of_work, diagnosis, work_performed, recommendations, company_id, branch_id, equipment_id, assigned_to, leadman_id, accepted_at, on_site_at, started_at, created_at")
      .eq("status", "awaiting_leadman_review")
      .order("created_at", { ascending: true })
      .limit(80);

    if (jobError) {
      setMessage(`Review queue error: ${jobError.message}`);
      setLoading(false);
      return;
    }

    const loadedJobs = (jobData ?? []) as ReviewJob[];
    setJobs(loadedJobs);

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
    loadReviewQueue();
  }, []);

  const companyMap = useMemo(() => byId(companies), [companies]);
  const branchMap = useMemo(() => byId(branches), [branches]);
  const equipmentMap = useMemo(() => byId(equipment), [equipment]);

  async function decide(job: ReviewJob, action: "leadman_approve" | "send_back") {
    setBusyId(job.id);
    setMessage("");

    const comment = comments[job.id]?.trim() ?? "";
    if (action === "send_back" && !comment) {
      setBusyId(null);
      setMessage("Send-back reason is required before returning a job to technician.");
      return;
    }

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
      body: JSON.stringify({ job_id: job.id, action, notes: comment || null }),
    });

    const result = (await response.json()) as StatusResult;
    setBusyId(null);

    if (!response.ok) {
      setMessage(result.error ?? "Review action failed.");
      return;
    }

    setMessage(`${job.job_number ?? "Work order"} ${action === "leadman_approve" ? "approved for client sign-off" : "sent back to technician"}.`);
    setComments((prev) => ({ ...prev, [job.id]: "" }));
    await loadReviewQueue();
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><p>Loading leadman review queue...</p></main>;
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">OATA Quality Control</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Leadman Review</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Review technician evidence, diagnosis, and work performed before releasing the job for client sign-off.
              </p>
              {profile && <p className="mt-3 text-xs text-slate-400">Signed in: {profile.full_name} · {profile.role.replace(/_/g, " ")}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/technician" className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white">Technician</Link>
              <Link href="/oata/dispatch" className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white">Dispatch</Link>
              <Link href="/" className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-white">Dashboard</Link>
            </div>
          </div>
        </header>

        {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{message}</div>}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Waiting review</p>
            <p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{jobs.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Urgent / Emergency</p>
            <p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{jobs.filter((job) => ["urgent", "emergency"].includes(job.priority)).length}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Rule</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">No job goes to client sign-off until OATA quality review passes.</p>
          </div>
        </section>

        <section className="space-y-4">
          {jobs.length === 0 ? (
            <article className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 shadow-sm">
              No work orders are waiting for leadman review.
            </article>
          ) : jobs.map((job) => {
            const branch = job.branch_id ? branchMap.get(job.branch_id) : null;
            const asset = job.equipment_id ? equipmentMap.get(job.equipment_id) : null;
            const gates = evidenceSummary(job, photos);
            const missing = gates.filter((gate) => !gate.done);
            return (
              <article key={job.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-[-0.04em]">{job.job_number ?? "Work Order"}</h2>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(job.priority)}`}>{statusLabel(job.priority)}</span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(job.status)}`}>{statusLabel(job.status)}</span>
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
                        <p className="text-sm font-semibold text-slate-900">Evidence gates</p>
                        <p className="text-xs text-slate-500">{gates.length - missing.length}/{gates.length} passed</p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {gates.map((gate) => (
                          <div key={gate.label} className={`rounded-2xl border p-3 text-sm font-semibold ${gate.done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-600"}`}>
                            {gate.done ? "✓ " : "! "}{gate.label}
                          </div>
                        ))}
                      </div>
                    </div>

                    <textarea
                      value={comments[job.id] ?? ""}
                      onChange={(event) => setComments((prev) => ({ ...prev, [job.id]: event.target.value }))}
                      rows={3}
                      placeholder="Leadman review comment / send-back reason"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-600"
                    />

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button onClick={() => decide(job, "send_back")} disabled={busyId === job.id} className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-60">Send Back</button>
                      <button onClick={() => decide(job, "leadman_approve")} disabled={busyId === job.id} className="rounded-2xl bg-cyan-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">Approve for Client Sign-off</button>
                    </div>
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
