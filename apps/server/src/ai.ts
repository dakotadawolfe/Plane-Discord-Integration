import { config } from "./config.js";
import type { AiArtifactRecord, WorkCommentRecord, WorkItemRecord } from "./db.js";
import type { AiJobType, RequestPriority } from "./domain.js";

export interface SuggestedTask {
  title: string;
  details: string;
  priority: RequestPriority;
}

export interface AiContext {
  workItem: WorkItemRecord;
  comments: WorkCommentRecord[];
  artifacts: AiArtifactRecord[];
  childItems: WorkItemRecord[];
  jobType: AiJobType;
  reason: string;
}

export interface AiResult {
  title: string;
  body: string;
  rawJson?: string | null;
  suggestedTasks?: SuggestedTask[];
  dmBody?: string | null;
}

export interface AiClient {
  generate(context: AiContext): Promise<AiResult>;
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

function jobLabel(type: AiJobType): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function compactContext(context: AiContext): string {
  const { workItem, comments, artifacts, childItems } = context;
  const latestComments = comments.slice(-8).map((comment) => {
    return `- ${comment.discordUsername} (${comment.authorType}): ${comment.body}`;
  });
  const latestArtifacts = artifacts.slice(0, 5).map((artifact) => {
    return `- ${artifact.title} (${artifact.type}): ${artifact.body.slice(0, 800)}`;
  });
  const children = childItems.slice(0, 12).map((item) => {
    return `- ${item.title} [${item.kind}/${item.stage}/${item.priority}]: ${item.details}`;
  });

  return [
    `Item: ${workItem.title}`,
    `Kind: ${workItem.kind}`,
    `Stage: ${workItem.stage}`,
    `Priority: ${workItem.priority}`,
    `Owner: ${workItem.ownerDiscordUsername ?? "Unassigned"}`,
    `Details:\n${workItem.details}`,
    latestComments.length ? `Recent comments:\n${latestComments.join("\n")}` : "Recent comments: none",
    latestArtifacts.length ? `Existing AI artifacts:\n${latestArtifacts.join("\n\n")}` : "Existing AI artifacts: none",
    children.length ? `Child tasks/items:\n${children.join("\n")}` : "Child tasks/items: none"
  ].join("\n\n");
}

function systemPrompt(): string {
  return [
    "You are Project Desk's background workflow worker.",
    "You are not a general chat assistant. You read the current project state and produce structured productivity artifacts.",
    "Be practical, skeptical, and concise. Separate confirmed facts from assumptions.",
    "Never ask for or reveal API keys, OAuth tokens, passwords, cookies, private keys, or raw credentials.",
    "Do not suggest public Discord channel spam. Prefer in-app comments and DMs.",
    "Do not run commands. If execution seems needed, describe the action as a recommendation unless it is a local whitelisted Project Desk action.",
    "Return JSON only with keys: title, body, suggestedTasks, dmBody.",
    "body must be Markdown. suggestedTasks must be an array of { title, details, priority } using priority urgent/high/medium/low/none."
  ].join(" ");
}

function userPrompt(context: AiContext): string {
  return [
    `Workflow job: ${jobLabel(context.jobType)}`,
    `Reason: ${context.reason}`,
    "Create the appropriate artifact for this phase.",
    "For idea_brief, summarize target user, pain, wedge, unknowns, and next step.",
    "For validation_review, score pain/urgency/pay/complexity/distribution and recommend Validate, Park, or Kill.",
    "For project_plan, include scope, non-scope, milestones, success criteria, required access, and risks.",
    "For task_breakdown, produce 3 to 7 concrete tasks in suggestedTasks.",
    "For progress_review, summarize progress, blockers, stale work, and next action.",
    "For build_demo, produce a build-ready package and builder prompt, but do not approve execution.",
    "For comment_review, respond to the new context with a short useful workflow comment.",
    compactContext(context)
  ].join("\n\n");
}

function parseAiJson(text: string, fallbackTitle: string): AiResult {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");

  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<AiResult>;
      return {
        title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : fallbackTitle,
        body: typeof parsed.body === "string" && parsed.body.trim() ? parsed.body.trim() : trimmed,
        rawJson: JSON.stringify(parsed),
        suggestedTasks: Array.isArray(parsed.suggestedTasks)
          ? parsed.suggestedTasks
              .filter((item): item is SuggestedTask => {
                if (!item || typeof item !== "object") {
                  return false;
                }
                const task = item as SuggestedTask;
                return typeof task.title === "string" && typeof task.details === "string";
              })
              .map((item) => ({
                title: item.title.slice(0, 160),
                details: item.details.slice(0, 2000),
                priority: ["urgent", "high", "medium", "low", "none"].includes(item.priority)
                  ? item.priority
                  : "medium"
              }))
          : [],
        dmBody: typeof parsed.dmBody === "string" ? parsed.dmBody : null
      };
    } catch {
      // Fall through to Markdown fallback.
    }
  }

  return {
    title: fallbackTitle,
    body: trimmed,
    rawJson: null,
    suggestedTasks: [],
    dmBody: null
  };
}

