import { config } from "../src/config.js";
import { launchButtonCustomId } from "../src/interactions.js";

const discordApiBaseUrl = "https://discord.com/api/v10";

interface DiscordMessage {
  id: string;
  content: string;
  author?: {
    id: string;
    bot?: boolean;
  };
  pinned?: boolean;
  components?: Array<{
    components?: Array<{
      custom_id?: string;
      label?: string;
    }>;
  }>;
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

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new Error(`Discord API ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizePinnedMessages(payload: unknown): DiscordMessage[] {
  if (Array.isArray(payload)) {
    return payload as DiscordMessage[];
  }

  if (payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown[] }).items)) {
    return (payload as { items: unknown[] }).items
      .map((item) => (item && typeof item === "object" && "message" in item ? (item as { message: unknown }).message : item))
      .filter((item): item is DiscordMessage => Boolean(item && typeof item === "object" && "id" in item));
  }

  return [];
}

function hasLaunchButton(message: DiscordMessage): boolean {
  return Boolean(
    message.components?.some((row) =>
      row.components?.some((component) => component.custom_id === launchButtonCustomId)
    )
  );
}

function launchMessagePayload() {
  return {
    content: "**Project Desk**\nOpen the request desk from this channel.",
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            label: "Play",
            custom_id: launchButtonCustomId
          }
        ]
      }
    ]
  };
}

async function updateMessage(messageId: string): Promise<DiscordMessage> {
  return (await discordRequest(
    `/channels/${encodeURIComponent(config.discord.requestChannelId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(launchMessagePayload())
    }
  )) as DiscordMessage;
}

async function createMessage(): Promise<DiscordMessage> {
  return (await discordRequest(`/channels/${encodeURIComponent(config.discord.requestChannelId)}/messages`, {
    method: "POST",
    body: JSON.stringify(launchMessagePayload())
  })) as DiscordMessage;
}

async function pinMessage(messageId: string): Promise<void> {
  await discordRequest(
    `/channels/${encodeURIComponent(config.discord.requestChannelId)}/pins/${encodeURIComponent(messageId)}`,
    {
      method: "PUT"
    }
  );
}

async function unpinMessage(messageId: string): Promise<void> {
  await discordRequest(
    `/channels/${encodeURIComponent(config.discord.requestChannelId)}/pins/${encodeURIComponent(messageId)}`,
    {
      method: "DELETE"
    }
  );
}

const pinnedPayload = await discordRequest(`/channels/${encodeURIComponent(config.discord.requestChannelId)}/pins`);
const pinnedMessages = normalizePinnedMessages(pinnedPayload);
const existingLaunchPins = pinnedMessages.filter(hasLaunchButton);
const [primaryPin, ...duplicatePins] = existingLaunchPins;

const launchMessage = primaryPin ? await updateMessage(primaryPin.id) : await createMessage();
await pinMessage(launchMessage.id);

for (const duplicate of duplicatePins) {
  await unpinMessage(duplicate.id);
}

console.log(
  primaryPin
    ? `Updated pinned Project Desk launch message ${launchMessage.id}.`
    : `Created and pinned Project Desk launch message ${launchMessage.id}.`
);

if (duplicatePins.length > 0) {
  console.log(`Unpinned ${duplicatePins.length} duplicate Project Desk launch pin(s).`);
}
