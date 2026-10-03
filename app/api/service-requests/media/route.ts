import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ALLOWED_MEDIA_TYPES = new Set(["photo", "video", "document", "other"]);

type MediaPayload = {
  service_request_id?: string;
  media_type?: string;
  storage_bucket?: string;
  storage_path?: string;
  caption?: string | null;
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
    return NextResponse.json({ error: "You must be signed in to attach request evidence." }, { status: 401 });
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

  let payload: MediaPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const requestId = normalize(payload.service_request_id);
  const storageBucket = normalize(payload.storage_bucket) || "job-photos";
  const storagePath = normalize(payload.storage_path);
  const mediaType = normalize(payload.media_type) || "photo";
  const caption = normalize(payload.caption) || null;

  if (!requestId || !storagePath) {
    return NextResponse.json({ error: "Service request ID and storage path are required." }, { status: 400 });
  }

  if (storageBucket !== "job-photos") {
    return NextResponse.json({ error: "Invalid evidence storage bucket." }, { status: 400 });
  }

  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return NextResponse.json({ error: "Invalid media type." }, { status: 400 });
  }

  if (!storagePath.startsWith(`service-requests/${requestId}/`)) {
    return NextResponse.json({ error: "Evidence path does not match this service request." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, full_name, role, status")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "active") {
    return NextResponse.json({ error: "Active profile required to attach request evidence." }, { status: 403 });
  }

  const { data: visibleRequest, error: visibleError } = await userClient
    .from("service_requests")
    .select("id")
    .eq("id", requestId)
    .maybeSingle();

  if (visibleError || !visibleRequest) {
    return NextResponse.json({ error: "You do not have access to this service request." }, { status: 403 });
  }

  const { data, error } = await serviceClient
    .from("service_request_media")
    .insert({
      service_request_id: requestId,
      media_type: mediaType,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      caption,
      uploaded_by: userData.user.id,
    })
    .select("id, service_request_id, media_type, storage_bucket, storage_path, caption, uploaded_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ media: data }, { status: 201 });
}
