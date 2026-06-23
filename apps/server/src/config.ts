import dotenv from "dotenv";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(__dirname, "..");
const repoRoot = resolve(__dirname, "../../..");
const envPaths = [
  resolve(repoRoot, ".env"),
  resolve(repoRoot, ".env.local"),
  resolve(serverDir, ".env"),
  resolve(serverDir, ".env.local"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), ".env.local")
];

for (const envPath of [...new Set(envPaths)]) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, quiet: true });
  }
}

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional()
);

const optionalCookieSameSite = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["lax", "strict", "none"]).optional()
);

const optionalBooleanString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["true", "false"]).optional()
);

const optionalAiProvider = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["hermes", "demo", "disabled"]).optional()
);

const optionalAiExecutionProvider = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["local", "hermes", "disabled"]).optional()
);

const optionalHermesTransport = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["api", "cli"]).optional()
);

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional()
);

const optionalPositiveInteger = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().positive().optional()
);

const optionalRequestBodyLimit = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d+)?\s*(?:b|kb|mb|gb)?$/i, "REQUEST_BODY_LIMIT must look like 50mb, 1024kb, or 1000000.")
    .optional()
);

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function requireWhenLive(
  ctx: z.RefinementCtx,
  value: string | undefined,
  path: string,
  message = `${path} is required unless DEMO_MODE=true.`
): void {
  if (!value) {
    ctx.addIssue({
      code: "custom",
      path: [path],
      message
    });
  }
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEMO_MODE: optionalBooleanString,
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: optionalString,
    APP_BASE_URL: optionalUrl,
    COOKIE_SECURE: optionalBooleanString,
    COOKIE_SAMESITE: optionalCookieSameSite,
    DISCORD_CLIENT_ID: z.string().min(1),
    DISCORD_CLIENT_SECRET: z.string().min(1),
    DISCORD_BOT_TOKEN: z.string().min(1),
    DISCORD_GUILD_ID: z.string().min(1),
    DISCORD_REQUEST_CHANNEL_ID: z.string().min(1),
    DISCORD_ADMIN_ROLE_IDS: z.string().default(""),
    DISCORD_PUBLIC_CHANNEL_POSTING: optionalBooleanString,
    DISCORD_PUBLIC_KEY: optionalString,
    AI_PROVIDER: optionalAiProvider,
    AI_WORKER_ENABLED: optionalBooleanString,
    HERMES_API_BASE_URL: optionalString,
    HERMES_API_KEY: optionalString,
    HERMES_MODEL: optionalString,
    HERMES_TRANSPORT: optionalHermesTransport,
    HERMES_CLI_COMMAND: optionalString,
    HERMES_CLI_PROVIDER: optionalString,
    HERMES_CLI_WORKSPACE_DIR: optionalString,
    HERMES_CLI_TIMEOUT_SECONDS: optionalPositiveInteger,
    HERMES_TASK_PROVIDER: optionalString,
    HERMES_TASK_MODEL: optionalString,
    AI_EXECUTION_PROVIDER: optionalAiExecutionProvider,
    AI_EXECUTION_COMMAND: optionalString,
    AI_EXECUTION_WORKSPACE_DIR: optionalString,
    AI_EXECUTION_RUN_DIR: optionalString,
    AI_EXECUTION_TIMEOUT_SECONDS: optionalPositiveInteger,
    AI_EXECUTION_MAX_CONCURRENCY: optionalPositiveInteger,
    AI_EXECUTION_REQUIRE_ADMIN: optionalBooleanString,
    LOCAL_CODEX_ENABLED: optionalBooleanString,
    LOCAL_CODEX_COMMAND: optionalString,
    LOCAL_CODEX_WORKSPACE_DIR: optionalString,
    LOCAL_CODEX_TIMEOUT_SECONDS: optionalPositiveInteger,
    LOCAL_CODEX_MAX_CONCURRENCY: optionalPositiveInteger,
    LOCAL_CODEX_REQUIRE_ADMIN: optionalBooleanString,
    SOURCE_SYNC_ENABLED: optionalBooleanString,
    SOURCE_SYNC_REPO_DIR: optionalString,
    SOURCE_SYNC_REMOTE: optionalString,
    SOURCE_SYNC_BRANCH: optionalString,
    UPLOADS_DIR: optionalString,
    REQUEST_BODY_LIMIT: optionalRequestBodyLimit,
    PLANE_BASE_URL: optionalString,
    PLANE_API_KEY: optionalString,
    PLANE_WORKSPACE_SLUG: optionalString,
    PLANE_PROJECT_ID: optionalString,
    PLANE_FULL_BOARD_URL: optionalString,
    DATABASE_URL: z.string().min(1).default("file:./data/project-desk.db"),
    SESSION_SECRET: z.string().min(16)
  })
  .superRefine((value, ctx) => {
    if (value.AI_PROVIDER === "hermes" && !value.HERMES_API_BASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["HERMES_API_BASE_URL"],
        message: "HERMES_API_BASE_URL is required when AI_PROVIDER=hermes."
      });
    }

    if (value.DEMO_MODE === "true") {
      return;
    }

    requireWhenLive(ctx, value.PLANE_BASE_URL, "PLANE_BASE_URL");
    requireWhenLive(ctx, value.PLANE_API_KEY, "PLANE_API_KEY");
    requireWhenLive(ctx, value.PLANE_WORKSPACE_SLUG, "PLANE_WORKSPACE_SLUG");
    requireWhenLive(ctx, value.PLANE_PROJECT_ID, "PLANE_PROJECT_ID");
    requireWhenLive(ctx, value.PLANE_FULL_BOARD_URL, "PLANE_FULL_BOARD_URL");

    if (value.PLANE_BASE_URL && !isUrl(value.PLANE_BASE_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["PLANE_BASE_URL"],
        message: "PLANE_BASE_URL must be a valid URL."
      });
    }

    if (value.PLANE_FULL_BOARD_URL && !isUrl(value.PLANE_FULL_BOARD_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["PLANE_FULL_BOARD_URL"],
        message: "PLANE_FULL_BOARD_URL must be a valid URL."
      });
    }
  });

