import cookieSession from "cookie-session";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { config } from "./config.js";
import type { CommentRecord, RequestRecord } from "./db.js";
import {
  getRequestById,
  insertComment,
  insertRequest,
  listLocalComments,
  listRecentRequests,
  listRequestsForUser,
  updateCommentPlaneId
} from "./db.js";
import type { SessionUser } from "./domain.js";
import { requestPriorities, requestTypes } from "./domain.js";
import { DiscordService } from "./discord.js";
import { stripHtml } from "./html.js";
import { captureRawBody, handleDiscordInteraction } from "./interactions.js";
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
}

const createRequestSchema = z.object({
  title: z.string().trim().min(3).max(160),
  type: z.enum(requestTypes),
  priority: z.enum(requestPriorities),
  details: z.string().trim().min(10).max(5000)
});

const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(3000)
});

const activityAuthSchema = z.object({
  code: z.string().min(1)
});

const updateBoardItemStateSchema = z.object({
  stateId: z.string().trim().min(1)
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

export function createApp({ plane, discord }: CreateAppServices) {
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
      planeFullBoardUrl: user?.isAdmin ? config.plane.fullBoardUrl : null
    });
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

  api.get("/board", requireAuth, requireAdmin, async (_req, res) => {
    const [workItems, states, recentRequests] = await Promise.all([
      plane.listWorkItems(),
      plane.listStates().catch(() => []),
      Promise.resolve(listRecentRequests(25))
    ]);

    res.json({
      boardUrl: config.plane.fullBoardUrl,
      states,
      workItems: workItems.map(toBoardItem),
      recentRequests: await attachWorkItems(recentRequests, plane)
    });
  });

  api.patch("/board/items/:id/state", requireAuth, requireAdmin, async (req, res) => {
    const workItemId = routeParam(req.params.id);

    if (!workItemId) {
      res.status(400).json({ error: "Work item id is required." });
      return;
    }

    const input = updateBoardItemStateSchema.parse(req.body);
    const workItem = await plane.updateWorkItemState(workItemId, input.stateId);

    res.json({ workItem: toBoardItem(workItem) });
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
