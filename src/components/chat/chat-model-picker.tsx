"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  formatMultiplier,
  useAppContext,
} from "@/components/app/app-provider";

interface ChatModelPickerProps {
  value: string | null;
  onChange: (modelId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

export function ChatModelPicker({
  value,
  onChange,
  disabled = false,
  className,
}: ChatModelPickerProps) {
  const { dictionary, loadingModels, models, settings } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedModelId = value ?? settings.defaultModelId ?? "";
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  const rootClassName = ["model-picker", className].filter(Boolean).join(" ");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div className={rootClassName} ref={containerRef}>
      {isOpen ? (
        <div className="surface-card model-picker__panel">
          <div className="model-picker__header">
            <div className="model-picker__title">{dictionary.chatModel}</div>
            <div className="model-picker__summary">
              {selectedModel
                ? `${selectedModel.name} · ${formatMultiplier(selectedModel.multiplier)}`
                : selectedModelId || dictionary.defaultModel}
            </div>
          </div>

          {models.length ? (
            <label className="select-shell">
              <select
                value={selectedModelId}
                disabled={disabled || loadingModels}
                onChange={(event) => {
                  onChange(event.target.value || null);
                  setIsOpen(false);
                }}
              >
                {selectedModelId && !selectedModel ? (
                  <option value={selectedModelId}>{selectedModelId}</option>
                ) : null}
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {`${model.name} · ${formatMultiplier(model.multiplier)}`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="empty-state-note">
              {loadingModels ? dictionary.loading : dictionary.noModels}
            </div>
          )}

          <div className="model-picker__hint">{dictionary.chatModelHint}</div>
        </div>
      ) : null}

      <button
        className="icon-button model-picker__trigger"
        type="button"
        aria-label={dictionary.changeModel}
        title={dictionary.changeModel}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
      >
        ⚙
      </button>
    </div>
  );
}
