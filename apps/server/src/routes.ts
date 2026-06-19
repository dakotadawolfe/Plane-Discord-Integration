import cookieSession from "cookie-session";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { AiWorker } from "./ai-worker.js";
import { config } from "./config.js";
import type { CommentRecord, RequestRecord, WorkCommentRecord, WorkItemRecord } from "./db.js";
import {
  getWorkItemById,
  getWorkCommentById,
  getRequestById,
  insertActivityEvent,
  insertDecision,
  insertNotification,
  insertWorkComment,
  insertWorkItem,
  insertComment,
  insertRequest,
  listActivityEvents,
  listDecisions,
  listNotificationsForUser,
  listKnownPeople,
  listLocalComments,
  listWorkComments,
  listWorkItemsByParent,
  listWorkItemsForUser,
  listRecentRequests,
  listRequestsForUser,
  listBoardWorkItems,
  updateWorkItemStage,
  updateCommentPlaneId,
  updateNotificationStatus
} from "./db.js";
import type { SessionUser } from "./domain.js";
import {
  aiJobTypes,
  isArchivedStage,
  requestPriorities,
  requestTypes,
  stageDefinition,
  workItemKinds,
  workStages,
  workStageDefinitions,
  type WorkStage
} from "./domain.js";
import { DiscordService } from "./discord.js";
import { addEventClient, emitProjectDeskEvent } from "./events.js";
import { stripHtml } from "./html.js";
import { captureRawBody, handleDiscordInteraction } from "./interactions.js";
import { runInactiveArchiveSweep } from "./maintenance.js";
import { PlaneApiError, type PlaneComment, type PlaneLikeClient, type PlaneWorkItem } from "./plane.js";

interface AppSession {
  user?: SessionUser;
  oauthState?: string;
  oauthReturnTo?: string;
  oauthRedirectUri?: string;
}

interface CreateAppServices {
  plane: PlaneLikeClient;
  discord: DiscordService;
  aiWorker: AiWorker;
}

const createRequestSchema = z.object({
  title: z.string().trim().min(3).max(160),
  type: z.enum(requestTypes),
  priority: z.enum(requestPriorities),
  details: z.string().trim().min(10).max(5000)
});

const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(3000),
  parentCommentId: z.string().uuid().optional().nullable()
});

const activityAuthSchema = z.object({
  code: z.string().min(1)
});

const updateBoardItemStateSchema = z.object({
  stateId: z.string().trim().min(1)
});

const createWorkItemSchema = z.object({
  title: z.string().trim().min(3).max(160),
  details: z.string().trim().min(10).max(5000),
  kind: z.enum(workItemKinds).optional().default("idea"),
  priority: z.enum(requestPriorities).optional().default("medium"),
  parentId: z.string().uuid().optional().nullable()
});

const updateWorkItemStageSchema = z.object({
  stage: z.enum(workStages),
  rationale: z.string().trim().max(1000).optional()
});

const enqueueAiJobSchema = z.object({
  type: z.enum(aiJobTypes),
  reason: z.string().trim().max(500).optional()
});

function getSession(req: Request): AppSession {
  if (!req.session) {
    req.session = {};
  }

  return req.session as AppSession;
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = getSession(req).user;

  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = getSession(req).user;

  if (!user?.isAdmin) {
    res.status(403).json({ error: "Admin role required." });
    return;
  }

  next();
}

function safeReturnTo(value: unknown): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/";
}

function routeParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function requestBaseUrl(req: Request): string {
  if (config.appBaseUrl) {
    return config.appBaseUrl;
  }

  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProto ?? req.protocol;
  const host = forwardedHost ?? req.get("host");

  return `${protocol}://${host}`;
}

function discordAvatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

