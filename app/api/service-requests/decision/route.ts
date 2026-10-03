import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const OATA_STAFF_ROLES = new Set([
  "oata_admin",
  "oata_manager",
  "head_of_technical",
  "hvac_ecology_supervisor",
  "leadman",
]);

const CLIENT_APPROVER_ROLES = new Set(["client_gm", "client_branch_manager", "client_finance"]);

type DecisionPayload = {
  service_request_id?: string;
  decision?: "approved" | "rejected";
  comment?: string | null;
};

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "You must be signed in to decide a request." }, { status: 401 });
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

  let payload: DecisionPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const requestId = normalize(payload.service_request_id);
  const decision = payload.decision;
  const comment = normalize(payload.comment);

  if (!requestId || !decision || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Request ID and a valid decision are required." }, { status: 400 });
  }

  if (decision === "rejected" && comment.length < 5) {
    return NextResponse.json({ error: "A rejection reason is required." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, full_name, role, company_id, branch_id, status")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "active") {
    return NextResponse.json({ error: "Active profile required to decide requests." }, { status: 403 });
  }

  const { data: serviceRequest, error: requestError } = await serviceClient
    .from("service_requests")
    .select("id, request_number, status, manager_approval_status, company_id, branch_id, contract_id, service_category, submitted_by_user_id")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !serviceRequest) {
    return NextResponse.json({ error: "Service request not found." }, { status: 404 });
  }

  if (!["awaiting_manager_approval", "priority_assigned", "submitted"].includes(serviceRequest.status)) {
    return NextResponse.json({ error: `Request cannot be decided from status: ${serviceRequest.status}` }, { status: 409 });
  }

  if (serviceRequest.manager_approval_status !== "pending") {
    return NextResponse.json({ error: "Request has already been decided." }, { status: 409 });
  }

  const isOataStaff = OATA_STAFF_ROLES.has(profile.role);
  const isClientApprover = CLIENT_APPROVER_ROLES.has(profile.role);

  const [branchAccessRes, contractAccessRes] = await Promise.all([
    serviceRequest.branch_id
      ? serviceClient
          .from("branch_user_access")
          .select("id")
          .eq("branch_id", serviceRequest.branch_id)
          .eq("user_id", profile.id)
          .eq("status", "active")
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
    serviceRequest.contract_id
      ? serviceClient
          .from("contract_user_access")
          .select("id")
          .eq("contract_id", serviceRequest.contract_id)
          .eq("user_id", profile.id)
          .eq("status", "active")
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const hasBranchAccess = Boolean(branchAccessRes.data?.length) || Boolean(profile.branch_id && profile.branch_id === serviceRequest.branch_id);
  const hasContractAccess = Boolean(contractAccessRes.data?.length);
  const sameCompany = Boolean(profile.company_id && profile.company_id === serviceRequest.company_id);

  const authorized = isOataStaff || (isClientApprover && (hasBranchAccess || hasContractAccess || sameCompany));
  if (!authorized) {
    return NextResponse.json({ error: "You are not authorized to approve or reject this request." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const updatePayload = decision === "approved"
    ? {
        status: "approved",
        manager_approval_status: "approved",
        approved_by_user_id: profile.id,
        approved_by_name_snapshot: profile.full_name,
        approved_at: now,
        rejection_reason: null,
      }
    : {
        status: "rejected",
        manager_approval_status: "rejected",
        rejected_by_user_id: profile.id,
        rejected_by_name_snapshot: profile.full_name,
        rejected_at: now,
        rejection_reason: comment,
      };

  const { data: updatedRequest, error: updateError } = await serviceClient
    .from("service_requests")
    .update(updatePayload)
    .eq("id", requestId)
    .select("id, request_number, status, manager_approval_status, approved_by_name_snapshot, approved_at, rejected_by_name_snapshot, rejected_at, rejection_reason")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const { error: approvalError } = await serviceClient.from("request_approvals").insert({
    service_request_id: requestId,
    approval_type: "manager_request_approval",
    required_role: "client_branch_manager_or_client_gm",
    requested_by: serviceRequest.submitted_by_user_id,
    decision,
    decided_by: profile.id,
    decided_by_name_snapshot: profile.full_name,
    decided_at: now,
    comment: comment || null,
  });

  if (approvalError) {
    return NextResponse.json({ error: `Request updated but approval audit insert failed: ${approvalError.message}` }, { status: 500 });
  }

  return NextResponse.json({ request: updatedRequest }, { status: 200 });
}
