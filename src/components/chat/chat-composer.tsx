"use client";

import { useEffect, useRef } from "react";

interface ChatComposerProps {
  value: string;
  placeholder: string;
  disabled?: boolean;
  fullWidth?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function ChatComposer({
  value,
  placeholder,
  disabled,
  fullWidth = false,
  onChange,
  onSubmit,
}: ChatComposerProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <div className={`composer-wrap ${fullWidth ? "is-full-width" : ""}`}>
      <div className="composer">
        <textarea
          ref={ref}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="composer__actions">
          <button
            className="icon-button"
            type="button"
            onClick={onSubmit}
            disabled={disabled}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
