import { config } from "./config.js";
import type { RequestPriority, RequestStatus, RequestType } from "./domain.js";
import { escapeHtml, textToHtmlParagraphs } from "./html.js";

const externalSource = "project-desk";

export interface PlaneWorkItem {
  id: string;
  name: string;
  priority: string | null;
  sequenceId: number | null;
  identifier: string | null;
  state: RequestStatus;
  url: string | null;
  raw: Record<string, unknown>;
}

export interface PlaneComment {
  id: string;
  authorName: string;
  bodyHtml: string;
  createdAt: string;
}

export interface PlaneLikeClient {
  createWorkItem(input: {
    requestId: string;
    title: string;
    type: RequestType;
    priority: RequestPriority;
    details: string;
    submitter: string;
  }): Promise<PlaneWorkItem>;
  getWorkItem(workItemId: string): Promise<PlaneWorkItem>;
  listStates(): Promise<RequestStatus[]>;
  listWorkItems(): Promise<PlaneWorkItem[]>;
  updateWorkItemState(workItemId: string, stateId: string): Promise<PlaneWorkItem>;
  listComments(workItemId: string): Promise<PlaneComment[]>;
  createComment(input: {
    workItemId: string;
    commentId: string;
    body: string;
    authorName: string;
  }): Promise<PlaneComment>;
}

export class PlaneApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown
  ) {
    super(message);
    this.name = "PlaneApiError";
  }
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeState(rawState: unknown): RequestStatus {
  if (rawState && typeof rawState === "object") {
    const state = rawState as Record<string, unknown>;
    return {
      id: getString(state.id),
      name: getString(state.name) ?? "In Plane",
      group: getString(state.group),
      color: getString(state.color)
    };
  }

  return {
    id: getString(rawState),
    name: rawState ? "In Plane" : "Submitted",
    group: null,
    color: null
  };
}

function flattenResults(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const payload = value as Record<string, unknown>;

  if (Array.isArray(payload.results)) {
    return flattenResults(payload.results);
  }

  if (payload.results && typeof payload.results === "object") {
    return Object.values(payload.results).flatMap(flattenResults);
  }

  if (Array.isArray(payload.issues)) {
    return flattenResults(payload.issues);
  }

  return [];
}

function normalizeWorkItem(raw: unknown): PlaneWorkItem {
  if (!raw || typeof raw !== "object") {
    throw new PlaneApiError("Plane returned an invalid work item payload.", 502, raw);
  }

  const item = raw as Record<string, unknown>;
  const id = getString(item.id);

  if (!id) {
    throw new PlaneApiError("Plane work item payload did not include an id.", 502, raw);
  }

  return {
    id,
    name: getString(item.name) ?? "Untitled request",
    priority: getString(item.priority),
    sequenceId: getNumber(item.sequence_id),
    identifier: getString(item.identifier) ?? getString(item.issue_identifier),
    state: normalizeState(item.state),
    url:
      getString(item.url) ??
      getString(item.html_url) ??
      getString(item.issue_url) ??
      buildPlaneIssueUrl(id),
    raw: item
  };
}

function buildPlaneIssueUrl(issueId: string): string {
  try {
    const boardUrl = new URL(config.plane.fullBoardUrl);
    const path = boardUrl.pathname.replace(/\/+$/, "");

    if (path.endsWith("/issues")) {
      boardUrl.pathname = `${path}/${issueId}`;
    } else {
      boardUrl.searchParams.set("peekId", issueId);
    }

    return boardUrl.toString();
  } catch {
    return config.plane.fullBoardUrl;
  }
}

function workItemsPath(suffix = ""): string {
  return `/api/v1/workspaces/${encodeURIComponent(config.plane.workspaceSlug)}/projects/${encodeURIComponent(
    config.plane.projectId
  )}/work-items/${suffix}`;
}

function statesPath(suffix = ""): string {
  return `/api/v1/workspaces/${encodeURIComponent(config.plane.workspaceSlug)}/projects/${encodeURIComponent(
    config.plane.projectId
  )}/states/${suffix}`;
}

function commentPath(workItemId: string, suffix = ""): string {
  return `${workItemsPath(`${encodeURIComponent(workItemId)}/comments/`)}${suffix}`;
}

