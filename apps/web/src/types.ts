export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roles: string[];
  isAdmin: boolean;
}

export interface MeResponse {
  authenticated: boolean;
  user: CurrentUser | null;
  planeFullBoardUrl: string | null;
  aiProvider: "hermes" | "demo" | "disabled";
  dmFirst: boolean;
}

export interface PublicConfig {
  discordClientId: string;
}

export interface KnownPerson {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
}

export type ProjectDeskEvent =
  | { type: "work_items_changed"; at: string }
  | { type: "work_item_changed"; workItemId: string; at: string }
  | { type: "notifications_changed"; at: string };

export type WorkItemKind = "idea" | "project" | "task";
export type WorkStage =
  | "inbox"
  | "review"
  | "validated"
  | "planning"
  | "active"
  | "reviewing"
  | "done"
  | "parked"
  | "killed";
export type RequestPriority = "urgent" | "high" | "medium" | "low" | "none";
export type AiJobType =
  | "idea_brief"
  | "validation_review"
  | "project_plan"
  | "task_breakdown"
  | "progress_review"
  | "build_demo"
  | "comment_review"
  | "stage_review"
  | "digest";

export interface RequestStatus {
  id: string | null;
  name: string;
  group: string | null;
  color: string | null;
}

export interface PlaneReference {
  issueId: string | null;
  sequenceId: number | null;
  identifier: string | null;
  url: string | null;
}

export interface WorkItemSummary {
  id: string;
  kind: WorkItemKind;
  parentId: string | null;
  title: string;
  details: string;
  priority: RequestPriority;
  stage: WorkStage;
  status: RequestStatus;
  owner: { discordUserId: string; displayName: string } | null;
  createdBy: { discordUserId: string; displayName: string };
  plane: PlaneReference;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemDetail extends WorkItemSummary {
  canOpenInPlane: boolean;
}

export interface WorkComment {
  id: string;
  parentCommentId: string | null;
  authorName: string;
  authorType: "user" | "ai" | "system";
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  source: "ai" | "local";
}

export interface Decision {
  id: string;
  workItemId: string;
  decision: string;
  actorDiscordUserId: string | null;
  actorName: string;
  rationale: string | null;
  createdAt: string;
}

export interface ActivityEvent {
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
  status: "pending" | "sent" | "failed";
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardItem {
  id: string;
  title: string;
  kind: WorkItemKind;
  priority: RequestPriority;
  sequenceId: number | null;
  identifier: string | null;
  url: string | null;
  status: RequestStatus;
}

export interface WorkItemDetailPayload {
  item: WorkItemDetail;
  comments: WorkComment[];
  decisions: Decision[];
  activity: ActivityEvent[];
  childItems: WorkItemSummary[];
}
