"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";

import { dictionaries, resolveLanguage, type Dictionary } from "@/lib/i18n";
import { DEFAULT_MODEL_ID } from "@/lib/defaults";
import type {
  AppSettings,
  CredentialStatus,
  LanguagePreference,
  ModelOption,
  RuntimeConnectionStatus,
  ThemePreference,
  ThreadRecord,
} from "@/lib/types";

interface AppContextValue {
  threads: ThreadRecord[];
  settings: AppSettings;
  dictionary: Dictionary;
  language: "en" | "es";
  theme: ThemePreference;
  models: ModelOption[];
  modelsConnection: RuntimeConnectionStatus | null;
  credentialStatus: CredentialStatus | null;
  loadingBootstrap: boolean;
  loadingModels: boolean;
  refreshBootstrap: () => Promise<void>;
  refreshModels: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  toggleTheme: () => Promise<void>;
  storeToken: (token: string) => Promise<string | null>;
  clearToken: () => Promise<void>;
}

const defaultSettings: AppSettings = {
  languagePreference: "system",
  defaultModelId: DEFAULT_MODEL_ID,
  themePreference: "dark",
};

const AppContext = createContext<AppContextValue | null>(null);

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [credentialStatus, setCredentialStatus] =
    useState<CredentialStatus | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsConnection, setModelsConnection] =
    useState<RuntimeConnectionStatus | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingModels, setLoadingModels] = useState(true);
  const [browserLanguage, setBrowserLanguage] = useState<string>("en");

  useEffect(() => {
    setBrowserLanguage(window.navigator.language ?? "en");
  }, []);

  const refreshBootstrap = useCallback(async () => {
    setLoadingBootstrap(true);
    try {
      const payload = await readJson<{
        threads: ThreadRecord[];
        settings: AppSettings;
        credentialStatus: CredentialStatus;
      }>("/api/bootstrap", { cache: "no-store" });

      setThreads(payload.threads);
      setSettings(payload.settings);
      setCredentialStatus(payload.credentialStatus);
    } finally {
      setLoadingBootstrap(false);
    }
  }, []);

  const refreshModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const payload = await readJson<{
        models: ModelOption[];
        connection: RuntimeConnectionStatus;
      }>("/api/models", { cache: "no-store" });

      setModels(payload.models);
      setModelsConnection(payload.connection);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    void refreshBootstrap();
    void refreshModels();
  }, [refreshBootstrap, refreshModels]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.themePreference;
  }, [settings.themePreference]);

  const updateSettingsValue = useCallback(
    async (patch: Partial<AppSettings>) => {
      const payload = await readJson<{ settings: AppSettings }>(
        "/api/settings",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patch),
        },
      );

      setSettings(payload.settings);
    },
    [],
  );

  const storeToken = useCallback(
    async (token: string) => {
      try {
        const payload = await readJson<{ credentialStatus: CredentialStatus }>(
          "/api/settings/credentials",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ githubToken: token }),
          },
        );

        setCredentialStatus(payload.credentialStatus);
        await refreshModels();
        return null;
      } catch (error) {
        return error instanceof Error
          ? error.message
          : "Unable to store the token.";
      }
    },
    [refreshModels],
  );

  const clearTokenValue = useCallback(async () => {
    const payload = await readJson<{ credentialStatus: CredentialStatus }>(
      "/api/settings/credentials",
      {
        method: "DELETE",
      },
    );

    setCredentialStatus(payload.credentialStatus);
    await refreshModels();
  }, [refreshModels]);

  const language = resolveLanguage(
    settings.languagePreference,
    browserLanguage,
  );
  const dictionary = dictionaries[language];
  const theme = settings.themePreference;

  const toggleTheme = useCallback(async () => {
    await updateSettingsValue({
      themePreference: theme === "dark" ? "light" : "dark",
    });
  }, [theme, updateSettingsValue]);

  const value = useMemo<AppContextValue>(
    () => ({
      threads,
      settings,
      dictionary,
      language,
      theme,
      models,
      modelsConnection,
      credentialStatus,
      loadingBootstrap,
      loadingModels,
      refreshBootstrap,
      refreshModels,
      updateSettings: updateSettingsValue,
      toggleTheme,
      storeToken,
      clearToken: clearTokenValue,
    }),
    [
      threads,
      settings,
      dictionary,
      language,
      theme,
      models,
      modelsConnection,
      credentialStatus,
      loadingBootstrap,
      loadingModels,
      refreshBootstrap,
      refreshModels,
      updateSettingsValue,
      toggleTheme,
      storeToken,
      clearTokenValue,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("useAppContext must be used inside AppProvider.");
  }

  return value;
}

export function formatMultiplier(multiplier: number | null): string {
  if (multiplier === null) {
    return "-";
  }

  return `${multiplier}x`;
}

export function formatTimestamp(value: string | null, language: "en" | "es") {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function languageOptions(dictionary: Dictionary): Array<{
  value: LanguagePreference;
  label: string;
}> {
  return [
    { value: "system", label: dictionary.languageSystem },
    { value: "en", label: dictionary.languageEnglish },
    { value: "es", label: dictionary.languageSpanish },
  ];
}
