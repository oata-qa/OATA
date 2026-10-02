"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase, badgeClass, statusLabel, categoryLabel, type EquipmentRow, type ServiceJobRow, type Profile } from "@/lib/supabase";

export default function EquipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const equipmentId = params?.id as string;

  const [equipment, setEquipment] = useState<EquipmentRow | null>(null);
  const [jobs, setJobs] = useState<ServiceJobRow[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [branchName, setBranchName] = useState("");

  useEffect(() => {
    loadEquipment();
  }, [equipmentId]);

  async function loadEquipment() {
    const { data: { user } } = await supabase.auth.getUser();
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

    // Load equipment
    const { data: equipData, error: equipError } = await supabase
      .from("equipment")
      .select("*")
      .eq("id", equipmentId)
      .maybeSingle();

    if (equipError || !equipData) {
      setError(equipError?.message ?? "Equipment not found");
      setLoading(false);
      return;
    }

    setEquipment(equipData as EquipmentRow);

    // Load company and branch names
    if ((equipData as EquipmentRow).company_id) {
      const { data: comp } = await supabase
        .from("companies")
        .select("name")
        .eq("id", (equipData as EquipmentRow).company_id!)
        .maybeSingle();
      setCompanyName(comp?.name ?? "Unknown");
    }

    if ((equipData as EquipmentRow).branch_id) {
      const { data: branch } = await supabase
        .from("branches")
        .select("name")
        .eq("id", (equipData as EquipmentRow).branch_id!)
        .maybeSingle();
      setBranchName(branch?.name ?? "Unknown");
    }

    // Load service history (jobs for this equipment)
    const { data: jobsData } = await supabase
      .from("service_jobs")
      .select("*")
      .eq("equipment_id", equipmentId)
      .order("created_at", { ascending: false });

    setJobs((jobsData as ServiceJobRow[]) ?? []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-400">Loading equipment...</p>
      </div>
    );
  }

  if (error && !equipment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-lg font-semibold text-red-700">Error</p>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <button onClick={() => router.push("/equipment")} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm text-white">
            Back to Equipment
          </button>
        </div>
      </div>
    );
  }

  if (!equipment) return null;

  const qrUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/equipment/${equipment.id}`;

  return (
    <div className="min-h-screen bg-[#eef3f6] text-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#eef3f6]/90 px-5 py-4 backdrop-blur lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/equipment")} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              ← Equipment
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-700">Asset Detail</p>
              <h1 className="text-xl font-bold tracking-[-0.03em]">{equipment.equipment_name}</h1>
            </div>
          </div>
          {profile && (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              {profile.full_name} · {profile.role}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-5 py-6 lg:px-8">
        {/* Asset info + QR */}
        <div className="grid gap-6 lg:grid-cols-[1fr_0.6fr]">
          {/* Asset info */}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Asset Information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-400">Asset Code</p>
                <p className="font-medium">{equipment.asset_code ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Service Category</p>
                <p className="font-medium">{categoryLabel(equipment.service_category)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Client</p>
                <p className="font-medium">{companyName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Branch / Site</p>
                <p className="font-medium">{branchName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Manufacturer</p>
                <p className="font-medium">{equipment.manufacturer ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Model</p>
                <p className="font-medium">{equipment.model ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Serial Number</p>
                <p className="font-medium">{equipment.serial_number ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Location</p>
                <p className="font-medium">{equipment.location_description ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(equipment.status)}`}>
                  {equipment.status}
                </span>
              </div>
            </div>
          </section>

          {/* QR Code */}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">QR Code</h2>
            <div className="flex flex-col items-center">
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <QRCodeSVG value={qrUrl} size={200} level="M" />
              </div>
              <p className="mt-4 text-sm text-slate-500">Scan to open this asset record</p>
              <p className="mt-1 font-mono text-xs text-slate-400">{equipment.qr_code ?? "No QR code assigned"}</p>
              <button
                onClick={() => {
                  const canvas = document.querySelector("canvas");
                  if (canvas) {
                    const link = document.createElement("a");
                    link.download = `qr-${equipment.asset_code ?? equipment.id}.png`;
                    link.href = canvas.toDataURL();
                    link.click();
                  }
                }}
                className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Download QR
              </button>
            </div>
          </section>
        </div>

        {/* Service History */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Service History</h2>
          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center">
              <p className="text-slate-400">No service jobs for this equipment yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-cyan-300 hover:bg-cyan-50"
                  onClick={() => router.push(`/jobs/${job.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-xs font-semibold text-slate-500">{job.job_number}</p>
                      <p className="mt-1 font-medium">{categoryLabel(job.job_type)}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(job.priority)}`}>
                        {job.priority}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(job.status)}`}>
                        {statusLabel(job.status)}
                      </span>
                    </div>
                  </div>
                  {job.complaint && (
                    <p className="mt-2 text-sm text-slate-600">{job.complaint}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {new Date(job.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
