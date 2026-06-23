import type {
  AiJobType,
  BoardItem,
  CollaborationContext,
  CodexReasoningEffort,
  CurrentUser,
  IdeaCategory,
  InboxNotification,
  KnownPerson,
  LocalCodexOutputEntry,
  LocalCodexRunSnapshot,
  MeResponse,
  NotificationRecord,
  NotificationPreferences,
  ProjectDeskEvent,
  PublicConfig,
  RecentWorkItemVisit,
  RequestPriority,
  SourceSyncAction,
  SourceSyncStatus,
  TaskCompletionReason,
  TaskStatus,
  WorkComment,
  WorkItemDetailPayload,
  WorkItemKind,
  WorkItemLink,
  WorkItemLinkRelationship,
  WorkItemSummary,
  WorkItemTitleSuggestion,
  UserProfile,
  UploadedAttachment,
  WorkStage
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormDataBody = typeof FormData !== "undefined" && init.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body && !isFormDataBody ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.text();
  let payload: unknown = null;

  if (body) {
    try {
      payload = JSON.parse(body);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = payload && typeof payload === "object" ? (payload as { error?: string; details?: unknown }) : null;
    const contentType = response.headers.get("content-type") ?? "";
    const fallbackMessage = contentType.includes("application/json")
      ? body.slice(0, 240) || "Request failed."
      : `Request failed with status ${response.status}.`;

    throw new ApiError(errorPayload?.error ?? fallbackMessage, response.status, errorPayload?.details);
  }

  return payload as T;
}

export function login(returnTo = window.location.pathname): void {
  window.location.href = `/api/auth/discord/start?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function logout(): Promise<void> {
  await apiFetch<void>("/api/auth/logout", { method: "POST" });
}

export function getPublicConfig(): Promise<PublicConfig> {
  return apiFetch<PublicConfig>("/api/public-config");
}

export function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/me");
}

export function exchangeDiscordActivityCode(code: string): Promise<{
  accessToken: string;
  user: CurrentUser;
}> {
  return apiFetch("/api/auth/discord/activity", {
    method: "POST",
    body: JSON.stringify({ code })
  });
}

export function establishDiscordActivitySession(accessToken: string): Promise<{
  accessToken: string;
  user: CurrentUser;
}> {
  return apiFetch("/api/auth/discord/activity", {
    method: "POST",
    body: JSON.stringify({ accessToken })
  });
}

export function listWorkItems(): Promise<{ items: WorkItemSummary[] }> {
  return apiFetch<{ items: WorkItemSummary[] }>("/api/work-items");
}

export function getRecentWorkItemVisits(): Promise<{ visits: RecentWorkItemVisit[] }> {
  return apiFetch<{ visits: RecentWorkItemVisit[] }>("/api/work-items/recent-visits");
}

export function listPeople(): Promise<{ people: KnownPerson[] }> {
  return apiFetch<{ people: KnownPerson[] }>("/api/people");
}

export function updateProfile(input: {
  displayName?: string;
  tagName?: string | null;
  avatarUrl?: string | null;
  notificationPreferences?: Partial<NotificationPreferences>;
}): Promise<{ user: CurrentUser; profile: UserProfile }> {
  return apiFetch("/api/profile", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listAdminUsers(): Promise<{ users: UserProfile[] }> {
  return apiFetch("/api/admin/users");
}

export function updateAdminUser(
  discordUserId: string,
  input: {
    displayName?: string;
    tagName?: string | null;
    avatarUrl?: string | null;
    notificationPreferences?: Partial<NotificationPreferences>;
  }
): Promise<{ user: UserProfile }> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(discordUserId)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function getSourceSyncStatus(): Promise<{ sync: SourceSyncStatus }> {
  return apiFetch("/api/admin/source-sync");
}

export function startSourceSync(action: SourceSyncAction): Promise<{ sync: SourceSyncStatus }> {
  return apiFetch(`/api/admin/source-sync/${encodeURIComponent(action)}`, {
    method: "POST"
  });
}

export function createWorkItem(input: {
  title: string;
  details: string;
  kind?: WorkItemKind;
  category?: IdeaCategory | null;
  priority?: RequestPriority;
  codexReasoning?: CodexReasoningEffort;
  parentId?: string | null;
  ownerDiscordUserId?: string | null;
  context?: CollaborationContext | null;
}): Promise<{ item: WorkItemSummary }> {
  return apiFetch<{ item: WorkItemSummary }>("/api/work-items", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getWorkItem(id: string): Promise<WorkItemDetailPayload> {
  return apiFetch(`/api/work-items/${id}`);
}

export function addWorkItemLink(
  id: string,
  input: {
    targetWorkItemId: string;
    relationship: WorkItemLinkRelationship;
    note?: string | null;
  }
): Promise<{ link: WorkItemLink }> {
  return apiFetch(`/api/work-items/${id}/links`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function deleteWorkItemLink(id: string, linkId: string): Promise<{ link: WorkItemLink | null }> {
  return apiFetch(`/api/work-items/${id}/links/${linkId}`, {
    method: "DELETE"
  });
}

export function addWorkComment(
  id: string,
  body: string,
  parentCommentId?: string | null,
  context?: CollaborationContext | null
): Promise<{ comment: WorkComment }> {
  return apiFetch(`/api/work-items/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, parentCommentId, context })
  });
}

