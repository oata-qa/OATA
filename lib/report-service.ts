import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const STAFF_ROLES = new Set([
  "oata_admin",
  "oata_manager",
  "head_of_technical",
  "hvac_ecology_supervisor",
  "leadman",
  "technician",
]);

const CLIENT_ROLES = new Set(["client_gm", "client_branch_manager", "client_finance", "client_user"]);

export type ReportJob = {
  id: string;
  job_number: string | null;
  job_type: string;
  service_category: string | null;
  priority: string;
  status: string;
  complaint: string | null;
  scope_of_work: string | null;
  diagnosis: string | null;
  root_cause: string | null;
  work_performed: string | null;
  recommendations: string | null;
  created_at: string | null;
  scheduled_at: string | null;
  accepted_at: string | null;
  on_site_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  client_signoff_name: string | null;
  client_signoff_at: string | null;
  verification_result: string | null;
  report_status: string | null;
};

export type ReportPhoto = {
  photo_type: string;
  caption: string | null;
  uploaded_at: string | null;
  signed_url: string | null;
};

export type ReportHistory = {
  old_status: string | null;
  new_status: string;
  change_reason: string | null;
  created_at: string;
};

export type ReportData = {
  job: ReportJob;
  company_name: string | null;
  branch_name: string | null;
  branch_code: string | null;
  equipment_name: string | null;
  asset_code: string | null;
  technician_name: string | null;
  leadman_name: string | null;
  photos: ReportPhoto[];
  history: ReportHistory[];
};

export type ReportResult =
  | { report: ReportData; error?: undefined; status: 200 }
  | { report?: undefined; error: string; status: number };

function fmtDate(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export async function assembleReport(token: string, jobId: string): Promise<ReportResult> {
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: "Invalid or expired session.", status: 401 };
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, full_name, role, status")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "active") {
    return { error: "Active profile required to view reports.", status: 403 };
  }

  const isStaff = STAFF_ROLES.has(profile.role);
  const isClient = CLIENT_ROLES.has(profile.role);
  if (!isStaff && !isClient) {
    return { error: "You do not have report access.", status: 403 };
  }

  const { data: job, error: jobError } = await serviceClient
    .from("service_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job) {
    return { error: "Work order not found.", status: 404 };
  }

  if (!isStaff) {
    const { data: visibleJob } = await userClient
      .from("service_jobs")
      .select("id")
      .eq("id", jobId)
      .maybeSingle();
    if (!visibleJob) {
      return { error: "You do not have access to this work order.", status: 403 };
    }
  }

  const [companyRes, branchRes, equipmentRes, techRes, leadRes] = await Promise.all([
    job.company_id
      ? serviceClient.from("companies").select("id, name").eq("id", job.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    job.branch_id
      ? serviceClient.from("branches").select("id, name, branch_code").eq("id", job.branch_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    job.equipment_id
      ? serviceClient.from("equipment").select("id, equipment_name, asset_code").eq("id", job.equipment_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    job.assigned_to
      ? serviceClient.from("profiles").select("id, full_name").eq("id", job.assigned_to).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    job.leadman_id
      ? serviceClient.from("profiles").select("id, full_name").eq("id", job.leadman_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const { data: photos } = await serviceClient
    .from("job_photos")
    .select("id, photo_type, storage_bucket, storage_path, caption, uploaded_at")
    .eq("job_id", jobId)
    .order("uploaded_at", { ascending: true });

  const photosWithUrls = await Promise.all(
    (photos ?? []).map(async (photo) => {
      let signedUrl: string | null = null;
      if (photo.storage_bucket && photo.storage_path) {
        const { data: signed } = await serviceClient.storage
          .from(photo.storage_bucket)
          .createSignedUrl(photo.storage_path, 3600);
        signedUrl = signed?.signedUrl ?? null;
      }
      return {
        photo_type: photo.photo_type,
        caption: photo.caption,
        uploaded_at: photo.uploaded_at,
        signed_url: signedUrl,
      };
    }),
  );

  const { data: history } = await serviceClient
    .from("job_status_history")
    .select("old_status, new_status, change_reason, created_at")
    .eq("entity_id", jobId)
    .eq("entity_type", "service_job")
    .order("created_at", { ascending: true });

  // Idempotent generation stamp.
  if (job.report_status === "ready" && !job.report_generated_at) {
    const generatedAt = new Date().toISOString();
    await serviceClient
      .from("service_jobs")
      .update({ report_generated_at: generatedAt })
      .eq("id", jobId);
    job.report_generated_at = generatedAt;

    const existing = await serviceClient.from("job_reports").select("id").eq("job_id", jobId).limit(1);
    if (!existing.data || existing.data.length === 0) {
      await serviceClient.from("job_reports").insert({
        job_id: jobId,
        report_type:
          job.service_category === "hood_cleaning" || job.service_category === "duct_cleaning"
            ? "cleaning_certificate"
            : "service_report",
        title: `${job.job_number ?? "Work Order"} — ${job.service_category ?? job.job_type} report`,
        storage_bucket: "reports",
        storage_path: null,
        report_content: `OATA service report for ${job.job_number ?? "work order"}. Generated from structured work-order data on ${generatedAt}.`,
        generated_by: profile.id,
      });
    }
  }

  const report: ReportData = {
    job: {
      id: job.id,
      job_number: job.job_number,
      job_type: job.job_type,
      service_category: job.service_category,
      priority: job.priority,
      status: job.status,
      complaint: job.complaint,
      scope_of_work: job.scope_of_work,
      diagnosis: job.diagnosis,
      root_cause: job.root_cause,
      work_performed: job.work_performed,
      recommendations: job.recommendations,
      created_at: fmtDate(job.created_at),
      scheduled_at: fmtDate(job.scheduled_at),
      accepted_at: fmtDate(job.accepted_at),
      on_site_at: fmtDate(job.on_site_at),
      started_at: fmtDate(job.started_at),
      completed_at: fmtDate(job.completed_at),
      closed_at: fmtDate(job.closed_at),
      client_signoff_name: job.client_signoff_name,
      client_signoff_at: fmtDate(job.client_signoff_at),
      verification_result: job.verification_result,
      report_status: job.report_status,
    },
    company_name: companyRes.data?.name ?? null,
    branch_name: branchRes.data?.name ?? null,
    branch_code: branchRes.data?.branch_code ?? null,
    equipment_name: equipmentRes.data?.equipment_name ?? null,
    asset_code: equipmentRes.data?.asset_code ?? null,
    technician_name: techRes.data?.full_name ?? null,
    leadman_name: leadRes.data?.full_name ?? null,
    photos: photosWithUrls,
    history: (history ?? []).map((h) => ({
      old_status: h.old_status,
      new_status: h.new_status,
      change_reason: h.change_reason,
      created_at: h.created_at,
    })),
  };

  return { report, status: 200 };
}