const env = envSchema.parse(process.env);

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function newestExistingPath(paths: string[]): string | null {
  const existingPaths = paths.filter((path) => existsSync(path));

  if (existingPaths.length === 0) {
    return null;
  }

  return existingPaths.sort((left, right) => {
    try {
      return statSync(right).mtimeMs - statSync(left).mtimeMs;
    } catch {
      return 0;
    }
  })[0];
}

function safeReadDirectories(path: string) {
  if (!existsSync(path)) {
    return [];
  }

  try {
    return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return [];
  }
}

function defaultLocalCodexCommand(): string {
  const localAppData = process.env.LOCALAPPDATA;

  if (!localAppData) {
    return "codex";
  }

  const userBin = resolve(localAppData, "OpenAI", "Codex", "bin");
  const userBinCandidates = safeReadDirectories(userBin).map((entry) => resolve(userBin, entry.name, "codex.exe"));
  const packageRoot = resolve(localAppData, "Packages");
  const packageCandidates = safeReadDirectories(packageRoot)
    .filter((entry) => entry.name.startsWith("OpenAI.Codex_"))
    .map((entry) => resolve(packageRoot, entry.name, "LocalCache", "Local", "OpenAI", "Codex", "bin", "codex.exe"));

  return newestExistingPath([...userBinCandidates, ...packageCandidates]) ?? "codex";
}

const isProduction = env.NODE_ENV === "production";
const demoMode = env.DEMO_MODE === "true";
const localCodexCommand = env.LOCAL_CODEX_COMMAND ?? defaultLocalCodexCommand();
const aiExecutionProvider =
  env.AI_EXECUTION_PROVIDER ??
  (env.LOCAL_CODEX_ENABLED === "false" ? "disabled" : "local");
const aiExecutionWorkspaceDir = resolve(repoRoot, env.AI_EXECUTION_WORKSPACE_DIR ?? env.LOCAL_CODEX_WORKSPACE_DIR ?? ".");
const aiExecutionRunDir = resolve(repoRoot, env.AI_EXECUTION_RUN_DIR ?? "data/ai-runs");
const aiExecutionCommand =
  env.AI_EXECUTION_COMMAND ?? (aiExecutionProvider === "hermes" ? "hermes" : localCodexCommand);
const aiExecutionTimeoutSeconds = env.AI_EXECUTION_TIMEOUT_SECONDS ?? env.LOCAL_CODEX_TIMEOUT_SECONDS ?? 1200;
const aiExecutionMaxConcurrency = env.AI_EXECUTION_MAX_CONCURRENCY ?? env.LOCAL_CODEX_MAX_CONCURRENCY ?? 5;
const aiExecutionRequireAdmin = env.AI_EXECUTION_REQUIRE_ADMIN
  ? env.AI_EXECUTION_REQUIRE_ADMIN === "true"
  : env.LOCAL_CODEX_REQUIRE_ADMIN
    ? env.LOCAL_CODEX_REQUIRE_ADMIN === "true"
    : true;

