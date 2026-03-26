import { NextResponse } from "next/server";

import { createThread, listThreads } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const threads = await listThreads();
  return NextResponse.json({ threads });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    modelId?: string | null;
  };

  const thread = await createThread(body.modelId ?? null);
  return NextResponse.json({ thread }, { status: 201 });
}