function requestDescriptionHtml(input: {
  type: RequestType;
  priority: RequestPriority;
  details: string;
  submitter: string;
  requestId: string;
}): string {
  return [
    textToHtmlParagraphs(input.details),
    "<hr />",
    `<p><strong>Type:</strong> ${escapeHtml(input.type)}</p>`,
    `<p><strong>Priority:</strong> ${escapeHtml(input.priority)}</p>`,
    `<p><strong>Submitted by:</strong> ${escapeHtml(input.submitter)}</p>`,
    `<p><strong>Project Desk request:</strong> ${escapeHtml(input.requestId)}</p>`
  ].join("");
}

export class PlaneClient implements PlaneLikeClient {
  async createWorkItem(input: {
    requestId: string;
    title: string;
    type: RequestType;
    priority: RequestPriority;
    details: string;
    submitter: string;
  }): Promise<PlaneWorkItem> {
    const body = {
      name: input.title,
      description_html: requestDescriptionHtml(input),
      description_stripped: input.details,
      priority: input.priority,
      external_source: externalSource,
      external_id: input.requestId
    };

    return normalizeWorkItem(await this.request(workItemsPath(), { method: "POST", body }));
  }

  async getWorkItem(workItemId: string): Promise<PlaneWorkItem> {
    const query = new URLSearchParams({ expand: "state" });
    return normalizeWorkItem(await this.request(`${workItemsPath(`${encodeURIComponent(workItemId)}/`)}?${query}`));
  }

  async listStates(): Promise<RequestStatus[]> {
    const query = new URLSearchParams({ per_page: "100" });
    const payload = await this.request(`${statesPath()}?${query}`);
    return flattenResults(payload).map(normalizeState);
  }

  async listWorkItems(): Promise<PlaneWorkItem[]> {
    const query = new URLSearchParams({
      expand: "state",
      per_page: "100",
      order_by: "-created_at"
    });
    const payload = await this.request(`${workItemsPath()}?${query}`);
    return flattenResults(payload).map(normalizeWorkItem);
  }

  async updateWorkItemState(workItemId: string, stateId: string): Promise<PlaneWorkItem> {
    const payload = await this.request(workItemsPath(`${encodeURIComponent(workItemId)}/`), {
      method: "PATCH",
      body: { state: stateId }
    });

    return normalizeWorkItem(payload);
  }

  async listComments(workItemId: string): Promise<PlaneComment[]> {
    const query = new URLSearchParams({ per_page: "100", order_by: "created_at" });
    const payload = await this.request(`${commentPath(workItemId)}?${query}`);

    return flattenResults(payload).map((raw) => {
      const actor = raw.actor && typeof raw.actor === "object" ? (raw.actor as Record<string, unknown>) : {};
      const authorName =
        getString(actor.display_name) ??
        [getString(actor.first_name), getString(actor.last_name)].filter(Boolean).join(" ") ??
        "Plane user";

      return {
        id: getString(raw.id) ?? crypto.randomUUID(),
        authorName: authorName || "Plane user",
        bodyHtml: getString(raw.comment_html) ?? "",
        createdAt: getString(raw.created_at) ?? new Date().toISOString()
      };
    });
  }

  async createComment(input: {
    workItemId: string;
    commentId: string;
    body: string;
    authorName: string;
  }): Promise<PlaneComment> {
    const commentHtml = [
      textToHtmlParagraphs(input.body),
      `<p><em>Added from Project Desk by ${escapeHtml(input.authorName)}.</em></p>`
    ].join("");

    const payload = await this.request(commentPath(input.workItemId), {
      method: "POST",
      body: {
        comment_html: commentHtml,
        access: "EXTERNAL",
        external_source: externalSource,
        external_id: input.commentId
      }
    });

    const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    return {
      id: getString(raw.id) ?? input.commentId,
      authorName: input.authorName,
      bodyHtml: getString(raw.comment_html) ?? commentHtml,
      createdAt: getString(raw.created_at) ?? new Date().toISOString()
    };
  }

  private async request(
    path: string,
    options: { method?: string; body?: unknown } = {}
  ): Promise<unknown> {
    const response = await fetch(`${config.plane.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": config.plane.apiKey
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    const text = await response.text();
    const payload = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      throw new PlaneApiError(`Plane API returned ${response.status}.`, response.status, payload ?? text);
    }

    return payload;
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
