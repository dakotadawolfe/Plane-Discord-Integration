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
  nick?: string | null;
  user?: DiscordApiUser & { bot?: boolean };
}

interface DiscordApiUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

export interface DiscordUserProfile {
  discordUserId?: string;
  discordUsername?: string | null;
  displayName: string;
  avatarUrl: string | null;
  isAdmin?: boolean;
}

export interface DiscordGuildPerson {
  discordUserId: string;
  discordUsername: string | null;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export interface DiscordGuildMemberProfile extends DiscordGuildPerson {
  roles: string[];
}

function discordAvatarUrl(discordUserId: string, avatarHash?: string | null): string | null {
  if (!avatarHash) {
    return null;
  }

  const extension = avatarHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.${extension}?size=128`;
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
    const member = await this.fetchGuildMemberProfile(discordUserId).catch(() => null);
    return member?.roles ?? [];
  }

  async fetchGuildMemberProfile(discordUserId: string): Promise<DiscordGuildMemberProfile | null> {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${config.discord.guildId}/members/${discordUserId}`,
      {
        headers: {
          Authorization: `Bot ${config.discord.botToken}`,
          Accept: "application/json"
        }
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Discord guild member lookup failed with ${response.status}.`);
    }

    const member = (await response.json()) as DiscordGuildMember;

    if (!member.user) {
      return null;
    }

    const roles = Array.isArray(member.roles) ? member.roles : [];

    return {
      discordUserId: member.user.id,
      discordUsername: member.user.username,
      displayName: member.nick ?? member.user.global_name ?? member.user.username,
      avatarUrl: discordAvatarUrl(member.user.id, member.user.avatar),
      roles,
      isAdmin: this.isAdmin(roles)
    };
  }

  async listGuildMembers(): Promise<DiscordGuildPerson[]> {
    const members: DiscordGuildPerson[] = [];
    let after = "0";

    for (let page = 0; page < 5; page += 1) {
      const url = new URL(`https://discord.com/api/v10/guilds/${config.discord.guildId}/members`);
      url.searchParams.set("limit", "1000");
      url.searchParams.set("after", after);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bot ${config.discord.botToken}`,
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        return members;
      }

      const pageMembers = (await response.json()) as DiscordGuildMember[];

      if (pageMembers.length === 0) {
        return members;
      }

      for (const member of pageMembers) {
        if (!member.user || member.user.bot) {
          continue;
        }

        members.push({
          discordUserId: member.user.id,
          discordUsername: member.user.username,
          displayName: member.nick ?? member.user.global_name ?? member.user.username,
          avatarUrl: discordAvatarUrl(member.user.id, member.user.avatar),
          isAdmin: this.isAdmin(member.roles ?? [])
        });
      }

      after = pageMembers[pageMembers.length - 1]?.user?.id ?? after;

      if (pageMembers.length < 1000) {
        return members;
      }
    }

    return members;
  }

  isAdmin(roles: string[]): boolean {
    return config.discord.adminRoleIds.some((roleId) => roles.includes(roleId));
  }

  async fetchUserProfile(discordUserId: string): Promise<DiscordUserProfile | null> {
    if (this.client?.isReady()) {
      try {
        const user = await this.client.users.fetch(discordUserId);

        return {
          discordUserId,
          discordUsername: user.username,
          displayName: user.globalName ?? user.username,
          avatarUrl: user.displayAvatarURL({ size: 128 })
        };
      } catch {
        // Fall through to the REST path below.
      }
    }

    const response = await fetch(`https://discord.com/api/v10/users/${discordUserId}`, {
      headers: {
        Authorization: `Bot ${config.discord.botToken}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return null;
    }

    const user = (await response.json()) as DiscordApiUser;

    return {
      discordUserId: user.id,
      discordUsername: user.username,
      displayName: user.global_name ?? user.username,
      avatarUrl: discordAvatarUrl(user.id, user.avatar)
    };
  }

  async sendDm(discordUserId: string, body: string): Promise<{ sent: boolean; reason?: string }> {
    if (!this.client?.isReady()) {
      return { sent: false, reason: "bot_not_ready" };
    }

    try {
      const user = await this.client.users.fetch(discordUserId);
      await user.send(body.slice(0, 1900));
      return { sent: true };
    } catch (error) {
      return {
        sent: false,
        reason: error instanceof Error ? error.message.slice(0, 300) : "dm_failed"
      };
    }
  }

  async notifyRequestCreated(request: RequestRecord): Promise<{ sent: boolean; reason?: string }> {
    if (!config.discord.publicChannelPosting) {
      return { sent: false, reason: "public_channel_posting_disabled" };
    }

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
