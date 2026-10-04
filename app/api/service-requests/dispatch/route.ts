import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const DISPATCH_ROLES = new Set([
  "oata_admin",
  "oata_manager",
  "head_of_technical",
  "hvac_ecology_supervisor",
  "leadman",
]);

type DispatchPayload = {
  service_request_id?: string;
  priority?: string | null;
  assigned_to?: string | null;
  leadman_id?: string | null;
  scheduled_at?: string | null;
  dispatch_notes?: string | null;
};

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

function jobPriority(value: string | null | undefined) {
  if (value === "emergency") return "emergency";
  if (value === "urgent") return "urgent";
  if (value === "planned" || value === "ppm") return "normal";
  return "normal";
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "You must be signed in to dispatch requests." }, { status: 401 });
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

  let payload: DispatchPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const requestId = normalize(payload.service_request_id);
  if (!requestId) {
    return NextResponse.json({ error: "Service request ID is required." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, full_name, role, status")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "active") {
    return NextResponse.json({ error: "Active OATA profile required to dispatch requests." }, { status: 403 });
  }

  if (!DISPATCH_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "Only OATA dispatch/operations roles can convert requests into work orders." }, { status: 403 });
  }

  const { data: serviceRequest, error: requestError } = await serviceClient
    .from("service_requests")
    .select("id, request_number, company_id, branch_id, equipment_id, contract_id, service_category, problem_category, submitted_from_area, description, submitted_by_user_id, submitted_by_name_snapshot, hermes_priority, hermes_priority_reason, status, manager_approval_status, converted_work_order_id")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !serviceRequest) {
    return NextResponse.json({ error: "Service request not found." }, { status: 404 });
  }

  if (serviceRequest.status !== "approved" || serviceRequest.manager_approval_status !== "approved") {
    return NextResponse.json({ error: "Only manager-approved service requests can be converted to work orders." }, { status: 409 });
  }

  if (serviceRequest.converted_work_order_id) {
    return NextResponse.json({ error: "This service request has already been converted to a work order." }, { status: 409 });
  }

  const [{ data: branch }, { data: contract }] = await Promise.all([
    serviceRequest.branch_id
      ? serviceClient.from("branches").select("id, company_id, name").eq("id", serviceRequest.branch_id).maybeSingle()
      : Promise.resolve({ data: null }),
    serviceRequest.contract_id
      ? serviceClient.from("contracts").select("id, owner_company_id, contract_name").eq("id", serviceRequest.contract_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const generatedJobNumber = `WO-${(serviceRequest.request_number ?? serviceRequest.id).replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase()}`;
  const priority = jobPriority(normalize(payload.priority) || serviceRequest.hermes_priority);
  const dispatchNotes = normalize(payload.dispatch_notes);
  const now = new Date().toISOString();

  const jobPayload = {
    company_id: serviceRequest.company_id,
    branch_id: serviceRequest.branch_id,
    equipment_id: serviceRequest.equipment_id,
    job_number: generatedJobNumber,
    job_type: serviceRequest.service_category,
    service_category: serviceRequest.service_category,
    priority,
    status: "created",
    complaint: serviceRequest.description,
    scope_of_work: [
      `Converted from service request ${serviceRequest.request_number ?? serviceRequest.id}.`,
      serviceRequest.submitted_from_area ? `Area: ${serviceRequest.submitted_from_area}.` : null,
      serviceRequest.hermes_priority_reason ? `Priority reason: ${serviceRequest.hermes_priority_reason}` : null,
      dispatchNotes ? `Dispatch notes: ${dispatchNotes}` : null,
    ].filter(Boolean).join("\n"),
    recommendations: "OATA dispatch to assign technician/supervisor and verify work scope before execution.",
    assigned_to: cleanId(payload.assigned_to),
    leadman_id: cleanId(payload.leadman_id),
    scheduled_at: normalize(payload.scheduled_at) || null,
    created_by: profile.id,
    contract_id: serviceRequest.contract_id,
    requested_by_company_id: serviceRequest.company_id,
    bill_to_company_id: contract?.owner_company_id ?? serviceRequest.company_id,
    site_company_id: branch?.company_id ?? serviceRequest.company_id,
    visibility_scope: serviceRequest.contract_id ? "contract" : "company",
    service_request_id: serviceRequest.id,
    report_status: "not_started",
  };

  const { data: job, error: jobError } = await serviceClient
    .from("service_jobs")
    .insert(jobPayload)
    .select("id, job_number, status, priority, service_category, service_request_id, created_at")
    .single();

  if (jobError) {
    return NextResponse.json({ error: `Work order creation failed: ${jobError.message}` }, { status: 400 });
  }

  const { data: updatedRequest, error: updateError } = await serviceClient
    .from("service_requests")
    .update({
      status: "converted_to_work_order",
      converted_work_order_id: job.id,
      converted_at: now,
    })
    .eq("id", serviceRequest.id)
    .select("id, request_number, status, manager_approval_status, converted_work_order_id, converted_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: `Work order created but request update failed: ${updateError.message}`, job }, { status: 500 });
  }

  return NextResponse.json({ request: updatedRequest, job }, { status: 201 });
}
