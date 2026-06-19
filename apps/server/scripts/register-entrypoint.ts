import { config } from "../src/config.js";

const discordApiBaseUrl = "https://discord.com/api/v10";
const primaryEntryPointType = 4;
const appHandler = 1;

interface DiscordCommand {
  id: string;
  application_id: string;
  name: string;
  type: number;
  handler?: number;
}

async function discordRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${discordApiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${config.discord.botToken}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Discord API ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

const commands = (await discordRequest(
  `/applications/${encodeURIComponent(config.discord.clientId)}/commands`
)) as DiscordCommand[];
const existing = commands.find((command) => command.type === primaryEntryPointType);
const payload = {
  name: existing?.name ?? "launch",
  description: "Open Project Desk",
  type: primaryEntryPointType,
  handler: appHandler
};

if (existing) {
  const updated = (await discordRequest(
    `/applications/${encodeURIComponent(config.discord.clientId)}/commands/${encodeURIComponent(existing.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  )) as DiscordCommand;

  console.log(`Updated Entry Point command "${updated.name}" (${updated.id}) to APP_HANDLER.`);
} else {
  const created = (await discordRequest(`/applications/${encodeURIComponent(config.discord.clientId)}/commands`, {
    method: "POST",
    body: JSON.stringify(payload)
  })) as DiscordCommand;

  console.log(`Created Entry Point command "${created.name}" (${created.id}) with APP_HANDLER.`);
}
