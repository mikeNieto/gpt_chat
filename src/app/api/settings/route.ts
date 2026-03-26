import { NextResponse } from "next/server";

import { getRuntimeConnectionStatus } from "@/lib/server/copilot";
import {
  getCredentialStatus,
  getSettings,
  updateSettings,
} from "@/lib/server/store";
import type { AppSettings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [settings, credentialStatus, connection] = await Promise.all([
    getSettings(),
    getCredentialStatus(),
    getRuntimeConnectionStatus(),
  ]);

  return NextResponse.json({ settings, credentialStatus, connection });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<AppSettings>;

  const settings = await updateSettings({
    ...(body.languagePreference ? { languagePreference: body.languagePreference } : {}),
    ...(body.defaultModelId !== undefined ? { defaultModelId: body.defaultModelId } : {}),
    ...(body.themePreference ? { themePreference: body.themePreference } : {}),
  });

  return NextResponse.json({ settings });
}
