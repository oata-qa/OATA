"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { OataLoading, OataPageShell } from "@/components/oata-page-shell";
import { supabase, badgeClass, statusLabel, categoryLabel, fetchWithNames, type ServiceJobRow, type JobPhoto, type Profile } from "@/lib/supabase";

type JobWithNames = ServiceJobRow & {
  company_name: string;
  branch_name: string;
  equipment_name?: string;
  asset_code?: string | null;
  service_category?: string | null;
  accepted_at?: string | null;
  on_site_at?: string | null;
};

type DetailItem = {
  label: string;
  value: string;
  helper?: string;
};

const photoTypes = ["before", "after", "defect", "nameplate", "parts", "safety", "client_signoff", "other"];

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-QA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Qatar",
  }).format(new Date(value));
}

function evidenceGates(job: JobWithNames, photos: JobPhoto[]) {
  return [
    { label: "Before photo", done: photos.some((photo) => photo.photo_type === "before") },
    { label: "Finding / diagnosis", done: Boolean(job.diagnosis) },
    { label: "Work notes", done: Boolean(job.work_performed) },
    { label: "After photo", done: photos.some((photo) => photo.photo_type === "after") },
    { label: "Supervisor review", done: ["awaiting_client_signoff", "completed"].includes(job.status) },
    { label: "Client sign-off", done: job.status === "completed" || Boolean(job.client_signoff_name) },
  ];
}

