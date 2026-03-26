import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
} from "@/lib/server/encryption";
import { DEFAULT_MODEL_ID } from "@/lib/defaults";
import type {
  AppSettings,
  CredentialStatus,
  DiagnosticEventRecord,
  MessageRecord,
  MessageRole,
  StoreSchema,
  ThreadRecord,
} from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const MAX_DIAGNOSTIC_EVENTS = 250;

const DEFAULT_STORE: StoreSchema = {
  version: 1,
  settings: {
    languagePreference: "system",
    defaultModelId: DEFAULT_MODEL_ID,
  },
  secrets: {
    githubToken: null,
  },
  threads: [],
  messages: [],
  diagnostics: [],
};

let writeChain = Promise.resolve();

function normalizeSettings(settings: Partial<AppSettings> | undefined): AppSettings {
  return {
    languagePreference: settings?.languagePreference ?? DEFAULT_STORE.settings.languagePreference,
    defaultModelId: settings?.defaultModelId ?? DEFAULT_MODEL_ID,
  };
}

function cloneDefaultStore(): StoreSchema {
  return JSON.parse(JSON.stringify(DEFAULT_STORE)) as StoreSchema;
}

async function ensureStore(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(STORE_PATH, "utf8");
  } catch {
    await writeFile(STORE_PATH, JSON.stringify(cloneDefaultStore(), null, 2), "utf8");
  }
}

async function readStore(): Promise<StoreSchema> {
  await ensureStore();
  const raw = await readFile(STORE_PATH, "utf8");
  const parsed = JSON.parse(raw) as Partial<StoreSchema>;

  return {
    ...cloneDefaultStore(),
    ...parsed,
    settings: normalizeSettings(parsed.settings),
    secrets: {
      ...DEFAULT_STORE.secrets,
      ...parsed.secrets,
    },
    threads: parsed.threads ?? [],
    messages: parsed.messages ?? [],
    diagnostics: parsed.diagnostics ?? [],
  };
}

async function updateStore<T>(mutate: (store: StoreSchema) => T | Promise<T>): Promise<T> {
  let result!: T;

  writeChain = writeChain.then(async () => {
    const store = await readStore();
    result = await mutate(store);
    await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  });

  await writeChain;
  return result;
}

function sortThreads(threads: ThreadRecord[]): ThreadRecord[] {
  return [...threads].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

export function createId(): string {
  return crypto.randomUUID();
}

export function deriveThreadTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New chat";
  }

  return normalized.length > 48 ? `${normalized.slice(0, 45)}...` : normalized;
}

export async function getBootstrapData(): Promise<{
  threads: ThreadRecord[];
  settings: AppSettings;
  credentialStatus: CredentialStatus;
}> {
  const store = await readStore();

  return {
    threads: sortThreads(store.threads),
    settings: store.settings,
    credentialStatus: getCredentialStatusFromStore(store),
  };
}

export async function listThreads(): Promise<ThreadRecord[]> {
  const store = await readStore();
  return sortThreads(store.threads);
}

export async function getThread(threadId: string): Promise<ThreadRecord | null> {
  const store = await readStore();
  return store.threads.find((thread) => thread.id === threadId) ?? null;
}

export async function getThreadWithMessages(threadId: string): Promise<{
  thread: ThreadRecord | null;
  messages: MessageRecord[];
}> {
  const store = await readStore();
  const thread = store.threads.find((entry) => entry.id === threadId) ?? null;
  const messages = store.messages
    .filter((entry) => entry.threadId === threadId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return { thread, messages };
}

export async function createThread(modelId: string | null): Promise<ThreadRecord> {
  return updateStore((store) => {
    const now = new Date().toISOString();
    const thread: ThreadRecord = {
      id: createId(),
      title: "New chat",
      modelId,
      copilotSessionId: null,
      createdAt: now,
      updatedAt: now,
    };

    store.threads.unshift(thread);
    return thread;
  });
}

export async function updateThread(
  threadId: string,
  patch: Partial<Omit<ThreadRecord, "id" | "createdAt">>
): Promise<ThreadRecord | null> {
  return updateStore((store) => {
    const thread = store.threads.find((entry) => entry.id === threadId);
    if (!thread) {
      return null;
    }

    Object.assign(thread, patch, {
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    });

    return thread;
  });
}

export async function deleteThread(threadId: string): Promise<boolean> {
  return updateStore((store) => {
    const before = store.threads.length;
    store.threads = store.threads.filter((thread) => thread.id !== threadId);
    store.messages = store.messages.filter((message) => message.threadId !== threadId);
    store.diagnostics = store.diagnostics.filter((event) => event.threadId !== threadId);
    return store.threads.length !== before;
  });
}

export async function appendMessage(
  threadId: string,
  role: MessageRole,
  content: string
): Promise<MessageRecord> {
  return updateStore((store) => {
    const thread = store.threads.find((entry) => entry.id === threadId);
    if (!thread) {
      throw new Error("Thread not found.");
    }

    const now = new Date().toISOString();
    const message: MessageRecord = {
      id: createId(),
      threadId,
      role,
      content,
      createdAt: now,
    };

    store.messages.push(message);
    thread.updatedAt = now;

    if (role === "user" && thread.title === "New chat") {
      thread.title = deriveThreadTitle(content);
    }

    return message;
  });
}

export async function getSettings(): Promise<AppSettings> {
  const store = await readStore();
  return store.settings;
}

export async function updateSettings(
  patch: Partial<AppSettings>
): Promise<AppSettings> {
  return updateStore((store) => {
    store.settings = normalizeSettings({
      ...store.settings,
      ...patch,
    });
    return store.settings;
  });
}

function getCredentialStatusFromStore(store: StoreSchema): CredentialStatus {
  return {
    hasStoredToken: Boolean(store.secrets.githubToken),
    updatedAt: store.secrets.githubToken?.updatedAt ?? null,
    encryptionConfigured: isEncryptionConfigured(),
  };
}

export async function getCredentialStatus(): Promise<CredentialStatus> {
  const store = await readStore();
  return getCredentialStatusFromStore(store);
}

export async function setGithubToken(token: string): Promise<CredentialStatus> {
  const trimmed = token.trim();

  if (!trimmed) {
    throw new Error("A GitHub token is required.");
  }

  return updateStore((store) => {
    store.secrets.githubToken = encryptSecret(trimmed);
    return getCredentialStatusFromStore(store);
  });
}

export async function clearGithubToken(): Promise<CredentialStatus> {
  return updateStore((store) => {
    store.secrets.githubToken = null;
    return getCredentialStatusFromStore(store);
  });
}

export async function getStoredGithubToken(): Promise<string | null> {
  const store = await readStore();

  if (!store.secrets.githubToken) {
    return null;
  }

  return decryptSecret(store.secrets.githubToken);
}

export async function recordDiagnosticEvent(
  input: Omit<DiagnosticEventRecord, "id" | "createdAt">
): Promise<void> {
  await updateStore((store) => {
    store.diagnostics.unshift({
      id: createId(),
      createdAt: new Date().toISOString(),
      ...input,
    });

    store.diagnostics = store.diagnostics.slice(0, MAX_DIAGNOSTIC_EVENTS);
  });
}
