import cookieSession from "cookie-session";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { AiWorker } from "./ai-worker.js";
import { AiUnavailableError, type AiClient } from "./ai.js";
import {
  DiscordGuildMembershipLookupError,
  DiscordGuildMembershipRequiredError,
  guildMembershipRequiredMessage,
  requireDiscordGuildMembership
} from "./auth.js";
import { config } from "./config.js";
import type {
  AttachmentRecord,
  CommentRecord,
  InboxNotificationRecord,
  InboxNotificationType,
  KnownPersonRecord,
  RequestRecord,
  UserProfileRecord,
  WorkCommentRecord,
  WorkItemLinkRecord,
  WorkItemLinkRelationship,
  WorkItemRecord
} from "./db.js";
import {
  deleteWorkItemLink,
  deleteWorkItemTree,
  getAttachmentById,
  countUnreadInboxNotifications,
  getUserProfile,
  getWorkItemMemory,
  getWorkItemLinkById,
  getWorkItemById,
  getWorkCommentById,
  getRequestById,
  countOpenChildTasks,
  countWorkItemFollowers,
  followWorkItem,
  insertActivityEvent,
  insertAttachment,
  insertDecision,
  insertInboxNotification,
  insertNotification,
  insertWorkComment,
  insertWorkItemLink,
  insertWorkItem,
  insertComment,
  insertRequest,
  isFollowingWorkItem,
  listActivityEvents,
  listAiArtifacts,
  listDecisions,
  listWorkItemFollowerIds,
  listInboxNotificationsForUser,
  listNotificationsForUser,
  listKnownPeople,
  listUserProfiles,
  listLocalComments,
  listRecentWorkItemVisits,
  listWorkComments,
  listWorkItemLinksForItem,
  listWorkItemsByParent,
  listWorkItemsForUser,
  listRecentRequests,
  listRequestsForUser,
  promoteIdeaToProject,
  recordWorkItemVisit,
  shouldSendNotification,
  markAllInboxNotificationsRead,
  markInboxNotificationRead,
  markInboxNotificationsReadForTarget,
  updateUserProfile,
  updateWorkCommentProfile,
  updateWorkItemCategory,
  updateWorkItemOwner,
  updateWorkItemPriority,
  updateWorkItemStage,
  updateWorkItemTaskStatus,
  updateWorkItemTitle,
  upsertWorkItemMemory,
  unfollowWorkItem,
  upsertUserProfile,
  updateCommentPlaneId,
  updateNotificationStatus
} from "./db.js";
import type { SessionUser } from "./domain.js";
import {
  aiJobTypes,
  defaultNotificationPreferences,
  codexReasoningEfforts,
  ideaCategories,
  isArchivedStage,
  isProjectDeskAiUserId,
  notificationTypes,
  projectDeskAiDisplayName,
  projectDeskAiTagName,
  projectDeskAiUserId,
  requestPriorities,
  requestTypes,
  stageDefinition,
  taskCompletionReasons,
  taskStatuses,
  workItemKinds,
  workStages,
  workStageDefinitions,
  type IdeaCategory,
  type CodexReasoningEffort,
  type TaskCompletionReason,
  type TaskStatus,
  type WorkStage
} from "./domain.js";
import { DiscordService } from "./discord.js";
import { addEventClient, emitProjectDeskEvent } from "./events.js";
import { stripHtml } from "./html.js";
import { captureRawBody, handleDiscordInteraction } from "./interactions.js";
import { runInactiveArchiveSweep } from "./maintenance.js";
import { PlaneApiError, type PlaneComment, type PlaneLikeClient, type PlaneWorkItem } from "./plane.js";
import { getSourceSyncStatus, startSourceSync, type SourceSyncAction } from "./source-sync.js";
import type { AiTaskRunner } from "./task-runner.js";

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
  ai: AiClient;
  taskRunner: AiTaskRunner;
}

const createRequestSchema = z.object({
  title: z.string().trim().min(3).max(160),
  type: z.enum(requestTypes),
  priority: z.enum(requestPriorities),
  details: z.string().trim().min(10).max(5000)
});

const maxUploadBytes = 25 * 1024 * 1024;
const maxUploadBatchBytes = 75 * 1024 * 1024;

const uploadFieldNames = new Set(["file", "files", "attachment", "attachments"]);
const fallbackUploadMimeType = "application/octet-stream";
const multipartOverheadAllowanceBytes = 1024 * 1024;
const safeInlineImageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const safeInlinePreviewMimeTypes = new Set([
  ...safeInlineImageMimeTypes,
  "application/pdf",
  "application/json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/sql",
  "text/csv",
  "text/css",
  "text/javascript",
  "text/json",
  "text/markdown",
  "text/plain",
  "text/rtf",
  "text/sql",
  "text/typescript",
  "text/typescript-jsx",
  "text/x-markdown",
  "text/x-python",
  "text/x-shellscript",
  "text/x-powershell",
  "text/x-yaml",
  "text/yaml"
]);
const unsafeInlinePreviewExtensions = new Set([".html", ".htm", ".svg"]);

const uploadAllowlist = {
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".gif": ["image/gif"],
  ".svg": ["image/svg+xml", "text/xml", "application/xml"],
  ".pdf": ["application/pdf"],
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".txt": ["text/plain"],
  ".rtf": ["application/rtf", "text/rtf"],
  ".csv": ["text/csv", "application/csv", "application/vnd.ms-excel"],
  ".md": ["text/markdown", "text/x-markdown", "text/plain"],
  ".mp3": ["audio/mpeg", "audio/mp3"],
  ".wav": ["audio/wav", "audio/wave", "audio/x-wav"],
  ".m4a": ["audio/mp4", "audio/x-m4a"],
  ".ogg": ["audio/ogg", "application/ogg"],
  ".mp4": ["video/mp4"],
  ".mov": ["video/quicktime"],
  ".webm": ["video/webm"],
  ".js": ["text/javascript", "application/javascript", "application/x-javascript", "text/plain"],
  ".ts": ["text/typescript", "application/typescript", "text/plain"],
  ".tsx": ["text/typescript-jsx", "text/tsx", "text/plain"],
  ".html": ["text/html"],
  ".css": ["text/css"],
  ".json": ["application/json", "text/json", "text/plain"],
  ".xml": ["application/xml", "text/xml"],
  ".yaml": ["application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml", "text/plain"],
  ".yml": ["application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml", "text/plain"],
  ".env": ["text/plain"],
  ".sql": ["application/sql", "text/sql", "text/plain"],
  ".py": ["text/x-python", "text/plain"],
  ".sh": ["application/x-sh", "text/x-shellscript", "text/plain"],
  ".bat": ["application/x-msdownload", "application/bat", "text/plain"],
  ".ps1": ["application/x-powershell", "text/x-powershell", "text/plain"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".rar": ["application/vnd.rar", "application/x-rar-compressed"],
  ".7z": ["application/x-7z-compressed"],
  ".tar": ["application/x-tar"],
  ".gz": ["application/gzip", "application/x-gzip"]
} as const satisfies Record<string, readonly string[]>;

type UploadExtension = keyof typeof uploadAllowlist;

interface UploadCandidate {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

class UploadHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "UploadHttpError";
  }
}

interface BodyParserHttpError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
  limit?: number;
  length?: number;
}

function isBodyParserHttpError(error: unknown): error is BodyParserHttpError {
  return Boolean(error && typeof error === "object" && ("type" in error || "status" in error || "statusCode" in error));
}

function handleBodyParserError(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (!isBodyParserHttpError(error)) {
    next(error);
    return;
  }

  const status = error.status ?? error.statusCode;

  if (error.type === "entity.too.large" || status === 413) {
    res.status(413).json({
      error: `Request body is too large. Keep it under ${config.http.requestBodyLimit}, or upload large files as attachments.`,
      details: {
        limit: error.limit ?? null,
        length: error.length ?? null
      }
    });
    return;
  }

  if (error.type === "entity.parse.failed" || status === 400) {
    res.status(400).json({ error: "Invalid JSON request body." });
    return;
  }

  next(error);
}

const attachmentContextSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string().trim().min(1).max(300).optional(),
  originalName: z.string().trim().min(1).max(240).optional(),
  name: z.string().trim().min(1).max(240).optional(),
  mimeType: z.string().trim().min(1).max(160),
  size: z.number().int().nonnegative().max(maxUploadBytes),
  url: z.string().trim().min(1).max(1000),
  thumbnailUrl: z.string().trim().min(1).max(1000).optional(),
  createdAt: z.string().trim().min(1).max(80)
}).superRefine((value, ctx) => {
  if (!value.originalName && !value.name && !value.fileName) {
    ctx.addIssue({
      code: "custom",
      path: ["originalName"],
      message: "Attachment name is required."
    });
  }
});

const annotationSchema = z.object({
  id: z.string().uuid(),
  screen: z.string().trim().min(1).max(240),
  path: z.string().trim().min(1).max(500),
  note: z.string().trim().max(1000),
  createdAt: z.string().trim().min(1).max(80),
  screenshot: attachmentContextSchema.optional().nullable(),
  rect: z.object({
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    viewportWidth: z.number().finite().positive(),
    viewportHeight: z.number().finite().positive()
  })
});

const itemReferenceContextSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(workItemKinds).optional(),
  title: z.string().trim().max(200).optional(),
  identifier: z.string().trim().max(80).optional().nullable(),
  source: z.enum(["current_page", "mentioned"]).optional().default("mentioned")
});

const pageContextSchema = z.object({
  label: z.string().trim().min(1).max(120),
  path: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(1000).optional().nullable()
});

const collaborationContextSchema = z
  .object({
    attachments: z.array(attachmentContextSchema).max(20).optional().default([]),
    annotations: z.array(annotationSchema).max(30).optional().default([]),
    itemReferences: z.array(itemReferenceContextSchema).max(12).optional().default([]),
    pageContext: pageContextSchema.optional().nullable(),
    sourceItemId: z.string().uuid().optional().nullable(),
    sourceItemTitle: z.string().trim().max(200).optional().nullable(),
    sourceCommentId: z.string().uuid().optional().nullable(),
    sourceCommentBody: z.string().trim().max(3000).optional().nullable(),
    sourceReplies: z
      .array(
        z.object({
          id: z.string().uuid(),
          authorName: z.string().trim().max(120),
          body: z.string().trim().max(2000),
          createdAt: z.string().trim().max(80)
        })
      )
      .max(12)
      .optional()
      .default([])
  })
  .strict();

type CollaborationContextInput = z.infer<typeof collaborationContextSchema>;
type ItemReferenceContextInput = z.infer<typeof itemReferenceContextSchema>;

