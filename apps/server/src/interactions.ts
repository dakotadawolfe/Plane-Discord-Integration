import { createPublicKey, verify } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { config } from "./config.js";

const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");

const interactionSchema = z.object({
  type: z.number(),
  data: z
    .object({
      type: z.number().optional(),
      name: z.string().optional(),
      custom_id: z.string().optional()
    })
    .passthrough()
    .optional()
});

export const launchButtonCustomId = "project-desk:launch";

const interactionType = {
  ping: 1,
  applicationCommand: 2,
  messageComponent: 3
} as const;

const commandType = {
  primaryEntryPoint: 4
} as const;

const responseType = {
  pong: 1,
  channelMessageWithSource: 4,
  launchActivity: 12
} as const;

export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

export function captureRawBody(req: Request, _res: Response, buffer: Buffer): void {
  (req as RawBodyRequest).rawBody = Buffer.from(buffer);
}

function verifyDiscordSignature(req: RawBodyRequest): boolean {
  if (!config.discord.publicKey) {
    return false;
  }

  const signature = req.get("x-signature-ed25519");
  const timestamp = req.get("x-signature-timestamp");

  if (!signature || !timestamp || !req.rawBody) {
    return false;
  }

  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([ed25519SpkiPrefix, Buffer.from(config.discord.publicKey, "hex")]),
      format: "der",
      type: "spki"
    });
    const signedPayload = Buffer.concat([Buffer.from(timestamp, "utf8"), req.rawBody]);

    return verify(null, signedPayload, publicKey, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export function handleDiscordInteraction(req: Request, res: Response): void {
  if (!config.discord.publicKey) {
    res.status(500).json({ error: "DISCORD_PUBLIC_KEY is required for interaction handling." });
    return;
  }

  if (!verifyDiscordSignature(req as RawBodyRequest)) {
    res.status(401).send("invalid request signature");
    return;
  }

  const interaction = interactionSchema.parse(req.body);

  if (interaction.type === interactionType.ping) {
    res.json({ type: responseType.pong });
    return;
  }

  if (
    interaction.type === interactionType.applicationCommand &&
    interaction.data?.type === commandType.primaryEntryPoint
  ) {
    res.json({ type: responseType.launchActivity });
    return;
  }

  if (
    interaction.type === interactionType.messageComponent &&
    interaction.data?.custom_id === launchButtonCustomId
  ) {
    res.json({ type: responseType.launchActivity });
    return;
  }

  res.json({
    type: responseType.channelMessageWithSource,
    data: {
      content: "Open Project Desk from the app launcher.",
      flags: 64
    }
  });
}