export const config = {
  repoRoot,
  nodeEnv: env.NODE_ENV,
  demoMode,
  isProduction,
  port: env.PORT,
  host: env.HOST,
  appBaseUrl: env.APP_BASE_URL,
  cookies: {
    secure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : isProduction,
    sameSite: env.COOKIE_SAMESITE ?? (isProduction ? "none" : "lax")
  },
  discord: {
    clientId: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
    botToken: env.DISCORD_BOT_TOKEN,
    guildId: env.DISCORD_GUILD_ID,
    requestChannelId: env.DISCORD_REQUEST_CHANNEL_ID,
    adminRoleIds: parseCsv(env.DISCORD_ADMIN_ROLE_IDS),
    publicChannelPosting: env.DISCORD_PUBLIC_CHANNEL_POSTING === "true",
    publicKey: env.DISCORD_PUBLIC_KEY
  },
  ai: {
    provider: env.AI_PROVIDER ?? (demoMode ? "demo" : "disabled"),
    workerEnabled: env.AI_WORKER_ENABLED ? env.AI_WORKER_ENABLED === "true" : true,
    hermesBaseUrl: env.HERMES_API_BASE_URL?.replace(/\/+$/, "") ?? "http://127.0.0.1:9119/v1",
    hermesApiKey: env.HERMES_API_KEY,
    hermesModel: env.HERMES_MODEL ?? "hermes-agent",
    hermesTransport: env.HERMES_TRANSPORT ?? "api",
    hermesCliCommand: env.HERMES_CLI_COMMAND ?? "hermes",
    hermesCliProvider: env.HERMES_CLI_PROVIDER ?? env.HERMES_TASK_PROVIDER,
    hermesCliWorkspaceDir: resolve(repoRoot, env.HERMES_CLI_WORKSPACE_DIR ?? env.AI_EXECUTION_WORKSPACE_DIR ?? "."),
    hermesCliTimeoutMs: (env.HERMES_CLI_TIMEOUT_SECONDS ?? 180) * 1000
  },
  aiExecution: {
    provider: aiExecutionProvider,
    command: aiExecutionCommand,
    workspaceDir: aiExecutionWorkspaceDir,
    runDir: aiExecutionRunDir,
    timeoutMs: aiExecutionTimeoutSeconds * 1000,
    maxConcurrency: Math.min(aiExecutionMaxConcurrency, 5),
    requireAdmin: aiExecutionRequireAdmin,
    hermesTaskProvider: env.HERMES_TASK_PROVIDER,
    hermesTaskModel: env.HERMES_TASK_MODEL ?? env.HERMES_MODEL
  },
  localCodex: {
    enabled: env.LOCAL_CODEX_ENABLED ? env.LOCAL_CODEX_ENABLED === "true" : true,
    command: localCodexCommand,
    workspaceDir: resolve(repoRoot, env.LOCAL_CODEX_WORKSPACE_DIR ?? "."),
    timeoutMs: (env.LOCAL_CODEX_TIMEOUT_SECONDS ?? 1200) * 1000,
    maxConcurrency: Math.min(env.LOCAL_CODEX_MAX_CONCURRENCY ?? 5, 5),
    requireAdmin: env.LOCAL_CODEX_REQUIRE_ADMIN ? env.LOCAL_CODEX_REQUIRE_ADMIN === "true" : true
  },
  sourceSync: {
    enabled: env.SOURCE_SYNC_ENABLED ? env.SOURCE_SYNC_ENABLED === "true" : true,
    repoDir: resolve(repoRoot, env.SOURCE_SYNC_REPO_DIR ?? "."),
    remote: env.SOURCE_SYNC_REMOTE ?? "origin",
    branch: env.SOURCE_SYNC_BRANCH ?? "main"
  },
  uploads: {
    dir: resolve(repoRoot, env.UPLOADS_DIR ?? "data/uploads")
  },
  http: {
    requestBodyLimit: env.REQUEST_BODY_LIMIT ?? "50mb"
  },
  plane: {
    baseUrl: (env.PLANE_BASE_URL ?? "https://project-desk-demo.local").replace(/\/+$/, ""),
    apiKey: env.PLANE_API_KEY ?? "demo-plane-api-key",
    workspaceSlug: env.PLANE_WORKSPACE_SLUG ?? "demo",
    projectId: env.PLANE_PROJECT_ID ?? "demo-project",
    fullBoardUrl: env.PLANE_FULL_BOARD_URL ?? "/board"
  },
  databaseUrl: env.DATABASE_URL,
  sessionSecret: env.SESSION_SECRET
} as const;

export type AppConfig = typeof config;
