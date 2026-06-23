export const requestTypes = ["bug", "feature", "support", "task", "other"] as const;
export const requestPriorities = ["urgent", "high", "medium", "low", "none"] as const;
export const codexReasoningEfforts = ["low", "medium", "high", "xhigh"] as const;
export const workItemKinds = ["idea", "project", "task"] as const;
export const ideaCategories = ["product", "automation", "content", "operations", "community", "research", "games", "learning", "other"] as const;
export const taskStatuses = ["todo", "in_progress", "complete"] as const;
export const taskCompletionReasons = ["done", "canceled", "not_needed", "duplicate"] as const;
export const notificationTypes = [
  "item_assigned",
  "task_assigned",
  "mention",
  "reply",
  "followed_comment",
  "followed_task_created",
  "followed_item_promoted",
  "followed_task_status",
  "review_needed",
  "blocker",
  "ai_question",
  "digest"
] as const;
export const projectDeskAiUserId = "project-desk-ai";
export const projectDeskAiDisplayName = "Project Desk AI";
export const projectDeskAiTagName = "AI";
export const workStages = [
  "review",
  "planning",
  "active",
  "reviewing",
  "done",
  "parked"
] as const;
export const aiJobTypes = [
  "idea_brief",
  "validation_review",
  "project_plan",
  "task_breakdown",
  "progress_review",
  "build_demo",
  "comment_review",
  "stage_review",
  "digest"
] as const;

export type RequestType = (typeof requestTypes)[number];
export type RequestPriority = (typeof requestPriorities)[number];
export type CodexReasoningEffort = (typeof codexReasoningEfforts)[number];
export type WorkItemKind = (typeof workItemKinds)[number];
export type IdeaCategory = (typeof ideaCategories)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type TaskCompletionReason = (typeof taskCompletionReasons)[number];
export type NotificationType = (typeof notificationTypes)[number];
export type NotificationPreferences = Record<NotificationType, boolean>;
export type WorkStage = (typeof workStages)[number];
export type AiJobType = (typeof aiJobTypes)[number];

export function isProjectDeskAiUserId(value: string | null | undefined): boolean {
  return value === projectDeskAiUserId;
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  tagName: string | null;
  notificationPreferences: NotificationPreferences;
  roles: string[];
  isAdmin: boolean;
}

export const defaultNotificationPreferences: NotificationPreferences = {
  item_assigned: true,
  task_assigned: true,
  mention: true,
  reply: true,
  followed_comment: true,
  followed_task_created: true,
  followed_item_promoted: true,
  followed_task_status: true,
  review_needed: true,
  blocker: true,
  ai_question: true,
  digest: true
};

export interface RequestStatus {
  id: string | null;
  name: string;
  group: string | null;
  color: string | null;
}

export interface WorkStageDefinition {
  id: WorkStage;
  name: string;
  group: "planning" | "execution" | "review" | "closed";
  color: string;
}

export const workStageDefinitions: WorkStageDefinition[] = [
  { id: "review", name: "Review", group: "review", color: "#c4b5fd" },
  { id: "planning", name: "Planning", group: "planning", color: "#fbbf24" },
  { id: "active", name: "Active", group: "execution", color: "#60a5fa" },
  { id: "reviewing", name: "Reviewing", group: "review", color: "#f472b6" },
  { id: "done", name: "Done", group: "closed", color: "#34d399" },
  { id: "parked", name: "Parked", group: "closed", color: "#94a3b8" }
];

export function stageDefinition(stage: WorkStage): WorkStageDefinition {
  return workStageDefinitions.find((item) => item.id === stage) ?? workStageDefinitions[0];
}

export function isArchivedStage(stage: WorkStage): boolean {
  return stage === "done" || stage === "parked";
}

export function defaultAiJobForStage(stage: WorkStage): AiJobType | null {
  switch (stage) {
    case "review":
      return "validation_review";
    case "planning":
      return "project_plan";
    case "active":
      return "task_breakdown";
    case "reviewing":
      return "progress_review";
    default:
      return null;
  }
}