function createAttachmentFormData(files: File[]): FormData {
  const formData = new FormData();

  for (const file of files) {
    formData.append("files", file, file.name || "pasted-file");
  }

  return formData;
}

function normalizeAttachmentUrls(
  payload: { attachments: UploadedAttachment[] },
  urlBase: "/api/uploads" | "/uploads"
): { attachments: UploadedAttachment[] } {
  if (urlBase === "/api/uploads") {
    return payload;
  }

  return {
    attachments: payload.attachments.map((attachment) => ({
      ...attachment,
      url: attachment.url.replace(/^\/api\/uploads\b/, urlBase),
      thumbnailUrl: attachment.thumbnailUrl?.replace(/^\/api\/uploads\b/, urlBase)
    }))
  };
}

async function uploadAttachmentsToPath(
  path: "/api/uploads" | "/uploads",
  files: File[]
): Promise<{ attachments: UploadedAttachment[] }> {
  const payload = await apiFetch<{ attachments: UploadedAttachment[] }>(path, {
    method: "POST",
    body: createAttachmentFormData(files)
  });

  return normalizeAttachmentUrls(payload, path);
}

export async function uploadAttachments(files: File[]): Promise<{ attachments: UploadedAttachment[] }> {
  try {
    return await uploadAttachmentsToPath("/api/uploads", files);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      throw error;
    }
  }

  try {
    return await uploadAttachmentsToPath("/uploads", files);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError(
        "Attachment uploads returned 404. Restart the Project Desk server or check that /api is routed to the backend.",
        404,
        error.details
      );
    }

    throw error;
  }
}

