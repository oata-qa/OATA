import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { assembleReport } from "@/lib/report-service";
import { ReportPdf } from "@/lib/report-pdf";

export const runtime = "nodejs";

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
    return NextResponse.json({ error: "You must be signed in to download reports." }, { status: 401 });
  }

  const result = await assembleReport(token, jobId);
  if (result.status !== 200 || !result.report) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const jobNumber = result.report.job.job_number ?? "work-order";
  const filename = `${jobNumber}-report.pdf`;

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(<ReportPdf report={result.report} />);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to generate PDF.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
