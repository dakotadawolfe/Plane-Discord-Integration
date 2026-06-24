export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  tagName: string | null;
  notificationPreferences: NotificationPreferences;
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
  tagName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export type NotificationPreferenceKey =
  | "item_assigned"
  | "task_assigned"
  | "mention"
  | "reply"
  | "followed_comment"
  | "followed_task_created"
  | "followed_item_promoted"
  | "followed_task_status"
  | "review_needed"
  | "blocker"
  | "ai_question"
  | "digest";

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

export interface UserProfile {
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

export type ProjectDeskEvent =
  | { type: "work_items_changed"; at: string }
  | { type: "work_item_changed"; workItemId: string; at: string }
  | { type: "notifications_changed"; at: string };

export type WorkItemKind = "idea" | "project" | "task";
export type IdeaCategory = "product" | "automation" | "content" | "operations" | "community" | "research" | "games" | "learning" | "other";
export type WorkStage =
  | "review"
  | "planning"
  | "active"
  | "reviewing"
  | "done"
  | "parked";
export type RequestPriority = "urgent" | "high" | "medium" | "low" | "none";
export type CodexReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type TaskStatus = "todo" | "in_progress" | "complete";
export type TaskCompletionReason = "done" | "canceled" | "not_needed" | "duplicate";
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
  sequenceId: number | null;
  identifier: string | null;
  parentId: string | null;
  title: string;
  details: string;
  category: IdeaCategory | null;
  priority: RequestPriority;
  codexReasoning: CodexReasoningEffort | null;
  stage: WorkStage;
  status: RequestStatus;
  taskStatus: TaskStatus | null;
  taskCompletionReason: TaskCompletionReason | null;
  context: CollaborationContext | null;
  owner: { discordUserId: string; displayName: string } | null;
  createdBy: { discordUserId: string; displayName: string };
  isFollowing: boolean;
  followersCount: number;
  openChildTaskCount: number;
  plane: PlaneReference;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemDetail extends WorkItemSummary {
  canOpenInPlane: boolean;
}

export type WorkItemLinkRelationship = "relates_to" | "blocked_by" | "blocks" | "caused_by" | "causes" | "duplicates";

export interface WorkItemLink {
  id: string;
  relationship: WorkItemLinkRelationship;
  direction: "outgoing" | "incoming";
  note: string | null;
  item: WorkItemSummary;
  createdBy: { discordUserId: string; displayName: string };
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemMemory {
  workItemId: string;
  body: string;
  updatedByDiscordUserId: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecentWorkItemVisit {
  item: WorkItemSummary;
  parentItem: WorkItemSummary | null;
  visitedAt: string;
}

export interface WorkItemTitleSuggestion {
  title: string;
  reason: string;
}

export interface UploadedAttachment {
  id: string;
  fileName: string;
  originalName: string;
  name?: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  createdAt: string;
}

export interface AnnotationMetadata {
  id: string;
  screen: string;
  path: string;
  note: string;
  createdAt: string;
  screenshot?: UploadedAttachment | null;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    viewportWidth: number;
    viewportHeight: number;
  };
}

export interface CollaborationItemReference {
  id: string;
  kind: WorkItemKind;
  title: string;
  identifier?: string | null;
  source: "current_page" | "mentioned";
}

export interface CollaborationPageContext {
  label: string;
  path: string;
  summary?: string | null;
}

export interface CollaborationContext {
  attachments?: UploadedAttachment[];
  annotations?: AnnotationMetadata[];
  itemReferences?: CollaborationItemReference[];
  pageContext?: CollaborationPageContext | null;
  sourceItemId?: string | null;
  sourceItemTitle?: string | null;
  sourceCommentId?: string | null;
  sourceCommentBody?: string | null;
  sourceReplies?: Array<{
    id: string;
    authorName: string;
    body: string;
    createdAt: string;
  }>;
}

export interface WorkComment {
  id: string;
  parentCommentId: string | null;
  authorName: string;
  authorType: "user" | "ai" | "system";
  avatarUrl: string | null;
  body: string;
  context: CollaborationContext | null;
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

export type InboxNotificationType = "mention" | "reply" | "assignment" | "task_update" | "annotation" | "ai_task_complete";

export interface InboxNotification {
  id: string;
  recipientUserId: string;
  actorUserId: string;
  actorDisplayName: string;
  type: InboxNotificationType;
  projectId: string | null;
  projectTitle: string | null;
  taskId: string | null;
  taskTitle: string | null;
  commentId: string | null;
  replyId: string | null;
  annotationId: string | null;
  targetUrl: string;
  previewText: string;
  locationLabel: string;
  createdAt: string;
  readAt: string | null;
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
  parentItem: WorkItemSummary | null;
  comments: WorkComment[];
  memory: WorkItemMemory | null;
  decisions: Decision[];
  activity: ActivityEvent[];
  links: WorkItemLink[];
  childItems: WorkItemSummary[];
}

export type AiTaskRunStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "restart_required"
  | "failed"
  | "timed_out"
  | "start_failed";

export interface AiTaskOutputEntry {
  id: string;
  stream: "system" | "stdout" | "stderr";
  text: string;
  at: string;
}

export interface AiTaskRunSnapshot {
  workItemId: string;
  status: AiTaskRunStatus;
  reason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  output: AiTaskOutputEntry[];
}

export type LocalCodexRunStatus = AiTaskRunStatus;
export type LocalCodexOutputEntry = AiTaskOutputEntry;
export type LocalCodexRunSnapshot = AiTaskRunSnapshot;

export type SourceSyncAction = "pull" | "push" | "restart" | "apply";
export type SourceSyncState = "idle" | "running" | "succeeded" | "failed";

export interface SourceSyncStatus {
  enabled: boolean;
  running: boolean;
  state: SourceSyncState;
  action: SourceSyncAction | null;
  actorName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  message: string | null;
  output: string[];
}
