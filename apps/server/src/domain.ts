export const requestTypes = ["bug", "feature", "support", "task", "other"] as const;
export const requestPriorities = ["urgent", "high", "medium", "low", "none"] as const;
export const workItemKinds = ["idea", "project", "task"] as const;
export const workStages = [
  "inbox",
  "review",
  "validated",
  "planning",
  "active",
  "reviewing",
  "done",
  "parked",
  "killed"
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
export type WorkItemKind = (typeof workItemKinds)[number];
export type WorkStage = (typeof workStages)[number];
export type AiJobType = (typeof aiJobTypes)[number];

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roles: string[];
  isAdmin: boolean;
}

export interface RequestStatus {
  id: string | null;
  name: string;
  group: string | null;
  color: string | null;
}

export interface WorkStageDefinition {
  id: WorkStage;
  name: string;
  group: "intake" | "planning" | "execution" | "review" | "closed";
  color: string;
}

export const workStageDefinitions: WorkStageDefinition[] = [
  { id: "inbox", name: "Inbox", group: "intake", color: "#93c5fd" },
  { id: "review", name: "Review", group: "review", color: "#c4b5fd" },
  { id: "validated", name: "Validated", group: "planning", color: "#5eead4" },
  { id: "planning", name: "Planning", group: "planning", color: "#fbbf24" },
  { id: "active", name: "Active", group: "execution", color: "#60a5fa" },
  { id: "reviewing", name: "Reviewing", group: "review", color: "#f472b6" },
  { id: "done", name: "Done", group: "closed", color: "#34d399" },
  { id: "parked", name: "Parked", group: "closed", color: "#94a3b8" },
  { id: "killed", name: "Killed", group: "closed", color: "#fb7185" }
];

export function stageDefinition(stage: WorkStage): WorkStageDefinition {
  return workStageDefinitions.find((item) => item.id === stage) ?? workStageDefinitions[0];
}

export function isArchivedStage(stage: WorkStage): boolean {
  return stage === "done" || stage === "parked" || stage === "killed";
}

export function defaultAiJobForStage(stage: WorkStage): AiJobType | null {
  switch (stage) {
    case "inbox":
      return "idea_brief";
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