const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(8000),
  parentCommentId: z.string().uuid().optional().nullable(),
  context: collaborationContextSchema.optional().nullable()
});

const uploadFileSchema = z.object({
  name: z.string().trim().min(1).max(240),
  type: z.string().trim().max(160).optional().default("application/octet-stream"),
  size: z.number().int().nonnegative().max(maxUploadBytes),
  dataUrl: z.string().min(1)
});

const uploadAttachmentsSchema = z.object({
  files: z.array(uploadFileSchema).min(1).max(8)
});

const activityAuthSchema = z
  .object({
    code: z.string().min(1).optional(),
    accessToken: z.string().min(1).optional()
  })
  .refine((value) => Boolean(value.code) !== Boolean(value.accessToken), {
    message: "Provide exactly one Discord Activity code or access token."
  });

const clientDiagnosticSchema = z
  .object({
    event: z.string().trim().min(1).max(80),
    href: z.string().trim().max(500).optional(),
    userAgent: z.string().trim().max(240).optional(),
    details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().default({})
  })
  .strict();

const updateBoardItemStateSchema = z.object({
  stateId: z.string().trim().min(1)
});

const createWorkItemSchema = z.object({
  title: z.string().trim().min(3).max(160),
  details: z.string().trim().min(10).max(10000),
  kind: z.enum(workItemKinds).optional().default("idea"),
  category: z.enum(ideaCategories).optional().nullable(),
  priority: z.enum(requestPriorities).optional().default("medium"),
  codexReasoning: z.enum(codexReasoningEfforts).optional().default("medium"),
  parentId: z.string().uuid().optional().nullable(),
  ownerDiscordUserId: z.string().trim().min(1).optional().nullable(),
  context: collaborationContextSchema.optional().nullable()
});

const workItemLinkRelationships: [WorkItemLinkRelationship, ...WorkItemLinkRelationship[]] = [
  "relates_to",
  "blocked_by",
  "blocks",
  "caused_by",
  "causes",
  "duplicates"
];

const createWorkItemLinkSchema = z.object({
  targetWorkItemId: z.string().uuid(),
  relationship: z.enum(workItemLinkRelationships),
  note: z.string().trim().max(1000).optional().nullable()
});

const updateWorkItemStageSchema = z.object({
  stage: z.enum(workStages),
  rationale: z.string().trim().max(1000).optional()
});

const updateWorkItemTitleSchema = z.object({
  title: z.string().trim().min(3).max(160)
});

const updateWorkItemMemorySchema = z.object({
  body: z.string().trim().max(12000)
});

const updateTaskStatusSchema = z.object({
  taskStatus: z.enum(taskStatuses),
  completionReason: z.enum(taskCompletionReasons).optional().nullable()
});

const updateFollowSchema = z.object({
  following: z.boolean()
});

const updateCategorySchema = z.object({
  category: z.enum(ideaCategories)
});

const updatePrioritySchema = z.object({
  priority: z.enum(requestPriorities)
});

const updateAssigneeSchema = z.object({
  discordUserId: z.string().trim().min(1).optional().nullable(),
  codexReasoning: z.enum(codexReasoningEfforts).optional().default("medium")
});

const notificationPreferencesSchema = z
  .object(Object.fromEntries(notificationTypes.map((type) => [type, z.boolean().optional()])))
  .partial();

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  tagName: z.string().trim().max(40).optional().nullable(),
  avatarUrl: z.string().trim().url().max(1000).optional().nullable().or(z.literal("")),
  notificationPreferences: notificationPreferencesSchema.optional()
});

const inboxReadTargetSchema = z.object({
  workItemId: z.string().uuid().optional().nullable(),
  commentId: z.string().uuid().optional().nullable(),
  replyId: z.string().uuid().optional().nullable(),
  annotationId: z.string().uuid().optional().nullable()
});

const devSessionSchema = z.object({
  userId: z.string().trim().min(1).max(80),
  username: z.string().trim().min(1).max(80).optional(),
  displayName: z.string().trim().min(1).max(80),
  tagName: z.string().trim().max(40).optional().nullable(),
  avatarUrl: z.string().trim().url().max(1000).optional().nullable().or(z.literal("")),
  isAdmin: z.boolean().optional().default(true)
});

const enqueueAiJobSchema = z.object({
  type: z.enum(aiJobTypes),
  reason: z.string().trim().max(500).optional()
});

const sourceSyncActions = ["pull", "push", "restart"] as const satisfies readonly SourceSyncAction[];

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
    res.status(403).json({ error: "Administrator role required." });
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

function shouldLogRequestPath(path: string): boolean {
  return (
    path === "/" ||
    path === "/api/me" ||
    path === "/api/public-config" ||
    path === "/api/client-diagnostics" ||
    path.startsWith("/api/auth/discord/") ||
    /^\/assets\/index-[^/]+\.(js|css)$/.test(path)
  );
}

function classifyUserAgent(userAgent: string | undefined): string {
  const value = userAgent ?? "";

  if (/discord/i.test(value) && /iphone|ipad|ios/i.test(value)) {
    return "discord-ios";
  }

  if (/discord/i.test(value) && /android/i.test(value)) {
    return "discord-android";
  }

  if (/discord/i.test(value)) {
    return "discord";
  }

  if (/iphone|ipad|ios/i.test(value)) {
    return "ios";
  }

  if (/android/i.test(value)) {
    return "android";
  }

  return "browser";
}

function logObservedRequest(req: Request, res: Response, next: NextFunction): void {
  if (!shouldLogRequestPath(req.path)) {
    next();
    return;
  }

  const startedAt = Date.now();
  res.on("finish", () => {
    console.info(
      `[project-desk:http] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms ${classifyUserAgent(req.get("user-agent"))}`
    );
  });
  next();
}

function logClientDiagnostic(input: z.infer<typeof clientDiagnosticSchema>): void {
  console.info(`[project-desk:client] ${input.event} ${JSON.stringify(input)}`);
}

function sanitizeFileName(value: string): string {
  const clean = basename(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return clean.slice(0, 160) || "attachment";
}

function uploadFileExtension(fileName: string): UploadExtension | null {
  const baseName = basename(fileName).toLowerCase();
  const extension = baseName === ".env" ? ".env" : extname(baseName);

  return extension in uploadAllowlist ? (extension as UploadExtension) : null;
}

function normalizeUploadMimeType(value: string | null | undefined): string {
  return value?.split(";")[0]?.trim().toLowerCase() || fallbackUploadMimeType;
}

function isUploadMimeTypeAllowed(extension: UploadExtension, mimeType: string): boolean {
  if (mimeType === fallbackUploadMimeType) {
    return true;
  }

  return (uploadAllowlist[extension] as readonly string[]).includes(mimeType);
}

function fileNameFromStoragePath(storagePath: string): string {
  return basename(storagePath);
}

function isSafeInlineAttachment(record: Pick<AttachmentRecord, "mimeType">): boolean {
  return safeInlineImageMimeTypes.has(normalizeUploadMimeType(record.mimeType));
}

function hasQueryFlag(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasQueryFlag);
  }

  return value === "" || value === "1" || value === "true";
}

function isSafeInlinePreviewAttachment(record: Pick<AttachmentRecord, "mimeType" | "originalName">): boolean {
  const mimeType = normalizeUploadMimeType(record.mimeType);
  const extension = extname(record.originalName).toLowerCase();

  if (unsafeInlinePreviewExtensions.has(extension)) {
    return false;
  }

  return safeInlinePreviewMimeTypes.has(mimeType) || (mimeType.startsWith("text/") && mimeType !== "text/html" && mimeType !== "text/xml");
}

function shouldServeAttachmentInline(req: Request, record: AttachmentRecord): boolean {
  if (hasQueryFlag(req.query.download)) {
    return false;
  }

  if (hasQueryFlag(req.query.preview)) {
    return isSafeInlinePreviewAttachment(record);
  }

  return isSafeInlineAttachment(record);
}

function safeContentDispositionFileName(fileName: string): string {
  return fileName.replace(/["\r\n]/g, "");
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const childRelativePath = relative(parentPath, childPath);
  return Boolean(childRelativePath && !childRelativePath.startsWith("..") && !isAbsolute(childRelativePath));
}

function parseUploadDataUrl(dataUrl: string): { mimeType: string | null; buffer: Buffer } | null {
  const match = /^data:([^;,]+)?;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);

  if (!match) {
    return null;
  }

  return {
    mimeType: match[1] || null,
    buffer: Buffer.from(match[2].replace(/\s/g, ""), "base64")
  };
}

function attachmentUrl(record: Pick<AttachmentRecord, "id" | "originalName">, urlBase = "/api/uploads"): string {
  return `${urlBase}/${record.id}/${encodeURIComponent(record.originalName)}`;
}

function toAttachmentApi(record: AttachmentRecord, urlBase = "/api/uploads") {
  const url = attachmentUrl(record, urlBase);
  const originalName = record.originalName;

  return {
    id: record.id,
    fileName: fileNameFromStoragePath(record.storagePath),
    originalName,
    name: originalName,
    mimeType: record.mimeType,
    size: record.sizeBytes,
    url,
    thumbnailUrl: isSafeInlineAttachment(record) ? url : undefined,
    createdAt: record.createdAt
  };
}

function requestHeaderEntries(req: Request): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    }
  }

  return headers;
}

function hasMultipartContentType(req: Request): boolean {
  return (req.get("content-type") ?? "").toLowerCase().includes("multipart/form-data");
}

function assertUploadContentLength(req: Request): void {
  const rawContentLength = req.get("content-length");
  const contentLength = rawContentLength ? Number(rawContentLength) : null;

  if (contentLength && Number.isFinite(contentLength) && contentLength > maxUploadBatchBytes + multipartOverheadAllowanceBytes) {
    throw new UploadHttpError(413, "Upload batch is too large.");
  }
}

function isFormDataUploadFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "size" in value &&
    "type" in value
  );
}