function toRequestSummary(record: RequestRecord, workItem?: PlaneWorkItem | null) {
  return {
    id: record.id,
    title: record.title,
    type: record.type,
    priority: record.priority,
    details: record.details,
    createdAt: record.createdAt,
    plane: {
      issueId: record.planeIssueId,
      sequenceId: workItem?.sequenceId ?? record.planeSequenceId,
      identifier: workItem?.identifier ?? record.planeIdentifier,
      url: workItem?.url ?? record.planeUrl
    },
    status: workItem?.state ?? {
      id: null,
      name: "Submitted",
      group: null,
      color: null
    }
  };
}

function stageStatus(stage: WorkStage) {
  const definition = stageDefinition(stage);
  return {
    id: definition.id,
    name: definition.name,
    group: definition.group,
    color: definition.color
  };
}

function promoteKindForStage(record: WorkItemRecord, stage: WorkStage) {
  if (record.kind === "idea" && ["planning", "active", "reviewing", "done"].includes(stage)) {
    return "project" as const;
  }

  return record.kind;
}

function canAccessWorkItem(user: SessionUser, record: WorkItemRecord): boolean {
  return (
    user.isAdmin ||
    record.createdByDiscordUserId === user.id ||
    record.ownerDiscordUserId === user.id
  );
}

function toWorkItemSummary(record: WorkItemRecord) {
  return {
    id: record.id,
    kind: record.kind,
    parentId: record.parentId,
    title: record.title,
    details: record.details,
    priority: record.priority,
    stage: record.stage,
    status: stageStatus(record.stage),
    owner: record.ownerDiscordUserId
      ? {
          discordUserId: record.ownerDiscordUserId,
          displayName: record.ownerDiscordUsername ?? "Assigned"
        }
      : null,
    createdBy: {
      discordUserId: record.createdByDiscordUserId,
      displayName: record.createdByDiscordUsername
    },
    plane: {
      issueId: record.planeIssueId,
      sequenceId: record.planeSequenceId,
      identifier: record.planeIdentifier,
      url: record.planeUrl
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function toWorkCommentApi(comment: WorkCommentRecord) {
  return {
    id: comment.id,
    parentCommentId: comment.parentCommentId,
    authorName: comment.discordUsername,
    authorType: comment.authorType,
    avatarUrl: comment.discordAvatarUrl,
    body: comment.body,
    createdAt: comment.createdAt,
    source: comment.authorType === "ai" ? "ai" : "local"
  };
}

async function hydratePeopleProfiles(discord: DiscordService) {
  const people = listKnownPeople();

  return Promise.all(
    people.map(async (person) => {
      if (person.avatarUrl) {
        return person;
      }

      const profile = await discord.fetchUserProfile(person.discordUserId);

      return {
        ...person,
        displayName: profile?.displayName ?? person.displayName,
        avatarUrl: profile?.avatarUrl ?? person.avatarUrl
      };
    })
  );
}

function toLocalBoardItem(record: WorkItemRecord) {
  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    priority: record.priority,
    sequenceId: record.planeSequenceId,
    identifier: record.planeIdentifier,
    url: record.planeUrl,
    status: stageStatus(record.stage)
  };
}

function toBoardItem(workItem: PlaneWorkItem) {
  return {
    id: workItem.id,
    title: workItem.name,
    priority: workItem.priority,
    sequenceId: workItem.sequenceId,
    identifier: workItem.identifier,
    url: workItem.url,
    status: workItem.state
  };
}

function localCommentToApi(comment: CommentRecord) {
  return {
    id: comment.id,
    authorName: comment.discordUsername,
    body: comment.body,
    createdAt: comment.createdAt,
    source: "local" as const
  };
}

function planeCommentToApi(comment: PlaneComment) {
  return {
    id: comment.id,
    authorName: comment.authorName,
    body: stripHtml(comment.bodyHtml),
    createdAt: comment.createdAt,
    source: "plane" as const
  };
}

function combineComments(planeComments: PlaneComment[], localComments: CommentRecord[]) {
  const seenPlaneIds = new Set(planeComments.map((comment) => comment.id));
  const comments = [
    ...planeComments.map(planeCommentToApi),
    ...localComments
      .filter((comment) => !comment.planeCommentId || !seenPlaneIds.has(comment.planeCommentId))
      .map(localCommentToApi)
  ];

  return comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

interface MentionRecipient {
  discordUserId: string;
  displayName: string;
}

function normalizeMentionName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mentionsAi(body: string): boolean {
  return /(^|[\s.,;:!?()[\]{}])@ai\b/i.test(body);
}

function notificationBodyPreview(body: string): string {
  return body
    .replace(/\[@([^\]]+)\]\(mention:[^)]+\)/g, "@$1")
    .replace(/\[(@?[^\]]+)\]\(work-item:[^)]+\)/g, "$1");
}

