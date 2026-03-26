"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAppContext } from "@/components/app/app-provider";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatModelPicker } from "@/components/chat/chat-model-picker";

export function HomeView() {
  const router = useRouter();
  const { dictionary, settings, refreshBootstrap } = useAppContext();
  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    settings.defaultModelId,
  );

  useEffect(() => {
    setSelectedModelId(settings.defaultModelId);
  }, [settings.defaultModelId]);

  const submit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isCreating) {
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modelId: selectedModelId ?? settings.defaultModelId,
        }),
      });

      const payload = (await response.json()) as {
        thread?: { id: string };
      };

      if (!response.ok || !payload.thread) {
        throw new Error("Unable to create a conversation.");
      }

      await refreshBootstrap();
      router.push(
        `/chat/${payload.thread.id}?prompt=${encodeURIComponent(trimmed)}`,
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="home-empty">
      <div>
        <h1 className="home-empty__title">{dictionary.homeTitle}</h1>
      </div>
      <ChatComposer
        value={prompt}
        disabled={isCreating}
        placeholder={dictionary.askAnything}
        onChange={setPrompt}
        onSubmit={submit}
      />
      <ChatModelPicker
        value={selectedModelId}
        disabled={isCreating}
        className="model-picker--home"
        onChange={setSelectedModelId}
      />
    </section>
  );
}
