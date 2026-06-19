import type {
  BoardItem,
  CurrentUser,
  MeResponse,
  PublicConfig,
  RequestComment,
  RequestDetail,
  RequestPriority,
  RequestSummary,
  RequestType
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

export function listRequests(): Promise<{ requests: RequestSummary[] }> {
  return apiFetch<{ requests: RequestSummary[] }>("/api/requests");
}

export function createRequest(input: {
  title: string;
  type: RequestType;
  priority: RequestPriority;
  details: string;
}): Promise<{ request: RequestSummary }> {
  return apiFetch<{ request: RequestSummary }>("/api/requests", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getRequest(id: string): Promise<{
  request: RequestDetail;
  comments: RequestComment[];
}> {
  return apiFetch(`/api/requests/${id}`);
}

export function addComment(id: string, body: string): Promise<{ comment: RequestComment }> {
  return apiFetch(`/api/requests/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}

export function getBoard(): Promise<{
  boardUrl: string;
  states: BoardItem["status"][];
  workItems: BoardItem[];
  recentRequests: RequestSummary[];
}> {
  return apiFetch("/api/board");
}

export function updateBoardItemState(id: string, stateId: string): Promise<{ workItem: BoardItem }> {
  return apiFetch(`/api/board/items/${encodeURIComponent(id)}/state`, {
    method: "PATCH",
    body: JSON.stringify({ stateId })
  });
}
