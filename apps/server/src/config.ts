import dotenv from "dotenv";
import { existsSync } from "node:fs";
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

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional()
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

const isProduction = env.NODE_ENV === "production";
const demoMode = env.DEMO_MODE === "true";

export const config = {
  nodeEnv: env.NODE_ENV,
  demoMode,
  isProduction,
  port: env.PORT,
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
    hermesModel: env.HERMES_MODEL ?? "hermes-agent"
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
