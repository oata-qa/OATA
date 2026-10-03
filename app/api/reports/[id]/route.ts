import { NextRequest, NextResponse } from "next/server";
import { assembleReport } from "@/lib/report-service";

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
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

  const result = await assembleReport(token, jobId);
  if (result.status !== 200 || !result.report) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ report: result.report });
}
