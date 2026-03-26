import { NextResponse } from "next/server";

import { getBootstrapData } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getBootstrapData();
  return NextResponse.json(data);
}
