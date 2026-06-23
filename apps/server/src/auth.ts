export const guildMembershipRequiredMessage = "You must be a member of this Discord server to use Project Desk.";

export class DiscordGuildMembershipRequiredError extends Error {
  constructor(message = guildMembershipRequiredMessage) {
    super(message);
    this.name = "DiscordGuildMembershipRequiredError";
  }
}

export class DiscordGuildMembershipLookupError extends Error {
  constructor(message = "Discord server membership could not be verified.") {
    super(message);
    this.name = "DiscordGuildMembershipLookupError";
  }
}

export function requireDiscordGuildMembership<T>(member: T | null | undefined): T {
  if (!member) {
    throw new DiscordGuildMembershipRequiredError();
  }

  return member;
}
