import type {
  AiJobType,
  BoardItem,
  CurrentUser,
  KnownPerson,
  MeResponse,
  NotificationRecord,
  ProjectDeskEvent,
  PublicConfig,
  RequestPriority,
  WorkComment,
  WorkItemDetailPayload,
  WorkItemKind,
  WorkItemSummary,
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
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(payload?.error ?? "Request failed.", response.status, payload?.details);
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

export function listWorkItems(): Promise<{ items: WorkItemSummary[] }> {
  return apiFetch<{ items: WorkItemSummary[] }>("/api/work-items");
}

export function listPeople(): Promise<{ people: KnownPerson[] }> {
  return apiFetch<{ people: KnownPerson[] }>("/api/people");
}

export function createWorkItem(input: {
  title: string;
  details: string;
  kind?: WorkItemKind;
  priority?: RequestPriority;
  parentId?: string | null;
}): Promise<{ item: WorkItemSummary }> {
  return apiFetch<{ item: WorkItemSummary }>("/api/work-items", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getWorkItem(id: string): Promise<WorkItemDetailPayload> {
  return apiFetch(`/api/work-items/${id}`);
}

export function addWorkComment(
  id: string,
  body: string,
  parentCommentId?: string | null
): Promise<{ comment: WorkComment }> {
  return apiFetch(`/api/work-items/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, parentCommentId })
  });
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
