import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Shared Types ───────────────────────────────────────────────────────────

export type Profile = {
  id: string;
  full_name: string;
  role: string;
  status: string;
};

export type ServiceJobRow = {
  id: string;
  job_number: string | null;
  job_type: string;
  priority: string;
  status: string;
  complaint: string | null;
  scope_of_work: string | null;
  diagnosis: string | null;
  root_cause: string | null;
  work_performed: string | null;
  recommendations: string | null;
  created_at: string;
  scheduled_at: string | null;
  company_id: string | null;
  branch_id: string | null;
  equipment_id: string | null;
  assigned_to: string | null;
  leadman_id: string | null;
  client_signoff_name: string | null;
  client_signoff_at: string | null;
  completed_at?: string | null;
  verification_result?: string | null;
  report_status?: string | null;
  report_generated_at?: string | null;
  closed_at?: string | null;
};

export type JobPhoto = {
  id: string;
  job_id: string;
  photo_type: string;
  storage_bucket: string;
  storage_path: string;
  caption: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

export type EquipmentRow = {
  id: string;
  asset_code: string | null;
  qr_code: string | null;
  service_category: string;
  equipment_name: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  location_description: string | null;
  status: string;
  company_id: string | null;
  branch_id: string | null;
};

export type ApprovalRow = {
  id: string;
  approval_type: string;
  decision: string;
  amount_qar: number | null;
  currency: string;
  comment: string | null;
  job_id: string | null;
};

// ─── Status constants ────────────────────────────────────────────────────────

export const JOB_STATUSES = [
  "created",
  "assigned",
  "in_progress",
  "awaiting_leadman_review",
  "awaiting_client_signoff",
  "awaiting_manager_approval",
  "quotation_required",
  "parts_required",
  "completed",
  "cancelled",
] as const;

export const PHOTO_TYPES = [
  "before",
  "after",
  "defect",
  "nameplate",
  "parts",
  "safety",
  "client_signoff",
  "other",
] as const;

export const SERVICE_CATEGORIES = [
  "kitchen_equipment",
  "refrigeration",
  "hvac",
  "coffee_machine",
  "hood_cleaning",
  "duct_cleaning",
  "grease_trap",
  "drainage",
  "water_tank",
  "ecology_unit",
  "mep",
  "other",
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function badgeClass(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("emergency") || lower.includes("critical") || lower.includes("risk")) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (lower.includes("awaiting") || lower.includes("approval") || lower.includes("high") || lower.includes("urgent")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (lower.includes("scheduled") || lower.includes("progress") || lower.includes("assigned") || lower.includes("created")) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    awaiting_leadman_review: "Awaiting Supervisor Review",
  };

  return labels[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function categoryLabel(category: string) {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function fetchWithNames<T extends { company_id: string | null; branch_id: string | null; equipment_id?: string | null }>(
  rows: T[]
): Promise<(T & { company_name: string; branch_name: string })[]> {
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean))] as string[];
  const branchIds = [...new Set(rows.map((r) => r.branch_id).filter(Boolean))] as string[];
  const equipmentIds = [...new Set(rows.map((r) => r.equipment_id).filter(Boolean))] as string[];

  const [companiesRes, branchesRes, equipmentRes] = await Promise.all([
    companyIds.length > 0
      ? supabase.from("companies").select("id, name").in("id", companyIds)
      : Promise.resolve({ data: null, error: null }),
    branchIds.length > 0
      ? supabase.from("branches").select("id, name").in("id", branchIds)
      : Promise.resolve({ data: null, error: null }),
    equipmentIds.length > 0
      ? supabase.from("equipment").select("id, equipment_name, asset_code").in("id", equipmentIds)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const companyMap = new Map<string, string>();
  (companiesRes.data ?? []).forEach((c: any) => companyMap.set(c.id, c.name));
  const branchMap = new Map<string, string>();
  (branchesRes.data ?? []).forEach((b: any) => branchMap.set(b.id, b.name));
  const equipmentMap = new Map<string, { name: string; asset_code: string | null }>();
  (equipmentRes.data ?? []).forEach((e: any) =>
    equipmentMap.set(e.id, { name: e.equipment_name, asset_code: e.asset_code }),
  );

  return rows.map((r) => ({
    ...r,
    company_name: r.company_id ? (companyMap.get(r.company_id) ?? "Unknown") : "Unassigned",
    branch_name: r.branch_id ? (branchMap.get(r.branch_id) ?? "Unknown") : "No branch",
    ...(r.equipment_id !== undefined ? {
      equipment_name: r.equipment_id ? (equipmentMap.get(r.equipment_id)?.name ?? "Unknown") : "No asset",
      asset_code: r.equipment_id ? (equipmentMap.get(r.equipment_id)?.asset_code ?? null) : null,
    } : {}),
  }));
}
