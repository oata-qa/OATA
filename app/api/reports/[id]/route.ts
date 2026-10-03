import { NextRequest, NextResponse } from "next/server";
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

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

function fmtDate(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params;
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "You must be signed in to view reports." }, { status: 401 });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, full_name, role, status")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "active") {
    return NextResponse.json({ error: "Active profile required to view reports." }, { status: 403 });
  }

  const isStaff = STAFF_ROLES.has(profile.role);
  const isClient = CLIENT_ROLES.has(profile.role);
  if (!isStaff && !isClient) {
    return NextResponse.json({ error: "You do not have report access." }, { status: 403 });
  }

  const { data: job, error: jobError } = await serviceClient
    .from("service_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ error: "Work order not found." }, { status: 404 });
  }

  // Clients may only view reports for jobs RLS allows them to see.
  if (!isStaff) {
    const { data: visibleJob } = await userClient
      .from("service_jobs")
      .select("id")
      .eq("id", jobId)
      .maybeSingle();
    if (!visibleJob) {
      return NextResponse.json({ error: "You do not have access to this work order." }, { status: 403 });
    }
  }

  // Resolve names
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

  // Load photos with signed URLs
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

  // Load status history
  const { data: history } = await serviceClient
    .from("job_status_history")
    .select("old_status, new_status, change_reason, created_at")
    .eq("entity_id", jobId)
    .eq("entity_type", "service_job")
    .order("created_at", { ascending: true });

  // Idempotent generation stamp: mark report generated when first viewed.
  if (job.report_status === "ready" && !job.report_generated_at) {
    await serviceClient
      .from("service_jobs")
      .update({ report_generated_at: new Date().toISOString() })
      .eq("id", jobId);

    const existing = await serviceClient
      .from("job_reports")
      .select("id")
      .eq("job_id", jobId)
      .limit(1);
    if (!existing.data || existing.data.length === 0) {
      await serviceClient.from("job_reports").insert({
        job_id: jobId,
        report_type: job.service_category === "hood_cleaning" || job.service_category === "duct_cleaning" ? "cleaning_certificate" : "service_report",
        title: `${job.job_number ?? "Work Order"} — ${job.service_category ?? job.job_type} report`,
        storage_bucket: "reports",
        storage_path: null,
        report_content: `OATA service report for ${job.job_number ?? "work order"}. Generated from structured work-order data on ${new Date().toISOString()}.`,
        generated_by: profile.id,
      });
    }
  }

  return NextResponse.json({
    report: {
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
        report_generated_at: fmtDate(job.report_generated_at),
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
    },
  });
}
