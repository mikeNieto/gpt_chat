import { NextResponse } from "next/server";

import {
  deleteThread,
  getThreadWithMessages,
  updateThread,
} from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const payload = await getThreadWithMessages(id);

  if (!payload.thread) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  return NextResponse.json(payload);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    modelId?: string | null;
  };

  const thread = await updateThread(id, {
    ...(typeof body.title === "string" ? { title: body.title.trim() || "New chat" } : {}),
    ...(body.modelId !== undefined ? { modelId: body.modelId } : {}),
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  return NextResponse.json({ thread });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = await deleteThread(id);

  if (!deleted) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
