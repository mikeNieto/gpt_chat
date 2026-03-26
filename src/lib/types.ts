export type LanguagePreference = "system" | "en" | "es";

export type ResolvedLanguage = "en" | "es";

export type MessageRole = "user" | "assistant";

export interface ThreadRecord {
  id: string;
  title: string;
  modelId: string | null;
  copilotSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface AppSettings {
  languagePreference: LanguagePreference;
  defaultModelId: string | null;
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
  updatedAt: string;
}

export interface CredentialStatus {
  hasStoredToken: boolean;
  updatedAt: string | null;
  encryptionConfigured: boolean;
}

export interface DiagnosticEventRecord {
  id: string;
  threadId: string;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface StoreSchema {
  version: 1;
  settings: AppSettings;
  secrets: {
    githubToken: EncryptedSecret | null;
  };
  threads: ThreadRecord[];
  messages: MessageRecord[];
  diagnostics: DiagnosticEventRecord[];
}

export interface ModelOption {
  id: string;
  name: string;
  multiplier: number | null;
  reasoningEffort: boolean;
  vision: boolean;
  contextWindow: number | null;
  policyState: string | null;
}

export interface RuntimeConnectionStatus {
  ok: boolean;
  mode: "stored-token" | "cli-login";
  error: string | null;
}