export class HermesAiClient implements AiClient {
  async generate(context: AiContext): Promise<AiResult> {
    const response = await fetch(`${config.ai.hermesBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.ai.hermesApiKey ? { Authorization: `Bearer ${config.ai.hermesApiKey}` } : {})
      },
      body: JSON.stringify({
        model: config.ai.hermesModel,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: userPrompt(context) }
        ]
      })
    });

    if (!response.ok) {
      throw new AiUnavailableError(`Hermes AI request failed with ${response.status}.`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new AiUnavailableError("Hermes AI response did not include content.");
    }

    return parseAiJson(content, jobLabel(context.jobType));
  }
}

export class DemoAiClient implements AiClient {
  async generate(context: AiContext): Promise<AiResult> {
    const { workItem, jobType } = context;
    const title = `${jobLabel(jobType)}: ${workItem.title}`;

    if (jobType === "task_breakdown") {
      const tasks: SuggestedTask[] = [
        {
          title: `Clarify ${workItem.title} scope`,
          details: "Write the smallest visible outcome, explicit non-scope, and the first proof needed.",
          priority: "high"
        },
        {
          title: `Build first ${workItem.title} deliverable`,
          details: "Create the smallest artifact or implementation slice that can be reviewed by the group.",
          priority: "medium"
        },
        {
          title: `Review ${workItem.title} with evidence`,
          details: "Collect screenshots, notes, or test output and decide whether to continue, revise, park, or kill.",
          priority: "medium"
        }
      ];

      return {
        title,
        body: [
          "## Task Breakdown",
          "This demo worker created a small execution path from the current plan.",
          "",
          "1. Clarify scope and proof.",
          "2. Build one visible deliverable.",
          "3. Review with evidence and decide the next move."
        ].join("\n"),
        rawJson: JSON.stringify({ provider: "demo", jobType, tasks }),
        suggestedTasks: tasks,
        dmBody: `${workItem.title} has a new task breakdown ready in Project Desk.`
      };
    }

    const sections: Record<AiJobType, string[]> = {
      idea_brief: [
        "## Idea Brief",
        `**Concept:** ${workItem.title}`,
        `**Target user:** The group member who feels this problem most often.`,
        "**Pain:** Needs validation through one concrete example.",
        "**Key unknowns:** Buyer/user, urgency, distribution, and smallest proof.",
        "**Next step:** Move to Review when the idea is ready for scoring."
      ],
      validation_review: [
        "## Validation Review",
        "**Pain:** 3/5",
        "**Urgency:** 3/5",
        "**Willingness to use/pay:** 2/5 until proven",
        "**Complexity:** 3/5",
        "**Distribution:** 2/5",
        "**Recommendation:** Validate if one real user can describe the problem in their own words; otherwise Park."
      ],
      project_plan: [
        "## Project Plan",
        "**Scope:** Build the smallest useful version that demonstrates the core workflow.",
        "**Non-scope:** Payments, public launch, complex permissions, and deep integrations.",
        "**Milestones:** define success, build first slice, review with the group.",
        "**Risks:** vague owner, unclear proof, and too much automation before the workflow is proven."
      ],
      task_breakdown: [
        "## Task Breakdown",
        "Create a short list of concrete next tasks tied to the current plan."
      ],
      progress_review: [
        "## Progress Review",
        "**Current state:** Review the latest comments and child tasks.",
        "**Likely blocker:** Missing owner, proof, or next visible output.",
        "**Recommended next action:** Assign one owner and one next deliverable."
      ],
      build_demo: [
        "## Build Demo Package",
        "**Demo outcome:** A build-ready package that can be handed to Codex/Hermes.",
        "**Acceptance criteria:** Runnable locally, clear empty states, reviewable screenshots, and no raw secrets.",
        "**Builder prompt:** Implement the smallest vertical slice described in this Project Desk item."
      ],
      comment_review: [
        "## Comment Review",
        "I read the latest comment and current phase.",
        "The useful next move is to either clarify the proof needed, assign an owner, or move the item to the next phase."
      ],
      stage_review: [
        "## Stage Review",
        `The item is now in **${workItem.stage}**.`,
        "I checked the phase policy and added the safest next workflow recommendation."
      ],
      digest: [
        "## Digest",
        "There are active Project Desk items that may need owner attention."
      ]
    };

    return {
      title,
      body: sections[jobType].join("\n"),
      rawJson: JSON.stringify({ provider: "demo", jobType }),
      suggestedTasks: [],
      dmBody: jobType === "progress_review" || jobType === "validation_review"
        ? `${title} is ready in Project Desk.`
        : null
    };
  }
}

export class DisabledAiClient implements AiClient {
  async generate(): Promise<AiResult> {
    throw new AiUnavailableError("AI worker is disabled. Set AI_PROVIDER=hermes or AI_PROVIDER=demo.");
  }
}

export function createAiClient(): AiClient {
  if (config.ai.provider === "hermes") {
    return new HermesAiClient();
  }

  if (config.ai.provider === "demo") {
    return new DemoAiClient();
  }

  return new DisabledAiClient();
}
