import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  type MessageCreateOptions
} from "discord.js";
import { config } from "./config.js";
import type { RequestRecord } from "./db.js";

interface DiscordGuildMember {
  roles?: string[];
}

export class DiscordService {
  private client: Client | null = null;

  async start(): Promise<void> {
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });

    try {
      await this.client.login(config.discord.botToken);
      console.log(`Discord bot logged in as ${this.client.user?.tag ?? "unknown"}.`);
    } catch (error) {
      console.warn("Discord bot login failed. Requests will still be created in Plane.", error);
    }
  }

  async stop(): Promise<void> {
    await this.client?.destroy();
  }

  async fetchMemberRoles(discordUserId: string): Promise<string[]> {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${config.discord.guildId}/members/${discordUserId}`,
      {
        headers: {
          Authorization: `Bot ${config.discord.botToken}`,
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      return [];
    }

    const member = (await response.json()) as DiscordGuildMember;
    return Array.isArray(member.roles) ? member.roles : [];
  }

  isAdmin(roles: string[]): boolean {
    return config.discord.adminRoleIds.some((roleId) => roles.includes(roleId));
  }

  async notifyRequestCreated(request: RequestRecord): Promise<{ sent: boolean; reason?: string }> {
    if (!this.client?.isReady()) {
      return { sent: false, reason: "bot_not_ready" };
    }

    const channel = await this.client.channels.fetch(config.discord.requestChannelId);

    if (!channel?.isTextBased()) {
      return { sent: false, reason: "channel_not_text_based" };
    }

    const embed = new EmbedBuilder()
      .setColor(0x2f80ed)
      .setTitle(request.title)
      .setDescription(request.details.slice(0, 900))
      .addFields(
        { name: "Type", value: request.type, inline: true },
        { name: "Priority", value: request.priority, inline: true },
        { name: "Submitted by", value: request.discordUsername, inline: true }
      )
      .setTimestamp(new Date(request.createdAt))
      .setFooter({ text: `Project Desk ${request.planeIdentifier ?? request.id}` });

    const components = request.planeUrl
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setURL(request.planeUrl)
              .setLabel("Open in Plane")
          )
        ]
      : [];

    if (!("send" in channel)) {
      return { sent: false, reason: "channel_not_sendable" };
    }

    const message: MessageCreateOptions = { embeds: [embed], components };
    await (channel as { send(options: MessageCreateOptions): Promise<unknown> }).send(message);
    return { sent: true };
  }
}
