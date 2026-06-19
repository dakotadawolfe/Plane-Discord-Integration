import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { config } from "./config.js";
import type { AiJobType, RequestPriority, RequestType, WorkItemKind, WorkStage } from "./domain.js";

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

export interface WorkItemRecord {
  id: string;
  kind: WorkItemKind;
  parentId: string | null;
  createdByDiscordUserId: string;
  createdByDiscordUsername: string;
  ownerDiscordUserId: string | null;
  ownerDiscordUsername: string | null;
  title: string;
  details: string;
  priority: RequestPriority;
  stage: WorkStage;
  planeIssueId: string | null;
  planeSequenceId: number | null;
  planeIdentifier: string | null;
  planeUrl: string | null;
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

export interface KnownPersonRecord {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
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
  parent_id: string | null;
  created_by_discord_user_id: string;
  created_by_discord_username: string;
  owner_discord_user_id: string | null;
  owner_discord_username: string | null;
  title: string;
  details: string;
  priority: RequestPriority;
  stage: WorkStage;
  plane_issue_id: string | null;
  plane_sequence_id: number | null;
  plane_identifier: string | null;
  plane_url: string | null;
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
    parent_id TEXT,
    created_by_discord_user_id TEXT NOT NULL,
    created_by_discord_username TEXT NOT NULL,
    owner_discord_user_id TEXT,
    owner_discord_username TEXT,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    priority TEXT NOT NULL,
    stage TEXT NOT NULL,
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

  CREATE TABLE IF NOT EXISTS work_comments (
    id TEXT PRIMARY KEY,
    work_item_id TEXT NOT NULL,
    parent_comment_id TEXT,
    discord_user_id TEXT,
    discord_avatar_url TEXT,
    discord_username TEXT NOT NULL,
    author_type TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_work_comments_work_item_id
    ON work_comments(work_item_id);

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
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_work_comments_parent_comment_id
    ON work_comments(parent_comment_id);
`);

function nowIso(): string {
  return new Date().toISOString();
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
    parentId: row.parent_id,
    createdByDiscordUserId: row.created_by_discord_user_id,
    createdByDiscordUsername: row.created_by_discord_username,
    ownerDiscordUserId: row.owner_discord_user_id,
    ownerDiscordUsername: row.owner_discord_username,
    title: row.title,
    details: row.details,
    priority: row.priority,
    stage: row.stage,
    planeIssueId: row.plane_issue_id,
    planeSequenceId: row.plane_sequence_id,
    planeIdentifier: row.plane_identifier,
    planeUrl: row.plane_url,
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
  input: Omit<WorkItemRecord, "createdAt" | "updatedAt">
): WorkItemRecord {
  const createdAt = nowIso();
  const record: WorkItemRecord = {
    ...input,
    createdAt,
    updatedAt: createdAt
  };

  db.prepare(`
    INSERT INTO work_items (
      id,
      kind,
      parent_id,
      created_by_discord_user_id,
      created_by_discord_username,
      owner_discord_user_id,
      owner_discord_username,
      title,
      details,
      priority,
      stage,
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
      @parentId,
      @createdByDiscordUserId,
      @createdByDiscordUsername,
      @ownerDiscordUserId,
      @ownerDiscordUsername,
      @title,
      @details,
      @priority,
      @stage,
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
          ORDER BY updated_at DESC
        `)
        .all(discordUserId, discordUserId) as WorkItemRow[]);

  return rows.map(mapWorkItem);
}

export function listWorkItemsByParent(parentId: string): WorkItemRecord[] {
  const rows = db
    .prepare("SELECT * FROM work_items WHERE parent_id = ? ORDER BY created_at ASC")
    .all(parentId) as WorkItemRow[];

  return rows.map(mapWorkItem);
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

  db.prepare(`
    UPDATE work_items
    SET
      stage = @stage,
      kind = @kind,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    stage,
    kind: kind ?? current.kind,
    updatedAt
  });

  return getWorkItemById(id);
}

export function touchWorkItem(id: string, timestamp = nowIso()): WorkItemRecord | null {
  db.prepare("UPDATE work_items SET updated_at = ? WHERE id = ?").run(timestamp, id);
  return getWorkItemById(id);
}

export function updateWorkItemOwner(
  id: string,
  owner: Pick<WorkItemRecord, "ownerDiscordUserId" | "ownerDiscordUsername">
): WorkItemRecord | null {
  const updatedAt = nowIso();

  db.prepare(`
    UPDATE work_items
    SET
      owner_discord_user_id = @ownerDiscordUserId,
      owner_discord_username = @ownerDiscordUsername,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({ id, ...owner, updatedAt });

  return getWorkItemById(id);
}

export function insertWorkComment(
  input: Omit<WorkCommentRecord, "createdAt">
): WorkCommentRecord {
  const record: WorkCommentRecord = {
    ...input,
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
      @createdAt
    )
  `).run(record);

  touchWorkItem(record.workItemId, record.createdAt);

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

export function archiveInactiveWorkItems(days = 30): WorkItemRecord[] {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(`
      SELECT * FROM work_items
      WHERE updated_at < @cutoff
        AND stage NOT IN ('done', 'parked', 'killed')
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

  return record;
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

export function listKnownPeople(): KnownPersonRecord[] {
  const rows = db
    .prepare(
      `
        SELECT discord_user_id, display_name, avatar_url, priority
        FROM (
          SELECT discord_user_id, discord_username AS display_name, discord_avatar_url AS avatar_url, 1 AS priority
          FROM work_comments
          WHERE discord_user_id IS NOT NULL AND author_type = 'user'
          UNION ALL
          SELECT discord_user_id, discord_username AS display_name, discord_avatar_url AS avatar_url, 2 AS priority
          FROM requests
          UNION ALL
          SELECT discord_user_id, discord_username AS display_name, NULL AS avatar_url, 3 AS priority
          FROM comments
          UNION ALL
          SELECT owner_discord_user_id AS discord_user_id, owner_discord_username AS display_name, NULL AS avatar_url, 4 AS priority
          FROM work_items
          WHERE owner_discord_user_id IS NOT NULL
          UNION ALL
          SELECT created_by_discord_user_id AS discord_user_id, created_by_discord_username AS display_name, NULL AS avatar_url, 5 AS priority
          FROM work_items
        )
        WHERE discord_user_id IS NOT NULL
          AND display_name IS NOT NULL
          AND display_name != discord_user_id
          AND lower(display_name) != 'project desk ai'
        ORDER BY discord_user_id ASC, priority ASC, avatar_url IS NULL ASC, lower(display_name) ASC
      `
    )
    .all() as Array<{ discord_user_id: string; display_name: string; avatar_url: string | null; priority: number }>;

  const peopleById = new Map<string, KnownPersonRecord>();

  for (const row of rows) {
    if (!peopleById.has(row.discord_user_id)) {
      peopleById.set(row.discord_user_id, {
        discordUserId: row.discord_user_id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url
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
