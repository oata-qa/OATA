"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase, badgeClass, categoryLabel, fetchWithNames, type EquipmentRow, type Profile } from "@/lib/supabase";

type EquipmentWithName = EquipmentRow & {
  company_name: string;
  branch_name: string;
};

export default function EquipmentPage() {
  const router = useRouter();
  const [equipment, setEquipment] = useState<EquipmentWithName[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showQR, setShowQR] = useState<string | null>(null);

  useEffect(() => {
    loadEquipment();
  }, []);

  async function loadEquipment() {
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

    // Load equipment
    const { data: equipData, error: equipError } = await supabase
      .from("equipment")
      .select("*")
      .order("created_at", { ascending: false });

    if (equipError) {
      setError(equipError.message);
      setLoading(false);
      return;
    }

    const named = await fetchWithNames<EquipmentRow>((equipData as EquipmentRow[]) ?? []);
    setEquipment(named);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-400">Loading equipment...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eef3f6] text-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#eef3f6]/90 px-5 py-4 backdrop-blur lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/")} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              ← Dashboard
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-700">Asset Register</p>
              <h1 className="text-xl font-bold tracking-[-0.03em]">Equipment & QR Codes</h1>
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
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            Error: {error}
          </div>
        )}

        {equipment.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <p className="text-slate-400">No equipment found.</p>
            <p className="mt-2 text-sm text-slate-400">Add equipment in Supabase or via the portal to see it here.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {equipment.map((item) => (
              <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-xs text-slate-400">{item.asset_code ?? "No code"}</p>
                    <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em]">{item.equipment_name}</h3>
                    <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                  <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                    {categoryLabel(item.service_category)}
                  </span>
                </div>

                <div className="mt-4 space-y-1 text-sm text-slate-500">
                  <p><span className="font-medium text-slate-700">Client:</span> {item.company_name}</p>
                  <p><span className="font-medium text-slate-700">Branch:</span> {item.branch_name}</p>
                  {item.manufacturer && <p><span className="font-medium text-slate-700">Manufacturer:</span> {item.manufacturer}</p>}
                  {item.model && <p><span className="font-medium text-slate-700">Model:</span> {item.model}</p>}
                  {item.serial_number && <p><span className="font-medium text-slate-700">Serial:</span> {item.serial_number}</p>}
                  {item.location_description && <p><span className="font-medium text-slate-700">Location:</span> {item.location_description}</p>}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => router.push(`/equipment/${item.id}`)}
                    className="flex-1 rounded-xl bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => setShowQR(showQR === item.id ? null : item.id)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    QR Code
                  </button>
                </div>

                {showQR === item.id && (
                  <div className="mt-4 flex flex-col items-center rounded-2xl bg-slate-50 p-4">
                    <div className="rounded-xl bg-white p-3">
                      <QRCodeSVG
                        value={`${typeof window !== "undefined" ? window.location.origin : ""}/equipment/${item.id}`}
                        size={180}
                        level="M"
                      />
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Scan to open asset record</p>
                    <p className="mt-1 font-mono text-xs text-slate-400">{item.qr_code ?? "No QR code assigned"}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
