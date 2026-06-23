import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { config } from "./config.js";
import type {
  AiJobType,
  CodexReasoningEffort,
  NotificationPreferences,
  IdeaCategory,
  RequestPriority,
  RequestType,
  TaskCompletionReason,
  TaskStatus,
  WorkItemKind,
  WorkStage
} from "./domain.js";
import { defaultNotificationPreferences } from "./domain.js";

export interface RequestRecord {
  id: string;
  discordUserId: string;
  discordUsername: string;
  discordAvatarUrl: string | null;
  title: string;
  type: RequestType;
  priority: RequestPriority;
  details: string;
  planeIssueId: string;
  planeSequenceId: number | null;
  planeIdentifier: string | null;
  planeUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentRecord {
  id: string;
  requestId: string;
  discordUserId: string;
  discordUsername: string;
  body: string;
  planeCommentId: string | null;
  createdAt: string;
}

export interface DemoWorkItemRecord {
  id: string;
  requestId: string | null;
  name: string;
  priority: RequestPriority | null;
  sequenceId: number;
  identifier: string;
  stateId: string;
  stateName: string;
  stateGroup: string;
  stateColor: string;
  url: string;
  details: string;
  submitter: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkCommentAuthorType = "user" | "ai" | "system";
export type AiJobStatus = "pending" | "running" | "succeeded" | "failed";
export type NotificationStatus = "pending" | "sent" | "failed";
export type InboxNotificationType = "mention" | "reply" | "assignment" | "task_update" | "annotation" | "ai_task_complete";
export type WorkItemLinkRelationship = "relates_to" | "blocked_by" | "blocks" | "caused_by" | "causes" | "duplicates";

export interface WorkItemRecord {
  id: string;
  kind: WorkItemKind;
  localSequenceId: number | null;
  localIdentifier: string | null;
  parentId: string | null;
  createdByDiscordUserId: string;
  createdByDiscordUsername: string;
  ownerDiscordUserId: string | null;
  ownerDiscordUsername: string | null;
  title: string;
  details: string;
  category: IdeaCategory | null;
  priority: RequestPriority;
  codexReasoning: CodexReasoningEffort | null;
  stage: WorkStage;
  taskStatus: TaskStatus | null;
  taskCompletionReason: TaskCompletionReason | null;
  contextJson?: string | null;
  planeIssueId: string | null;
  planeSequenceId: number | null;
  planeIdentifier: string | null;
  planeUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemFollowerRecord {
  workItemId: string;
  discordUserId: string;
  createdAt: string;
}

export interface WorkItemVisitRecord {
  discordUserId: string;
  workItemId: string;
  visitedAt: string;
  workItem: WorkItemRecord;
}

export interface WorkItemLinkRecord {
  id: string;
  sourceWorkItemId: string;
  targetWorkItemId: string;
  relationship: WorkItemLinkRelationship;
  note: string | null;
  createdByDiscordUserId: string;
  createdByDiscordUsername: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemMemoryRecord {
  workItemId: string;
  body: string;
  updatedByDiscordUserId: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkCommentRecord {
  id: string;
  workItemId: string;
  parentCommentId: string | null;
  discordUserId: string | null;
  discordAvatarUrl: string | null;
  discordUsername: string;
  authorType: WorkCommentAuthorType;
  body: string;
  contextJson?: string | null;
  createdAt: string;
}

export interface AttachmentRecord {
  id: string;
  uploaderDiscordUserId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  createdAt: string;
}

export interface AiArtifactRecord {
  id: string;
  workItemId: string;
  type: AiJobType;
  title: string;
  body: string;
  rawJson: string | null;
  createdAt: string;
}

export interface DecisionRecord {
  id: string;
  workItemId: string;
  decision: string;
  actorDiscordUserId: string | null;
  actorName: string;
  rationale: string | null;
  createdAt: string;
}

export interface ActivityEventRecord {
  id: string;
  workItemId: string;
  type: string;
  actorName: string;
  body: string;
  metadataJson: string | null;
  createdAt: string;
}

interface InsertWorkCommentOptions {
  reopenCompletedTask?: boolean;
}

export interface NotificationRecord {
  id: string;
  workItemId: string | null;
  discordUserId: string;
  type: string;
  channel: "dm";
  body: string;
  status: NotificationStatus;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboxNotificationRecord {
  id: string;
  recipientUserId: string;
  actorUserId: string;
  type: InboxNotificationType;
  projectId: string | null;
  taskId: string | null;
  commentId: string | null;
  replyId: string | null;
  annotationId: string | null;
  targetUrl: string;
  previewText: string;
  createdAt: string;
  readAt: string | null;
}

export interface KnownPersonRecord {
  discordUserId: string;
  displayName: string;
  tagName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export interface UserProfileRecord {
  discordUserId: string;
  discordUsername: string | null;
  discordDisplayName: string | null;
  displayName: string;
  tagName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  notificationPreferences: NotificationPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface AiJobRecord {
  id: string;
  workItemId: string | null;
  type: AiJobType;
  status: AiJobStatus;
  reason: string;
  attempts: number;
  lastError: string | null;
  runAfter: string;
  createdAt: string;
  updatedAt: string;
}

interface RequestRow {
  id: string;
  discord_user_id: string;
  discord_username: string;
  discord_avatar_url: string | null;
  title: string;
  type: RequestType;
  priority: RequestPriority;
  details: string;
  plane_issue_id: string;
  plane_sequence_id: number | null;
  plane_identifier: string | null;
  plane_url: string | null;
  created_at: string;
  updated_at: string;
}

interface CommentRow {
  id: string;
  request_id: string;
  discord_user_id: string;
  discord_username: string;
  body: string;
  plane_comment_id: string | null;
  created_at: string;
}

interface DemoWorkItemRow {
  id: string;
  request_id: string | null;
  name: string;
  priority: RequestPriority | null;
  sequence_id: number;
  identifier: string;
  state_id: string;
  state_name: string;
  state_group: string;
  state_color: string;
  url: string;
  details: string;
  submitter: string;
  created_at: string;
  updated_at: string;
}

interface WorkItemRow {
  id: string;
  kind: WorkItemKind;
  local_sequence_id: number | null;
  local_identifier: string | null;
  parent_id: string | null;
  created_by_discord_user_id: string;
  created_by_discord_username: string;
  owner_discord_user_id: string | null;
  owner_discord_username: string | null;
  title: string;
  details: string;
  category: IdeaCategory | null;
  priority: RequestPriority;
  codex_reasoning: CodexReasoningEffort | null;
  stage: WorkStage;
  task_status: TaskStatus | null;
  task_completion_reason: TaskCompletionReason | null;
  context_json: string | null;
  plane_issue_id: string | null;
  plane_sequence_id: number | null;
  plane_identifier: string | null;
  plane_url: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkItemLinkRow {
  id: string;
  source_work_item_id: string;
  target_work_item_id: string;
  relationship: WorkItemLinkRelationship;
  note: string | null;
  created_by_discord_user_id: string;
  created_by_discord_username: string;
  created_at: string;
  updated_at: string;
}

interface WorkItemMemoryRow {
  work_item_id: string;
  body: string;
  updated_by_discord_user_id: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkCommentRow {
  id: string;
  work_item_id: string;
  parent_comment_id: string | null;
  discord_user_id: string | null;
  discord_avatar_url: string | null;
  discord_username: string;
  author_type: WorkCommentAuthorType;
  body: string;
  context_json: string | null;
  created_at: string;
}

interface AttachmentRow {
  id: string;
  uploader_discord_user_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
}

interface AiArtifactRow {
  id: string;
  work_item_id: string;
  type: AiJobType;
  title: string;
  body: string;
  raw_json: string | null;
  created_at: string;
}

interface DecisionRow {
  id: string;
  work_item_id: string;
  decision: string;
  actor_discord_user_id: string | null;
  actor_name: string;
  rationale: string | null;
  created_at: string;
}

interface ActivityEventRow {
  id: string;
  work_item_id: string;
  type: string;
  actor_name: string;
  body: string;
  metadata_json: string | null;
  created_at: string;
}

interface NotificationRow {
  id: string;
  work_item_id: string | null;
  discord_user_id: string;
  type: string;
  channel: "dm";
  body: string;
  status: NotificationStatus;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface InboxNotificationRow {
  id: string;
  recipient_user_id: string;
  actor_user_id: string;
  type: InboxNotificationType;
  project_id: string | null;
  task_id: string | null;
  comment_id: string | null;
  reply_id: string | null;
  annotation_id: string | null;
  target_url: string;
  preview_text: string;
  created_at: string;
  read_at: string | null;
}

interface UserProfileRow {
  discord_user_id: string;
  discord_username: string | null;
  discord_display_name: string | null;
  display_name: string;
  tag_name: string | null;
  avatar_url: string | null;
  is_admin: number;
  notification_prefs_json: string | null;
  created_at: string;
  updated_at: string;
}

interface AiJobRow {
  id: string;
  work_item_id: string | null;
  type: AiJobType;
  status: AiJobStatus;
  reason: string;
  attempts: number;
  last_error: string | null;
  run_after: string;
  created_at: string;
  updated_at: string;
}

function databasePathFromUrl(databaseUrl: string): string {
  if (databaseUrl.startsWith("file:")) {
    return databaseUrl.slice("file:".length);
  }

  if (databaseUrl.startsWith("sqlite://")) {
    return databaseUrl.slice("sqlite://".length);
  }

  return databaseUrl;
}

function toAbsoluteDatabasePath(databaseUrl: string): string {
  const path = databasePathFromUrl(databaseUrl);
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) ? path : resolve(process.cwd(), path);
}

const databasePath = toAbsoluteDatabasePath(config.databaseUrl);
mkdirSync(dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    discord_user_id TEXT NOT NULL,
    discord_username TEXT NOT NULL,
    discord_avatar_url TEXT,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    priority TEXT NOT NULL,
    details TEXT NOT NULL,
    plane_issue_id TEXT NOT NULL,
    plane_sequence_id INTEGER,
    plane_identifier TEXT,
    plane_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_requests_discord_user_id
    ON requests(discord_user_id);

  CREATE INDEX IF NOT EXISTS idx_requests_plane_issue_id
    ON requests(plane_issue_id);

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    discord_user_id TEXT NOT NULL,
    discord_username TEXT NOT NULL,
    body TEXT NOT NULL,
    plane_comment_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_comments_request_id
    ON comments(request_id);

  CREATE TABLE IF NOT EXISTS demo_work_items (
    id TEXT PRIMARY KEY,
    request_id TEXT UNIQUE,
    name TEXT NOT NULL,
    priority TEXT,
    sequence_id INTEGER NOT NULL,
    identifier TEXT NOT NULL,
    state_id TEXT NOT NULL,
    state_name TEXT NOT NULL,
    state_group TEXT NOT NULL,
    state_color TEXT NOT NULL,
    url TEXT NOT NULL,
    details TEXT NOT NULL,
    submitter TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_demo_work_items_request_id
    ON demo_work_items(request_id);

  CREATE INDEX IF NOT EXISTS idx_demo_work_items_sequence_id
    ON demo_work_items(sequence_id);

  CREATE TABLE IF NOT EXISTS work_items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    local_sequence_id INTEGER,
    local_identifier TEXT,
    parent_id TEXT,
    created_by_discord_user_id TEXT NOT NULL,
    created_by_discord_username TEXT NOT NULL,
    owner_discord_user_id TEXT,
    owner_discord_username TEXT,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    category TEXT,
    priority TEXT NOT NULL,
    codex_reasoning TEXT,
    stage TEXT NOT NULL,
    task_status TEXT,
    task_completion_reason TEXT,
    context_json TEXT,
    plane_issue_id TEXT,
    plane_sequence_id INTEGER,
    plane_identifier TEXT,
    plane_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES work_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_work_items_parent_id
    ON work_items(parent_id);

  CREATE INDEX IF NOT EXISTS idx_work_items_created_by
    ON work_items(created_by_discord_user_id);

  CREATE INDEX IF NOT EXISTS idx_work_items_owner
    ON work_items(owner_discord_user_id);

  CREATE INDEX IF NOT EXISTS idx_work_items_stage
    ON work_items(stage);

  CREATE TABLE IF NOT EXISTS work_item_follows (
    work_item_id TEXT NOT NULL,
    discord_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (work_item_id, discord_user_id),
    FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_work_item_follows_discord_user_id
    ON work_item_follows(discord_user_id);

  CREATE TABLE IF NOT EXISTS work_item_visits (
    discord_user_id TEXT NOT NULL,
    work_item_id TEXT NOT NULL,
    visited_at TEXT NOT NULL,
    PRIMARY KEY (discord_user_id, work_item_id),
    FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_work_item_visits_user_visited_at
    ON work_item_visits(discord_user_id, visited_at DESC);

  CREATE TABLE IF NOT EXISTS work_item_links (
    id TEXT PRIMARY KEY,
    source_work_item_id TEXT NOT NULL,
    target_work_item_id TEXT NOT NULL,
    relationship TEXT NOT NULL,
    note TEXT,
    created_by_discord_user_id TEXT NOT NULL,
    created_by_discord_username TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (source_work_item_id, target_work_item_id, relationship),
    FOREIGN KEY (source_work_item_id) REFERENCES work_items(id) ON DELETE CASCADE,
    FOREIGN KEY (target_work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_work_item_links_source
    ON work_item_links(source_work_item_id, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_work_item_links_target
    ON work_item_links(target_work_item_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS work_item_memories (
    work_item_id TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    updated_by_discord_user_id TEXT,
    updated_by_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS work_comments (
    id TEXT PRIMARY KEY,
    work_item_id TEXT NOT NULL,
    parent_comment_id TEXT,
    discord_user_id TEXT,
    discord_avatar_url TEXT,
    discord_username TEXT NOT NULL,
    author_type TEXT NOT NULL,
    body TEXT NOT NULL,
    context_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_work_comments_work_item_id
    ON work_comments(work_item_id);

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    uploader_discord_user_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_attachments_uploader
    ON attachments(uploader_discord_user_id);

  CREATE TABLE IF NOT EXISTS ai_artifacts (
    id TEXT PRIMARY KEY,
    work_item_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    raw_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ai_artifacts_work_item_id
    ON ai_artifacts(work_item_id);

  CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    work_item_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    actor_discord_user_id TEXT,
    actor_name TEXT NOT NULL,
    rationale TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_decisions_work_item_id
    ON decisions(work_item_id);

  CREATE TABLE IF NOT EXISTS activity_events (
    id TEXT PRIMARY KEY,
    work_item_id TEXT NOT NULL,
    type TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    body TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_activity_events_work_item_id
    ON activity_events(work_item_id);

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    work_item_id TEXT,
    discord_user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    channel TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_discord_user_id
    ON notifications(discord_user_id);

  CREATE INDEX IF NOT EXISTS idx_notifications_status
    ON notifications(status);

  CREATE TABLE IF NOT EXISTS inbox_notifications (
    id TEXT PRIMARY KEY,
    recipient_user_id TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    project_id TEXT,
    task_id TEXT,
    comment_id TEXT,
    reply_id TEXT,
    annotation_id TEXT,
    target_url TEXT NOT NULL,
    preview_text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT,
    FOREIGN KEY (project_id) REFERENCES work_items(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES work_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_inbox_notifications_recipient_created
    ON inbox_notifications(recipient_user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_inbox_notifications_recipient_read
    ON inbox_notifications(recipient_user_id, read_at);

  CREATE INDEX IF NOT EXISTS idx_inbox_notifications_target_item
    ON inbox_notifications(recipient_user_id, task_id, project_id);

  CREATE INDEX IF NOT EXISTS idx_inbox_notifications_target_comment
    ON inbox_notifications(recipient_user_id, comment_id, reply_id, annotation_id);

  CREATE TABLE IF NOT EXISTS user_profiles (
    discord_user_id TEXT PRIMARY KEY,
    discord_username TEXT,
    discord_display_name TEXT,
    display_name TEXT NOT NULL,
    tag_name TEXT,
    avatar_url TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    notification_prefs_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_user_profiles_display_name
    ON user_profiles(display_name);

  CREATE TABLE IF NOT EXISTS ai_jobs (
    id TEXT PRIMARY KEY,
    work_item_id TEXT,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    last_error TEXT,
    run_after TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ai_jobs_status_run_after
    ON ai_jobs(status, run_after);
`);

function addColumnIfMissing(tableName: string, columnName: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

addColumnIfMissing("work_comments", "parent_comment_id", "TEXT");
addColumnIfMissing("work_comments", "discord_avatar_url", "TEXT");
addColumnIfMissing("work_comments", "context_json", "TEXT");
addColumnIfMissing("work_items", "category", "TEXT");
addColumnIfMissing("work_items", "codex_reasoning", "TEXT");
addColumnIfMissing("work_items", "task_status", "TEXT");
addColumnIfMissing("work_items", "task_completion_reason", "TEXT");
addColumnIfMissing("work_items", "context_json", "TEXT");
addColumnIfMissing("work_items", "local_sequence_id", "INTEGER");
addColumnIfMissing("work_items", "local_identifier", "TEXT");
backfillWorkItemLocalIdentifiers();
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_work_items_local_identifier
    ON work_items(local_identifier);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_work_items_local_sequence_id
    ON work_items(local_sequence_id);

  CREATE INDEX IF NOT EXISTS idx_work_items_kind_local_sequence
    ON work_items(kind, local_sequence_id);

  CREATE INDEX IF NOT EXISTS idx_work_items_task_status
    ON work_items(task_status);

  CREATE INDEX IF NOT EXISTS idx_work_comments_parent_comment_id
    ON work_comments(parent_comment_id);

  UPDATE work_items
  SET task_status = 'todo'
  WHERE kind = 'task'
    AND task_status IS NULL;

  UPDATE work_items
  SET category = 'other'
  WHERE kind IN ('idea', 'project')
    AND category IS NULL;

  UPDATE work_items
  SET stage = 'review'
  WHERE stage = 'inbox';

  UPDATE work_items
  SET stage = 'planning'
  WHERE stage = 'validated';

  UPDATE work_items
  SET stage = 'parked'
  WHERE stage = 'killed';
`);

function nowIso(): string {
  return new Date().toISOString();
}

function formatWorkItemLocalIdentifier(kind: WorkItemKind, sequenceId: number): string {
  return `${kind}-${sequenceId.toString().padStart(5, "0")}`;
}

function isRandomWorkItemLocalIdentifier(
  kind: WorkItemKind,
  sequenceId: number | null | undefined,
  value: string | null | undefined
): boolean {
  return Boolean(sequenceId && sequenceId >= 10000 && sequenceId <= 99999 && value === formatWorkItemLocalIdentifier(kind, sequenceId));
}

function workItemLocalNumberExists(sequenceId: number): boolean {
  const row = db
    .prepare("SELECT 1 AS found FROM work_items WHERE local_sequence_id = ? LIMIT 1")
    .get(sequenceId) as { found: number } | undefined;

  return Boolean(row);
}

function allocateWorkItemLocalNumber(kind: WorkItemKind): { localSequenceId: number; localIdentifier: string } {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = Math.floor(10000 + Math.random() * 90000);

    if (!workItemLocalNumberExists(candidate)) {
      return {
        localSequenceId: candidate,
        localIdentifier: formatWorkItemLocalIdentifier(kind, candidate)
      };
    }
  }

  for (let candidate = 10000; candidate <= 99999; candidate += 1) {
    if (!workItemLocalNumberExists(candidate)) {
      return {
        localSequenceId: candidate,
        localIdentifier: formatWorkItemLocalIdentifier(kind, candidate)
      };
    }
  }

  throw new Error("No Project Desk item numbers are available.");
}

function randomWorkItemLocalNumber(kind: WorkItemKind, usedNumbers: Set<number>): { localSequenceId: number; localIdentifier: string } {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = Math.floor(10000 + Math.random() * 90000);

    if (!usedNumbers.has(candidate)) {
      usedNumbers.add(candidate);
      return {
        localSequenceId: candidate,
        localIdentifier: formatWorkItemLocalIdentifier(kind, candidate)
      };
    }
  }

  for (let candidate = 10000; candidate <= 99999; candidate += 1) {
    if (!usedNumbers.has(candidate)) {
      usedNumbers.add(candidate);
      return {
        localSequenceId: candidate,
        localIdentifier: formatWorkItemLocalIdentifier(kind, candidate)
      };
    }
  }

  throw new Error("No Project Desk item numbers are available.");
}

function localNumberForKind(record: Pick<WorkItemRecord, "localSequenceId">, kind: WorkItemKind): {
  localSequenceId: number;
  localIdentifier: string;
} {
  if (record.localSequenceId && record.localSequenceId >= 10000 && record.localSequenceId <= 99999) {
    return {
      localSequenceId: record.localSequenceId,
      localIdentifier: formatWorkItemLocalIdentifier(kind, record.localSequenceId)
    };
  }

  return allocateWorkItemLocalNumber(kind);
}

function backfillWorkItemLocalIdentifiers(): void {
  const rows = db
    .prepare(
      `
        SELECT id, kind, local_sequence_id, local_identifier
        FROM work_items
        ORDER BY created_at ASC, id ASC
      `
    )
    .all() as Array<{ id: string; kind: WorkItemKind; local_sequence_id: number | null; local_identifier: string | null }>;
  const seenExistingNumbers = new Set<number>();
  const needsRandomBackfill = rows.some((row) => {
    if (!isRandomWorkItemLocalIdentifier(row.kind, row.local_sequence_id, row.local_identifier)) {
      return true;
    }

    if (seenExistingNumbers.has(row.local_sequence_id!)) {
      return true;
    }

    seenExistingNumbers.add(row.local_sequence_id!);
    return false;
  });

  if (!needsRandomBackfill) {
    return;
  }

  const update = db.prepare(`
    UPDATE work_items
    SET
      local_sequence_id = @localSequenceId,
      local_identifier = @localIdentifier
    WHERE id = @id
  `);

  const backfill = db.transaction(() => {
    db.prepare("UPDATE work_items SET local_sequence_id = NULL, local_identifier = '__renumber__' || id").run();

    const usedNumbers = new Set<number>();

    for (const row of rows) {
      const canKeepExistingNumber =
        isRandomWorkItemLocalIdentifier(row.kind, row.local_sequence_id, row.local_identifier) &&
        !usedNumbers.has(row.local_sequence_id!);
      const localNumber = canKeepExistingNumber
        ? {
            localSequenceId: row.local_sequence_id!,
            localIdentifier: row.local_identifier!
          }
        : randomWorkItemLocalNumber(row.kind, usedNumbers);

      usedNumbers.add(localNumber.localSequenceId);
      update.run({
        id: row.id,
        ...localNumber
      });
    }
  });

  backfill();
}

function mapRequest(row: RequestRow): RequestRecord {
  return {
    id: row.id,
    discordUserId: row.discord_user_id,
    discordUsername: row.discord_username,
    discordAvatarUrl: row.discord_avatar_url,
    title: row.title,
    type: row.type,
    priority: row.priority,
    details: row.details,
    planeIssueId: row.plane_issue_id,
    planeSequenceId: row.plane_sequence_id,
    planeIdentifier: row.plane_identifier,
    planeUrl: row.plane_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapComment(row: CommentRow): CommentRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    discordUserId: row.discord_user_id,
    discordUsername: row.discord_username,
    body: row.body,
    planeCommentId: row.plane_comment_id,
    createdAt: row.created_at
  };
}

function mapDemoWorkItem(row: DemoWorkItemRow): DemoWorkItemRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    name: row.name,
    priority: row.priority,
    sequenceId: row.sequence_id,
    identifier: row.identifier,
    stateId: row.state_id,
    stateName: row.state_name,
    stateGroup: row.state_group,
    stateColor: row.state_color,
    url: row.url,
    details: row.details,
    submitter: row.submitter,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapWorkItem(row: WorkItemRow): WorkItemRecord {
  return {
    id: row.id,
    kind: row.kind,
    localSequenceId: row.local_sequence_id,
    localIdentifier: row.local_identifier,
    parentId: row.parent_id,
    createdByDiscordUserId: row.created_by_discord_user_id,
    createdByDiscordUsername: row.created_by_discord_username,
    ownerDiscordUserId: row.owner_discord_user_id,
    ownerDiscordUsername: row.owner_discord_username,
    title: row.title,
    details: row.details,
    category: row.category,
    priority: row.priority,
    codexReasoning: row.codex_reasoning,
    stage: row.stage,
    taskStatus: row.task_status,
    taskCompletionReason: row.task_completion_reason,
    contextJson: row.context_json ?? null,
    planeIssueId: row.plane_issue_id,
    planeSequenceId: row.plane_sequence_id,
    planeIdentifier: row.plane_identifier,
    planeUrl: row.plane_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapWorkItemLink(row: WorkItemLinkRow): WorkItemLinkRecord {
  return {
    id: row.id,
    sourceWorkItemId: row.source_work_item_id,
    targetWorkItemId: row.target_work_item_id,
    relationship: row.relationship,
    note: row.note ?? null,
    createdByDiscordUserId: row.created_by_discord_user_id,
    createdByDiscordUsername: row.created_by_discord_username,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapWorkItemMemory(row: WorkItemMemoryRow): WorkItemMemoryRecord {
  return {
    workItemId: row.work_item_id,
    body: row.body,
    updatedByDiscordUserId: row.updated_by_discord_user_id,
    updatedByName: row.updated_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapWorkComment(row: WorkCommentRow): WorkCommentRecord {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    parentCommentId: row.parent_comment_id ?? null,
    discordUserId: row.discord_user_id,
    discordAvatarUrl: row.discord_avatar_url,
    discordUsername: row.discord_username,
    authorType: row.author_type,
    body: row.body,
    contextJson: row.context_json ?? null,
    createdAt: row.created_at
  };
}

function mapAttachment(row: AttachmentRow): AttachmentRecord {
  return {
    id: row.id,
    uploaderDiscordUserId: row.uploader_discord_user_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    createdAt: row.created_at
  };
}

function mapAiArtifact(row: AiArtifactRow): AiArtifactRecord {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    type: row.type,
    title: row.title,
    body: row.body,
    rawJson: row.raw_json,
    createdAt: row.created_at
  };
}

function mapDecision(row: DecisionRow): DecisionRecord {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    decision: row.decision,
    actorDiscordUserId: row.actor_discord_user_id,
    actorName: row.actor_name,
    rationale: row.rationale,
    createdAt: row.created_at
  };
}

function mapActivityEvent(row: ActivityEventRow): ActivityEventRecord {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    type: row.type,
    actorName: row.actor_name,
    body: row.body,
    metadataJson: row.metadata_json,
    createdAt: row.created_at
  };
}

function mapNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    discordUserId: row.discord_user_id,
    type: row.type,
    channel: row.channel,
    body: row.body,
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInboxNotification(row: InboxNotificationRow): InboxNotificationRecord {
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    actorUserId: row.actor_user_id,
    type: row.type,
    projectId: row.project_id,
    taskId: row.task_id,
    commentId: row.comment_id,
    replyId: row.reply_id,
    annotationId: row.annotation_id,
    targetUrl: row.target_url,
    previewText: row.preview_text,
    createdAt: row.created_at,
    readAt: row.read_at
  };
}

function normalizeNotificationPreferences(value: string | null | undefined): NotificationPreferences {
  if (!value) {
    return { ...defaultNotificationPreferences };
  }

  try {
    const parsed = JSON.parse(value) as Partial<Record<string, unknown>>;
    return Object.fromEntries(
      Object.entries(defaultNotificationPreferences).map(([key, defaultValue]) => [
        key,
        typeof parsed[key] === "boolean" ? parsed[key] : defaultValue
      ])
    ) as NotificationPreferences;
  } catch {
    return { ...defaultNotificationPreferences };
  }
}

function mapUserProfile(row: UserProfileRow): UserProfileRecord {
  return {
    discordUserId: row.discord_user_id,
    discordUsername: row.discord_username,
    discordDisplayName: row.discord_display_name,
    displayName: row.display_name,
    tagName: row.tag_name,
    avatarUrl: row.avatar_url,
    isAdmin: Boolean(row.is_admin),
    notificationPreferences: normalizeNotificationPreferences(row.notification_prefs_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAiJob(row: AiJobRow): AiJobRecord {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    type: row.type,
    status: row.status,
    reason: row.reason,
    attempts: row.attempts,
    lastError: row.last_error,
    runAfter: row.run_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function insertRequest(
  input: Omit<RequestRecord, "createdAt" | "updatedAt">
): RequestRecord {
  const createdAt = nowIso();
  const record: RequestRecord = {
    ...input,
    createdAt,
    updatedAt: createdAt
  };

  db.prepare(`
    INSERT INTO requests (
      id,
      discord_user_id,
      discord_username,
      discord_avatar_url,
      title,
      type,
      priority,
      details,
      plane_issue_id,
      plane_sequence_id,
      plane_identifier,
      plane_url,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @discordUserId,
      @discordUsername,
      @discordAvatarUrl,
      @title,
      @type,
      @priority,
      @details,
      @planeIssueId,
      @planeSequenceId,
      @planeIdentifier,
      @planeUrl,
      @createdAt,
      @updatedAt
    )
  `).run(record);

  return record;
}

export function listRequestsForUser(discordUserId: string): RequestRecord[] {
  const rows = db
    .prepare("SELECT * FROM requests WHERE discord_user_id = ? ORDER BY created_at DESC")
    .all(discordUserId) as RequestRow[];

  return rows.map(mapRequest);
}

export function listRecentRequests(limit = 50): RequestRecord[] {
  const rows = db
    .prepare("SELECT * FROM requests ORDER BY created_at DESC LIMIT ?")
    .all(limit) as RequestRow[];

  return rows.map(mapRequest);
}

export function getRequestById(id: string): RequestRecord | null {
  const row = db.prepare("SELECT * FROM requests WHERE id = ?").get(id) as RequestRow | undefined;
  return row ? mapRequest(row) : null;
}

export function getRequestByPlaneIssueId(planeIssueId: string): RequestRecord | null {
  const row = db.prepare("SELECT * FROM requests WHERE plane_issue_id = ?").get(planeIssueId) as
    | RequestRow
    | undefined;

  return row ? mapRequest(row) : null;
}

export function insertComment(
  input: Omit<CommentRecord, "createdAt" | "planeCommentId"> & { planeCommentId?: string | null }
): CommentRecord {
  const record: CommentRecord = {
    ...input,
    planeCommentId: input.planeCommentId ?? null,
    createdAt: nowIso()
  };

  db.prepare(`
    INSERT INTO comments (
      id,
      request_id,
      discord_user_id,
      discord_username,
      body,
      plane_comment_id,
      created_at
    )
    VALUES (
      @id,
      @requestId,
      @discordUserId,
      @discordUsername,
      @body,
      @planeCommentId,
      @createdAt
    )
  `).run(record);

  return record;
}

export function updateCommentPlaneId(commentId: string, planeCommentId: string): void {
  db.prepare("UPDATE comments SET plane_comment_id = ? WHERE id = ?").run(planeCommentId, commentId);
}

export function listLocalComments(requestId: string): CommentRecord[] {
  const rows = db
    .prepare("SELECT * FROM comments WHERE request_id = ? ORDER BY created_at ASC")
    .all(requestId) as CommentRow[];

  return rows.map(mapComment);
}

export function nextDemoSequenceId(): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(sequence_id), 0) + 1 AS next FROM demo_work_items WHERE request_id IS NOT NULL")
    .get() as { next: number };

  return row.next;
}

export function insertDemoWorkItem(
  input: Omit<DemoWorkItemRecord, "createdAt" | "updatedAt">
): DemoWorkItemRecord {
  const createdAt = nowIso();
  const record: DemoWorkItemRecord = {
    ...input,
    createdAt,
    updatedAt: createdAt
  };

  db.prepare(`
    INSERT INTO demo_work_items (
      id,
      request_id,
      name,
      priority,
      sequence_id,
      identifier,
      state_id,
      state_name,
      state_group,
      state_color,
      url,
      details,
      submitter,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @requestId,
      @name,
      @priority,
      @sequenceId,
      @identifier,
      @stateId,
      @stateName,
      @stateGroup,
      @stateColor,
      @url,
      @details,
      @submitter,
      @createdAt,
      @updatedAt
    )
  `).run(record);

  return record;
}

export function insertDemoWorkItemIfMissing(
  input: Omit<DemoWorkItemRecord, "createdAt" | "updatedAt">
): DemoWorkItemRecord {
  const existing = getDemoWorkItemById(input.id);

  if (existing) {
    return existing;
  }

  return insertDemoWorkItem(input);
}

export function getDemoWorkItemById(id: string): DemoWorkItemRecord | null {
  const row = db.prepare("SELECT * FROM demo_work_items WHERE id = ?").get(id) as
    | DemoWorkItemRow
    | undefined;

  return row ? mapDemoWorkItem(row) : null;
}

export function updateDemoWorkItemState(
  id: string,
  state: Pick<DemoWorkItemRecord, "stateId" | "stateName" | "stateGroup" | "stateColor">
): DemoWorkItemRecord | null {
  const updatedAt = nowIso();

  db.prepare(`
    UPDATE demo_work_items
    SET
      state_id = @stateId,
      state_name = @stateName,
      state_group = @stateGroup,
      state_color = @stateColor,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    ...state,
    updatedAt
  });

  return getDemoWorkItemById(id);
}

export function listDemoWorkItems(): DemoWorkItemRecord[] {
  const rows = db
    .prepare("SELECT * FROM demo_work_items ORDER BY sequence_id DESC")
    .all() as DemoWorkItemRow[];

  return rows.map(mapDemoWorkItem);
}

export function insertWorkItem(
  input: Omit<WorkItemRecord, "createdAt" | "updatedAt" | "localSequenceId" | "localIdentifier">
): WorkItemRecord {
  const createdAt = nowIso();
  const localNumber = allocateWorkItemLocalNumber(input.kind);
  const record: WorkItemRecord = {
    ...input,
    ...localNumber,
    contextJson: input.contextJson ?? null,
    createdAt,
    updatedAt: createdAt
  };

  db.prepare(`
    INSERT INTO work_items (
      id,
      kind,
      local_sequence_id,
      local_identifier,
      parent_id,
      created_by_discord_user_id,
      created_by_discord_username,
      owner_discord_user_id,
      owner_discord_username,
      title,
      details,
      category,
      priority,
      codex_reasoning,
      stage,
      task_status,
      task_completion_reason,
      context_json,
      plane_issue_id,
      plane_sequence_id,
      plane_identifier,
      plane_url,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @kind,
      @localSequenceId,
      @localIdentifier,
      @parentId,
      @createdByDiscordUserId,
      @createdByDiscordUsername,
      @ownerDiscordUserId,
      @ownerDiscordUsername,
      @title,
      @details,
      @category,
      @priority,
      @codexReasoning,
      @stage,
      @taskStatus,
      @taskCompletionReason,
      @contextJson,
      @planeIssueId,
      @planeSequenceId,
      @planeIdentifier,
      @planeUrl,
      @createdAt,
      @updatedAt
    )
  `).run(record);

  return record;
}

export function getWorkItemById(id: string): WorkItemRecord | null {
  const row = db.prepare("SELECT * FROM work_items WHERE id = ?").get(id) as WorkItemRow | undefined;
  return row ? mapWorkItem(row) : null;
}

export function listWorkItemsForUser(discordUserId: string, isAdmin = false): WorkItemRecord[] {
  const rows = isAdmin
    ? (db.prepare("SELECT * FROM work_items ORDER BY updated_at DESC").all() as WorkItemRow[])
    : (db
        .prepare(`
          SELECT * FROM work_items
          WHERE created_by_discord_user_id = ?
             OR owner_discord_user_id = ?
             OR id IN (
               SELECT work_item_id
               FROM work_item_follows
               WHERE discord_user_id = ?
             )
          ORDER BY updated_at DESC
        `)
        .all(discordUserId, discordUserId, discordUserId) as WorkItemRow[]);

  return rows.map(mapWorkItem);
}

export function listWorkItemsByParent(parentId: string): WorkItemRecord[] {
  const rows = db
    .prepare("SELECT * FROM work_items WHERE parent_id = ? ORDER BY created_at ASC")
    .all(parentId) as WorkItemRow[];

  return rows.map(mapWorkItem);
}

export function insertWorkItemLink(input: Omit<WorkItemLinkRecord, "createdAt" | "updatedAt">): WorkItemLinkRecord {
  const updatedAt = nowIso();
  const record: WorkItemLinkRecord = {
    ...input,
    note: input.note?.trim() || null,
    createdAt: updatedAt,
    updatedAt
  };

  db.prepare(`
    INSERT INTO work_item_links (
      id,
      source_work_item_id,
      target_work_item_id,
      relationship,
      note,
      created_by_discord_user_id,
      created_by_discord_username,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @sourceWorkItemId,
      @targetWorkItemId,
      @relationship,
      @note,
      @createdByDiscordUserId,
      @createdByDiscordUsername,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(source_work_item_id, target_work_item_id, relationship) DO UPDATE SET
      note = excluded.note,
      created_by_discord_user_id = excluded.created_by_discord_user_id,
      created_by_discord_username = excluded.created_by_discord_username,
      updated_at = excluded.updated_at
  `).run(record);

  const row = db
    .prepare(
      `
        SELECT *
        FROM work_item_links
        WHERE source_work_item_id = ?
          AND target_work_item_id = ?
          AND relationship = ?
      `
    )
    .get(record.sourceWorkItemId, record.targetWorkItemId, record.relationship) as WorkItemLinkRow | undefined;

  return row ? mapWorkItemLink(row) : record;
}

export function getWorkItemLinkById(id: string): WorkItemLinkRecord | null {
  const row = db.prepare("SELECT * FROM work_item_links WHERE id = ?").get(id) as WorkItemLinkRow | undefined;
  return row ? mapWorkItemLink(row) : null;
}

export function listWorkItemLinksForItem(workItemId: string): WorkItemLinkRecord[] {
  const rows = db
    .prepare(
      `
        SELECT *
        FROM work_item_links
        WHERE source_work_item_id = ?
           OR target_work_item_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `
    )
    .all(workItemId, workItemId) as WorkItemLinkRow[];

  return rows.map(mapWorkItemLink);
}

export function deleteWorkItemLink(id: string): WorkItemLinkRecord | null {
  const existing = getWorkItemLinkById(id);

  if (!existing) {
    return null;
  }

  db.prepare("DELETE FROM work_item_links WHERE id = ?").run(id);
  return existing;
}

export function getWorkItemMemory(workItemId: string): WorkItemMemoryRecord | null {
  const row = db.prepare("SELECT * FROM work_item_memories WHERE work_item_id = ?").get(workItemId) as WorkItemMemoryRow | undefined;
  return row ? mapWorkItemMemory(row) : null;
}

export function upsertWorkItemMemory(input: {
  workItemId: string;
  body: string;
  updatedByDiscordUserId: string | null;
  updatedByName: string | null;
}): WorkItemMemoryRecord {
  const existing = getWorkItemMemory(input.workItemId);
  const now = nowIso();
  const record: WorkItemMemoryRecord = {
    workItemId: input.workItemId,
    body: input.body.trim(),
    updatedByDiscordUserId: input.updatedByDiscordUserId,
    updatedByName: input.updatedByName,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO work_item_memories (
      work_item_id,
      body,
      updated_by_discord_user_id,
      updated_by_name,
      created_at,
      updated_at
    )
    VALUES (
      @workItemId,
      @body,
      @updatedByDiscordUserId,
      @updatedByName,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(work_item_id) DO UPDATE SET
      body = excluded.body,
      updated_by_discord_user_id = excluded.updated_by_discord_user_id,
      updated_by_name = excluded.updated_by_name,
      updated_at = excluded.updated_at
  `).run(record);

  return getWorkItemMemory(input.workItemId) ?? record;
}

export function recordWorkItemVisit(discordUserId: string, workItemId: string): void {
  const visitedAt = nowIso();

  db.prepare(
    `
      INSERT INTO work_item_visits (
        discord_user_id,
        work_item_id,
        visited_at
      )
      VALUES (?, ?, ?)
      ON CONFLICT(discord_user_id, work_item_id)
      DO UPDATE SET visited_at = excluded.visited_at
    `
  ).run(discordUserId, workItemId, visitedAt);

  db.prepare(
    `
      DELETE FROM work_item_visits
      WHERE discord_user_id = ?
        AND work_item_id NOT IN (
          SELECT work_item_id
          FROM work_item_visits
          WHERE discord_user_id = ?
          ORDER BY visited_at DESC
          LIMIT 100
        )
    `
  ).run(discordUserId, discordUserId);
}

export function listRecentWorkItemVisits(discordUserId: string, limit = 50): WorkItemVisitRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          work_items.*,
          work_item_visits.discord_user_id AS visit_discord_user_id,
          work_item_visits.visited_at AS visit_visited_at
        FROM work_item_visits
        INNER JOIN work_items ON work_items.id = work_item_visits.work_item_id
        WHERE work_item_visits.discord_user_id = ?
        ORDER BY work_item_visits.visited_at DESC
        LIMIT ?
      `
    )
    .all(discordUserId, limit) as Array<WorkItemRow & { visit_discord_user_id: string; visit_visited_at: string }>;

  return rows.map((row) => ({
    discordUserId: row.visit_discord_user_id,
    workItemId: row.id,
    visitedAt: row.visit_visited_at,
    workItem: mapWorkItem(row)
  }));
}

export function countOpenChildTasks(parentId: string): number {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM work_items
        WHERE parent_id = ?
          AND kind = 'task'
          AND COALESCE(task_status, 'todo') != 'complete'
      `
    )
    .get(parentId) as { count: number } | undefined;

  return row?.count ?? 0;
}

export function listBoardWorkItems(): WorkItemRecord[] {
  const rows = db.prepare("SELECT * FROM work_items ORDER BY updated_at DESC").all() as WorkItemRow[];
  return rows.map(mapWorkItem);
}

export function updateWorkItemStage(id: string, stage: WorkStage, kind?: WorkItemKind): WorkItemRecord | null {
  const updatedAt = nowIso();
  const current = getWorkItemById(id);

  if (!current) {
    return null;
  }

  const nextKind = kind ?? current.kind;
  const localNumber = localNumberForKind(current, nextKind);

  db.prepare(`
    UPDATE work_items
    SET
      stage = @stage,
      kind = @kind,
      local_sequence_id = @localSequenceId,
      local_identifier = @localIdentifier,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    stage,
    kind: nextKind,
    ...localNumber,
    updatedAt
  });

  return getWorkItemById(id);
}

export function touchWorkItem(id: string, timestamp = nowIso()): WorkItemRecord | null {
  db.prepare("UPDATE work_items SET updated_at = ? WHERE id = ?").run(timestamp, id);
  return getWorkItemById(id);
}

function reopenCompletedTaskForNewActivity(id: string, timestamp = nowIso()): boolean {
  const result = db
    .prepare(
      `
        UPDATE work_items
        SET
          task_status = 'in_progress',
          task_completion_reason = NULL,
          updated_at = @timestamp
        WHERE id = @id
          AND kind = 'task'
          AND task_status = 'complete'
      `
    )
    .run({ id, timestamp });

  return result.changes > 0;
}

function touchWorkItemForNewComment(id: string, timestamp: string, reopenCompletedTask: boolean): void {
  if (reopenCompletedTask && reopenCompletedTaskForNewActivity(id, timestamp)) {
    return;
  }

  touchWorkItem(id, timestamp);
}

export function updateWorkItemOwner(
  id: string,
  owner: Pick<WorkItemRecord, "ownerDiscordUserId" | "ownerDiscordUsername" | "codexReasoning">
): WorkItemRecord | null {
  const updatedAt = nowIso();

  db.prepare(`
    UPDATE work_items
    SET
      owner_discord_user_id = @ownerDiscordUserId,
      owner_discord_username = @ownerDiscordUsername,
      codex_reasoning = @codexReasoning,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({ id, ...owner, updatedAt });

  return getWorkItemById(id);
}

export function updateWorkItemCodexReasoning(id: string, codexReasoning: CodexReasoningEffort | null): WorkItemRecord | null {
  const updatedAt = nowIso();

  db.prepare(`
    UPDATE work_items
    SET
      codex_reasoning = @codexReasoning,
      updated_at = @updatedAt
    WHERE id = @id AND kind = 'task'
  `).run({ id, codexReasoning, updatedAt });

  return getWorkItemById(id);
}

export function updateWorkItemTitle(id: string, title: string): WorkItemRecord | null {
  const updatedAt = nowIso();

  db.prepare(`
    UPDATE work_items
    SET
      title = @title,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({ id, title, updatedAt });

  return getWorkItemById(id);
}

export function updateWorkItemCategory(id: string, category: IdeaCategory): WorkItemRecord | null {
  const updatedAt = nowIso();

  db.prepare(`
    UPDATE work_items
    SET
      category = @category,
      updated_at = @updatedAt
    WHERE id = @id AND kind IN ('idea', 'project')
  `).run({ id, category, updatedAt });

  return getWorkItemById(id);
}

export function updateWorkItemPriority(id: string, priority: RequestPriority): WorkItemRecord | null {
  const updatedAt = nowIso();

  db.prepare(`
    UPDATE work_items
    SET
      priority = @priority,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({ id, priority, updatedAt });

  return getWorkItemById(id);
}

export function promoteIdeaToProject(id: string): WorkItemRecord | null {
  const updatedAt = nowIso();
  const current = getWorkItemById(id);

  if (!current) {
    return null;
  }

  const localNumber = localNumberForKind(current, "project");

  db.prepare(`
    UPDATE work_items
    SET
      kind = 'project',
      stage = 'planning',
      local_sequence_id = @localSequenceId,
      local_identifier = @localIdentifier,
      updated_at = @updatedAt
    WHERE id = @id AND kind = 'idea'
  `).run({ id, ...localNumber, updatedAt });

  return getWorkItemById(id);
}

export function updateWorkItemTaskStatus(
  id: string,
  taskStatus: TaskStatus,
  taskCompletionReason: TaskCompletionReason | null
): WorkItemRecord | null {
  const updatedAt = nowIso();

  db.prepare(`
    UPDATE work_items
    SET
      task_status = @taskStatus,
      task_completion_reason = @taskCompletionReason,
      updated_at = @updatedAt
    WHERE id = @id AND kind = 'task'
  `).run({
    id,
    taskStatus,
    taskCompletionReason,
    updatedAt
  });

  return getWorkItemById(id);
}

export function deleteWorkItemTree(id: string): { deletedIds: string[] } {
  const deleteTree = db.transaction((rootId: string) => {
    const rows = db
      .prepare(
        `
          WITH RECURSIVE subtree(id, depth) AS (
            SELECT id, 0
            FROM work_items
            WHERE id = ?
            UNION ALL
            SELECT child.id, subtree.depth + 1
            FROM work_items child
            JOIN subtree ON child.parent_id = subtree.id
          )
          SELECT id
          FROM subtree
          ORDER BY depth DESC
        `
      )
      .all(rootId) as Array<{ id: string }>;
    const deletedIds = rows.map((row) => row.id);

    if (deletedIds.length === 0) {
      return deletedIds;
    }

    const placeholders = deletedIds.map(() => "?").join(", ");

    db.prepare(`DELETE FROM notifications WHERE work_item_id IN (${placeholders})`).run(...deletedIds);
    db.prepare(`DELETE FROM inbox_notifications WHERE project_id IN (${placeholders}) OR task_id IN (${placeholders})`).run(
      ...deletedIds,
      ...deletedIds
    );
    db.prepare(`DELETE FROM work_item_follows WHERE work_item_id IN (${placeholders})`).run(...deletedIds);
    db.prepare(`DELETE FROM work_item_memories WHERE work_item_id IN (${placeholders})`).run(...deletedIds);
    db.prepare(`DELETE FROM work_comments WHERE work_item_id IN (${placeholders})`).run(...deletedIds);
    db.prepare(`DELETE FROM ai_artifacts WHERE work_item_id IN (${placeholders})`).run(...deletedIds);
    db.prepare(`DELETE FROM decisions WHERE work_item_id IN (${placeholders})`).run(...deletedIds);
    db.prepare(`DELETE FROM activity_events WHERE work_item_id IN (${placeholders})`).run(...deletedIds);
    db.prepare(`DELETE FROM ai_jobs WHERE work_item_id IN (${placeholders})`).run(...deletedIds);

    for (const deletedId of deletedIds) {
      db.prepare("DELETE FROM work_items WHERE id = ?").run(deletedId);
    }

    return deletedIds;
  });

  return { deletedIds: deleteTree(id) };
}

export function followWorkItem(workItemId: string, discordUserId: string): WorkItemFollowerRecord {
  const record: WorkItemFollowerRecord = {
    workItemId,
    discordUserId,
    createdAt: nowIso()
  };

  db.prepare(`
    INSERT OR IGNORE INTO work_item_follows (
      work_item_id,
      discord_user_id,
      created_at
    )
    VALUES (
      @workItemId,
      @discordUserId,
      @createdAt
    )
  `).run(record);

  return record;
}

export function followCreatedWorkItems(discordUserId: string): void {
  const createdAt = nowIso();
  db.prepare(`
    INSERT OR IGNORE INTO work_item_follows (
      work_item_id,
      discord_user_id,
      created_at
    )
    SELECT id, created_by_discord_user_id, @createdAt
    FROM work_items
    WHERE created_by_discord_user_id = @discordUserId
  `).run({ discordUserId, createdAt });
}

export function unfollowWorkItem(workItemId: string, discordUserId: string): void {
  db.prepare("DELETE FROM work_item_follows WHERE work_item_id = ? AND discord_user_id = ?").run(workItemId, discordUserId);
}

export function isFollowingWorkItem(workItemId: string, discordUserId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM work_item_follows WHERE work_item_id = ? AND discord_user_id = ?")
    .get(workItemId, discordUserId);

  return Boolean(row);
}

export function countWorkItemFollowers(workItemId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM work_item_follows WHERE work_item_id = ?").get(workItemId) as
    | { count: number }
    | undefined;

  return row?.count ?? 0;
}

export function listWorkItemFollowerIds(workItemId: string): string[] {
  const rows = db
    .prepare("SELECT discord_user_id FROM work_item_follows WHERE work_item_id = ? ORDER BY created_at ASC")
    .all(workItemId) as Array<{ discord_user_id: string }>;

  return rows.map((row) => row.discord_user_id);
}

export function listFollowedWorkItemIds(discordUserId: string): Set<string> {
  const rows = db
    .prepare("SELECT work_item_id FROM work_item_follows WHERE discord_user_id = ?")
    .all(discordUserId) as Array<{ work_item_id: string }>;

  return new Set(rows.map((row) => row.work_item_id));
}

export function insertWorkComment(
  input: Omit<WorkCommentRecord, "createdAt">,
  options: InsertWorkCommentOptions = {}
): WorkCommentRecord {
  const record: WorkCommentRecord = {
    ...input,
    contextJson: input.contextJson ?? null,
    createdAt: nowIso()
  };

  db.prepare(`
    INSERT INTO work_comments (
      id,
      work_item_id,
      parent_comment_id,
      discord_user_id,
      discord_avatar_url,
      discord_username,
      author_type,
      body,
      context_json,
      created_at
    )
    VALUES (
      @id,
      @workItemId,
      @parentCommentId,
      @discordUserId,
      @discordAvatarUrl,
      @discordUsername,
      @authorType,
      @body,
      @contextJson,
      @createdAt
    )
  `).run(record);

  touchWorkItemForNewComment(record.workItemId, record.createdAt, options.reopenCompletedTask ?? true);

  return record;
}

export function listWorkComments(workItemId: string): WorkCommentRecord[] {
  const rows = db
    .prepare("SELECT * FROM work_comments WHERE work_item_id = ? ORDER BY created_at ASC")
    .all(workItemId) as WorkCommentRow[];

  return rows.map(mapWorkComment);
}

export function getWorkCommentById(id: string): WorkCommentRecord | null {
  const row = db.prepare("SELECT * FROM work_comments WHERE id = ?").get(id) as WorkCommentRow | undefined;
  return row ? mapWorkComment(row) : null;
}

export function updateWorkCommentProfile(
  id: string,
  profile: Pick<WorkCommentRecord, "discordUsername" | "discordAvatarUrl">
): WorkCommentRecord | null {
  db.prepare(`
    UPDATE work_comments
    SET
      discord_username = @discordUsername,
      discord_avatar_url = @discordAvatarUrl
    WHERE id = @id
  `).run({ id, ...profile });

  return getWorkCommentById(id);
}

export function insertAttachment(input: Omit<AttachmentRecord, "createdAt">): AttachmentRecord {
  const record: AttachmentRecord = {
    ...input,
    createdAt: nowIso()
  };

  db.prepare(`
    INSERT INTO attachments (
      id,
      uploader_discord_user_id,
      original_name,
      mime_type,
      size_bytes,
      storage_path,
      created_at
    )
    VALUES (
      @id,
      @uploaderDiscordUserId,
      @originalName,
      @mimeType,
      @sizeBytes,
      @storagePath,
      @createdAt
    )
  `).run(record);

  return record;
}

export function getAttachmentById(id: string): AttachmentRecord | null {
  const row = db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as AttachmentRow | undefined;
  return row ? mapAttachment(row) : null;
}

export function archiveInactiveWorkItems(days = 30): WorkItemRecord[] {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(`
      SELECT * FROM work_items
      WHERE updated_at < @cutoff
        AND stage NOT IN ('done', 'parked')
      ORDER BY updated_at ASC
    `)
    .all({ cutoff }) as WorkItemRow[];

  if (rows.length === 0) {
    return [];
  }

  const updateStage = db.prepare("UPDATE work_items SET stage = 'parked' WHERE id = ?");
  const insertAutoArchiveEvent = db.prepare(`
    INSERT INTO activity_events (
      id,
      work_item_id,
      type,
      actor_name,
      body,
      metadata_json,
      created_at
    )
    VALUES (
      @id,
      @workItemId,
      'auto_archived',
      'Project Desk',
      @body,
      @metadataJson,
      @createdAt
    )
  `);

  const archiveRecords = db.transaction((staleRows: WorkItemRow[]) => {
    const createdAt = nowIso();

    for (const row of staleRows) {
      updateStage.run(row.id);
      insertAutoArchiveEvent.run({
        id: randomUUID(),
        workItemId: row.id,
        body: `Archived after ${days} days without activity.`,
        metadataJson: JSON.stringify({ from: row.stage, to: "parked", cutoff, days }),
        createdAt
      });
    }
  });

  archiveRecords(rows);

  return rows.map((row) => ({ ...mapWorkItem(row), stage: "parked" }));
}

export function insertAiArtifact(input: Omit<AiArtifactRecord, "createdAt">): AiArtifactRecord {
  const record: AiArtifactRecord = {
    ...input,
    createdAt: nowIso()
  };

  db.prepare(`
    INSERT INTO ai_artifacts (
      id,
      work_item_id,
      type,
      title,
      body,
      raw_json,
      created_at
    )
    VALUES (
      @id,
      @workItemId,
      @type,
      @title,
      @body,
      @rawJson,
      @createdAt
    )
  `).run(record);

  return record;
}

export function listAiArtifacts(workItemId: string): AiArtifactRecord[] {
  const rows = db
    .prepare("SELECT * FROM ai_artifacts WHERE work_item_id = ? ORDER BY created_at DESC")
    .all(workItemId) as AiArtifactRow[];

  return rows.map(mapAiArtifact);
}

export function insertDecision(input: Omit<DecisionRecord, "createdAt">): DecisionRecord {
  const record: DecisionRecord = {
    ...input,
    createdAt: nowIso()
  };

  db.prepare(`
    INSERT INTO decisions (
      id,
      work_item_id,
      decision,
      actor_discord_user_id,
      actor_name,
      rationale,
      created_at
    )
    VALUES (
      @id,
      @workItemId,
      @decision,
      @actorDiscordUserId,
      @actorName,
      @rationale,
      @createdAt
    )
  `).run(record);

  return record;
}

export function listDecisions(workItemId: string): DecisionRecord[] {
  const rows = db
    .prepare("SELECT * FROM decisions WHERE work_item_id = ? ORDER BY created_at DESC")
    .all(workItemId) as DecisionRow[];

  return rows.map(mapDecision);
}

export function insertActivityEvent(input: Omit<ActivityEventRecord, "createdAt">): ActivityEventRecord {
  const record: ActivityEventRecord = {
    ...input,
    createdAt: nowIso()
  };

  db.prepare(`
    INSERT INTO activity_events (
      id,
      work_item_id,
      type,
      actor_name,
      body,
      metadata_json,
      created_at
    )
    VALUES (
      @id,
      @workItemId,
      @type,
      @actorName,
      @body,
      @metadataJson,
      @createdAt
    )
  `).run(record);

  if (shouldActivityReopenCompletedTask(record)) {
    reopenCompletedTaskForNewActivity(record.workItemId, record.createdAt);
  }

  return record;
}

function shouldActivityReopenCompletedTask(record: ActivityEventRecord): boolean {
  return record.type !== "task_status_changed" && record.type !== "local_codex_completed";
}

export function listActivityEvents(workItemId: string): ActivityEventRecord[] {
  const rows = db
    .prepare("SELECT * FROM activity_events WHERE work_item_id = ? ORDER BY created_at DESC")
    .all(workItemId) as ActivityEventRow[];

  return rows.map(mapActivityEvent);
}

export function insertNotification(input: Omit<NotificationRecord, "createdAt" | "updatedAt">): NotificationRecord {
  const createdAt = nowIso();
  const record: NotificationRecord = {
    ...input,
    createdAt,
    updatedAt: createdAt
  };

  db.prepare(`
    INSERT INTO notifications (
      id,
      work_item_id,
      discord_user_id,
      type,
      channel,
      body,
      status,
      reason,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @workItemId,
      @discordUserId,
      @type,
      @channel,
      @body,
      @status,
      @reason,
      @createdAt,
      @updatedAt
    )
  `).run(record);

  return record;
}

export function updateNotificationStatus(
  id: string,
  status: NotificationStatus,
  reason: string | null
): NotificationRecord | null {
  db.prepare("UPDATE notifications SET status = ?, reason = ?, updated_at = ? WHERE id = ?").run(
    status,
    reason,
    nowIso(),
    id
  );

  const row = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as NotificationRow | undefined;
  return row ? mapNotification(row) : null;
}

export function listNotificationsForUser(discordUserId: string, limit = 50): NotificationRecord[] {
  const rows = db
    .prepare("SELECT * FROM notifications WHERE discord_user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(discordUserId, limit) as NotificationRow[];

  return rows.map(mapNotification);
}

export function insertInboxNotification(input: Omit<InboxNotificationRecord, "createdAt" | "readAt">): InboxNotificationRecord {
  const record: InboxNotificationRecord = {
    ...input,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    commentId: input.commentId ?? null,
    replyId: input.replyId ?? null,
    annotationId: input.annotationId ?? null,
    createdAt: nowIso(),
    readAt: null
  };

  db.prepare(`
    INSERT INTO inbox_notifications (
      id,
      recipient_user_id,
      actor_user_id,
      type,
      project_id,
      task_id,
      comment_id,
      reply_id,
      annotation_id,
      target_url,
      preview_text,
      created_at,
      read_at
    )
    VALUES (
      @id,
      @recipientUserId,
      @actorUserId,
      @type,
      @projectId,
      @taskId,
      @commentId,
      @replyId,
      @annotationId,
      @targetUrl,
      @previewText,
      @createdAt,
      @readAt
    )
  `).run(record);

  return record;
}

export function listInboxNotificationsForUser(discordUserId: string, limit = 100): InboxNotificationRecord[] {
  const rows = db
    .prepare(
      `
        SELECT *
        FROM inbox_notifications
        WHERE recipient_user_id = ?
        ORDER BY read_at IS NULL DESC, created_at DESC
        LIMIT ?
      `
    )
    .all(discordUserId, limit) as InboxNotificationRow[];

  return rows.map(mapInboxNotification);
}

export function countUnreadInboxNotifications(discordUserId: string): number {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM inbox_notifications
        WHERE recipient_user_id = ?
          AND read_at IS NULL
      `
    )
    .get(discordUserId) as { count: number } | undefined;

  return row?.count ?? 0;
}

export function markInboxNotificationRead(id: string, recipientUserId: string): InboxNotificationRecord | null {
  db.prepare(
    `
      UPDATE inbox_notifications
      SET read_at = COALESCE(read_at, @readAt)
      WHERE id = @id
        AND recipient_user_id = @recipientUserId
    `
  ).run({ id, recipientUserId, readAt: nowIso() });

  const row = db.prepare("SELECT * FROM inbox_notifications WHERE id = ? AND recipient_user_id = ?").get(id, recipientUserId) as
    | InboxNotificationRow
    | undefined;
  return row ? mapInboxNotification(row) : null;
}

export function markAllInboxNotificationsRead(recipientUserId: string): number {
  const result = db
    .prepare(
      `
        UPDATE inbox_notifications
        SET read_at = @readAt
        WHERE recipient_user_id = @recipientUserId
          AND read_at IS NULL
      `
    )
    .run({ recipientUserId, readAt: nowIso() });

  return result.changes;
}

export function markInboxNotificationsReadForTarget(
  recipientUserId: string,
  target: {
    workItemId?: string | null;
    commentId?: string | null;
    replyId?: string | null;
    annotationId?: string | null;
  }
): number {
  const filters: string[] = [];
  const params: Record<string, string> = { recipientUserId, readAt: nowIso() };

  if (target.annotationId) {
    filters.push("annotation_id = @annotationId");
    params.annotationId = target.annotationId;
  }

  if (target.replyId) {
    filters.push("reply_id = @replyId");
    params.replyId = target.replyId;
  }

  if (target.commentId) {
    filters.push("(comment_id = @commentId OR reply_id = @commentId)");
    params.commentId = target.commentId;
  }

  if (target.workItemId) {
    filters.push("(task_id = @workItemId OR (task_id IS NULL AND project_id = @workItemId))");
    params.workItemId = target.workItemId;
  }

  if (filters.length === 0) {
    return 0;
  }

  const result = db
    .prepare(
      `
        UPDATE inbox_notifications
        SET read_at = @readAt
        WHERE recipient_user_id = @recipientUserId
          AND read_at IS NULL
          AND (${filters.join(" OR ")})
      `
    )
    .run(params);

  return result.changes;
}

export function getUserProfile(discordUserId: string): UserProfileRecord | null {
  const row = db.prepare("SELECT * FROM user_profiles WHERE discord_user_id = ?").get(discordUserId) as UserProfileRow | undefined;
  return row ? mapUserProfile(row) : null;
}

export function listUserProfiles(): UserProfileRecord[] {
  const rows = db.prepare("SELECT * FROM user_profiles ORDER BY lower(display_name) ASC").all() as UserProfileRow[];
  return rows.map(mapUserProfile);
}

export function upsertUserProfile(input: {
  discordUserId: string;
  discordUsername?: string | null;
  discordDisplayName?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}): UserProfileRecord {
  const now = nowIso();
  const existing = getUserProfile(input.discordUserId);
  const fallbackDisplayName = input.displayName.trim() || input.discordUsername || input.discordUserId;
  const displayName = existing?.displayName ?? fallbackDisplayName;
  const avatarUrl = existing?.avatarUrl ?? input.avatarUrl ?? null;
  const notificationPreferences = existing?.notificationPreferences ?? defaultNotificationPreferences;

  db.prepare(`
    INSERT INTO user_profiles (
      discord_user_id,
      discord_username,
      discord_display_name,
      display_name,
      tag_name,
      avatar_url,
      is_admin,
      notification_prefs_json,
      created_at,
      updated_at
    )
    VALUES (
      @discordUserId,
      @discordUsername,
      @discordDisplayName,
      @displayName,
      @tagName,
      @avatarUrl,
      @isAdmin,
      @notificationPrefsJson,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(discord_user_id) DO UPDATE SET
      discord_username = excluded.discord_username,
      discord_display_name = excluded.discord_display_name,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      is_admin = excluded.is_admin,
      notification_prefs_json = excluded.notification_prefs_json,
      updated_at = excluded.updated_at
  `).run({
    discordUserId: input.discordUserId,
    discordUsername: input.discordUsername ?? existing?.discordUsername ?? null,
    discordDisplayName: input.discordDisplayName ?? existing?.discordDisplayName ?? null,
    displayName,
    tagName: existing?.tagName ?? null,
    avatarUrl,
    isAdmin: input.isAdmin ? 1 : 0,
    notificationPrefsJson: JSON.stringify(notificationPreferences),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });

  return getUserProfile(input.discordUserId)!;
}

export function updateUserProfile(
  discordUserId: string,
  input: {
    displayName?: string | null;
    tagName?: string | null;
    avatarUrl?: string | null;
    notificationPreferences?: Partial<Record<string, boolean>>;
  }
): UserProfileRecord | null {
  const existing = getUserProfile(discordUserId);

  if (!existing) {
    return null;
  }

  const notificationPreferences = {
    ...existing.notificationPreferences,
    ...Object.fromEntries(
      Object.keys(defaultNotificationPreferences)
        .filter((key) => typeof input.notificationPreferences?.[key] === "boolean")
        .map((key) => [key, input.notificationPreferences?.[key]])
    )
  } as NotificationPreferences;

  db.prepare(`
    UPDATE user_profiles
    SET
      display_name = @displayName,
      tag_name = @tagName,
      avatar_url = @avatarUrl,
      notification_prefs_json = @notificationPrefsJson,
      updated_at = @updatedAt
    WHERE discord_user_id = @discordUserId
  `).run({
    discordUserId,
    displayName: input.displayName?.trim() || existing.displayName,
    tagName: input.tagName === undefined ? existing.tagName : input.tagName?.trim() || null,
    avatarUrl: input.avatarUrl === undefined ? existing.avatarUrl : input.avatarUrl?.trim() || null,
    notificationPrefsJson: JSON.stringify(notificationPreferences),
    updatedAt: nowIso()
  });

  return getUserProfile(discordUserId);
}

export function shouldSendNotification(discordUserId: string, type: string): boolean {
  const profile = getUserProfile(discordUserId);

  if (!profile) {
    return true;
  }

  return profile.notificationPreferences[type as keyof NotificationPreferences] ?? true;
}

export function listKnownPeople(): KnownPersonRecord[] {
  const rows = db
    .prepare(
      `
        SELECT discord_user_id, display_name, tag_name, avatar_url, is_admin, priority
        FROM (
          SELECT
            discord_user_id,
            display_name,
            tag_name,
            avatar_url,
            is_admin,
            0 AS priority
          FROM user_profiles
          UNION ALL
          SELECT discord_user_id, discord_username AS display_name, NULL AS tag_name, discord_avatar_url AS avatar_url, 0 AS is_admin, 1 AS priority
          FROM work_comments
          WHERE discord_user_id IS NOT NULL AND author_type = 'user'
          UNION ALL
          SELECT discord_user_id, discord_username AS display_name, NULL AS tag_name, discord_avatar_url AS avatar_url, 0 AS is_admin, 2 AS priority
          FROM requests
          UNION ALL
          SELECT discord_user_id, discord_username AS display_name, NULL AS tag_name, NULL AS avatar_url, 0 AS is_admin, 3 AS priority
          FROM comments
          UNION ALL
          SELECT owner_discord_user_id AS discord_user_id, owner_discord_username AS display_name, NULL AS tag_name, NULL AS avatar_url, 0 AS is_admin, 4 AS priority
          FROM work_items
          WHERE owner_discord_user_id IS NOT NULL
          UNION ALL
          SELECT created_by_discord_user_id AS discord_user_id, created_by_discord_username AS display_name, NULL AS tag_name, NULL AS avatar_url, 0 AS is_admin, 5 AS priority
          FROM work_items
        )
        WHERE discord_user_id IS NOT NULL
          AND display_name IS NOT NULL
          AND display_name != discord_user_id
          AND lower(display_name) != 'project desk ai'
        ORDER BY discord_user_id ASC, priority ASC, avatar_url IS NULL ASC, lower(display_name) ASC
      `
    )
    .all() as Array<{
      discord_user_id: string;
      display_name: string;
      tag_name: string | null;
      avatar_url: string | null;
      is_admin: number;
      priority: number;
    }>;

  const peopleById = new Map<string, KnownPersonRecord>();

  for (const row of rows) {
    if (!peopleById.has(row.discord_user_id)) {
      peopleById.set(row.discord_user_id, {
        discordUserId: row.discord_user_id,
        displayName: row.display_name,
        tagName: row.tag_name,
        avatarUrl: row.avatar_url,
        isAdmin: Boolean(row.is_admin)
      });
    }
  }

  return [...peopleById.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function insertAiJob(input: Omit<AiJobRecord, "createdAt" | "updatedAt" | "status" | "attempts" | "lastError">): AiJobRecord {
  const createdAt = nowIso();
  const record: AiJobRecord = {
    ...input,
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt,
    updatedAt: createdAt
  };

  db.prepare(`
    INSERT INTO ai_jobs (
      id,
      work_item_id,
      type,
      status,
      reason,
      attempts,
      last_error,
      run_after,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @workItemId,
      @type,
      @status,
      @reason,
      @attempts,
      @lastError,
      @runAfter,
      @createdAt,
      @updatedAt
    )
  `).run(record);

  return record;
}

export function listPendingAiJobs(limit = 5): AiJobRecord[] {
  const rows = db
    .prepare(`
      SELECT * FROM ai_jobs
      WHERE status = 'pending'
        AND run_after <= ?
      ORDER BY created_at ASC
      LIMIT ?
    `)
    .all(nowIso(), limit) as AiJobRow[];

  return rows.map(mapAiJob);
}

export function markAiJobRunning(id: string): AiJobRecord | null {
  db.prepare(`
    UPDATE ai_jobs
    SET status = 'running',
        attempts = attempts + 1,
        updated_at = ?
    WHERE id = ?
      AND status = 'pending'
  `).run(nowIso(), id);

  const row = db.prepare("SELECT * FROM ai_jobs WHERE id = ?").get(id) as AiJobRow | undefined;
  return row ? mapAiJob(row) : null;
}

export function markAiJobSucceeded(id: string): void {
  db.prepare("UPDATE ai_jobs SET status = 'succeeded', updated_at = ? WHERE id = ?").run(nowIso(), id);
}

export function markAiJobFailed(id: string, error: string, retry = false): void {
  const runAfter = new Date(Date.now() + 1000 * 60 * 5).toISOString();

  db.prepare(`
    UPDATE ai_jobs
    SET status = @status,
        last_error = @error,
        run_after = @runAfter,
        updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    error,
    runAfter,
    updatedAt: nowIso(),
    status: retry ? "pending" : "failed"
  });
}
