"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppContext } from "@/components/app/app-provider";
import { AssistantMarkdown } from "@/components/chat/assistant-markdown";
import { ChatComposer } from "@/components/chat/chat-composer";
import type { MessageRecord, ThreadRecord } from "@/lib/types";

interface ThreadViewProps {
  threadId: string;
}

function parseEventStreamBlock(block: string) {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || "message";
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  return {
    event,
    data: JSON.parse(dataLines.join("\n")) as Record<string, unknown>,
  };
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function ThreadView({ threadId }: ThreadViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dictionary, models, refreshBootstrap, settings } = useAppContext();
  const [thread, setThread] = useState<ThreadRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [missingThread, setMissingThread] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const autoPromptRef = useRef<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pendingAssistantContentRef = useRef("");
  const flushFrameRef = useRef<number | null>(null);
  const streamingMessageCreatedAtRef = useRef<string | null>(null);
  const activeModelId = thread?.modelId ?? settings.defaultModelId;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = scrollerRef.current;
    if (!element) {
      return;
    }

    element.scrollTo({
      top: element.scrollHeight,
      behavior,
    });
  }, []);

  const isNearBottom = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) {
      return true;
    }

    return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
  }, []);

  const shouldStickToBottomRef = useRef(true);

  const flushAssistantContent = useCallback(
    (messageId: string, nextContent: string) => {
      setMessages((current) => {
        const next = [...current];
        const index = next.findIndex((message) => message.id === messageId);
        if (index === -1) {
          return [
            ...current,
            {
              id: messageId,
              threadId,
              role: "assistant",
              content: nextContent,
              createdAt:
                streamingMessageCreatedAtRef.current ??
                new Date().toISOString(),
            },
          ];
        }

        const message = next[index];
        if (message.role !== "assistant" || message.content === nextContent) {
          return current;
        }

        next[index] = {
          ...message,
          content: nextContent,
        };
        return next;
      });
    },
    [threadId],
  );

  const scheduleAssistantFlush = useCallback(
    (messageId: string) => {
      if (flushFrameRef.current !== null) {
        return;
      }

      flushFrameRef.current = requestAnimationFrame(() => {
        flushFrameRef.current = null;
        flushAssistantContent(messageId, pendingAssistantContentRef.current);
      });
    },
    [flushAssistantContent],
  );

  const finishAssistantFlush = useCallback(
    (messageId: string, finalContent: string) => {
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
        flushFrameRef.current = null;
      }

      pendingAssistantContentRef.current = finalContent;
      flushAssistantContent(messageId, finalContent);
    },
    [flushAssistantContent],
  );

  const fetchThread = useCallback(async () => {
    const response = await fetch(`/api/threads/${threadId}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      error?: string;
      thread?: ThreadRecord;
      messages?: MessageRecord[];
    };

    if (!response.ok || !payload.thread || !payload.messages) {
      setMissingThread(true);
      return;
    }

    setThread(payload.thread);
    setMessages(payload.messages);
    setMissingThread(false);
  }, [threadId]);

  useEffect(() => {
    void fetchThread();
  }, [fetchThread]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    scrollToBottom(messages.length > 1 ? "smooth" : "auto");
  }, [messages, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
      }
    };
  }, []);

  const activeModelName = useMemo(() => {
    if (!activeModelId) {
      return dictionary.defaultModel;
    }

    return (
      models.find((model) => model.id === activeModelId)?.name ?? activeModelId
    );
  }, [activeModelId, dictionary.defaultModel, models]);

  const sendPrompt = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || isSending) {
        return;
      }

      shouldStickToBottomRef.current = true;
      setIsSending(true);
      setStatus(dictionary.sending);

      const userMessage: MessageRecord = {
        id: crypto.randomUUID(),
        threadId,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      const assistantPlaceholder: MessageRecord = {
        id: crypto.randomUUID(),
        threadId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => [...current, userMessage, assistantPlaceholder]);
      setStreamingMessageId(assistantPlaceholder.id);
      pendingAssistantContentRef.current = "";
      streamingMessageCreatedAtRef.current = assistantPlaceholder.createdAt;
      setInput("");
      requestAnimationFrame(() => scrollToBottom("smooth"));

      try {
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            threadId,
            prompt: trimmed,
            modelId: activeModelId,
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error("Unable to stream the assistant response.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const applyEvent = (event: {
          event: string;
          data: Record<string, unknown>;
        }) => {
          if (event.event === "delta") {
            const chunk = String(event.data.content ?? "");
            pendingAssistantContentRef.current += chunk;
            scheduleAssistantFlush(assistantPlaceholder.id);
          }

          if (event.event === "compaction") {
            const phase = String(event.data.phase ?? "start");
            setStatus(`Compaction ${phase}`);
          }

          if (event.event === "error") {
            throw new Error(
              String(event.data.message ?? "Unable to process the response."),
            );
          }

          if (event.event === "done") {
            const final = String(event.data.content ?? "");
            finishAssistantFlush(assistantPlaceholder.id, final);
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          let sawDelta = false;

          for (const part of parts) {
            const event = parseEventStreamBlock(part);
            if (event) {
              if (event.event === "delta") {
                sawDelta = true;
              }
              applyEvent(event);
            }
          }

          if (sawDelta) {
            await waitForNextFrame();
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
          const event = parseEventStreamBlock(buffer);
          if (event) {
            applyEvent(event);
          }
        }

        setStatus(null);
        setStreamingMessageId(null);
        await fetchThread();
        await refreshBootstrap();
      } catch (error) {
        finishAssistantFlush(
          assistantPlaceholder.id,
          pendingAssistantContentRef.current,
        );
        setStreamingMessageId(null);
        const message =
          error instanceof Error ? error.message : "Unable to send the prompt.";
        setStatus(message);
      } finally {
        setIsSending(false);
      }
    },
    [
      dictionary.sending,
      fetchThread,
      finishAssistantFlush,
      isSending,
      refreshBootstrap,
      scrollToBottom,
      scheduleAssistantFlush,
      activeModelId,
      threadId,
    ],
  );

  useEffect(() => {
    const pendingPrompt = searchParams.get("prompt");

    if (
      !thread ||
      !pendingPrompt ||
      autoPromptRef.current === pendingPrompt ||
      missingThread
    ) {
      return;
    }

    autoPromptRef.current = pendingPrompt;
    void sendPrompt(pendingPrompt).then(() => {
      router.replace(`/chat/${threadId}`);
    });
  }, [missingThread, router, searchParams, sendPrompt, thread, threadId]);

  const header = useMemo(
    () => thread?.title ?? dictionary.loading,
    [dictionary.loading, thread?.title],
  );

  const statusLabel = status ?? `${dictionary.model}: ${activeModelName}`;

  if (missingThread) {
    return (
      <section className="home-empty">
        <h1 className="home-empty__title">{dictionary.chatNotFound}</h1>
        <button
          className="pill-button is-accent"
          onClick={() => router.push("/")}
        >
          {dictionary.backHome}
        </button>
      </section>
    );
  }

  return (
    <section className="chat-thread">
      <div
        className="surface-card"
        style={{ margin: "1rem 1rem 0", padding: "1rem 1.15rem" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "1.1rem" }}>{header}</h1>
            <div className="inline-note">{statusLabel}</div>
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
          >
            {dictionary.deleteChat}
          </button>
        </div>
      </div>

      <div
        className="chat-thread__messages"
        ref={scrollerRef}
        onScroll={() => {
          shouldStickToBottomRef.current = isNearBottom();
        }}
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={`message-card ${message.role === "user" ? "is-user" : "is-assistant"}`}
          >
            <div className="message-card__role">
              {message.role === "user" ? dictionary.you : dictionary.assistant}
            </div>
            <div className="message-card__content">
              {message.role === "assistant" ? (
                message.id === streamingMessageId ? (
                  <div className="message-streaming">
                    {message.content || (isSending ? dictionary.thinking : "")}
                  </div>
                ) : (
                  <AssistantMarkdown content={message.content} />
                )
              ) : (
                message.content
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="chat-thread__composer">
        <ChatComposer
          value={input}
          disabled={isSending}
          fullWidth
          placeholder={dictionary.askAnything}
          onChange={setInput}
          onSubmit={() => void sendPrompt(input)}
        />
      </div>

      {showDeleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="surface-card"
            style={{
              maxWidth: 380,
              width: "90%",
              padding: "1.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
              {dictionary.deleteChatConfirmTitle}
            </h2>
            <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.8 }}>
              {dictionary.deleteChatConfirmBody}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
                marginTop: "0.25rem",
              }}
            >
              <button
                className="ghost-button"
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
              >
                {dictionary.deleteChatCancel}
              </button>
              <button
                className="ghost-button"
                type="button"
                style={{ color: "var(--color-danger, #e74c3c)" }}
                onClick={async () => {
                  setShowDeleteConfirm(false);
                  await fetch(`/api/threads/${threadId}`, { method: "DELETE" });
                  await refreshBootstrap();
                  router.push("/");
                }}
              >
                {dictionary.deleteChatConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