function timeline(job: JobWithNames) {
  return [
    { label: "Created", value: formatDate(job.created_at), done: true },
    { label: "Scheduled", value: formatDate(job.scheduled_at), done: Boolean(job.scheduled_at) },
    { label: "Accepted", value: formatDate(job.accepted_at), done: Boolean(job.accepted_at) },
    { label: "On site", value: formatDate(job.on_site_at), done: Boolean(job.on_site_at) },
    { label: "Completed", value: formatDate(job.completed_at), done: Boolean(job.completed_at) },
    { label: "Signed off", value: formatDate(job.client_signoff_at), done: Boolean(job.client_signoff_at) },
  ];
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.id as string;

  const [job, setJob] = useState<JobWithNames | null>(null);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoType, setPhotoType] = useState("before");

  const loadPhotos = useCallback(async () => {
    const { data: photoData } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("uploaded_at", { ascending: true });

    setPhotos((photoData as JobPhoto[]) ?? []);
  }, [jobId]);

  const loadJob = useCallback(async () => {
    try {
      setError("");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, role, status")
        .eq("id", user.id)
        .maybeSingle();
      setProfile(profileData ?? { id: user.id, full_name: user.email ?? "User", role: "authenticated", status: "active" });

      const { data: jobData, error: jobError } = await supabase.from("service_jobs").select("*").eq("id", jobId).maybeSingle();

      if (jobError || !jobData) {
        setError(jobError?.message ?? "Job not found");
        return;
      }

      const named = await fetchWithNames<ServiceJobRow>([jobData as ServiceJobRow]);
      setJob(named[0]);
      await loadPhotos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load job details.");
    } finally {
      setLoading(false);
    }
  }, [jobId, loadPhotos, router]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  async function uploadPhoto(file: File) {
    if (!job) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload image evidence only.");
      return;
    }

    setUploading(true);
    setError("");

    const fileExt = file.name.split(".").pop() || "jpg";
    const fileName = `${job.id}/${photoType}/${Date.now()}.${fileExt}`;
    const bucket = "job-photos";

    const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("job_photos").insert({
      job_id: job.id,
      photo_type: photoType,
      storage_bucket: bucket,
      storage_path: fileName,
      uploaded_by: user?.id ?? null,
    });

    if (insertError) {
      setError(`Database insert failed: ${insertError.message}`);
      setUploading(false);
      return;
    }

    await loadPhotos();
    setUploading(false);
  }

  async function deletePhoto(photo: JobPhoto) {
    await supabase.storage.from(photo.storage_bucket).remove([photo.storage_path]);
    await supabase.from("job_photos").delete().eq("id", photo.id);
    await loadPhotos();
  }

  const getPhotoUrl = useCallback(async (photo: JobPhoto) => {
    const { data } = await supabase.storage.from(photo.storage_bucket).createSignedUrl(photo.storage_path, 3600);
    return data?.signedUrl ?? null;
  }, []);

  const photosByType = useMemo(() => {
    return photos.reduce((acc, photo) => {
      if (!acc[photo.photo_type]) acc[photo.photo_type] = [];
      acc[photo.photo_type].push(photo);
      return acc;
    }, {} as Record<string, JobPhoto[]>);
  }, [photos]);

  if (loading) {
    return <OataLoading label="Loading job details..." />;
  }

  if (error && !job) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef5f8] p-5">
        <div className="max-w-md rounded-3xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-bold text-red-700">Job details unavailable</p>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <button onClick={() => router.push("/")} className="mt-5 rounded-2xl bg-[#123747] px-4 py-3 text-sm font-bold text-white">
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  if (!job) return null;

  const details: DetailItem[] = [
    { label: "Client", value: job.company_name },
    { label: "Location", value: job.branch_name },
    { label: "Service", value: categoryLabel(job.service_category ?? job.job_type) },
    { label: "Asset", value: job.equipment_name ?? "No asset", helper: job.asset_code ?? undefined },
    { label: "Scheduled", value: formatDate(job.scheduled_at) },
    { label: "Report", value: statusLabel(job.report_status ?? "not_started") },
  ];
  const gates = evidenceGates(job, photos);
  const completedGates = gates.filter((gate) => gate.done).length;

  return (
    <OataPageShell
      eyebrow="Job Details"
      title={job.job_number ?? job.id.slice(0, 8)}
      description="Shared work-order details for OATA operations, technician execution, client review, evidence, and report readiness."
      userLabel={profile ? `${profile.full_name} · ${profile.role.replaceAll("_", " ")}` : null}
      actions={[
        { label: "← Dashboard", href: "/", variant: "ghost" },
        { label: "Technician", href: "/technician", variant: "ghost" },
        { label: "Report", href: `/reports/${job.id}`, variant: "primary" },
      ]}
    >
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#327482]">{categoryLabel(job.service_category ?? job.job_type)}</p>
                <h2 className="mt-3 text-3xl font-bold tracking-[-0.06em] text-[#123747] sm:text-4xl">{job.complaint ?? job.scope_of_work ?? "OATA Work Order"}</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                  Shared job details for OATA operations, technician execution, client review, evidence, and report readiness.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/technician" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-[#123747] hover:bg-slate-50">Technician</Link>
                <Link href={`/reports/${job.id}`} className="rounded-2xl bg-[#0872c9] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-900/15 hover:bg-[#065fa8]">Report</Link>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {details.map((item) => (
                <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</p>
                  <p className="mt-2 font-bold text-[#123747]">{item.value}</p>
                  {item.helper && <p className="mt-1 text-xs font-semibold text-slate-400">{item.helper}</p>}
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <TextPanel title="Complaint / Scope" tone="amber" text={job.complaint ?? job.scope_of_work ?? "No complaint or scope recorded."} />
              <TextPanel title="Diagnosis" tone="slate" text={job.diagnosis ?? "No diagnosis recorded yet."} />
              <TextPanel title="Root Cause" tone="slate" text={job.root_cause ?? "No root cause recorded yet."} />
              <TextPanel title="Work Performed" tone="green" text={job.work_performed ?? "No work notes recorded yet."} />
            </div>

            {job.recommendations && <TextPanel title="Recommendations" tone="blue" text={job.recommendations} className="mt-4" />}
          </article>

          <aside className="space-y-5">
            <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
              <h3 className="text-xl font-bold tracking-[-0.04em] text-[#123747]">Evidence Checklist</h3>
              <p className="mt-1 text-sm text-slate-500">{completedGates}/{gates.length} completed</p>
              <div className="mt-5 space-y-3">
                {gates.map((gate) => (
                  <div key={gate.label} className={`flex items-center gap-3 rounded-2xl border p-3 text-sm font-bold ${gate.done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${gate.done ? "bg-emerald-500 text-white" : "bg-white text-slate-400"}`}>{gate.done ? "✓" : "○"}</span>
                    {gate.label}
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
              <h3 className="text-xl font-bold tracking-[-0.04em] text-[#123747]">Timeline</h3>
              <div className="mt-5 space-y-4">
                {timeline(job).map((step) => (
                  <div key={step.label} className="flex gap-3">
                    <span className={`mt-1 h-3 w-3 rounded-full ${step.done ? "bg-[#0872c9]" : "bg-slate-300"}`} />
                    <div>
                      <p className="text-sm font-bold text-[#123747]">{step.label}</p>
                      <p className="text-xs text-slate-400">{step.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </aside>
        </div>

        <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-bold tracking-[-0.04em] text-[#123747]">Photos & Evidence</h3>
              <p className="mt-1 text-sm text-slate-500">Before, after, defect, nameplate, parts, safety, and sign-off evidence.</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <select value={photoType} onChange={(event) => setPhotoType(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#123747]">
              {photoTypes.map((type) => <option key={type} value={type}>{statusLabel(type)}</option>)}
            </select>

            <label className={`flex-1 cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 px-4 py-4 text-center text-sm font-semibold text-slate-500 transition hover:border-[#0872c9] hover:bg-blue-50 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
              {uploading ? "Uploading..." : "Upload photo evidence"}
              <input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadPhoto(file); }} />
            </label>
          </div>

          {error && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}

          {photos.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-slate-200 p-8 text-center">
              <p className="font-bold text-slate-500">No photos uploaded yet.</p>
              <p className="mt-1 text-sm text-slate-400">Upload before/after evidence to protect the client and OATA.</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {Object.entries(photosByType).map(([type, typePhotos]) => (
                <div key={type}>
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{statusLabel(type)} ({typePhotos.length})</p>
                  <div className="space-y-3">
                    {typePhotos.map((photo) => <PhotoItem key={photo.id} photo={photo} onDelete={deletePhoto} getPhotoUrl={getPhotoUrl} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {job.client_signoff_name && (
          <section className="mt-5 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm lg:p-6">
            <h3 className="text-xl font-bold tracking-[-0.04em] text-emerald-900">Client Sign-off</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">Signed By</p><p className="mt-2 font-bold text-emerald-950">{job.client_signoff_name}</p></div>
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">Signed At</p><p className="mt-2 font-bold text-emerald-950">{formatDate(job.client_signoff_at)}</p></div>
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">Report Status</p><p className="mt-2 font-bold text-emerald-950">{statusLabel(job.report_status ?? "ready")}</p></div>
            </div>
            {job.verification_result && <p className="mt-4 rounded-2xl bg-white/70 p-4 text-sm leading-6 text-emerald-900">{job.verification_result}</p>}
          </section>
        )}
      </OataPageShell>
  );
}

function TextPanel({ title, text, tone, className = "" }: { title: string; text: string; tone: "amber" | "slate" | "green" | "blue"; className?: string }) {
  const classes = {
    amber: "bg-amber-50 text-amber-900",
    slate: "bg-slate-50 text-slate-700",
    green: "bg-emerald-50 text-emerald-900",
    blue: "bg-blue-50 text-blue-900",
  }[tone];
  return (
    <div className={`rounded-3xl p-4 ${classes} ${className}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-70">{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{text}</p>
    </div>
  );
}

function PhotoItem({ photo, onDelete, getPhotoUrl }: { photo: JobPhoto; onDelete: (p: JobPhoto) => void; getPhotoUrl: (p: JobPhoto) => Promise<string | null> }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getPhotoUrl(photo).then((signedUrl) => {
      if (mounted) setUrl(signedUrl);
    });
    return () => {
      mounted = false;
    };
  }, [photo, getPhotoUrl]);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
      {url ? <img src={url} alt={photo.caption ?? photo.photo_type} className="h-44 w-full object-cover" /> : <div className="flex h-44 items-center justify-center text-sm text-slate-300">Loading photo...</div>}
      <div className="flex items-center justify-between p-3">
        <p className="text-xs font-semibold text-slate-400">{formatDate(photo.uploaded_at)}</p>
        <button onClick={() => onDelete(photo)} className="rounded-full px-3 py-1 text-xs font-bold text-red-500 hover:bg-red-50">Delete</button>
      </div>
    </div>
  );
}