function collectKnownParticipants(record: WorkItemRecord, comments: WorkCommentRecord[]): MentionRecipient[] {
  const recipients = new Map<string, MentionRecipient>();

  recipients.set(record.createdByDiscordUserId, {
    discordUserId: record.createdByDiscordUserId,
    displayName: record.createdByDiscordUsername
  });

  if (record.ownerDiscordUserId) {
    recipients.set(record.ownerDiscordUserId, {
      discordUserId: record.ownerDiscordUserId,
      displayName: record.ownerDiscordUsername ?? "Owner"
    });
  }

  for (const comment of comments) {
    if (comment.discordUserId && comment.authorType === "user") {
      recipients.set(comment.discordUserId, {
        discordUserId: comment.discordUserId,
        displayName: comment.discordUsername
      });
    }
  }

  return [...recipients.values()];
}

function findMentionRecipients(body: string, record: WorkItemRecord, comments: WorkCommentRecord[]): MentionRecipient[] {
  const discordIds = new Set<string>();
  const tokenMentions = new Set<string>();
  const recipients = new Map<string, MentionRecipient>();
  const peopleById = new Map<string, MentionRecipient>();
  const participants = collectKnownParticipants(record, comments);
  const discordMentionPattern = /<@!?([A-Za-z0-9]+)>/g;
  const markdownMentionPattern = /\[@[^\]]+\]\(mention:([^)]+)\)/g;
  const tokenPattern = /(^|[\s.,;:!?()[\]{}])@([A-Za-z0-9_.-]+)/g;
  let match: RegExpExecArray | null;

  for (const person of [...listKnownPeople(), ...participants]) {
    peopleById.set(person.discordUserId, person);
  }

  while ((match = discordMentionPattern.exec(body))) {
    discordIds.add(match[1]);
  }

  while ((match = markdownMentionPattern.exec(body))) {
    discordIds.add(match[1]);
  }

  while ((match = tokenPattern.exec(body))) {
    tokenMentions.add(normalizeMentionName(match[2]));
  }

  if (tokenMentions.has("owner") && record.ownerDiscordUserId) {
    recipients.set(record.ownerDiscordUserId, {
      discordUserId: record.ownerDiscordUserId,
      displayName: record.ownerDiscordUsername ?? "Owner"
    });
  }

  if (tokenMentions.has("creator")) {
    recipients.set(record.createdByDiscordUserId, {
      discordUserId: record.createdByDiscordUserId,
      displayName: record.createdByDiscordUsername
    });
  }

  for (const participant of [...peopleById.values()]) {
    if (discordIds.has(participant.discordUserId)) {
      recipients.set(participant.discordUserId, participant);
    }
  }

  return [...recipients.values()];
}

async function sendRecordedDm(
  discord: DiscordService,
  input: {
    workItemId: string;
    discordUserId: string;
    type: string;
    body: string;
  }
): Promise<void> {
  const notification = insertNotification({
    id: crypto.randomUUID(),
    workItemId: input.workItemId,
    discordUserId: input.discordUserId,
    type: input.type,
    channel: "dm",
    body: input.body,
    status: "pending",
    reason: null
  });
  const result = await discord.sendDm(input.discordUserId, input.body);

  updateNotificationStatus(notification.id, result.sent ? "sent" : "failed", result.reason ?? null);
  emitProjectDeskEvent({ type: "notifications_changed" });
}

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

