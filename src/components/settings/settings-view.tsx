"use client";

import { useEffect, useState } from "react";

import {
  formatMultiplier,
  formatTimestamp,
  languageOptions,
  useAppContext,
} from "@/components/app/app-provider";
import type { AppSettings } from "@/lib/types";

interface ConnectionState {
  ok: boolean;
  mode: "stored-token" | "cli-login";
  error: string | null;
  authenticated: boolean | null;
}

export function SettingsView() {
  const {
    dictionary,
    language,
    models,
    credentialStatus,
    settings,
    loadingModels,
    refreshModels,
    storeToken,
    clearToken,
    updateSettings,
  } = useAppContext();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const payload = (await response.json()) as {
        connection: ConnectionState;
      };
      setConnection(payload.connection);
    })();
  }, []);

  return (
    <section className="settings-grid">
      <div className="settings-grid__item">
        <h2>{dictionary.language}</h2>
        <div className="stack">
          <label className="field-label">{dictionary.language}</label>
          <label className="select-shell">
            <select
              value={draft.languagePreference}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  languagePreference: event.target
                    .value as AppSettings["languagePreference"],
                }))
              }
            >
              {languageOptions(dictionary).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="settings-grid__item">
        <h2>{dictionary.defaultModel}</h2>
        <div className="stack">
          <label className="field-label">{dictionary.model}</label>
          <label className="select-shell">
            <select
              value={draft.defaultModelId ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  defaultModelId: event.target.value || null,
                }))
              }
            >
              <option value="">
                {loadingModels ? dictionary.loading : dictionary.defaultModel}
              </option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {`${model.name} · ${formatMultiplier(model.multiplier)}`}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button
              className="pill-button is-accent"
              type="button"
              onClick={async () => {
                await updateSettings(draft);
                setMessage(dictionary.saveSettings);
              }}
            >
              {dictionary.saveSettings}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-grid__item is-full">
        <h2>{dictionary.credentials}</h2>
        <div className="stack">
          <div className="status-row">
            <strong>{dictionary.storedToken}:</strong>{" "}
            <span
              className={`inline-badge ${credentialStatus?.hasStoredToken ? "is-ok" : ""}`}
            >
              {credentialStatus?.hasStoredToken
                ? dictionary.connected
                : dictionary.unavailable}
            </span>
          </div>
          <div className="status-row">
            <strong>{dictionary.encryption}:</strong>{" "}
            <span
              className={`inline-badge ${credentialStatus?.encryptionConfigured ? "is-ok" : "is-error"}`}
            >
              {credentialStatus?.encryptionConfigured
                ? dictionary.encryptionReady
                : dictionary.encryptionMissing}
            </span>
          </div>
          <div className="status-row">
            <strong>{dictionary.updatedAt}:</strong>{" "}
            {formatTimestamp(credentialStatus?.updatedAt ?? null, language)}
          </div>
          <label className="field-label">{dictionary.githubToken}</label>
          <label className="input-shell">
            <input
              type="password"
              value={token}
              placeholder={dictionary.tokenPlaceholder}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              className="pill-button is-accent"
              type="button"
              onClick={async () => {
                const error = await storeToken(token);
                setMessage(error ?? dictionary.saveSettings);
                if (!error) {
                  setToken("");
                  await refreshModels();
                }
              }}
            >
              {dictionary.saveToken}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={async () => {
                await clearToken();
                setMessage(dictionary.clearToken);
              }}
            >
              {dictionary.clearToken}
            </button>
          </div>
          {message ? <div className="inline-note">{message}</div> : null}
        </div>
      </div>

      <div className="settings-grid__item is-full">
        <h2>{dictionary.connection}</h2>
        <div className="stack">
          <div className="status-row">
            <strong>{dictionary.runtimeMode}:</strong>{" "}
            {connection?.mode === "stored-token"
              ? dictionary.useStoredToken
              : dictionary.useCliLogin}
          </div>
          <div className="status-row">
            <strong>{dictionary.connection}:</strong>{" "}
            <span
              className={`inline-badge ${connection?.ok ? "is-ok" : "is-error"}`}
            >
              {connection?.ok ? dictionary.connected : dictionary.unavailable}
            </span>
          </div>
          {connection?.error ? (
            <div className="inline-note">{connection.error}</div>
          ) : null}
          <div className="inline-note">{dictionary.diagnostics}</div>
        </div>
      </div>

      <div className="settings-grid__item is-full">
        <h2>{dictionary.availableModels}</h2>
        {models.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>{dictionary.model}</th>
                <th>{dictionary.multiplier}</th>
                <th>{dictionary.capabilities}</th>
                <th>{dictionary.contextWindow}</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.id}>
                  <td>{model.name}</td>
                  <td>{formatMultiplier(model.multiplier)}</td>
                  <td>
                    {[
                      model.reasoningEffort ? "reasoning" : null,
                      model.vision ? "vision" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "-"}
                  </td>
                  <td>
                    {model.contextWindow?.toLocaleString(language) ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state-note">{dictionary.noModels}</div>
        )}
      </div>
    </section>
  );
}