export function updateWorkItemStage(
  id: string,
  stage: WorkStage,
  rationale?: string
): Promise<{ item: WorkItemSummary }> {
  return apiFetch(`/api/work-items/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage, rationale })
  });
}

export function updateWorkItemFollow(id: string, following: boolean): Promise<{ item: WorkItemSummary }> {
  return apiFetch(`/api/work-items/${id}/follow`, {
    method: "PATCH",
    body: JSON.stringify({ following })
  });
}

export function suggestWorkItemTitle(id: string): Promise<{ suggestion: WorkItemTitleSuggestion }> {
  return apiFetch(`/api/work-items/${id}/title-suggestion`, {
    method: "POST"
  });
}

export function updateWorkItemTitle(id: string, title: string): Promise<{ item: WorkItemSummary }> {
  return apiFetch(`/api/work-items/${id}/title`, {
    method: "PATCH",
    body: JSON.stringify({ title })
  });
}

export function updateWorkItemCategory(id: string, category: IdeaCategory): Promise<{ item: WorkItemSummary }> {
  return apiFetch(`/api/work-items/${id}/category`, {
    method: "PATCH",
    body: JSON.stringify({ category })
  });
}

export function updateWorkItemPriority(id: string, priority: RequestPriority): Promise<{ item: WorkItemSummary }> {
  return apiFetch(`/api/work-items/${id}/priority`, {
    method: "PATCH",
    body: JSON.stringify({ priority })
  });
}

export function updateWorkItemAssignee(
  id: string,
  discordUserId: string | null,
  codexReasoning?: CodexReasoningEffort
): Promise<{ item: WorkItemSummary }> {
  return apiFetch(`/api/work-items/${id}/assignee`, {
    method: "PATCH",
    body: JSON.stringify({ discordUserId, codexReasoning })
  });
}

export function promoteIdea(id: string): Promise<{ item: WorkItemSummary }> {
  return apiFetch(`/api/work-items/${id}/promote`, {
    method: "POST"
  });
}

export function updateTaskStatus(
  id: string,
  taskStatus: TaskStatus,
  completionReason?: TaskCompletionReason | null
): Promise<{ item: WorkItemSummary }> {
  return apiFetch(`/api/work-items/${id}/task-status`, {
    method: "PATCH",
    body: JSON.stringify({ taskStatus, completionReason })
  });
}

export function deleteWorkItem(id: string): Promise<{
  deletedCount: number;
  deletedIds: string[];
  parentId: string | null;
  kind: WorkItemKind;
}> {
  return apiFetch(`/api/work-items/${id}`, {
    method: "DELETE"
  });
}

export function enqueueAiJob(
  id: string,
  type: AiJobType,
  reason?: string
): Promise<{ aiJob: { id: string; type: AiJobType; status: string } }> {
  return apiFetch(`/api/work-items/${id}/ai-jobs`, {
    method: "POST",
    body: JSON.stringify({ type, reason })
  });
}

export function getNotifications(): Promise<{ notifications: NotificationRecord[] }> {
  return apiFetch("/api/notifications");
}

export function getInbox(): Promise<{ notifications: InboxNotification[]; unreadCount: number }> {
  return apiFetch("/api/inbox");
}

export function getInboxUnreadCount(): Promise<{ unreadCount: number }> {
  return apiFetch("/api/inbox/unread-count");
}

export function markInboxNotificationRead(id: string): Promise<{ notification: InboxNotification; unreadCount: number }> {
  return apiFetch(`/api/inbox/${encodeURIComponent(id)}/read`, {
    method: "PATCH"
  });
}

export function markInboxTargetRead(input: {
  workItemId?: string | null;
  commentId?: string | null;
  replyId?: string | null;
  annotationId?: string | null;
}): Promise<{ readCount: number; unreadCount: number }> {
  return apiFetch("/api/inbox/read-target", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function markAllInboxRead(): Promise<{ readCount: number; unreadCount: number }> {
  return apiFetch("/api/inbox/mark-all-read", {
    method: "POST"
  });
}

export function startDevSession(input: {
  userId: string;
  username?: string;
  displayName: string;
  tagName?: string | null;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}): Promise<{ user: CurrentUser }> {
  return apiFetch("/api/dev/session", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getBoard(): Promise<{
  boardUrl: string | null;
  states: BoardItem["status"][];
  workItems: BoardItem[];
  recentItems: WorkItemSummary[];
  recentRequests: [];
}> {
  return apiFetch("/api/board");
}

export function updateBoardItemState(id: string, stateId: WorkStage): Promise<{ workItem: BoardItem }> {
  return apiFetch(`/api/board/items/${encodeURIComponent(id)}/state`, {
    method: "PATCH",
    body: JSON.stringify({ stateId })
  });
}

export function subscribeProjectDeskEvents(onEvent: (event: ProjectDeskEvent) => void): () => void {
  const source = new EventSource("/api/events", { withCredentials: true });
  const eventTypes: ProjectDeskEvent["type"][] = ["work_items_changed", "work_item_changed", "notifications_changed"];
  const listeners = eventTypes.map((type) => {
    const listener = (event: MessageEvent<string>) => {
      try {
        onEvent(JSON.parse(event.data) as ProjectDeskEvent);
      } catch {
        // Ignore malformed event payloads and keep the stream alive.
      }
    };

    source.addEventListener(type, listener);
    return { type, listener };
  });

  source.onerror = () => {
    // Native EventSource retries automatically. Timed page refreshes cover longer disconnects.
  };

  return () => {
    for (const { type, listener } of listeners) {
      source.removeEventListener(type, listener);
    }

    source.close();
  };
}

export function subscribeLocalCodexOutput(
  workItemId: string,
  handlers: {
    onSnapshot: (snapshot: LocalCodexRunSnapshot) => void;
    onOutput: (output: LocalCodexOutputEntry) => void;
    onError?: () => void;
  }
): () => void {
  const source = new EventSource(`/api/work-items/${encodeURIComponent(workItemId)}/ai-output`, {
    withCredentials: true
  });
  const snapshotListener = (event: MessageEvent<string>) => {
    try {
      handlers.onSnapshot(JSON.parse(event.data) as LocalCodexRunSnapshot);
    } catch {
      // Ignore malformed event payloads and keep the stream alive.
    }
  };
  const outputListener = (event: MessageEvent<string>) => {
    try {
      handlers.onOutput(JSON.parse(event.data) as LocalCodexOutputEntry);
    } catch {
      // Ignore malformed event payloads and keep the stream alive.
    }
  };

  source.addEventListener("snapshot", snapshotListener);
  source.addEventListener("output", outputListener);
  source.onerror = () => handlers.onError?.();

  return () => {
    source.removeEventListener("snapshot", snapshotListener);
    source.removeEventListener("output", outputListener);
    source.close();
  };
}

export function getLocalCodexOutputSnapshot(workItemId: string): Promise<LocalCodexRunSnapshot> {
  return apiFetch(`/api/work-items/${encodeURIComponent(workItemId)}/ai-output/snapshot`);
}
