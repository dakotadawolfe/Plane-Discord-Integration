import { config } from "./config.js";
import type { DemoWorkItemRecord } from "./db.js";
import {
  getDemoWorkItemById,
  getRequestByPlaneIssueId,
  insertDemoWorkItem,
  insertDemoWorkItemIfMissing,
  listDemoWorkItems,
  listLocalComments,
  nextDemoSequenceId,
  updateDemoWorkItemState
} from "./db.js";
import type { RequestPriority, RequestStatus, RequestType } from "./domain.js";
import { textToHtmlParagraphs } from "./html.js";
import { PlaneApiError, type PlaneComment, type PlaneLikeClient, type PlaneWorkItem } from "./plane.js";

const demoStates = {
  triage: {
    id: "demo-triage",
    name: "Triage",
    group: "backlog",
    color: "#93c5fd"
  },
  inProgress: {
    id: "demo-in-progress",
    name: "In Progress",
    group: "started",
    color: "#fbbf24"
  },
  done: {
    id: "demo-done",
    name: "Done",
    group: "completed",
    color: "#34d399"
  }
} satisfies Record<string, RequestStatus>;

const sampleWorkItems: Array<{
  id: string;
  name: string;
  priority: RequestPriority;
  sequenceId: number;
  identifier: string;
  state: RequestStatus;
  details: string;
}> = [
  {
    id: "demo-sample-triage",
    name: "Demo: route a new request",
    priority: "medium",
    sequenceId: -1,
    identifier: "PD-DEMO-201",
    state: demoStates.triage,
    details: "A sample item that keeps the demo board's Triage column visible."
  },
  {
    id: "demo-sample-in-progress",
    name: "Demo: update request status",
    priority: "high",
    sequenceId: -2,
    identifier: "PD-DEMO-202",
    state: demoStates.inProgress,
    details: "A sample item that keeps the demo board's In Progress column visible."
  },
  {
    id: "demo-sample-done",
    name: "Demo: close a completed request",
    priority: "low",
    sequenceId: -3,
    identifier: "PD-DEMO-203",
    state: demoStates.done,
    details: "A sample item that keeps the demo board's Done column visible."
  }
];

function demoIssueUrl(workItemId: string): string {
  const boardUrl = config.plane.fullBoardUrl;

  if (boardUrl.startsWith("/")) {
    return `${boardUrl}?demoIssue=${encodeURIComponent(workItemId)}`;
  }

  try {
    const url = new URL(boardUrl);
    url.searchParams.set("demoIssue", workItemId);
    return url.toString();
  } catch {
    return "/board";
  }
}

function stateFields(state: RequestStatus) {
  return {
    stateId: state.id ?? "demo-state",
    stateName: state.name,
    stateGroup: state.group ?? "backlog",
    stateColor: state.color ?? "#93c5fd"
  };
}

function demoStateById(stateId: string): RequestStatus | null {
  return Object.values(demoStates).find((state) => state.id === stateId) ?? null;
}

function recordToWorkItem(record: DemoWorkItemRecord): PlaneWorkItem {
  return {
    id: record.id,
    name: record.name,
    priority: record.priority,
    sequenceId: record.sequenceId,
    identifier: record.identifier,
    state: {
      id: record.stateId,
      name: record.stateName,
      group: record.stateGroup,
      color: record.stateColor
    },
    url: record.url,
    raw: {
      id: record.id,
      name: record.name,
      priority: record.priority,
      sequence_id: record.sequenceId,
      identifier: record.identifier,
      state: {
        id: record.stateId,
        name: record.stateName,
        group: record.stateGroup,
        color: record.stateColor
      },
      html_url: record.url,
      description_stripped: record.details,
      submitter: record.submitter,
      created_at: record.createdAt,
      updated_at: record.updatedAt
    }
  };
}

function notFound(workItemId: string): PlaneApiError {
  return new PlaneApiError("Demo work item was not found.", 404, { workItemId });
}

function ensureDemoSamples(): void {
  for (const sample of sampleWorkItems) {
    insertDemoWorkItemIfMissing({
      id: sample.id,
      requestId: null,
      name: sample.name,
      priority: sample.priority,
      sequenceId: sample.sequenceId,
      identifier: sample.identifier,
      ...stateFields(sample.state),
      url: demoIssueUrl(sample.id),
      details: sample.details,
      submitter: "Project Desk Demo"
    });
  }
}

export class DemoPlaneClient implements PlaneLikeClient {
  async createWorkItem(input: {
    requestId: string;
    title: string;
    type: RequestType;
    priority: RequestPriority;
    details: string;
    submitter: string;
  }): Promise<PlaneWorkItem> {
    const sequenceId = nextDemoSequenceId();
    const workItemId = `demo-${input.requestId}`;
    const identifier = `PD-DEMO-${sequenceId.toString().padStart(3, "0")}`;
    const record = insertDemoWorkItem({
      id: workItemId,
      requestId: input.requestId,
      name: input.title,
      priority: input.priority,
      sequenceId,
      identifier,
      ...stateFields(demoStates.triage),
      url: demoIssueUrl(workItemId),
      details: input.details,
      submitter: input.submitter
    });

    return recordToWorkItem(record);
  }

  async getWorkItem(workItemId: string): Promise<PlaneWorkItem> {
    const record = getDemoWorkItemById(workItemId);

    if (!record) {
      throw notFound(workItemId);
    }

    return recordToWorkItem(record);
  }

  async listStates(): Promise<RequestStatus[]> {
    return Object.values(demoStates);
  }

  async listWorkItems(): Promise<PlaneWorkItem[]> {
    ensureDemoSamples();
    return listDemoWorkItems().map(recordToWorkItem);
  }

  async updateWorkItemState(workItemId: string, stateId: string): Promise<PlaneWorkItem> {
    const state = demoStateById(stateId);

    if (!state) {
      throw new PlaneApiError("Demo state was not found.", 404, { stateId });
    }

    const record = updateDemoWorkItemState(workItemId, stateFields(state));

    if (!record) {
      throw notFound(workItemId);
    }

    return recordToWorkItem(record);
  }

  async listComments(workItemId: string): Promise<PlaneComment[]> {
    const record = getDemoWorkItemById(workItemId);

    if (!record) {
      throw notFound(workItemId);
    }

    if (!record.requestId) {
      return [];
    }

    return listLocalComments(record.requestId)
      .filter((comment) => Boolean(comment.planeCommentId))
      .map((comment) => ({
        id: comment.planeCommentId ?? comment.id,
        authorName: comment.discordUsername,
        bodyHtml: textToHtmlParagraphs(comment.body),
        createdAt: comment.createdAt
      }));
  }

  async createComment(input: {
    workItemId: string;
    commentId: string;
    body: string;
    authorName: string;
  }): Promise<PlaneComment> {
    const record = getDemoWorkItemById(input.workItemId);

    if (!record || !getRequestByPlaneIssueId(input.workItemId)) {
      throw notFound(input.workItemId);
    }

    return {
      id: input.commentId,
      authorName: input.authorName,
      bodyHtml: textToHtmlParagraphs(input.body),
      createdAt: new Date().toISOString()
    };
  }
}