async function exchangeDiscordCode(code: string, redirectUri: string): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Discord token exchange failed with ${response.status}.`);
  }

  return (await response.json()) as DiscordTokenResponse;
}

async function exchangeDiscordActivityCode(code: string): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: "authorization_code",
    code
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Discord activity token exchange failed with ${response.status}.`);
  }

  return (await response.json()) as DiscordTokenResponse;
}

async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Discord user lookup failed with ${response.status}.`);
  }

  return (await response.json()) as DiscordUser;
}

async function createSessionUser(discord: DiscordService, accessToken: string): Promise<SessionUser> {
  const discordUser = await fetchDiscordUser(accessToken);
  const roles = await discord.fetchMemberRoles(discordUser.id);
  const displayName = discordUser.global_name ?? discordUser.username;

  return {
    id: discordUser.id,
    username: discordUser.username,
    displayName,
    avatarUrl: discordAvatarUrl(discordUser),
    roles,
    isAdmin: discord.isAdmin(roles)
  };
}

async function attachWorkItems(records: RequestRecord[], plane: PlaneLikeClient) {
  return Promise.all(
    records.map(async (record) => {
      try {
        return toRequestSummary(record, await plane.getWorkItem(record.planeIssueId));
      } catch {
        return toRequestSummary(record, null);
      }
    })
  );
}

export function createApp({ plane, discord, aiWorker }: CreateAppServices) {
  const app = express();
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const webDistDir = process.env.WEB_DIST_DIR ?? resolve(__dirname, "../../web/dist");

  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false
    })
  );
  app.use(express.json({ limit: "1mb", verify: captureRawBody }));
  app.use(
    cookieSession({
      name: "project_desk",
      keys: [config.sessionSecret],
      httpOnly: true,
      secure: config.cookies.secure,
      sameSite: config.cookies.sameSite,
      maxAge: 1000 * 60 * 60 * 24 * 7
    })
  );

  const api = express.Router();

  api.post("/interactions", handleDiscordInteraction);

  api.get("/health", (_req, res) => {
    res.json({ ok: true, app: "Project Desk" });
  });

  api.get("/public-config", (_req, res) => {
    res.json({ discordClientId: config.discord.clientId });
  });

  api.get("/auth/discord/start", (req, res) => {
    const session = getSession(req);
    const state = crypto.randomUUID();
    const redirectUri = `${requestBaseUrl(req)}/api/auth/discord/callback`;
    const authorizeUrl = new URL("https://discord.com/oauth2/authorize");

    authorizeUrl.searchParams.set("client_id", config.discord.clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", "identify");
    authorizeUrl.searchParams.set("state", state);

    session.oauthState = state;
    session.oauthReturnTo = safeReturnTo(req.query.returnTo);
    session.oauthRedirectUri = redirectUri;

    res.redirect(authorizeUrl.toString());
  });

  api.get("/auth/discord/callback", async (req, res) => {
    const session = getSession(req);
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;

    if (!code || !state || !session.oauthState || state !== session.oauthState) {
      res.status(400).send("Invalid Discord OAuth state.");
      return;
    }

    const redirectUri = session.oauthRedirectUri ?? `${requestBaseUrl(req)}/api/auth/discord/callback`;
    const token = await exchangeDiscordCode(code, redirectUri);
    session.user = await createSessionUser(discord, token.access_token);
    session.oauthState = undefined;
    session.oauthRedirectUri = undefined;

    const returnTo = session.oauthReturnTo ?? "/";
    session.oauthReturnTo = undefined;
    res.redirect(returnTo);
  });

  api.post("/auth/discord/activity", async (req, res) => {
    const input = activityAuthSchema.parse(req.body);
    const token = await exchangeDiscordActivityCode(input.code);
    const user = await createSessionUser(discord, token.access_token);

    getSession(req).user = user;

    res.json({
      accessToken: token.access_token,
      user
    });
  });

  api.post("/auth/logout", (req, res) => {
    req.session = null;
    res.status(204).send();
  });

  api.get("/me", (req, res) => {
    const user = getSession(req).user ?? null;
    res.json({
      authenticated: Boolean(user),
      user,
      planeFullBoardUrl: user?.isAdmin ? config.plane.fullBoardUrl : null,
      aiProvider: config.ai.provider,
      dmFirst: !config.discord.publicChannelPosting
    });
  });

  api.get("/events", requireAuth, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const cleanup = addEventClient(res);
    req.on("close", cleanup);
  });

  api.get("/work-items", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    runInactiveArchiveSweep();
    const records = listWorkItemsForUser(user.id, user.isAdmin);
    res.json({ items: records.map(toWorkItemSummary) });
  });

  api.get("/people", requireAuth, async (_req, res) => {
    res.json({ people: await hydratePeopleProfiles(discord) });
  });

  api.post("/work-items", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const input = createWorkItemSchema.parse(req.body);
    const item = insertWorkItem({
      id: crypto.randomUUID(),
      kind: input.kind,
      parentId: input.parentId ?? null,
      createdByDiscordUserId: user.id,
      createdByDiscordUsername: user.displayName,
      ownerDiscordUserId: user.id,
      ownerDiscordUsername: user.displayName,
      title: input.title,
      details: input.details,
      priority: input.priority,
      stage: input.kind === "task" ? "active" : "inbox",
      planeIssueId: null,
      planeSequenceId: null,
      planeIdentifier: null,
      planeUrl: null
    });

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: item.id,
      type: "created",
      actorName: user.displayName,
      body: `Created ${item.kind}.`,
      metadataJson: null
    });

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: item.id });

    res.status(201).json({
      item: toWorkItemSummary(item)
    });
  });

  api.get("/work-items/:id", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    runInactiveArchiveSweep();
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    res.json({
      item: {
        ...toWorkItemSummary(record),
        canOpenInPlane: user.isAdmin && Boolean(record.planeUrl)
      },
      comments: listWorkComments(record.id).map(toWorkCommentApi),
      decisions: listDecisions(record.id),
      activity: listActivityEvents(record.id),
      childItems: listWorkItemsByParent(record.id).map(toWorkItemSummary)
    });
  });

  api.post("/work-items/:id/comments", requireAuth, async (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    const input = createCommentSchema.parse(req.body);
    const existingComments = listWorkComments(record.id);
    const parentComment = input.parentCommentId ? getWorkCommentById(input.parentCommentId) : null;

    if (input.parentCommentId && (!parentComment || parentComment.workItemId !== record.id)) {
      res.status(400).json({ error: "Reply target was not found on this item." });
      return;
    }

    const comment = insertWorkComment({
      id: crypto.randomUUID(),
      workItemId: record.id,
      parentCommentId: parentComment?.id ?? null,
      discordUserId: user.id,
      discordAvatarUrl: user.avatarUrl,
      discordUsername: user.displayName,
      authorType: "user",
      body: input.body
    });

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: record.id,
      type: "commented",
      actorName: user.displayName,
      body: "Added a comment.",
      metadataJson: JSON.stringify({ commentId: comment.id })
    });

    const dmTargets = new Map<string, { type: string; body: string }>();
    const itemLink = config.appBaseUrl ? `${config.appBaseUrl.replace(/\/+$/, "")}/items/${record.id}` : null;
    const commentPreview = notificationBodyPreview(input.body);
    const baseDmBody = `${user.displayName} mentioned you on "${record.title}".\n\n${commentPreview}${
      itemLink ? `\n\nOpen: ${itemLink}` : "\n\nOpen Project Desk to reply."
    }`;

    for (const recipient of findMentionRecipients(input.body, record, [...existingComments, comment])) {
      if (recipient.discordUserId !== user.id) {
        dmTargets.set(recipient.discordUserId, { type: "mention", body: baseDmBody });
      }
    }

    if (parentComment?.discordUserId && parentComment.discordUserId !== user.id && !dmTargets.has(parentComment.discordUserId)) {
      dmTargets.set(parentComment.discordUserId, {
        type: "comment_reply",
        body: `${user.displayName} replied to you on "${record.title}".\n\n${commentPreview}${
          itemLink ? `\n\nOpen: ${itemLink}` : "\n\nOpen Project Desk to reply."
        }`
      });
    }

    await Promise.all(
      [...dmTargets.entries()].map(([discordUserId, notification]) =>
        sendRecordedDm(discord, {
          workItemId: record.id,
          discordUserId,
          type: notification.type,
          body: notification.body
        })
      )
    );

    if (mentionsAi(input.body) && !isArchivedStage(record.stage)) {
      aiWorker.enqueueWorkItemJob(record.id, "comment_review", `@AI was mentioned by ${user.displayName}.`);
    }

    emitProjectDeskEvent({ type: "work_item_changed", workItemId: record.id });

    res.status(201).json({ comment: toWorkCommentApi(comment) });
  });

  api.patch("/work-items/:id/stage", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    const input = updateWorkItemStageSchema.parse(req.body);
    const nextKind = promoteKindForStage(record, input.stage);
    const updated = updateWorkItemStage(record.id, input.stage, nextKind);

    if (!updated) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: updated.id,
      type: "stage_changed",
      actorName: user.displayName,
      body: `Moved from ${stageDefinition(record.stage).name} to ${stageDefinition(updated.stage).name}.`,
      metadataJson: JSON.stringify({ from: record.stage, to: updated.stage })
    });

    if (["validated", "parked", "killed", "done"].includes(updated.stage)) {
      insertDecision({
        id: crypto.randomUUID(),
        workItemId: updated.id,
        decision: updated.stage,
        actorDiscordUserId: user.id,
        actorName: user.displayName,
        rationale: input.rationale ?? null
      });
    }

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: updated.id });

    res.json({
      item: toWorkItemSummary(updated)
    });
  });

  api.post("/work-items/:id/ai-jobs", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    if (isArchivedStage(record.stage)) {
      res.status(409).json({ error: "Archived items only allow AI archive summaries." });
      return;
    }

    const input = enqueueAiJobSchema.parse(req.body);
    const job = aiWorker.enqueueWorkItemJob(record.id, input.type, input.reason ?? "Workflow action requested.");

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: record.id,
      type: "ai_job_enqueued",
      actorName: user.displayName,
      body: `Queued ${input.type}.`,
      metadataJson: JSON.stringify({ jobId: job.id })
    });

    emitProjectDeskEvent({ type: "work_item_changed", workItemId: record.id });

    res.status(202).json({ aiJob: job });
  });

  api.get("/notifications", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    res.json({ notifications: listNotificationsForUser(user.id) });
  });

  api.get("/requests", requireAuth, async (req, res) => {
    const user = getSession(req).user!;
    const records = listRequestsForUser(user.id);
    res.json({ requests: await attachWorkItems(records, plane) });
  });

  api.post("/requests", requireAuth, async (req, res) => {
    const user = getSession(req).user!;
    const input = createRequestSchema.parse(req.body);
    const requestId = crypto.randomUUID();
    const planeIssue = await plane.createWorkItem({
      requestId,
      ...input,
      submitter: `${user.displayName} (${user.id})`
    });

    const record = insertRequest({
      id: requestId,
      discordUserId: user.id,
      discordUsername: user.displayName,
      discordAvatarUrl: user.avatarUrl,
      title: input.title,
      type: input.type,
      priority: input.priority,
      details: input.details,
      planeIssueId: planeIssue.id,
      planeSequenceId: planeIssue.sequenceId,
      planeIdentifier: planeIssue.identifier,
      planeUrl: planeIssue.url
    });

    let notification = await discord.notifyRequestCreated(record);

    if (!notification.sent) {
      console.warn("Discord request notification was not sent.", notification.reason);
    }

    res.status(201).json({
      request: toRequestSummary(record, planeIssue),
      notification
    });
  });

  api.get("/requests/:id", requireAuth, async (req, res) => {
    const user = getSession(req).user!;
    const requestId = routeParam(req.params.id);
    const record = requestId ? getRequestById(requestId) : null;

    if (!record || (record.discordUserId !== user.id && !user.isAdmin)) {
      res.status(404).json({ error: "Request not found." });
      return;
    }

    const [workItem, planeComments] = await Promise.all([
      plane.getWorkItem(record.planeIssueId),
      plane.listComments(record.planeIssueId).catch(() => [])
    ]);
    const localComments = listLocalComments(record.id);

    res.json({
      request: {
        ...toRequestSummary(record, workItem),
        discordUserId: record.discordUserId,
        discordUsername: record.discordUsername,
        canOpenInPlane: user.isAdmin
      },
      comments: combineComments(planeComments, localComments)
    });
  });

  api.post("/requests/:id/comments", requireAuth, async (req, res) => {
    const user = getSession(req).user!;
    const requestId = routeParam(req.params.id);
    const record = requestId ? getRequestById(requestId) : null;

    if (!record || (record.discordUserId !== user.id && !user.isAdmin)) {
      res.status(404).json({ error: "Request not found." });
      return;
    }

    const input = createCommentSchema.parse(req.body);
    const comment = insertComment({
      id: crypto.randomUUID(),
      requestId: record.id,
      discordUserId: user.id,
      discordUsername: user.displayName,
      body: input.body
    });

    const planeComment = await plane.createComment({
      workItemId: record.planeIssueId,
      commentId: comment.id,
      body: input.body,
      authorName: user.displayName
    });
    updateCommentPlaneId(comment.id, planeComment.id);

    res.status(201).json({
      comment: localCommentToApi({ ...comment, planeCommentId: planeComment.id })
    });
  });

  api.get("/board", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    runInactiveArchiveSweep();
    const workItems = listWorkItemsForUser(user.id, user.isAdmin);
    const recentItems = workItems.slice(0, 25).map(toWorkItemSummary);

    res.json({
      boardUrl: user.isAdmin ? config.plane.fullBoardUrl : null,
      states: workStageDefinitions.map((stage) => ({
        id: stage.id,
        name: stage.name,
        group: stage.group,
        color: stage.color
      })),
      workItems: workItems.map(toLocalBoardItem),
      recentItems,
      recentRequests: []
    });
  });

  api.patch("/board/items/:id/state", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);

    if (!workItemId) {
      res.status(400).json({ error: "Work item id is required." });
      return;
    }

    const input = updateBoardItemStateSchema.parse(req.body);
    const current = getWorkItemById(workItemId);

    if (!current || !canAccessWorkItem(user, current)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    if (!workStages.includes(input.stateId as WorkStage)) {
      res.status(400).json({ error: "Unknown Project Desk stage." });
      return;
    }

    const stage = input.stateId as WorkStage;
    const updated = updateWorkItemStage(current.id, stage, promoteKindForStage(current, stage));

    if (!updated) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: updated.id,
      type: "board_stage_changed",
      actorName: user.displayName,
      body: `Moved from ${stageDefinition(current.stage).name} to ${stageDefinition(updated.stage).name}.`,
      metadataJson: JSON.stringify({ from: current.stage, to: updated.stage })
    });

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: updated.id });

    res.json({ workItem: toLocalBoardItem(updated) });
  });

  api.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request.", details: error.flatten() });
      return;
    }

    if (error instanceof PlaneApiError) {
      res.status(502).json({ error: error.message, details: error.details });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Unexpected server error." });
  });

  app.use("/api", api);

  if (existsSync(webDistDir)) {
    app.use(express.static(webDistDir));
    app.get(/.*/, (_req, res) => {
      res.sendFile(resolve(webDistDir, "index.html"));
    });
  }

  return app;
}
