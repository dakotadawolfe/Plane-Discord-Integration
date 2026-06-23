export const discordActivityAuthScopes = ["identify", "guilds"] as const;

export function describeDiscordActivityLoginError(step: string, error: unknown): Error {
  const details = formatDiscordActivityError(error);
  return new Error(`${step} failed${details ? `: ${details}` : "."}`);
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
