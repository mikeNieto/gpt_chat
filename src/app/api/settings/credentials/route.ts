import { NextResponse } from "next/server";

import {
  clearGithubToken,
  getCredentialStatus,
  setGithubToken,
} from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const credentialStatus = await getCredentialStatus();
  return NextResponse.json({ credentialStatus });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { githubToken?: string };
    const credentialStatus = await setGithubToken(body.githubToken ?? "");
    return NextResponse.json({ credentialStatus });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to store the GitHub token.",
      },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  const credentialStatus = await clearGithubToken();
  return NextResponse.json({ credentialStatus });
}