async function multipartUploadCandidates(req: Request): Promise<UploadCandidate[]> {
  if (!hasMultipartContentType(req)) {
    throw new UploadHttpError(415, "Uploads must be sent as multipart/form-data.");
  }

  assertUploadContentLength(req);

  let formData: FormData;

  try {
    const webRequest = new globalThis.Request(requestBaseUrl(req), {
      method: "POST",
      headers: requestHeaderEntries(req),
      body: Readable.toWeb(req) as unknown as BodyInit,
      duplex: "half"
    } as RequestInit & { duplex: "half" });
    formData = await webRequest.formData();
  } catch {
    throw new UploadHttpError(400, "Upload payload could not be parsed.");
  }

  const files: File[] = [];

  formData.forEach((value, fieldName) => {
    if (uploadFieldNames.has(fieldName) && isFormDataUploadFile(value)) {
      files.push(value);
    }
  });

  if (files.length === 0) {
    throw new UploadHttpError(400, "No upload files were provided.");
  }

  if (files.length > 8) {
    throw new UploadHttpError(400, "Upload batch can include at most 8 files.");
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  if (totalBytes > maxUploadBatchBytes) {
    throw new UploadHttpError(413, "Upload batch is too large.");
  }

  return Promise.all(
    files.map(async (file) => ({
      originalName: file.name || "pasted-file",
      mimeType: normalizeUploadMimeType(file.type),
      size: file.size,
      buffer: Buffer.from(await file.arrayBuffer())
    }))
  );
}

function jsonUploadCandidates(body: unknown): UploadCandidate[] {
  const input = uploadAttachmentsSchema.parse(body);
  const totalBytes = input.files.reduce((sum, file) => sum + file.size, 0);

  if (totalBytes > maxUploadBatchBytes) {
    throw new UploadHttpError(413, "Upload batch is too large.");
  }

  return input.files.map((file) => {
    const parsed = parseUploadDataUrl(file.dataUrl);

    if (!parsed) {
      throw new UploadHttpError(400, "Invalid upload payload.");
    }

    return {
      originalName: file.name,
      mimeType: normalizeUploadMimeType(parsed.mimeType ?? file.type),
      size: file.size,
      buffer: parsed.buffer
    };
  });
}

async function uploadCandidatesFromRequest(req: Request): Promise<UploadCandidate[]> {
  if (hasMultipartContentType(req)) {
    return multipartUploadCandidates(req);
  }

  if ((req.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return jsonUploadCandidates(req.body);
  }

  throw new UploadHttpError(415, "Uploads must be sent as multipart/form-data.");
}

function validateUploadCandidate(file: UploadCandidate): { originalName: string; mimeType: string } {
  const originalName = sanitizeFileName(file.originalName);
  const extension = uploadFileExtension(originalName);
  const mimeType = normalizeUploadMimeType(file.mimeType);

  if (file.size <= 0 || file.buffer.length <= 0) {
    throw new UploadHttpError(400, "Uploaded files cannot be empty.", { fileName: originalName });
  }

  if (file.size > maxUploadBytes || file.buffer.length > maxUploadBytes) {
    throw new UploadHttpError(413, "Uploaded file is too large.", { fileName: originalName, maxBytes: maxUploadBytes });
  }

  if (file.buffer.length !== file.size) {
    throw new UploadHttpError(400, "Uploaded file size did not match the provided metadata.", { fileName: originalName });
  }

  if (!extension) {
    throw new UploadHttpError(415, "File type is not allowed.", { fileName: originalName });
  }

  if (!isUploadMimeTypeAllowed(extension, mimeType)) {
    throw new UploadHttpError(415, "File MIME type does not match the allowed type for this extension.", {
      fileName: originalName,
      mimeType
    });
  }

  return { originalName, mimeType };
}

function hasCollaborationContext(context: z.infer<typeof collaborationContextSchema> | null | undefined): boolean {
  return Boolean(
    context &&
      ((context.attachments?.length ?? 0) > 0 ||
        (context.annotations?.length ?? 0) > 0 ||
        (context.itemReferences?.length ?? 0) > 0 ||
        context.pageContext ||
        context.sourceCommentId ||
        context.sourceCommentBody ||
        (context.sourceReplies?.length ?? 0) > 0 ||
        context.sourceItemId)
  );
}

function serializeCollaborationContext(context: z.infer<typeof collaborationContextSchema> | null | undefined): string | null {
  return hasCollaborationContext(context) ? JSON.stringify(context) : null;
}

function parseCollaborationContext(contextJson: string | null | undefined): unknown {
  if (!contextJson) {
    return null;
  }

  try {
    return JSON.parse(contextJson);
  } catch {
    return null;
  }
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
  if (
    user.isAdmin ||
    record.createdByDiscordUserId === user.id ||
    record.ownerDiscordUserId === user.id ||
    isFollowingWorkItem(record.id, user.id)
  ) {
    return true;
  }

  if (record.parentId) {
    const parent = getWorkItemById(record.parentId);
    return Boolean(parent && parent.id !== record.id && canAccessWorkItem(user, parent));
  }

  return false;
}

function itemReferenceFromRecord(record: WorkItemRecord, source: ItemReferenceContextInput["source"]): ItemReferenceContextInput {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    identifier: record.localIdentifier,
    source
  };
}

function normalizeCollaborationContextForUser(
  user: SessionUser,
  context: CollaborationContextInput | null | undefined,
  currentRecord?: WorkItemRecord | null
): CollaborationContextInput | null | undefined {
  if (!context) {
    return context;
  }

  const itemReferences = new Map<string, ItemReferenceContextInput>();
  let sourceItemId = context.sourceItemId ?? null;
  let sourceItemTitle = context.sourceItemTitle ?? null;

  const addReference = (id: string | null | undefined, source: ItemReferenceContextInput["source"]) => {
    if (!id) {
      return null;
    }

    const record = getWorkItemById(id);

    if (!record || !canAccessWorkItem(user, record)) {
      return null;
    }

    const existing = itemReferences.get(record.id);
    const nextSource = existing?.source === "current_page" || source === "current_page" ? "current_page" : "mentioned";
    itemReferences.set(record.id, itemReferenceFromRecord(record, nextSource));
    return record;
  };

  const sourceRecord = addReference(sourceItemId, "current_page");

  if (sourceItemId && sourceRecord) {
    sourceItemTitle = sourceRecord.title;
  } else if (sourceItemId) {
    sourceItemId = null;
    sourceItemTitle = null;
  }

  if (currentRecord && sourceItemId === currentRecord.id) {
    sourceItemTitle = currentRecord.title;
  }

  for (const reference of context.itemReferences ?? []) {
    addReference(reference.id, reference.source);
  }

  return {
    ...context,
    itemReferences: [...itemReferences.values()].slice(0, 12),
    sourceItemId,
    sourceItemTitle
  };
}

function toWorkItemSummary(record: WorkItemRecord, viewerDiscordUserId?: string) {
  return {
    id: record.id,
    kind: record.kind,
    sequenceId: record.localSequenceId,
    identifier: record.localIdentifier,
    parentId: record.parentId,
    title: record.title,
    details: record.details,
    category: record.category,
    priority: record.priority,
    codexReasoning: record.codexReasoning,
    stage: record.stage,
    status: stageStatus(record.stage),
    taskStatus: record.taskStatus,
    taskCompletionReason: record.taskCompletionReason,
    context: parseCollaborationContext(record.contextJson),
    owner: record.ownerDiscordUserId
      ? {
          discordUserId: record.ownerDiscordUserId,
          displayName: profileDisplayName(record.ownerDiscordUserId, record.ownerDiscordUsername ?? "Assigned")
        }
      : null,
    createdBy: {
      discordUserId: record.createdByDiscordUserId,
      displayName: profileDisplayName(record.createdByDiscordUserId, record.createdByDiscordUsername)
    },
    isFollowing: viewerDiscordUserId ? isFollowingWorkItem(record.id, viewerDiscordUserId) : false,
    followersCount: countWorkItemFollowers(record.id),
    openChildTaskCount: countOpenChildTasks(record.id),
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

function toWorkItemLinkApi(link: WorkItemLinkRecord, currentWorkItemId: string, user: SessionUser) {
  const direction = link.sourceWorkItemId === currentWorkItemId ? "outgoing" : "incoming";
  const linkedItemId = direction === "outgoing" ? link.targetWorkItemId : link.sourceWorkItemId;
  const linkedItem = getWorkItemById(linkedItemId);

  if (!linkedItem || !canAccessWorkItem(user, linkedItem)) {
    return null;
  }

  return {
    id: link.id,
    relationship: link.relationship,
    direction,
    note: link.note,
    item: toWorkItemSummary(linkedItem, user.id),
    createdBy: {
      discordUserId: link.createdByDiscordUserId,
      displayName: profileDisplayName(link.createdByDiscordUserId, link.createdByDiscordUsername)
    },
    createdAt: link.createdAt,
    updatedAt: link.updatedAt
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
    context: parseCollaborationContext(comment.contextJson),
    createdAt: comment.createdAt,
    source: comment.authorType === "ai" ? "ai" : "local"
  };
}

function humanizeValue(value: string | null | undefined) {
  if (!value) {
    return "None";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizeCodexReasoning(value: CodexReasoningEffort | null | undefined) {
  return value === "xhigh" ? "Extra high" : humanizeValue(value);
}

function markdownInline(value: string) {
  return value.replace(/([\\`*_\[\]{}()#+\-.!|>])/g, "\\$1");
}

function boldMarkdownValue(value: string | null | undefined) {
  return `**${markdownInline(value ?? "None")}**`;
}

function insertSystemWorkComment(workItemId: string, body: string) {
  return insertWorkComment({
    id: crypto.randomUUID(),
    workItemId,
    parentCommentId: null,
    discordUserId: null,
    discordAvatarUrl: null,
    discordUsername: "Project Desk",
    authorType: "system",
    body
  });
}

function toUserProfileApi(profile: UserProfileRecord) {
  return {
    discordUserId: profile.discordUserId,
    discordUsername: profile.discordUsername,
    discordDisplayName: profile.discordDisplayName,
    displayName: profile.displayName,
    tagName: profile.tagName,
    avatarUrl: profile.avatarUrl,
    isAdmin: profile.isAdmin,
    notificationPreferences: profile.notificationPreferences,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

function personFromProfile(profile: UserProfileRecord): KnownPersonRecord {
  return {
    discordUserId: profile.discordUserId,
    displayName: profile.displayName,
    tagName: profile.tagName,
    avatarUrl: profile.avatarUrl,
    isAdmin: profile.isAdmin
  };
}

function projectDeskAiPerson(): KnownPersonRecord {
  return {
    discordUserId: projectDeskAiUserId,
    displayName: projectDeskAiDisplayName,
    tagName: projectDeskAiTagName,
    avatarUrl: null,
    isAdmin: false
  };
}

function withProjectDeskAiPerson(people: KnownPersonRecord[], taskRunner: AiTaskRunner): KnownPersonRecord[] {
  const filteredPeople = people.filter((person) => !isProjectDeskAiUserId(person.discordUserId));
  return taskRunner.enabled ? [projectDeskAiPerson(), ...filteredPeople] : filteredPeople;
}

function canAssignProjectDeskAi(user: SessionUser, taskRunner: AiTaskRunner): boolean {
  return taskRunner.enabled && (!taskRunner.requireAdmin || user.isAdmin);
}

function aiTaskRunnerUnavailableMessage(user: SessionUser, taskRunner: AiTaskRunner): string {
  if (!taskRunner.enabled) {
    return `${projectDeskAiDisplayName} task runner is disabled.`;
  }

  return taskRunner.requireAdmin && !user.isAdmin
    ? `Administrator role required to run ${taskRunner.label}.`
    : `${projectDeskAiDisplayName} cannot be assigned right now.`;
}

function toKnownPersonApi(person: KnownPersonRecord) {
  if (isProjectDeskAiUserId(person.discordUserId)) {
    return projectDeskAiPerson();
  }

  const profile = getUserProfile(person.discordUserId);

  if (profile) {
    return personFromProfile(profile);
  }

  return person;
}

function profileDisplayName(discordUserId: string | null | undefined, fallback: string | null | undefined): string {
  if (!discordUserId) {
    return fallback ?? "Unknown";
  }

  return getUserProfile(discordUserId)?.displayName ?? fallback ?? "Unknown";
}

function profileAvatarUrl(discordUserId: string | null | undefined, fallback: string | null | undefined): string | null {
  if (!discordUserId) {
    return fallback ?? null;
  }

  return getUserProfile(discordUserId)?.avatarUrl ?? fallback ?? null;
}

function applyProfileToSessionUser(user: SessionUser): SessionUser {
  const profile = getUserProfile(user.id);

  if (!profile) {
    return {
      ...user,
      notificationPreferences: defaultNotificationPreferences
    };
  }

  return {
    ...user,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl ?? user.avatarUrl,
    tagName: profile.tagName,
    notificationPreferences: profile.notificationPreferences,
    isAdmin: user.isAdmin
  };
}

async function hydrateWorkCommentProfiles(comments: WorkCommentRecord[], discord: DiscordService) {
  const profileCache = new Map<string, ReturnType<DiscordService["fetchUserProfile"]>>();

  return Promise.all(
    comments.map(async (comment) => {
      if (comment.authorType !== "user" || !comment.discordUserId) {
        return comment;
      }

      const localProfile = getUserProfile(comment.discordUserId);

      if (localProfile) {
        return {
          ...comment,
          discordUsername: localProfile.displayName,
          discordAvatarUrl: localProfile.avatarUrl ?? comment.discordAvatarUrl
        };
      }

      if (comment.discordAvatarUrl) {
        return comment;
      }

      if (!profileCache.has(comment.discordUserId)) {
        profileCache.set(comment.discordUserId, discord.fetchUserProfile(comment.discordUserId));
      }

      try {
        const profile = await profileCache.get(comment.discordUserId);

        if (!profile?.avatarUrl) {
          return comment;
        }

        const updated = updateWorkCommentProfile(comment.id, {
          discordUsername: profile.displayName ?? comment.discordUsername,
          discordAvatarUrl: profile.avatarUrl
        });

        upsertUserProfile({
          discordUserId: comment.discordUserId,
          discordUsername: profile.discordUsername,
          discordDisplayName: profile.displayName,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          isAdmin: false
        });

        return updated ?? {
          ...comment,
          discordUsername: profile.displayName ?? comment.discordUsername,
          discordAvatarUrl: profile.avatarUrl
        };
      } catch {
        return comment;
      }
    })
  );
}

async function hydratePeopleProfiles(discord: DiscordService) {
  try {
    for (const member of await discord.listGuildMembers()) {
      upsertUserProfile({
        discordUserId: member.discordUserId,
        discordUsername: member.discordUsername,
        discordDisplayName: member.displayName,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        isAdmin: member.isAdmin
      });
    }
  } catch {
    console.warn("Discord guild member lookup failed; using local user profiles.");
  }

  const people = listKnownPeople().map(toKnownPersonApi);

  return Promise.all(
    people.map(async (person) => {
      if (person.avatarUrl) {
        return person;
      }

      const profile = await discord.fetchUserProfile(person.discordUserId).catch(() => null);

      if (!profile) {
        return person;
      }

      const updated = upsertUserProfile({
        discordUserId: person.discordUserId,
        discordUsername: profile.discordUsername,
        discordDisplayName: profile.displayName,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        isAdmin: person.isAdmin
      });

      return personFromProfile(updated);
    })
  );
}

async function resolveKnownPerson(discord: DiscordService, discordUserId: string) {
  if (isProjectDeskAiUserId(discordUserId)) {
    return projectDeskAiPerson();
  }

  const person = listKnownPeople().map(toKnownPersonApi).find((candidate) => candidate.discordUserId === discordUserId);

  if (person) {
    return person;
  }

  const profile = await discord.fetchUserProfile(discordUserId);

  return {
    discordUserId,
    displayName: profile?.displayName ?? discordUserId,
    tagName: null,
    avatarUrl: profile?.avatarUrl ?? null,
    isAdmin: false
  };
}

function toLocalBoardItem(record: WorkItemRecord) {
  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    priority: record.priority,
    sequenceId: record.localSequenceId,
    identifier: record.localIdentifier,
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
  tagName?: string | null;
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

function compactInboxPreview(value: string, fallback = "Project Desk activity"): string {
  const preview = notificationBodyPreview(value)
    .replace(/[#*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!preview) {
    return fallback;
  }

  return preview.length > 180 ? `${preview.slice(0, 177)}...` : preview;
}

function collectKnownParticipants(record: WorkItemRecord, comments: WorkCommentRecord[]): MentionRecipient[] {
  const recipients = new Map<string, MentionRecipient>();

  recipients.set(record.createdByDiscordUserId, {
    discordUserId: record.createdByDiscordUserId,
    displayName: profileDisplayName(record.createdByDiscordUserId, record.createdByDiscordUsername)
  });

  if (record.ownerDiscordUserId) {
    recipients.set(record.ownerDiscordUserId, {
      discordUserId: record.ownerDiscordUserId,
      displayName: profileDisplayName(record.ownerDiscordUserId, record.ownerDiscordUsername ?? "Assigned")
    });
  }

  for (const comment of comments) {
    if (comment.discordUserId && comment.authorType === "user") {
      recipients.set(comment.discordUserId, {
        discordUserId: comment.discordUserId,
        displayName: profileDisplayName(comment.discordUserId, comment.discordUsername)
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

  for (const person of [...listKnownPeople().map(toKnownPersonApi), ...participants]) {
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

  if ((tokenMentions.has("assigned") || tokenMentions.has("assignee") || tokenMentions.has("owner")) && record.ownerDiscordUserId) {
    recipients.set(record.ownerDiscordUserId, {
      discordUserId: record.ownerDiscordUserId,
      displayName: profileDisplayName(record.ownerDiscordUserId, record.ownerDiscordUsername ?? "Assigned")
    });
  }

  if (tokenMentions.has("creator")) {
    recipients.set(record.createdByDiscordUserId, {
      discordUserId: record.createdByDiscordUserId,
      displayName: profileDisplayName(record.createdByDiscordUserId, record.createdByDiscordUsername)
    });
  }

  for (const participant of [...peopleById.values()]) {
    if (
      discordIds.has(participant.discordUserId) ||
      tokenMentions.has(normalizeMentionName(participant.displayName)) ||
      (participant.tagName && tokenMentions.has(normalizeMentionName(participant.tagName)))
    ) {
      recipients.set(participant.discordUserId, participant);
    }
  }

  return [...recipients.values()];
}

function inboxItemTargets(record: WorkItemRecord): Pick<InboxNotificationRecord, "projectId" | "taskId"> {
  if (record.kind === "task") {
    return {
      projectId: record.parentId,
      taskId: record.id
    };
  }

  return {
    projectId: record.id,
    taskId: null
  };
}

function inboxTargetUrl(
  workItemId: string,
  notificationId: string,
  target: Pick<InboxNotificationRecord, "commentId" | "replyId" | "annotationId">
): string {
  const hashTarget = target.annotationId
    ? `annotation-${target.annotationId}`
    : target.replyId
      ? `comment-${target.replyId}`
      : target.commentId
        ? `comment-${target.commentId}`
        : "";
  const hash = hashTarget ? `#${encodeURIComponent(hashTarget)}` : "";
  return `/items/${encodeURIComponent(workItemId)}?notification=${encodeURIComponent(notificationId)}${hash}`;
}

function createInboxNotification(input: {
  record: WorkItemRecord;
  recipientUserId: string;
  actorUserId: string;
  type: InboxNotificationType;
  previewText: string;
  commentId?: string | null;
  replyId?: string | null;
  annotationId?: string | null;
}): InboxNotificationRecord | null {
  if (input.recipientUserId === input.actorUserId || isProjectDeskAiUserId(input.recipientUserId)) {
    return null;
  }

  const id = crypto.randomUUID();
  const target = {
    commentId: input.commentId ?? null,
    replyId: input.replyId ?? null,
    annotationId: input.annotationId ?? null
  };

  return insertInboxNotification({
    id,
    recipientUserId: input.recipientUserId,
    actorUserId: input.actorUserId,
    type: input.type,
    ...inboxItemTargets(input.record),
    ...target,
    targetUrl: inboxTargetUrl(input.record.id, id, target),
    previewText: compactInboxPreview(input.previewText)
  });
}

function inboxTargetLabel(notification: InboxNotificationRecord): string {
  if (notification.annotationId) {
    return "Annotation";
  }

  if (notification.replyId) {
    return "Reply";
  }

  if (notification.commentId) {
    return "Comment";
  }

  if (notification.type === "assignment") {
    return "Assignment";
  }

  if (notification.type === "task_update" || notification.type === "ai_task_complete") {
    return "Task";
  }

  return "Activity";
}

function toInboxNotificationApi(notification: InboxNotificationRecord) {
  const project = notification.projectId ? getWorkItemById(notification.projectId) : null;
  const task = notification.taskId ? getWorkItemById(notification.taskId) : null;
  const locationParts = ["Project Desk"];

  if (project) {
    locationParts.push(project.title);
  }

  if (task && task.id !== project?.id) {
    locationParts.push(task.title);
  }

  locationParts.push(inboxTargetLabel(notification));

  return {
    id: notification.id,
    recipientUserId: notification.recipientUserId,
    actorUserId: notification.actorUserId,
    actorDisplayName: isProjectDeskAiUserId(notification.actorUserId)
      ? projectDeskAiDisplayName
      : profileDisplayName(notification.actorUserId, "Someone"),
    type: notification.type,
    projectId: notification.projectId,
    projectTitle: project?.title ?? null,
    taskId: notification.taskId,
    taskTitle: task?.title ?? null,
    commentId: notification.commentId,
    replyId: notification.replyId,
    annotationId: notification.annotationId,
    targetUrl: notification.targetUrl,
    previewText: notification.previewText,
    locationLabel: locationParts.join(" / "),
    createdAt: notification.createdAt,
    readAt: notification.readAt
  };
}

function sourceCommentRecipients(context: z.infer<typeof collaborationContextSchema> | null | undefined): MentionRecipient[] {
  const recipients = new Map<string, MentionRecipient>();
  const commentIds = [context?.sourceCommentId, ...(context?.sourceReplies?.map((reply) => reply.id) ?? [])].filter(Boolean) as string[];

  for (const commentId of commentIds) {
    const comment = getWorkCommentById(commentId);

    if (comment?.discordUserId && comment.authorType === "user") {
      recipients.set(comment.discordUserId, {
        discordUserId: comment.discordUserId,
        displayName: profileDisplayName(comment.discordUserId, comment.discordUsername)
      });
    }
  }

  return [...recipients.values()];
}

function setDevSession(req: Request, input: z.infer<typeof devSessionSchema>): SessionUser {
  const profile = upsertUserProfile({
    discordUserId: input.userId,
    discordUsername: input.username ?? input.displayName,
    discordDisplayName: input.displayName,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl || null,
    isAdmin: input.isAdmin
  });
  const updatedProfile = updateUserProfile(profile.discordUserId, {
    tagName: input.tagName ?? profile.tagName,
    avatarUrl: input.avatarUrl || profile.avatarUrl
  }) ?? profile;
  const user: SessionUser = {
    id: updatedProfile.discordUserId,
    username: updatedProfile.discordUsername ?? input.username ?? input.displayName,
    displayName: updatedProfile.displayName,
    avatarUrl: updatedProfile.avatarUrl,
    tagName: updatedProfile.tagName,
    notificationPreferences: updatedProfile.notificationPreferences,
    roles: input.isAdmin ? ["dev-admin"] : [],
    isAdmin: input.isAdmin
  };

  req.session = {
    ...getSession(req),
    user
  };
  return user;
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
  if (isProjectDeskAiUserId(input.discordUserId)) {
    return;
  }

  if (!shouldSendNotification(input.discordUserId, input.type)) {
    return;
  }

  let notification: ReturnType<typeof insertNotification> | null = null;

  try {
    notification = insertNotification({
      id: crypto.randomUUID(),
      workItemId: input.workItemId,
      discordUserId: input.discordUserId,
      type: input.type,
      channel: "dm",
      body: input.body,
      status: "pending",
      reason: null
    });
  } catch {
    console.warn("Project Desk notification recording failed.");
    return;
  }

  try {
    const result = await discord.sendDm(input.discordUserId, input.body);
    updateNotificationStatus(notification.id, result.sent ? "sent" : "failed", result.reason ?? null);
  } catch {
    try {
      updateNotificationStatus(notification.id, "failed", "DM send failed.");
    } catch {
      console.warn("Project Desk notification status update failed.");
    }
  }

  emitProjectDeskEvent({ type: "notifications_changed" });
}

async function notifyFollowers(
  discord: DiscordService,
  input: {
    workItemId: string;
    actorDiscordUserId: string;
    type: string;
    body: string;
    skipDiscordUserIds?: Iterable<string>;
  }
): Promise<void> {
  const skip = new Set([input.actorDiscordUserId, ...(input.skipDiscordUserIds ?? [])]);
  const followerIds = listWorkItemFollowerIds(input.workItemId).filter((discordUserId) => !skip.has(discordUserId));

  const results = await Promise.allSettled(
    followerIds.map((discordUserId) =>
      sendRecordedDm(discord, {
        workItemId: input.workItemId,
        discordUserId,
        type: input.type,
        body: input.body
      })
    )
  );

  if (results.some((result) => result.status === "rejected")) {
    console.warn("One or more Project Desk follower notifications failed.");
  }
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
  const guildMember = requireDiscordGuildMembership(
    await discord.fetchGuildMemberProfile(discordUser.id).catch((error: unknown) => {
      throw new DiscordGuildMembershipLookupError(error instanceof Error ? error.message : undefined);
    })
  );
  const roles = guildMember.roles;
  const displayName = guildMember.displayName || discordUser.global_name || discordUser.username;
  const avatarUrl = guildMember.avatarUrl ?? discordAvatarUrl(discordUser);
  const isAdmin = guildMember.isAdmin;

  const profile = upsertUserProfile({
    discordUserId: discordUser.id,
    discordUsername: discordUser.username,
    discordDisplayName: displayName,
    displayName,
    avatarUrl,
    isAdmin
  });

  return {
    id: discordUser.id,
    username: discordUser.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl ?? avatarUrl,
    tagName: profile.tagName,
    notificationPreferences: profile.notificationPreferences,
    roles,
    isAdmin
  };
}

function sendDiscordAuthError(res: Response, error: unknown, format: "html" | "json"): boolean {
  if (error instanceof DiscordGuildMembershipRequiredError) {
    if (format === "json") {
      res.status(403).json({ error: guildMembershipRequiredMessage });
    } else {
      res.status(403).send(guildMembershipRequiredMessage);
    }
    return true;
  }

  if (error instanceof DiscordGuildMembershipLookupError) {
    const message = "Could not verify Discord server membership. Try again in a moment.";

    if (format === "json") {
      res.status(503).json({ error: message });
    } else {
      res.status(503).send(message);
    }
    return true;
  }

  return false;
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

export function createApp({ plane, discord, aiWorker, ai, taskRunner }: CreateAppServices) {
  const app = express();
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const webDistDir = process.env.WEB_DIST_DIR ?? resolve(__dirname, "../../web/dist");
  const uploadsDir = config.uploads.dir;

  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      frameguard: false,
      originAgentCluster: false
    })
  );
  app.use(logObservedRequest);
  app.use(express.json({ limit: config.http.requestBodyLimit, verify: captureRawBody }));
  app.use(handleBodyParserError);
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

  function createUploadAttachmentsHandler(urlBase: string) {
    return async (req: Request, res: Response) => {
      const user = getSession(req).user!;
      const input = await uploadCandidatesFromRequest(req);

      mkdirSync(uploadsDir, { recursive: true });

      const attachments: AttachmentRecord[] = [];

      for (const file of input) {
        const id = crypto.randomUUID();
        const validated = validateUploadCandidate(file);
        const storagePath = resolve(uploadsDir, `${id}-${validated.originalName}`);

        if (!isPathInside(uploadsDir, storagePath)) {
          throw new UploadHttpError(400, "Invalid upload file name.", { fileName: validated.originalName });
        }

        writeFileSync(storagePath, file.buffer, { flag: "wx" });

        attachments.push(
          insertAttachment({
            id,
            uploaderDiscordUserId: user.id,
            originalName: validated.originalName,
            mimeType: validated.mimeType,
            sizeBytes: file.buffer.length,
            storagePath
          })
        );
      }

      res.status(201).json({ attachments: attachments.map((attachment) => toAttachmentApi(attachment, urlBase)) });
    };
  }

  function handleAttachmentDownload(req: Request, res: Response) {
    const id = routeParam(req.params.id);
    const record = id ? getAttachmentById(id) : null;

    if (!record || !existsSync(record.storagePath)) {
      res.status(404).json({ error: "Attachment not found." });
      return;
    }

    res.type(record.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    const disposition = shouldServeAttachmentInline(req, record) ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeContentDispositionFileName(record.originalName)}"`);
    res.sendFile(record.storagePath);
  }

  function handleRequestError(error: unknown, _req: Request, res: Response, next: NextFunction) {
    if (res.headersSent) {
      next(error);
      return;
    }

    if (error instanceof UploadHttpError) {
      res.status(error.status).json({ error: error.message, details: error.details });
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
  }

  api.post("/interactions", handleDiscordInteraction);

  api.get("/health", (_req, res) => {
    res.json({ ok: true, app: "Project Desk" });
  });

  api.get("/public-config", (_req, res) => {
    res.json({ discordClientId: config.discord.clientId });
  });

  api.post("/client-diagnostics", (req, res) => {
    logClientDiagnostic(clientDiagnosticSchema.parse(req.body));
    res.status(204).send();
  });

  api.post(["/uploads", "/upload", "/attachments"], requireAuth, createUploadAttachmentsHandler("/api/uploads"));
  api.get(["/uploads/:id/:fileName", "/attachments/:id/:fileName"], requireAuth, handleAttachmentDownload);

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

    try {
      session.user = await createSessionUser(discord, token.access_token);
    } catch (error) {
      session.user = undefined;

      if (sendDiscordAuthError(res, error, "html")) {
        return;
      }

      throw error;
    }

    session.oauthState = undefined;
    session.oauthRedirectUri = undefined;

    const returnTo = session.oauthReturnTo ?? "/";
    session.oauthReturnTo = undefined;
    res.redirect(returnTo);
  });

  api.post("/auth/discord/activity", async (req, res) => {
    const input = activityAuthSchema.parse(req.body);
    const accessToken = input.accessToken ?? (await exchangeDiscordActivityCode(input.code!)).access_token;
    let user: SessionUser;

    try {
      user = await createSessionUser(discord, accessToken);
    } catch (error) {
      if (sendDiscordAuthError(res, error, "json")) {
        return;
      }

      throw error;
    }

    getSession(req).user = user;

    res.json({
      accessToken,
      user
    });
  });

  api.post("/auth/logout", (req, res) => {
    req.session = null;
    res.status(204).send();
  });

  if (config.demoMode && config.nodeEnv !== "production" && process.env.PROJECT_DESK_DEV_AUTH === "true") {
    api.post("/dev/session", (req, res) => {
      const input = devSessionSchema.parse(req.body);
      res.json({ user: setDevSession(req, input) });
    });

    api.get("/dev/session", (req, res) => {
      const input = devSessionSchema.parse({
        userId: req.query.userId,
        username: req.query.username,
        displayName: req.query.displayName,
        tagName: req.query.tagName,
        avatarUrl: req.query.avatarUrl,
        isAdmin: req.query.isAdmin === undefined ? true : req.query.isAdmin === "true"
      });
      setDevSession(req, input);
      res.redirect(safeReturnTo(req.query.returnTo));
    });
  }

  api.get("/me", (req, res) => {
    const session = getSession(req);
    const user = session.user ? applyProfileToSessionUser(session.user) : null;

    if (user) {
      session.user = user;
    }

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
    res.json({ items: records.map((record) => toWorkItemSummary(record, user.id)) });
  });

  api.get("/work-items/recent-visits", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    runInactiveArchiveSweep();
    const visits = listRecentWorkItemVisits(user.id, 60)
      .filter((visit) => canAccessWorkItem(user, visit.workItem))
      .map((visit) => {
        const parentRecord = visit.workItem.parentId ? getWorkItemById(visit.workItem.parentId) : null;
        const parentItem =
          visit.workItem.kind === "task" && parentRecord?.kind === "project"
            ? toWorkItemSummary(parentRecord, user.id)
            : null;

        return {
          item: toWorkItemSummary(visit.workItem, user.id),
          parentItem,
          visitedAt: visit.visitedAt
        };
      });

    res.json({ visits });
  });

  api.get("/people", requireAuth, async (_req, res) => {
    res.json({ people: withProjectDeskAiPerson(await hydratePeopleProfiles(discord), taskRunner) });
  });

  api.patch("/profile", requireAuth, (req, res) => {
    const session = getSession(req);
    const user = session.user!;
    const input = updateProfileSchema.parse(req.body);
    const existing =
      getUserProfile(user.id) ??
      upsertUserProfile({
        discordUserId: user.id,
        discordUsername: user.username,
        discordDisplayName: user.displayName,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin
      });
    const profile = updateUserProfile(existing.discordUserId, {
      displayName: input.displayName,
      tagName: input.tagName,
      avatarUrl: input.avatarUrl === "" ? null : input.avatarUrl,
      notificationPreferences: input.notificationPreferences
    });

    if (!profile) {
      res.status(404).json({ error: "Profile not found." });
      return;
    }

    session.user = applyProfileToSessionUser(user);
    emitProjectDeskEvent({ type: "work_items_changed" });
    res.json({ user: session.user, profile: toUserProfileApi(profile) });
  });

  api.get("/admin/users", requireAuth, requireAdmin, async (_req, res) => {
    await hydratePeopleProfiles(discord);
    res.json({
      users: listUserProfiles().map(toUserProfileApi)
    });
  });

  api.patch("/admin/users/:discordUserId", requireAuth, requireAdmin, async (req, res) => {
    const discordUserId = routeParam(req.params.discordUserId);

    if (!discordUserId) {
      res.status(400).json({ error: "Discord user id is required." });
      return;
    }

    const input = updateProfileSchema.parse(req.body);
    const existing = getUserProfile(discordUserId);

    if (!existing) {
      const profile = await discord.fetchUserProfile(discordUserId);

      if (!profile) {
        res.status(404).json({ error: "User profile not found." });
        return;
      }

      upsertUserProfile({
        discordUserId,
        discordUsername: profile.discordUsername,
        discordDisplayName: profile.displayName,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        isAdmin: false
      });
    }

    const updated = updateUserProfile(discordUserId, {
      displayName: input.displayName,
      tagName: input.tagName,
      avatarUrl: input.avatarUrl === "" ? null : input.avatarUrl,
      notificationPreferences: input.notificationPreferences
    });

    if (!updated) {
      res.status(404).json({ error: "User profile not found." });
      return;
    }

    emitProjectDeskEvent({ type: "work_items_changed" });
    res.json({ user: toUserProfileApi(updated) });
  });

  api.get("/admin/source-sync", requireAuth, requireAdmin, (_req, res) => {
    res.json({ sync: getSourceSyncStatus() });
  });

  api.post("/admin/source-sync/:action", requireAuth, requireAdmin, (req, res) => {
    const user = getSession(req).user!;
    const action = routeParam(req.params.action);

    if (!action || !sourceSyncActions.includes(action as SourceSyncAction)) {
      res.status(400).json({ error: "Unsupported source sync action." });
      return;
    }

    const sync = startSourceSync(action as SourceSyncAction, user.displayName);
    res.status(sync.running ? 202 : sync.state === "failed" ? 409 : 200).json({ sync });
  });

  api.post("/work-items", requireAuth, async (req, res) => {
    const user = getSession(req).user!;
    const input = createWorkItemSchema.parse(req.body);
    const parent = input.parentId ? getWorkItemById(input.parentId) : null;
    const context = normalizeCollaborationContextForUser(user, input.context, parent);

    if (input.parentId && (!parent || !canAccessWorkItem(user, parent))) {
      res.status(404).json({ error: "Parent item not found." });
      return;
    }

    if (input.kind === "idea" && !input.category) {
      res.status(400).json({ error: "Category is required for ideas." });
      return;
    }

    if (input.kind === "task" && !parent) {
      res.status(400).json({ error: "Tasks must belong to an idea or project." });
      return;
    }

    if (input.kind === "task" && parent?.kind === "task") {
      res.status(400).json({ error: "Tasks can only be added to an idea or project." });
      return;
    }

    const assignToProjectDeskAi = isProjectDeskAiUserId(input.ownerDiscordUserId);

    if (assignToProjectDeskAi && input.kind !== "task") {
      res.status(400).json({ error: "Only tasks can be assigned to Project Desk AI." });
      return;
    }

    if (assignToProjectDeskAi && !canAssignProjectDeskAi(user, taskRunner)) {
      res.status(403).json({
        error: aiTaskRunnerUnavailableMessage(user, taskRunner)
      });
      return;
    }

    const owner = input.ownerDiscordUserId ? await resolveKnownPerson(discord, input.ownerDiscordUserId) : null;
    const item = insertWorkItem({
      id: crypto.randomUUID(),
      kind: input.kind,
      parentId: input.parentId ?? null,
      createdByDiscordUserId: user.id,
      createdByDiscordUsername: user.displayName,
      ownerDiscordUserId: owner?.discordUserId ?? user.id,
      ownerDiscordUsername: owner?.displayName ?? user.displayName,
      title: input.title,
      details: input.details,
      category: input.kind === "task" ? parent?.category ?? null : input.category ?? "other",
      priority: input.priority,
      codexReasoning: input.kind === "task" && assignToProjectDeskAi ? input.codexReasoning : null,
      stage: input.kind === "task" ? "active" : "review",
      taskStatus: input.kind === "task" ? "todo" : null,
      taskCompletionReason: null,
      contextJson: serializeCollaborationContext(context),
      planeIssueId: null,
      planeSequenceId: null,
      planeIdentifier: null,
      planeUrl: null
    });

    followWorkItem(item.id, user.id);

    if (item.ownerDiscordUserId && !isProjectDeskAiUserId(item.ownerDiscordUserId)) {
      followWorkItem(item.id, item.ownerDiscordUserId);
    }

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: item.id,
      type: "created",
      actorName: user.displayName,
      body: `Created ${item.kind}.`,
      metadataJson: null
    });

    const createdInboxNotifications: InboxNotificationRecord[] = [];
    const addInboxNotification = (notification: InboxNotificationRecord | null) => {
      if (notification) {
        createdInboxNotifications.push(notification);
      }
    };

    if (item.kind === "task") {
      if (item.ownerDiscordUserId && item.ownerDiscordUserId !== user.id && !isProjectDeskAiUserId(item.ownerDiscordUserId)) {
        addInboxNotification(
          createInboxNotification({
            record: item,
            recipientUserId: item.ownerDiscordUserId,
            actorUserId: user.id,
            type: "assignment",
            previewText: `${user.displayName} assigned you "${item.title}".`
          })
        );
      }

      const alreadyNotified = new Set(createdInboxNotifications.map((notification) => notification.recipientUserId));
      const taskMentionRecipients = new Map<string, MentionRecipient>();

      for (const recipient of findMentionRecipients(`${input.title}\n${input.details}`, item, [])) {
        taskMentionRecipients.set(recipient.discordUserId, recipient);
      }

      for (const annotation of context?.annotations ?? []) {
        for (const recipient of findMentionRecipients(annotation.note, item, [])) {
          taskMentionRecipients.set(recipient.discordUserId, recipient);
        }
      }

      if (context?.sourceCommentBody && parent) {
        for (const recipient of findMentionRecipients(context.sourceCommentBody, parent, [])) {
          taskMentionRecipients.set(recipient.discordUserId, recipient);
        }
      }

      for (const recipient of taskMentionRecipients.values()) {
        if (!alreadyNotified.has(recipient.discordUserId)) {
          addInboxNotification(
            createInboxNotification({
              record: item,
              recipientUserId: recipient.discordUserId,
              actorUserId: user.id,
              type: "mention",
              previewText: input.details || input.title
            })
          );
          alreadyNotified.add(recipient.discordUserId);
        }
      }

      if (context?.sourceCommentId || (context?.annotations?.length ?? 0) > 0) {
        for (const recipient of sourceCommentRecipients(context)) {
          if (!alreadyNotified.has(recipient.discordUserId)) {
            addInboxNotification(
              createInboxNotification({
                record: item,
                recipientUserId: recipient.discordUserId,
                actorUserId: user.id,
                type: "task_update",
                previewText: `${user.displayName} created task "${item.title}" from related context.`
              })
            );
            alreadyNotified.add(recipient.discordUserId);
          }
        }
      }
    }

    if (item.kind === "task" && isProjectDeskAiUserId(item.ownerDiscordUserId)) {
      taskRunner.enqueueTask(item.id, user.displayName, `Task was created assigned to ${projectDeskAiDisplayName}.`);
    } else if (item.kind === "task" && item.ownerDiscordUserId && item.ownerDiscordUserId !== user.id) {
      await sendRecordedDm(discord, {
        workItemId: item.id,
        discordUserId: item.ownerDiscordUserId,
        type: "task_assigned",
        body: `${user.displayName} assigned you "${item.title}" in Project Desk.`
      });
    }

    if (item.kind === "task" && parent) {
      await notifyFollowers(discord, {
        workItemId: parent.id,
        actorDiscordUserId: user.id,
        type: "followed_task_created",
        body: `${user.displayName} added task "${item.title}" to "${parent.title}".`,
        skipDiscordUserIds: item.ownerDiscordUserId ? [item.ownerDiscordUserId] : []
      });
    }

    if (createdInboxNotifications.length > 0) {
      emitProjectDeskEvent({ type: "notifications_changed" });
    }

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: item.id });

    res.status(201).json({
      item: toWorkItemSummary(item, user.id)
    });
  });

  api.get("/work-items/:id", requireAuth, async (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    runInactiveArchiveSweep();
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    recordWorkItemVisit(user.id, record.id);

    const comments = await hydrateWorkCommentProfiles(listWorkComments(record.id), discord);
    const parentRecord = record.parentId ? getWorkItemById(record.parentId) : null;

    res.json({
      item: {
        ...toWorkItemSummary(record, user.id),
        canOpenInPlane: user.isAdmin && Boolean(record.planeUrl)
      },
      parentItem: parentRecord && canAccessWorkItem(user, parentRecord) ? toWorkItemSummary(parentRecord, user.id) : null,
      comments: comments.map(toWorkCommentApi),
      memory: getWorkItemMemory(record.id),
      decisions: listDecisions(record.id),
      activity: listActivityEvents(record.id),
      links: listWorkItemLinksForItem(record.id)
        .map((link) => toWorkItemLinkApi(link, record.id, user))
        .filter((link): link is NonNullable<typeof link> => Boolean(link)),
      childItems: listWorkItemsByParent(record.id).map((child) => toWorkItemSummary(child, user.id))
    });
  });

  api.get("/work-items/:id/memory", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    res.json({ memory: getWorkItemMemory(record.id) });
  });

  api.patch("/work-items/:id/memory", requireAuth, requireAdmin, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    const input = updateWorkItemMemorySchema.parse(req.body);
    const memory = upsertWorkItemMemory({
      workItemId: record.id,
      body: input.body,
      updatedByDiscordUserId: user.id,
      updatedByName: user.displayName
    });

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: record.id,
      type: "memory_updated",
      actorName: user.displayName,
      body: "Updated scoped memory.",
      metadataJson: null
    });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: record.id });

    res.json({ memory });
  });

  api.post("/work-items/:id/links", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    const input = createWorkItemLinkSchema.parse(req.body);
    const target = getWorkItemById(input.targetWorkItemId);

    if (!target || !canAccessWorkItem(user, target)) {
      res.status(404).json({ error: "Linked item not found." });
      return;
    }

    if (target.id === record.id) {
      res.status(400).json({ error: "An item cannot link to itself." });
      return;
    }

    const link = insertWorkItemLink({
      id: crypto.randomUUID(),
      sourceWorkItemId: record.id,
      targetWorkItemId: target.id,
      relationship: input.relationship,
      note: input.note?.trim() || null,
      createdByDiscordUserId: user.id,
      createdByDiscordUsername: user.displayName
    });
    const linkApi = toWorkItemLinkApi(link, record.id, user);

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: record.id });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: target.id });

    res.status(201).json({ link: linkApi });
  });

  api.delete("/work-items/:id/links/:linkId", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const linkId = routeParam(req.params.linkId);
    const record = workItemId ? getWorkItemById(workItemId) : null;
    const link = linkId ? getWorkItemLinkById(linkId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    if (!link || (link.sourceWorkItemId !== record.id && link.targetWorkItemId !== record.id)) {
      res.status(404).json({ error: "Link not found." });
      return;
    }

    const linkedItemId = link.sourceWorkItemId === record.id ? link.targetWorkItemId : link.sourceWorkItemId;
    const linkedItem = getWorkItemById(linkedItemId);

    if (!linkedItem || !canAccessWorkItem(user, linkedItem)) {
      res.status(404).json({ error: "Link not found." });
      return;
    }

    const deleted = deleteWorkItemLink(link.id);

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: record.id });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: linkedItem.id });

    res.json({
      link: deleted ? toWorkItemLinkApi(deleted, record.id, user) : null
    });
  });

  function streamTaskRunnerOutput(req: Request, res: Response) {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    if (record.kind !== "task") {
      res.status(400).json({ error: "AI output is only available for tasks." });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (eventName: string, payload: unknown) => {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    const cleanupOutput = taskRunner.subscribeOutput(record.id, send);
    const heartbeat = setInterval(() => {
      res.write(`: ai-output heartbeat ${new Date().toISOString()}\n\n`);
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      cleanupOutput();
    });
  }

  function taskRunnerOutputSnapshot(req: Request, res: Response) {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    if (record.kind !== "task") {
      res.status(400).json({ error: "AI output is only available for tasks." });
      return;
    }

    res.setHeader("Cache-Control", "no-cache");
    res.json(taskRunner.getSnapshot(record.id));
  }

  api.get("/work-items/:id/ai-output", requireAuth, streamTaskRunnerOutput);
  api.get("/work-items/:id/ai-output/snapshot", requireAuth, taskRunnerOutputSnapshot);
  api.get("/work-items/:id/local-codex-output", requireAuth, streamTaskRunnerOutput);
  api.get("/work-items/:id/local-codex-output/snapshot", requireAuth, taskRunnerOutputSnapshot);

  api.post("/work-items/:id/comments", requireAuth, async (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    const input = createCommentSchema.parse(req.body);
    const context = normalizeCollaborationContextForUser(user, input.context, record);
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
      body: input.body,
      contextJson: serializeCollaborationContext(context)
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
    const createdInboxNotifications: InboxNotificationRecord[] = [];
    const inboxNotifiedUserIds = new Set<string>();
    const commentTargetId = parentComment?.id ?? comment.id;
    const replyTargetId = parentComment ? comment.id : null;
    const addInboxNotification = (notification: InboxNotificationRecord | null) => {
      if (notification) {
        createdInboxNotifications.push(notification);
        inboxNotifiedUserIds.add(notification.recipientUserId);
      }
    };
    const itemLink = config.appBaseUrl ? `${config.appBaseUrl.replace(/\/+$/, "")}/items/${record.id}` : null;
    const commentPreview = notificationBodyPreview(input.body);
    const baseDmBody = `${user.displayName} mentioned you on "${record.title}".\n\n${commentPreview}${
      itemLink ? `\n\nOpen: ${itemLink}` : "\n\nOpen Project Desk to reply."
    }`;

    for (const recipient of findMentionRecipients(input.body, record, [...existingComments, comment])) {
      if (recipient.discordUserId !== user.id) {
        dmTargets.set(recipient.discordUserId, { type: "mention", body: baseDmBody });
        addInboxNotification(
          createInboxNotification({
            record,
            recipientUserId: recipient.discordUserId,
            actorUserId: user.id,
            type: "mention",
            commentId: commentTargetId,
            replyId: replyTargetId,
            previewText: input.body
          })
        );
      }
    }

    for (const annotation of context?.annotations ?? []) {
      for (const recipient of findMentionRecipients(annotation.note, record, [...existingComments, comment])) {
        if (recipient.discordUserId !== user.id && !inboxNotifiedUserIds.has(recipient.discordUserId)) {
          addInboxNotification(
            createInboxNotification({
              record,
              recipientUserId: recipient.discordUserId,
              actorUserId: user.id,
              type: "annotation",
              commentId: commentTargetId,
              replyId: replyTargetId,
              annotationId: annotation.id,
              previewText: annotation.note || input.body
            })
          );
        }
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

    if (parentComment?.discordUserId && parentComment.discordUserId !== user.id && !inboxNotifiedUserIds.has(parentComment.discordUserId)) {
      addInboxNotification(
        createInboxNotification({
          record,
          recipientUserId: parentComment.discordUserId,
          actorUserId: user.id,
          type: "reply",
          commentId: parentComment.id,
          replyId: comment.id,
          previewText: input.body
        })
      );
    }

    for (const followerId of listWorkItemFollowerIds(record.id)) {
      if (followerId !== user.id && !dmTargets.has(followerId)) {
        dmTargets.set(followerId, {
          type: "followed_comment",
          body: `${user.displayName} commented on followed item "${record.title}".\n\n${commentPreview}${
            itemLink ? `\n\nOpen: ${itemLink}` : "\n\nOpen Project Desk to reply."
          }`
        });
      }
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

    if (createdInboxNotifications.length > 0) {
      emitProjectDeskEvent({ type: "notifications_changed" });
    }

    if (mentionsAi(input.body) && !isArchivedStage(record.stage)) {
      if (record.kind === "task") {
        if (canAssignProjectDeskAi(user, taskRunner)) {
          const queued = taskRunner.enqueueTask(record.id, user.displayName, `@AI was mentioned by ${user.displayName}.`);

          if (!queued.queued && queued.reason) {
            insertSystemWorkComment(record.id, queued.reason);
          }
        } else {
          insertSystemWorkComment(
            record.id,
            `${projectDeskAiDisplayName} was mentioned, but ${aiTaskRunnerUnavailableMessage(user, taskRunner)}`
          );
        }
      } else {
        aiWorker.enqueueWorkItemJob(record.id, "comment_review", `@AI was mentioned by ${user.displayName}.`);
      }
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

    if (record.stage !== updated.stage) {
      insertSystemWorkComment(
        updated.id,
        `${markdownInline(user.displayName)} changed phase from ${boldMarkdownValue(stageDefinition(record.stage).name)} to ${boldMarkdownValue(
          stageDefinition(updated.stage).name
        )}.`
      );
    }

    if (["parked", "done"].includes(updated.stage)) {
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
      item: toWorkItemSummary(updated, user.id)
    });
  });

  api.patch("/work-items/:id/follow", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    const input = updateFollowSchema.parse(req.body);

    if (input.following) {
      followWorkItem(record.id, user.id);
    } else {
      unfollowWorkItem(record.id, user.id);
    }

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: record.id });

    const updated = getWorkItemById(record.id) ?? record;
    res.json({ item: toWorkItemSummary(updated, user.id) });
  });

  api.post("/work-items/:id/title-suggestion", requireAuth, async (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    const parentItem = record.parentId ? getWorkItemById(record.parentId) : null;
    const siblingItems = parentItem ? listWorkItemsByParent(parentItem.id).filter((item) => item.id !== record.id) : [];

    try {
      const suggestion = await ai.suggestTitle({
        workItem: record,
        comments: listWorkComments(record.id),
        artifacts: listAiArtifacts(record.id),
        childItems: listWorkItemsByParent(record.id),
        parentItem,
        siblingItems
      });

      res.json({
        suggestion: {
          title: suggestion.title,
          reason: suggestion.reason
        }
      });
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        res.status(503).json({ error: error.message });
        return;
      }

      throw error;
    }
  });

  api.patch("/work-items/:id/title", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    const input = updateWorkItemTitleSchema.parse(req.body);

    if (record.title === input.title) {
      res.json({ item: toWorkItemSummary(record, user.id) });
      return;
    }

    const updated = updateWorkItemTitle(record.id, input.title);

    if (!updated) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: updated.id,
      type: "title_changed",
      actorName: user.displayName,
      body: `Renamed from ${record.title} to ${updated.title}.`,
      metadataJson: JSON.stringify({ from: record.title, to: updated.title })
    });
    insertSystemWorkComment(
      updated.id,
      `${markdownInline(user.displayName)} renamed this ${updated.kind} from ${boldMarkdownValue(record.title)} to ${boldMarkdownValue(updated.title)}.`
    );

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: updated.id });

    res.json({ item: toWorkItemSummary(updated, user.id) });
  });

  api.patch("/work-items/:id/category", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    if (record.kind !== "idea" && record.kind !== "project") {
      res.status(400).json({ error: "Only ideas and projects have categories." });
      return;
    }

    const input = updateCategorySchema.parse(req.body);
    const updated = updateWorkItemCategory(record.id, input.category);

    if (!updated) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: updated.id,
      type: "category_changed",
      actorName: user.displayName,
      body: `Changed category to ${input.category}.`,
      metadataJson: JSON.stringify({ from: record.category, to: updated.category })
    });

    if (record.category !== updated.category) {
      insertSystemWorkComment(
        updated.id,
        `${markdownInline(user.displayName)} changed category from ${boldMarkdownValue(humanizeValue(record.category))} to ${boldMarkdownValue(
          humanizeValue(updated.category)
        )}.`
      );
    }

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: updated.id });

    res.json({ item: toWorkItemSummary(updated, user.id) });
  });

  api.patch("/work-items/:id/priority", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    const input = updatePrioritySchema.parse(req.body);
    const updated = updateWorkItemPriority(record.id, input.priority);

    if (!updated) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: updated.id,
      type: "priority_changed",
      actorName: user.displayName,
      body: `Changed priority to ${input.priority}.`,
      metadataJson: JSON.stringify({ from: record.priority, to: updated.priority })
    });

    if (record.priority !== updated.priority) {
      insertSystemWorkComment(
        updated.id,
        `${markdownInline(user.displayName)} changed priority from ${boldMarkdownValue(humanizeValue(record.priority))} to ${boldMarkdownValue(
          humanizeValue(updated.priority)
        )}.`
      );
    }

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: updated.id });

    res.json({ item: toWorkItemSummary(updated, user.id) });
  });

  api.patch("/work-items/:id/assignee", requireAuth, async (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    const input = updateAssigneeSchema.parse(req.body);
    const assignToProjectDeskAi = isProjectDeskAiUserId(input.discordUserId);

    if (assignToProjectDeskAi && record.kind !== "task") {
      res.status(400).json({ error: "Only tasks can be assigned to Project Desk AI." });
      return;
    }

    if (assignToProjectDeskAi && !canAssignProjectDeskAi(user, taskRunner)) {
      res.status(403).json({
        error: aiTaskRunnerUnavailableMessage(user, taskRunner)
      });
      return;
    }

    const assignee = input.discordUserId ? await resolveKnownPerson(discord, input.discordUserId) : null;
    const nextCodexReasoning = assignToProjectDeskAi ? input.codexReasoning : null;
    const updated = updateWorkItemOwner(record.id, {
      ownerDiscordUserId: assignee?.discordUserId ?? null,
      ownerDiscordUsername: assignee?.displayName ?? null,
      codexReasoning: nextCodexReasoning
    });

    if (!updated) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    if (assignee && !isProjectDeskAiUserId(assignee.discordUserId)) {
      followWorkItem(updated.id, assignee.discordUserId);
    }

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: updated.id,
      type: "assignee_changed",
      actorName: user.displayName,
      body: assignee ? `Assigned to ${assignee.displayName}.` : "Cleared assignment.",
      metadataJson: JSON.stringify({
        from: record.ownerDiscordUserId,
        to: updated.ownerDiscordUserId,
        codexReasoning: updated.codexReasoning
      })
    });

    if (record.ownerDiscordUserId !== updated.ownerDiscordUserId) {
      insertSystemWorkComment(
        updated.id,
        `${markdownInline(user.displayName)} changed assigned to from ${boldMarkdownValue(
          record.ownerDiscordUsername ?? "Unassigned"
        )} to ${boldMarkdownValue(updated.ownerDiscordUsername ?? "Unassigned")}.`
      );
    }

    if (isProjectDeskAiUserId(updated.ownerDiscordUserId) && record.codexReasoning !== updated.codexReasoning) {
      insertSystemWorkComment(
        updated.id,
        `${markdownInline(user.displayName)} changed AI reasoning from ${boldMarkdownValue(
          humanizeCodexReasoning(record.codexReasoning)
        )} to ${boldMarkdownValue(humanizeCodexReasoning(updated.codexReasoning))}.`
      );
    }

    if (assignToProjectDeskAi && record.ownerDiscordUserId !== updated.ownerDiscordUserId) {
      taskRunner.enqueueTask(updated.id, user.displayName, `${user.displayName} assigned this task to ${projectDeskAiDisplayName}.`);
    } else if (assignee && assignee.discordUserId !== user.id && assignee.discordUserId !== record.ownerDiscordUserId) {
      const inboxNotification = createInboxNotification({
        record: updated,
        recipientUserId: assignee.discordUserId,
        actorUserId: user.id,
        type: "assignment",
        previewText: `${user.displayName} assigned you "${updated.title}".`
      });

      if (inboxNotification) {
        emitProjectDeskEvent({ type: "notifications_changed" });
      }

      await sendRecordedDm(discord, {
        workItemId: updated.id,
        discordUserId: assignee.discordUserId,
        type: "item_assigned",
        body: `${user.displayName} assigned you "${updated.title}" in Project Desk.`
      });
    }

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: updated.id });

    res.json({ item: toWorkItemSummary(updated, user.id) });
  });

  api.post("/work-items/:id/promote", requireAuth, async (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    if (record.kind !== "idea") {
      res.status(400).json({ error: "Only ideas can be promoted to projects." });
      return;
    }

    const updated = promoteIdeaToProject(record.id);

    if (!updated) {
      res.status(404).json({ error: "Idea not found." });
      return;
    }

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: updated.id,
      type: "promoted_to_project",
      actorName: user.displayName,
      body: "Promoted idea to project.",
      metadataJson: JSON.stringify({ from: record.kind, to: updated.kind, stage: updated.stage })
    });

    await notifyFollowers(discord, {
      workItemId: updated.id,
      actorDiscordUserId: user.id,
      type: "followed_item_promoted",
      body: `${user.displayName} promoted "${updated.title}" to a project.`
    });

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: updated.id });

    res.json({ item: toWorkItemSummary(updated, user.id) });
  });

  api.patch("/work-items/:id/task-status", requireAuth, async (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record || !canAccessWorkItem(user, record)) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    if (record.kind !== "task") {
      res.status(400).json({ error: "Only tasks have task status." });
      return;
    }

    const input = updateTaskStatusSchema.parse(req.body);
    const completionReason: TaskCompletionReason | null = input.taskStatus === "complete" ? input.completionReason ?? "done" : null;
    const updated = updateWorkItemTaskStatus(record.id, input.taskStatus, completionReason);

    if (!updated) {
      res.status(404).json({ error: "Task not found." });
      return;
    }

    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: updated.id,
      type: "task_status_changed",
      actorName: user.displayName,
      body:
        input.taskStatus === "complete"
          ? `Marked complete (${completionReason}).`
          : `Moved to ${input.taskStatus === "todo" ? "To do" : "In progress"}.`,
      metadataJson: JSON.stringify({ from: record.taskStatus, to: updated.taskStatus, completionReason })
    });

    await notifyFollowers(discord, {
      workItemId: updated.id,
      actorDiscordUserId: user.id,
      type: "followed_task_status",
      body: `${user.displayName} updated task "${updated.title}" to ${
        updated.taskStatus === "complete" ? `Complete (${updated.taskCompletionReason ?? "done"})` : updated.taskStatus === "todo" ? "To do" : "In progress"
      }.`
    });

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: updated.id });

    res.json({ item: toWorkItemSummary(updated, user.id) });
  });

  api.delete("/work-items/:id", requireAuth, requireAdmin, (req, res) => {
    const user = getSession(req).user!;
    const workItemId = routeParam(req.params.id);
    const record = workItemId ? getWorkItemById(workItemId) : null;

    if (!record) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    const result = deleteWorkItemTree(record.id);

    if (result.deletedIds.length === 0) {
      res.status(404).json({ error: "Work item not found." });
      return;
    }

    console.info(`Administrator ${user.displayName} deleted ${result.deletedIds.length} Project Desk item(s).`);

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: record.id });

    res.json({
      deletedCount: result.deletedIds.length,
      deletedIds: result.deletedIds,
      parentId: record.parentId,
      kind: record.kind
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

  api.get("/inbox", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    res.json({
      notifications: listInboxNotificationsForUser(user.id).map(toInboxNotificationApi),
      unreadCount: countUnreadInboxNotifications(user.id)
    });
  });

  api.get("/inbox/unread-count", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    res.json({ unreadCount: countUnreadInboxNotifications(user.id) });
  });

  api.patch("/inbox/:id/read", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const notificationId = routeParam(req.params.id);
    const notification = notificationId ? markInboxNotificationRead(notificationId, user.id) : null;

    if (!notification) {
      res.status(404).json({ error: "Inbox notification not found." });
      return;
    }

    emitProjectDeskEvent({ type: "notifications_changed" });
    res.json({
      notification: toInboxNotificationApi(notification),
      unreadCount: countUnreadInboxNotifications(user.id)
    });
  });

  api.post("/inbox/read-target", requireAuth, (req, res) => {
    const user = getSession(req).user!;
    const target = inboxReadTargetSchema.parse(req.body);
    const changed = markInboxNotificationsReadForTarget(user.id, target);

    if (changed > 0) {
      emitProjectDeskEvent({ type: "notifications_changed" });
    }

    res.json({
      readCount: changed,
      unreadCount: countUnreadInboxNotifications(user.id)
    });
  });

  api.post("/inbox/mark-all-read", requireAuth, (_req, res) => {
    const user = getSession(_req).user!;
    const changed = markAllInboxNotificationsRead(user.id);

    if (changed > 0) {
      emitProjectDeskEvent({ type: "notifications_changed" });
    }

    res.json({
      readCount: changed,
      unreadCount: countUnreadInboxNotifications(user.id)
    });
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
    const boardWorkItems = workItems.filter((item) => item.kind === "project");
    const recentItems = workItems.slice(0, 25).map((item) => toWorkItemSummary(item, user.id));

    res.json({
      boardUrl: user.isAdmin ? config.plane.fullBoardUrl : null,
      states: workStageDefinitions.map((stage) => ({
        id: stage.id,
        name: stage.name,
        group: stage.group,
        color: stage.color
      })),
      workItems: boardWorkItems.map(toLocalBoardItem),
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

    if (current.stage !== updated.stage) {
      insertSystemWorkComment(
        updated.id,
        `${markdownInline(user.displayName)} changed phase from ${boldMarkdownValue(stageDefinition(current.stage).name)} to ${boldMarkdownValue(
          stageDefinition(updated.stage).name
        )}.`
      );
    }

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: updated.id });

    res.json({ workItem: toLocalBoardItem(updated) });
  });

  api.use((_req, res) => {
    res.status(404).json({ error: "API route not found." });
  });

  api.use(handleRequestError);

  app.post("/uploads", requireAuth, createUploadAttachmentsHandler("/uploads"));
  app.get("/uploads/:id/:fileName", requireAuth, handleAttachmentDownload);
  app.use("/api", api);
  app.use(handleRequestError);

  if (existsSync(webDistDir)) {
    app.use(express.static(webDistDir));
    app.get(/.*/, (_req, res) => {
      res.sendFile(resolve(webDistDir, "index.html"));
    });
  }

  return app;
}
