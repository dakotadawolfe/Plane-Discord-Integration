export const discordActivityAuthScopes = ["identify", "guilds", "applications.commands"] as const;

export function describeDiscordActivityLoginError(step: string, error: unknown): Error {
  const details = error instanceof Error ? error.message : String(error);
  return new Error(`${step} failed${details ? `: ${details}` : "."}`);
}
