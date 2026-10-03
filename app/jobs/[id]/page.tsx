"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, badgeClass, statusLabel, categoryLabel, fetchWithNames, type ServiceJobRow, type JobPhoto, type Profile } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type JobWithNames = ServiceJobRow & {
  company_name: string;
  branch_name: string;
  equipment_name?: string;
  asset_code?: string | null;
};

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.id as string;

  const [job, setJob] = useState<JobWithNames | null>(null);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusUpdateMsg, setStatusUpdateMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoType, setPhotoType] = useState("before");

  const loadJob = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/");
      return;
    }

    // Load profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, role, status")
      .eq("id", user.id)
      .maybeSingle();
    setProfile(profileData ?? { id: user.id, full_name: user.email ?? "User", role: "authenticated", status: "active" });

    // Load job
    const { data: jobData, error: jobError } = await supabase
      .from("service_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !jobData) {
      setError(jobError?.message ?? "Job not found");
      setLoading(false);
      return;
    }

    const named = await fetchWithNames<ServiceJobRow>([jobData as ServiceJobRow]);
    setJob(named[0]);

    // Load photos
    const { data: photoData } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("uploaded_at", { ascending: true });

    setPhotos((photoData as JobPhoto[]) ?? []);
    setLoading(false);
  }, [jobId, router]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  async function updateStatus(newStatus: string) {
    if (!job) return;
    setStatusUpdateMsg("Updating status...");

    const { error: updateError } = await supabase
      .from("service_jobs")
      .update({ status: newStatus })
      .eq("id", job.id);

    if (updateError) {
      setStatusUpdateMsg(`Error: ${updateError.message}`);
      return;
    }

    setJob({ ...job, status: newStatus });
    setStatusUpdateMsg(`Status updated to ${newStatus}`);
  }

  async function uploadPhoto(file: File) {
    if (!job) return;
    setUploading(true);
    setError("");

    const fileExt = file.name.split(".").pop();
    const fileName = `${job.id}/${photoType}/${Date.now()}.${fileExt}`;
    const bucket = "job-photos";

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    // Insert job_photos record
    const { data: { user } } = await supabase.auth.getUser();
    const { error: insertError } = await supabase
      .from("job_photos")
      .insert({
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

    // Reload photos
    const { data: photoData } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("uploaded_at", { ascending: true });

    setPhotos((photoData as JobPhoto[]) ?? []);
    setUploading(false);
  }

  async function deletePhoto(photo: JobPhoto) {
    // Delete from storage
    await supabase.storage.from(photo.storage_bucket).remove([photo.storage_path]);

    // Delete from database
    await supabase.from("job_photos").delete().eq("id", photo.id);

    // Reload
    const { data: photoData2 } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("uploaded_at", { ascending: true });

    setPhotos((photoData2 as JobPhoto[]) ?? []);
  }

  async function getPhotoUrl(photo: JobPhoto) {
    const { data } = await supabase.storage
      .from(photo.storage_bucket)
      .createSignedUrl(photo.storage_path, 3600);
    return data?.signedUrl ?? null;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-400">Loading job...</p>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-lg font-semibold text-red-700">Error</p>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <button onClick={() => router.push("/")} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm text-white">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!job) return null;

  const photosByType = photos.reduce((acc, p) => {
    const key = p.photo_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {} as Record<string, JobPhoto[]>);

  const canEdit = profile?.role === "oata_admin" || profile?.role === "oata_manager";

  return (
    <div className="min-h-screen bg-[#eef3f6] text-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#eef3f6]/90 px-5 py-4 backdrop-blur lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/")} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              ← Dashboard
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-700">Job Detail</p>
              <h1 className="text-xl font-bold tracking-[-0.03em]">{job.job_number}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(job.priority)}`}>
              {job.priority}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(job.status)}`}>
              {statusLabel(job.status)}
            </span>
            {profile && (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                {profile.full_name} · {profile.role}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-5 py-6 lg:px-8">
        {/* Job info card */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Job Information</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs text-slate-400">Client</p>
              <p className="font-medium">{job.company_name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Branch / Site</p>
              <p className="font-medium">{job.branch_name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Equipment / Asset</p>
              <p className="font-medium">{job.equipment_name}</p>
              {job.asset_code && <p className="text-sm text-slate-500">{job.asset_code}</p>}
            </div>
            <div>
              <p className="text-xs text-slate-400">Job Type</p>
              <p className="font-medium">{categoryLabel(job.job_type)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Created</p>
              <p className="font-medium">{new Date(job.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Scheduled</p>
              <p className="font-medium">{job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "Not scheduled"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Report Status</p>
              <p className="font-medium">{statusLabel(job.report_status ?? "not_started")}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Completed</p>
              <p className="font-medium">{job.completed_at ? new Date(job.completed_at).toLocaleString() : "Not completed"}</p>
            </div>
          </div>

          {job.complaint && (
            <div className="mt-5 rounded-2xl bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Complaint</p>
              <p className="mt-1 text-sm text-amber-900">{job.complaint}</p>
            </div>
          )}

          {job.scope_of_work && (
            <div className="mt-3 rounded-2xl bg-blue-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Scope of Work</p>
              <p className="mt-1 text-sm text-blue-900">{job.scope_of_work}</p>
            </div>
          )}

          {job.diagnosis && (
            <div className="mt-3 rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Diagnosis</p>
              <p className="mt-1 text-sm text-slate-800">{job.diagnosis}</p>
            </div>
          )}

          {job.root_cause && (
            <div className="mt-3 rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Root Cause</p>
              <p className="mt-1 text-sm text-slate-800">{job.root_cause}</p>
            </div>
          )}

          {job.work_performed && (
            <div className="mt-3 rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Work Performed</p>
              <p className="mt-1 text-sm text-emerald-900">{job.work_performed}</p>
            </div>
          )}

          {job.recommendations && (
            <div className="mt-3 rounded-2xl bg-cyan-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Recommendations</p>
              <p className="mt-1 text-sm text-cyan-900">{job.recommendations}</p>
            </div>
          )}
        </section>

        {/* Status workflow */}
        {canEdit && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Status Workflow</h2>
            <div className="flex flex-wrap gap-2">
              {[
                "created",
                "assigned",
                "in_progress",
                "awaiting_leadman_review",
                "awaiting_client_signoff",
                "awaiting_manager_approval",
                "completed",
                "cancelled",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => updateStatus(s)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    job.status === s
                      ? "border-cyan-600 bg-cyan-600 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-300 hover:bg-cyan-50"
                  }`}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>
            {statusUpdateMsg && (
              <p className="mt-3 text-sm text-amber-700">{statusUpdateMsg}</p>
            )}
          </section>
        )}

        {/* Photo upload */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Photos & Evidence</h2>
            <span className="text-sm text-slate-400">{photos.length} photo{photos.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Upload controls */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={photoType}
              onChange={(e) => setPhotoType(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
            >
              <option value="before">Before</option>
              <option value="after">After</option>
              <option value="defect">Defect</option>
              <option value="nameplate">Nameplate</option>
              <option value="parts">Parts</option>
              <option value="safety">Safety</option>
              <option value="client_signoff">Client Sign-off</option>
              <option value="other">Other</option>
            </select>

            <label className={`flex-1 cursor-pointer rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-center text-sm text-slate-500 transition hover:border-cyan-400 hover:bg-cyan-50 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
              {uploading ? "Uploading..." : "Click to upload photo (max 10MB, JPEG/PNG/WebP)"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPhoto(file);
                }}
              />
            </label>
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
          )}

          {/* Photo grid */}
          {photos.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-8 text-center">
              <p className="text-slate-400">No photos uploaded yet.</p>
              <p className="mt-1 text-sm text-slate-400">Upload before/after photos as evidence for this job.</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(photosByType).map(([type, typePhotos]) => (
                <div key={type}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {type.replace(/_/g, " ")} ({typePhotos.length})
                  </p>
                  <div className="space-y-2">
                    {typePhotos.map((photo) => (
                      <PhotoItem key={photo.id} photo={photo} onDelete={deletePhoto} getPhotoUrl={getPhotoUrl} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Client sign-off */}
        {job.client_signoff_name && (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="text-lg font-semibold text-emerald-800">Client Sign-off</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-emerald-600">Signed by</p>
                <p className="font-medium text-emerald-900">{job.client_signoff_name}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-600">Date</p>
                <p className="font-medium text-emerald-900">
                  {job.client_signoff_at ? new Date(job.client_signoff_at).toLocaleString() : "—"}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Report / Certificate Readiness</p>
              <p className="mt-1 text-sm text-emerald-950">
                Status: {statusLabel(job.report_status ?? "ready")}. OATA can now prepare the final report/certificate package.
              </p>
              {job.verification_result && <p className="mt-2 text-sm text-emerald-900">{job.verification_result}</p>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ─── Photo Item Component ─────────────────────────────────────────────────────

function PhotoItem({
  photo,
  onDelete,
  getPhotoUrl,
}: {
  photo: JobPhoto;
  onDelete: (p: JobPhoto) => void;
  getPhotoUrl: (p: JobPhoto) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    getPhotoUrl(photo).then(setUrl);
  }, [photo, getPhotoUrl]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      {url ? (
        <img src={url} alt={photo.caption ?? photo.photo_type} className="h-48 w-full object-cover" />
      ) : (
        <div className="flex h-48 items-center justify-center text-slate-300">Loading...</div>
      )}
      <div className="flex items-center justify-between p-3">
        <p className="text-xs text-slate-500">
          {new Date(photo.uploaded_at).toLocaleDateString()}
        </p>
        <button
          onClick={() => onDelete(photo)}
          className="rounded-full px-2 py-1 text-xs text-red-500 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
