import { NextResponse } from "next/server";

import { getOrCreateChatSession, withCopilotClient } from "@/lib/server/copilot";
import {
  appendMessage,
  getThread,
  recordDiagnosticEvent,
  updateThread,
} from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toSse(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { threadId?: string; prompt?: string; modelId?: string | null }
    | null;

  const threadId = body?.threadId?.trim();
  const prompt = body?.prompt?.trim();
  const modelId = body?.modelId ?? null;

  if (!threadId || !prompt) {
    return NextResponse.json(
      { error: "threadId and prompt are required." },
      { status: 400 }
    );
  }

  const thread = await getThread(threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  await appendMessage(threadId, "user", prompt);
  await updateThread(threadId, {
    modelId,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(toSse(event, data)));
      };

      try {
        await withCopilotClient(async (client) => {
          const session = await getOrCreateChatSession(client, thread, modelId);

          if (!thread.copilotSessionId || thread.copilotSessionId !== session.sessionId) {
            await updateThread(threadId, {
              copilotSessionId: session.sessionId,
              modelId,
            });
            send("session", { sessionId: session.sessionId });
          }

          let finalContent = "";

          const unsubscribeDelta = session.on("assistant.message_delta", (event) => {
            const chunk = event.data.deltaContent ?? "";
            finalContent += chunk;
            send("delta", { content: chunk });
          });

          const unsubscribeFinal = session.on("assistant.message", (event) => {
            finalContent = event.data.content ?? finalContent;
          });

          const unsubscribeCompactionStart = session.on(
            "session.compaction_start",
            (event) => {
              const payload = {
                systemTokens: event.data.systemTokens ?? null,
                conversationTokens: event.data.conversationTokens ?? null,
                toolDefinitionsTokens: event.data.toolDefinitionsTokens ?? null,
              };

              void recordDiagnosticEvent({
                threadId,
                type: event.type,
                payload,
              });

              send("compaction", { phase: "start", ...payload });
            }
          );

          const unsubscribeCompactionComplete = session.on(
            "session.compaction_complete",
            (event) => {
              const payload = {
                success: event.data.success,
                preCompactionTokens: event.data.preCompactionTokens ?? null,
                postCompactionTokens: event.data.postCompactionTokens ?? null,
                messagesRemoved: event.data.messagesRemoved ?? null,
                tokensRemoved: event.data.tokensRemoved ?? null,
              };

              void recordDiagnosticEvent({
                threadId,
                type: event.type,
                payload,
              });

              send("compaction", { phase: "complete", ...payload });
            }
          );

          try {
            await session.sendAndWait({ prompt });

            if (finalContent.trim()) {
              await appendMessage(threadId, "assistant", finalContent);
            }

            send("done", {
              content: finalContent,
            });
          } finally {
            unsubscribeDelta();
            unsubscribeFinal();
            unsubscribeCompactionStart();
            unsubscribeCompactionComplete();
            await session.disconnect().catch(() => undefined);
          }
        });
      } catch (error) {
        send("error", {
          message:
            error instanceof Error ? error.message : "Unable to process the message.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
