import {
  CopilotClient,
  type GetAuthStatusResponse,
  type ModelInfo,
  type PermissionRequestResult,
  type ResumeSessionConfig,
  type SessionConfig,
} from "@github/copilot-sdk";

import { getStoredGithubToken } from "@/lib/server/store";
import type {
  ModelOption,
  RuntimeConnectionStatus,
  ThreadRecord,
} from "@/lib/types";

const CHAT_ONLY_SYSTEM_PROMPT = `You are GPT Chat, a helpful assistant used inside a private intranet application.
Respond only with natural language text.
You do not have tools, file access, shell access, URL fetching, MCP servers, or agent capabilities.
If the user asks you to use tools or act autonomously, explain briefly that this chat is text-only.`;

const denyUnexpectedPermissions = (): PermissionRequestResult => ({
  kind: "denied-by-rules",
  rules: [],
});

async function createClient(): Promise<{
  client: CopilotClient;
  mode: RuntimeConnectionStatus["mode"];
}> {
  const token = await getStoredGithubToken();

  const client = new CopilotClient({
    ...(process.env.COPILOT_CLI_PATH ? { cliPath: process.env.COPILOT_CLI_PATH } : {}),
    ...(token
      ? {
          githubToken: token,
          useLoggedInUser: false,
        }
      : {}),
    logLevel: process.env.NODE_ENV === "development" ? "warning" : "error",
  });

  return {
    client,
    mode: token ? "stored-token" : "cli-login",
  };
}

export async function withCopilotClient<T>(
  callback: (client: CopilotClient, mode: RuntimeConnectionStatus["mode"]) => Promise<T>
): Promise<T> {
  const { client, mode } = await createClient();

  try {
    await client.start();
    return await callback(client, mode);
  } finally {
    await client.stop().catch(() => undefined);
  }
}

export function buildChatSessionConfig(modelId: string | null): SessionConfig {
  return {
    ...(modelId ? { model: modelId } : {}),
    availableTools: [],
    streaming: true,
    systemMessage: {
      mode: "replace",
      content: CHAT_ONLY_SYSTEM_PROMPT,
    },
    infiniteSessions: {
      enabled: true,
      backgroundCompactionThreshold: 0.6,
      bufferExhaustionThreshold: 0.95,
    },
    onPermissionRequest: denyUnexpectedPermissions,
  };
}

export function buildResumeSessionConfig(
  modelId: string | null
): ResumeSessionConfig {
  return buildChatSessionConfig(modelId);
}

function mapModel(model: ModelInfo): ModelOption {
  return {
    id: model.id,
    name: model.name,
    multiplier: model.billing?.multiplier ?? null,
    reasoningEffort: model.capabilities.supports.reasoningEffort,
    vision: model.capabilities.supports.vision,
    contextWindow: model.capabilities.limits.max_context_window_tokens ?? null,
    policyState: model.policy?.state ?? null,
  };
}

export async function listAvailableModels(): Promise<{
  models: ModelOption[];
  connection: RuntimeConnectionStatus;
}> {
  return withCopilotClient(async (client, mode) => {
    try {
      const models = await client.listModels();
      return {
        models: models.map(mapModel),
        connection: {
          ok: true,
          mode,
          error: null,
        },
      };
    } catch (error) {
      return {
        models: [],
        connection: {
          ok: false,
          mode,
          error: error instanceof Error ? error.message : "Unable to list models.",
        },
      };
    }
  });
}

export async function getRuntimeConnectionStatus(): Promise<RuntimeConnectionStatus & {
  authenticated: boolean | null;
}> {
  return withCopilotClient(async (client, mode) => {
    try {
      const auth = (await client.getAuthStatus()) as GetAuthStatusResponse & {
        isAuthenticated?: boolean;
      };

      return {
        ok: true,
        mode,
        error: null,
        authenticated: auth.isAuthenticated ?? true,
      };
    } catch (error) {
      return {
        ok: false,
        mode,
        error: error instanceof Error ? error.message : "Unable to validate connection.",
        authenticated: null,
      };
    }
  });
}

export async function getOrCreateChatSession(
  client: CopilotClient,
  thread: ThreadRecord,
  modelId: string | null
) {
  if (thread.copilotSessionId) {
    try {
      return await client.resumeSession(
        thread.copilotSessionId,
        buildResumeSessionConfig(modelId)
      );
    } catch {
      return client.createSession(buildChatSessionConfig(modelId));
    }
  }

  return client.createSession(buildChatSessionConfig(modelId));
}
