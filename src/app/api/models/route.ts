import { NextResponse } from "next/server";

import { listAvailableModels } from "@/lib/server/copilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await listAvailableModels();
  return NextResponse.json(payload);
}
