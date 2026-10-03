import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type RequestPayload = {
  company_id?: string | null;
  branch_id?: string | null;
  equipment_id?: string | null;
  contract_id?: string | null;
  service_category?: string;
  problem_category?: string;
  submitted_from_area?: string | null;
  description?: string;
};

function cleanId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function classifyPriority(payload: RequestPayload) {
  const text = `${payload.service_category ?? ""} ${payload.problem_category ?? ""} ${payload.description ?? ""}`.toLowerCase();

  const emergencyTerms = ["fire", "smoke", "gas leak", "electric shock", "sparking", "burning smell", "flood", "major leak"];
  if (emergencyTerms.some((term) => text.includes(term))) {
    return {
      priority: "emergency",
      confidence: "high",
      rule: "life_safety_or_property_damage_risk",
      reason: "The request mentions a possible life-safety, fire, gas, electrical, flooding, or major property-damage risk. OATA should treat it as emergency until verified.",
    };
  }

  const urgentTerms = [
    "not cooling",
    "freezer down",
    "chiller down",
    "fryer unavailable",
    "main fryer",
    "hood grease",
    "heavy grease",
    "exhaust fan stopped",
    "blocked drain",
    "blockage",
    "no hot water",
    "ac not working",
    "kitchen closed",
  ];
  if (urgentTerms.some((term) => text.includes(term))) {
    return {
      priority: "urgent",
      confidence: "high",
      rule: "business_interruption_or_hygiene_fire_safety_risk",
      reason: "The request indicates likely business interruption, hygiene risk, food-safety risk, fire-safety risk, or critical system failure.",
    };
  }

  if (payload.problem_category === "ppm" || text.includes("preventive") || text.includes("scheduled")) {
    return {
      priority: "planned",
      confidence: "medium",
      rule: "planned_preventive_or_scheduled_work",
      reason: "The request appears to be planned or preventive work rather than a breakdown.",
    };
  }

  return {
    priority: "normal",
    confidence: "medium",
    rule: "standard_service_request",
    reason: "No emergency or urgent rule was matched. OATA should review and dispatch under normal priority unless the manager adds more information.",
  };
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return NextResponse.json({ error: "You must be signed in to create a service request." }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  let payload: RequestPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const serviceCategory = normalize(payload.service_category);
  const problemCategory = normalize(payload.problem_category);
  const description = normalize(payload.description);

  if (!serviceCategory || !problemCategory || !description) {
    return NextResponse.json({ error: "Service category, problem category, and description are required." }, { status: 400 });
  }

  if (description.length < 12) {
    return NextResponse.json({ error: "Please describe the issue clearly before submitting." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, company_id, branch_id, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: `Profile check failed: ${profileError.message}` }, { status: 403 });
  }

  const submitterName = profile?.full_name || userData.user.email || "Client User";
  const classification = classifyPriority({ ...payload, service_category: serviceCategory, problem_category: problemCategory, description });

  const insertPayload = {
    company_id: cleanId(payload.company_id) ?? profile?.company_id ?? null,
    branch_id: cleanId(payload.branch_id) ?? profile?.branch_id ?? null,
    equipment_id: cleanId(payload.equipment_id),
    contract_id: cleanId(payload.contract_id),
    service_category: serviceCategory,
    problem_category: problemCategory,
    submitted_from_area: normalize(payload.submitted_from_area) || null,
    description,
    submitted_by_user_id: userData.user.id,
    submitted_by_name_snapshot: submitterName,
    hermes_priority: classification.priority,
    hermes_priority_reason: classification.reason,
    hermes_priority_confidence: classification.confidence,
    hermes_priority_rule: classification.rule,
    hermes_priority_at: new Date().toISOString(),
    status: "awaiting_manager_approval",
    manager_approval_status: "pending",
  };

  const { data, error } = await supabase
    .from("service_requests")
    .insert(insertPayload)
    .select("id, request_number, status, manager_approval_status, hermes_priority, hermes_priority_reason, hermes_priority_confidence, hermes_priority_rule, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ request: data }, { status: 201 });
}
