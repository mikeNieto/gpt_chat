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

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to process the message.";
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

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const send = async (event: string, data: Record<string, unknown>) => {
    await writer.write(encoder.encode(toSse(event, data)));
  };

  void (async () => {
    try {
      await writer.write(encoder.encode(": connected\n\n"));

      await withCopilotClient(async (client) => {
        const session = await getOrCreateChatSession(client, thread, modelId);

        if (!thread.copilotSessionId || thread.copilotSessionId !== session.sessionId) {
          await updateThread(threadId, {
            copilotSessionId: session.sessionId,
            modelId,
          });
          await send("session", { sessionId: session.sessionId });
        }

        let finalContent = "";
        let resolveIdle: (() => void) | null = null;
        let rejectIdle: ((error: Error) => void) | null = null;

        const idlePromise = new Promise<void>((resolve, reject) => {
          resolveIdle = resolve;
          rejectIdle = reject;
        });

        const unsubscribeDelta = session.on("assistant.message_delta", (event) => {
          const chunk = event.data.deltaContent ?? "";
          finalContent += chunk;
          void send("delta", { content: chunk });
        });

        const unsubscribeFinal = session.on("assistant.message", (event) => {
          finalContent = event.data.content ?? finalContent;
        });

        const unsubscribeIdle = session.on("session.idle", () => {
          resolveIdle?.();
        });

        const unsubscribeSessionError = session.on("session.error", (event) => {
          rejectIdle?.(new Error(event.data.message));
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

            void send("compaction", { phase: "start", ...payload });
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

            void send("compaction", { phase: "complete", ...payload });
          }
        );

        try {
          await session.send({ prompt });
          await idlePromise;

          if (finalContent.trim()) {
            await appendMessage(threadId, "assistant", finalContent);
          }

          await send("done", {
            content: finalContent,
          });
        } finally {
          unsubscribeDelta();
          unsubscribeFinal();
          unsubscribeIdle();
          unsubscribeSessionError();
          unsubscribeCompactionStart();
          unsubscribeCompactionComplete();
          await session.disconnect().catch(() => undefined);
        }
      });
    } catch (error) {
      await send("error", {
        message: toErrorMessage(error),
      }).catch(() => undefined);
    } finally {
      await writer.close().catch(() => undefined);
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Encoding": "none",
      "X-Accel-Buffering": "no",
    },
  });
}
