import type { Types } from "@discord/embedded-app-sdk";

export const discordActivityAuthScopes = ["identify", "guilds"] as const satisfies readonly Types.OAuthScopes[];
const discordActivityAccessTokenStorageKey = "project-desk.discord-activity-access-token";

interface DiscordActivitySdkLike {
  commands: {
    authorize(input: {
      client_id: string;
      response_type: "code";
      state: string;
      prompt: "none";
      scope: Types.OAuthScopes[];
    }): Promise<{ code: string }>;
    authenticate(input: { access_token: string | null }): Promise<{ access_token?: string | null }>;
  };
}

export interface DiscordActivityTokenStore {
  read(): string | null;
  write(accessToken: string): void;
  clear(): void;
}

export const browserDiscordActivityTokenStore: DiscordActivityTokenStore = {
  read() {
    return getBrowserLocalStorage()?.getItem(discordActivityAccessTokenStorageKey) ?? null;
  },
  write(accessToken: string) {
    getBrowserLocalStorage()?.setItem(discordActivityAccessTokenStorageKey, accessToken);
  },
  clear() {
    getBrowserLocalStorage()?.removeItem(discordActivityAccessTokenStorageKey);
  }
};

export async function completeDiscordActivityLogin(input: {
  clientId: string;
  sdk: DiscordActivitySdkLike;
  exchangeCode: (code: string) => Promise<{ accessToken: string }>;
  establishSession: (accessToken: string) => Promise<void>;
  tokenStore?: DiscordActivityTokenStore;
  fallbackLogin?: () => void;
}): Promise<void> {
  let code: string;

  try {
    ({ code } = await input.sdk.commands.authorize({
      client_id: input.clientId,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: [...discordActivityAuthScopes]
    }));
  } catch (error) {
    if (!isAlreadyAuthenticatedError(error)) {
      throw describeDiscordActivityLoginError("Discord Activity authorization", error);
    }

    await restoreDiscordActivitySession(input);
    return;
  }

  let accessToken: string;

  try {
    ({ accessToken } = await input.exchangeCode(code));
  } catch (error) {
    throw describeDiscordActivityLoginError("Project Desk Activity token exchange", error);
  }

  input.tokenStore?.write(accessToken);

  try {
    await input.sdk.commands.authenticate({ access_token: accessToken });
  } catch (error) {
    throw describeDiscordActivityLoginError("Discord Activity authentication", error);
  }
}

async function restoreDiscordActivitySession(input: {
  sdk: DiscordActivitySdkLike;
  establishSession: (accessToken: string) => Promise<void>;
  tokenStore?: DiscordActivityTokenStore;
  fallbackLogin?: () => void;
}): Promise<void> {
  const accessToken = input.tokenStore?.read() ?? null;

  if (!accessToken) {
    input.fallbackLogin?.();
    return;
  }

  try {
    await input.sdk.commands.authenticate({ access_token: accessToken });
  } catch (error) {
    input.tokenStore?.clear();
    throw describeDiscordActivityLoginError("Discord Activity session restore", error);
  }

  try {
    await input.establishSession(accessToken);
  } catch (error) {
    throw describeDiscordActivityLoginError("Project Desk Activity session restore", error);
  }
}

export function describeDiscordActivityLoginError(step: string, error: unknown): Error {
  const details = formatDiscordActivityError(error);
  return new Error(`${step} failed${details ? `: ${details}` : "."}`);
}

function isAlreadyAuthenticatedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: unknown; message?: unknown };
  return (
    maybeError.code === 4002 ||
    (typeof maybeError.message === "string" && maybeError.message.toLowerCase().includes("already authenticated"))
  );
}

function getBrowserLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function formatDiscordActivityError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }

  return String(error);
}
