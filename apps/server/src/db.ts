import Database from "better-sqlite3";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { config } from "./config.js";
import type { RequestPriority, RequestType } from "./domain.js";

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
