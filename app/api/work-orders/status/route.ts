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
]);

const FIELD_ROLES = new Set(["technician", "leadman", "head_of_technical", "hvac_ecology_supervisor"]);
const REVIEW_ROLES = new Set(["oata_admin", "oata_manager", "head_of_technical", "hvac_ecology_supervisor", "leadman"]);
const CLIENT_SIGNOFF_ROLES = new Set(["client_gm", "client_branch_manager", "client_finance", "client_user"]);

type StatusPayload = {
  job_id?: string;
  action?: "accept" | "start" | "submit_review" | "leadman_approve" | "send_back" | "client_signoff";
  notes?: string | null;
  diagnosis?: string | null;
  work_performed?: string | null;
  signer_name?: string | null;
};

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

function appendText(existing: string | null, addition: string) {
  if (!addition) return existing;
  if (!existing) return addition;
  return `${existing}\n\n${addition}`;
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "You must be signed in to update work orders." }, { status: 401 });
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

  let payload: StatusPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const jobId = normalize(payload.job_id);
  const action = payload.action;

  if (!jobId || !action || !["accept", "start", "submit_review", "leadman_approve", "send_back", "client_signoff"].includes(action)) {
    return NextResponse.json({ error: "Job ID and valid action are required." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, full_name, role, status")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "active") {
    return NextResponse.json({ error: "Active OATA profile required to update work orders." }, { status: 403 });
  }

  const isClientSignoffAction = action === "client_signoff";

  if (!STAFF_ROLES.has(profile.role) && !FIELD_ROLES.has(profile.role) && !(isClientSignoffAction && CLIENT_SIGNOFF_ROLES.has(profile.role))) {
    return NextResponse.json({ error: "Only authorized OATA or client roles can update work orders." }, { status: 403 });
  }

  const { data: visibleJob } = await userClient
    .from("service_jobs")
    .select("id")
    .eq("id", jobId)
    .maybeSingle();

  const { data: job, error: jobError } = await serviceClient
    .from("service_jobs")
    .select("id, job_number, status, assigned_to, leadman_id, diagnosis, work_performed, started_at, accepted_at, on_site_at, client_signoff_name, report_status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ error: "Work order not found." }, { status: 404 });
  }

  const isStaff = STAFF_ROLES.has(profile.role);
  const isAssignedTechnician = job.assigned_to === profile.id;
  const isAssignedLeadman = job.leadman_id === profile.id;
  const canClientSignoff = isClientSignoffAction && (isStaff || (CLIENT_SIGNOFF_ROLES.has(profile.role) && Boolean(visibleJob)));
  const canTouch = isStaff || isAssignedTechnician || isAssignedLeadman || (!job.assigned_to && FIELD_ROLES.has(profile.role)) || canClientSignoff;

  if (!canTouch) {
    return NextResponse.json({ error: "You are not assigned or authorized for this work order." }, { status: 403 });
  }

  if (isClientSignoffAction && !canClientSignoff) {
    return NextResponse.json({ error: "You do not have client sign-off access for this work order." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const notes = normalize(payload.notes);
  const diagnosis = normalize(payload.diagnosis);
  const workPerformed = normalize(payload.work_performed);
  const signerName = normalize(payload.signer_name) || profile.full_name;

  let updatePayload: Record<string, string | null> = {};

  if (action === "accept") {
    if (!["created", "assigned"].includes(job.status)) {
      return NextResponse.json({ error: `Work order cannot be accepted from status: ${job.status}` }, { status: 409 });
    }
    updatePayload = {
      status: "assigned",
      assigned_to: job.assigned_to ?? profile.id,
      accepted_at: job.accepted_at ?? now,
      work_performed: appendText(job.work_performed, notes ? `Technician accepted: ${notes}` : `Technician accepted by ${profile.full_name}.`),
    };
  }

  if (action === "start") {
    if (!["created", "assigned"].includes(job.status)) {
      return NextResponse.json({ error: `Work order cannot be started from status: ${job.status}` }, { status: 409 });
    }
    updatePayload = {
      status: "in_progress",
      assigned_to: job.assigned_to ?? profile.id,
      accepted_at: job.accepted_at ?? now,
      started_at: job.started_at ?? now,
      on_site_at: job.on_site_at ?? now,
      work_performed: appendText(job.work_performed, notes ? `Started/on site: ${notes}` : `Technician started/on site: ${profile.full_name}.`),
    };
  }

  if (action === "submit_review") {
    if (job.status !== "in_progress") {
      return NextResponse.json({ error: `Work order can only be submitted for review from in_progress. Current status: ${job.status}` }, { status: 409 });
    }
    if (!diagnosis && !workPerformed && !notes) {
      return NextResponse.json({ error: "Diagnosis, work performed, or notes are required before submitting for review." }, { status: 400 });
    }
    updatePayload = {
      status: "awaiting_leadman_review",
      diagnosis: appendText(job.diagnosis, diagnosis),
      work_performed: appendText(job.work_performed, workPerformed || notes),
    };
  }

  if (action === "leadman_approve") {
    if (!REVIEW_ROLES.has(profile.role)) {
      return NextResponse.json({ error: "Only leadman or OATA operations roles can approve review." }, { status: 403 });
    }
    if (job.status !== "awaiting_leadman_review") {
      return NextResponse.json({ error: `Work order can only be approved from awaiting_leadman_review. Current status: ${job.status}` }, { status: 409 });
    }
    updatePayload = {
      status: "awaiting_client_signoff",
      leadman_id: job.leadman_id ?? profile.id,
      work_performed: appendText(job.work_performed, notes ? `Leadman approved for client sign-off: ${notes}` : `Leadman approved for client sign-off by ${profile.full_name}.`),
    };
  }

  if (action === "send_back") {
    if (!REVIEW_ROLES.has(profile.role)) {
      return NextResponse.json({ error: "Only leadman or OATA operations roles can send work back." }, { status: 403 });
    }
    if (job.status !== "awaiting_leadman_review") {
      return NextResponse.json({ error: `Work order can only be sent back from awaiting_leadman_review. Current status: ${job.status}` }, { status: 409 });
    }
    if (!notes) {
      return NextResponse.json({ error: "Leadman send-back reason is required." }, { status: 400 });
    }
    updatePayload = {
      status: "in_progress",
      leadman_id: job.leadman_id ?? profile.id,
      work_performed: appendText(job.work_performed, `Leadman sent back for correction: ${notes}`),
    };
  }

  if (action === "client_signoff") {
    if (job.status !== "awaiting_client_signoff") {
      return NextResponse.json({ error: `Work order can only be signed off from awaiting_client_signoff. Current status: ${job.status}` }, { status: 409 });
    }
    updatePayload = {
      status: "completed",
      client_signoff_name: signerName,
      client_signoff_at: now,
      completed_at: now,
      closed_at: now,
      verification_result: notes ? `Client sign-off accepted: ${notes}` : "Client sign-off accepted.",
      report_status: "ready",
      work_performed: appendText(job.work_performed, notes ? `Client signed off by ${signerName}: ${notes}` : `Client signed off by ${signerName}.`),
    };
  }

  const { data: updatedJob, error: updateError } = await serviceClient
    .from("service_jobs")
    .update(updatePayload)
    .eq("id", jobId)
    .select("id, job_number, status, priority, accepted_at, started_at, on_site_at, completed_at, closed_at, client_signoff_name, client_signoff_at, verification_result, report_status, diagnosis, work_performed, assigned_to, leadman_id")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ job: updatedJob }, { status: 200 });
}
