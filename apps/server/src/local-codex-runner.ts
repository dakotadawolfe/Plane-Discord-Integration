import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { collectReferencedItemIdsFromContextJsons } from "./collaboration-context.js";
import { config } from "./config.js";
import {
  getWorkItemById,
  insertInboxNotification,
  insertActivityEvent,
  insertWorkComment,
  listWorkItemFollowerIds,
  listWorkComments,
  listWorkItemsByParent,
  updateWorkItemTaskStatus,
  type WorkCommentRecord,
  type WorkItemRecord
} from "./db.js";
import {
  isProjectDeskAiUserId,
  projectDeskAiDisplayName,
  projectDeskAiUserId,
  type CodexReasoningEffort,
  type RequestPriority
} from "./domain.js";
import { emitProjectDeskEvent } from "./events.js";

interface QueuedCodexTask {
  workItemId: string;
  actorName: string;
  reason: string;
  queuedAt: string;
}

interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type LocalCodexRunStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "restart_required"
  | "failed"
  | "timed_out"
  | "start_failed";

export interface LocalCodexOutputEntry {
  id: string;
  stream: "system" | "stdout" | "stderr";
  text: string;
  at: string;
}

export interface LocalCodexRunSnapshot {
  workItemId: string;
  status: LocalCodexRunStatus;
  reason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  output: LocalCodexOutputEntry[];
}

type LocalCodexOutputListener = (
  eventName: "snapshot" | "output",
  payload: LocalCodexRunSnapshot | LocalCodexOutputEntry
) => void;

interface LocalCodexRunState extends LocalCodexRunSnapshot {
  output: LocalCodexOutputEntry[];
}

const maxCapturedOutput = 18_000;
const maxLiveOutputEntries = 500;
const maxLiveOutputChunkLength = 6000;

function appendLimited(current: string, chunk: Buffer | string): string {
  if (current.length >= maxCapturedOutput) {
    return current;
  }

  const next = current + chunk.toString();
  return next.length > maxCapturedOutput ? `${next.slice(0, maxCapturedOutput)}\n\n[output truncated]` : next;
}

function redactSensitiveOutput(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "sk-[redacted]")
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "gh_[redacted]")
    .replace(/mfa\.[A-Za-z0-9_-]{20,}/g, "mfa.[redacted]")
    .replace(/(discord(?:[_-]?bot)?[_-]?token\s*[:=]\s*)[^\s]+/gi, "$1[redacted]");
}

function sanitizeCodexOutput(value: string): string {
  return redactSensitiveOutput(value).trim();
}

function sanitizeCodexOutputChunk(value: string): string {
  const redacted = redactSensitiveOutput(value).replace(/\r\n/g, "\n");
  return redacted.length > maxLiveOutputChunkLength
    ? `${redacted.slice(0, maxLiveOutputChunkLength)}\n\n[live output chunk truncated]`
    : redacted;
}

function stripTerminalControls(value: string): string {
  return value
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function normalizeCodexLine(value: string): string {
  return value
    .replace(/^[\s|>*+-]+/, "")
    .replace(/^[\u2500-\u257F\u2022\u203A\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeLiveToolNoise(line: string): boolean {
  return (
    !line ||
    line.startsWith("{") ||
    line.startsWith("[") ||
    /^(```|\*\*\*|@@|diff\b|index\b)/i.test(line) ||
    /^(tool|exec|shell|command|function|result|stdout|stderr|apply_patch|user|system)\b/i.test(line)
  );
}

function visibleCodexTextFromChunk(value: string): string {
  const lines = stripTerminalControls(value)
    .split("\n")
    .map(normalizeCodexLine);
  const visible: string[] = [];
  let inCodexBlock = false;

  for (const line of lines) {
    if (looksLikeLiveToolNoise(line)) {
      inCodexBlock = false;
      continue;
    }

    const codexLine = line.match(/^(?:codex|assistant|project desk ai)\b[:\s-]*(.*)$/i);

    if (codexLine) {
      const message = (codexLine[1] ?? "").trim();
      inCodexBlock = true;

      if (message) {
        visible.push(`Codex: ${message}`);
      }

      continue;
    }

    if (inCodexBlock) {
      visible.push(`Codex: ${line}`);
    }
  }

  return visible.join("\n");
}

function formatLiveCodexOutput(stream: LocalCodexOutputEntry["stream"], value: string): string {
  const cleanText = sanitizeCodexOutputChunk(value);

  if (stream === "system") {
    return cleanText;
  }

  return visibleCodexTextFromChunk(cleanText);
}

function insertSystemComment(workItemId: string, body: string, options?: { reopenCompletedTask?: boolean }): void {
  insertWorkComment({
    id: crypto.randomUUID(),
    workItemId,
    parentCommentId: null,
    discordUserId: null,
    discordAvatarUrl: null,
    discordUsername: "Project Desk",
    authorType: "system",
    body
  }, options);
}

function insertAiComment(workItemId: string, body: string): void {
  insertWorkComment({
    id: crypto.randomUUID(),
    workItemId,
    parentCommentId: null,
    discordUserId: null,
    discordAvatarUrl: null,
    discordUsername: projectDeskAiDisplayName,
    authorType: "ai",
    body
  });
}

function notifyAiCompletedTaskFollowers(task: WorkItemRecord, parent: WorkItemRecord | null): number {
  const recipientIds = new Set([
    ...listWorkItemFollowerIds(task.id),
    ...(parent ? listWorkItemFollowerIds(parent.id) : [])
  ]);
  let insertedCount = 0;

  for (const recipientUserId of recipientIds) {
    if (isProjectDeskAiUserId(recipientUserId)) {
      continue;
    }

    const id = crypto.randomUUID();
    insertInboxNotification({
      id,
      recipientUserId,
      actorUserId: projectDeskAiUserId,
      type: "ai_task_complete",
      projectId: task.parentId,
      taskId: task.id,
      commentId: null,
      replyId: null,
      annotationId: null,
      targetUrl: `/items/${encodeURIComponent(task.id)}?notification=${encodeURIComponent(id)}`,
      previewText: `${projectDeskAiDisplayName} marked "${task.title}" complete.`
    });
    insertedCount += 1;
  }

  return insertedCount;
}

function compactContextJson(value: string | null | undefined): string {
  return value ? `\n  context_json: ${value.slice(0, 1600)}` : "";
}

function compactComment(comment: WorkCommentRecord): string {
  return `- ${comment.discordUsername} (${comment.authorType}): ${comment.body.slice(0, 1200)}${compactContextJson(comment.contextJson)}`;
}

function compactTaskWithComments(item: WorkItemRecord): string {
  const comments = listWorkComments(item.id).slice(-6).map(compactComment);
  const lines = [
    `- ${item.title}`,
    `  id: ${item.id}`,
    `  kind/status: ${item.kind}/${item.taskStatus ?? item.stage}`,
    `  priority: ${item.priority}`,
    `  codex_reasoning: ${item.codexReasoning ?? "medium"}`,
    `  assigned to: ${item.ownerDiscordUsername ?? "Unassigned"}`,
    `  details: ${item.details.slice(0, 1200)}`,
    item.contextJson ? `  context_json: ${item.contextJson.slice(0, 1600)}` : ""
  ];

  if (comments.length) {
    lines.push("  recent comments:", ...comments.map((comment) => `  ${comment}`));
  }

  return lines.join("\n");
}

const priorityRanks: Record<RequestPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4
};

function priorityRank(priority: RequestPriority | null | undefined): number {
  return priority ? priorityRanks[priority] : priorityRanks.none;
}

function codexReasoningLabel(reasoning: CodexReasoningEffort): string {
  return reasoning === "xhigh" ? "Extra high" : reasoning.charAt(0).toUpperCase() + reasoning.slice(1);
}

function codexCommandArgs(reasoning: CodexReasoningEffort): string[] {
  return [
    "--ask-for-approval",
    "never",
    "-c",
    `model_reasoning_effort="${reasoning}"`,
    "exec",
    "--sandbox",
    "workspace-write",
    "-"
  ];
}

function buildPrompt(task: WorkItemRecord, parent: WorkItemRecord | null, reasoning: CodexReasoningEffort): string {
  const taskCommentRecords = listWorkComments(task.id);
  const parentCommentRecords = parent ? listWorkComments(parent.id) : [];
  const taskComments = taskCommentRecords.slice(-20).map(compactComment);
  const parentComments = parentCommentRecords.slice(-20).map(compactComment);
  const siblingAndRelatedTasks = parent
    ? listWorkItemsByParent(parent.id)
        .filter((item) => item.kind === "task")
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(compactTaskWithComments)
    : [];
  const directChildRecords = listWorkItemsByParent(task.id);
  const directChildren = directChildRecords.map(compactTaskWithComments);
  const referencedItems = collectReferencedItemIdsFromContextJsons(
    [
      task.contextJson,
      ...taskCommentRecords.map((comment) => comment.contextJson),
      parent?.contextJson,
      ...parentCommentRecords.map((comment) => comment.contextJson)
    ],
    [task.id, parent?.id, ...directChildRecords.map((item) => item.id)]
  )
    .map((id) => getWorkItemById(id))
    .filter((item): item is WorkItemRecord => Boolean(item))
    .map(compactTaskWithComments);

  return [
    "You are running from Project Desk as the local Codex task runner on Dakota's PC.",
    "Use the current repository directory as your workspace. Keep edits scoped to this Project Desk repo.",
    "Do not commit, push, rewrite git history, or change secrets. Do not reveal secrets from .env files, auth files, logs, or local config.",
    "If the task is unsafe, unclear, or not actionable in this repository, do not make code changes; explain what is needed instead.",
    "When you finish, return a concise Markdown report with: summary, files changed, verification run, and anything blocked.",
    "",
    `Task: ${task.title}`,
    `Task id: ${task.id}`,
    `Priority: ${task.priority}`,
    `Codex reasoning effort: ${codexReasoningLabel(reasoning)} (${reasoning})`,
    `Details:\n${task.details}`,
    task.contextJson ? `Task context JSON:\n${task.contextJson}` : "",
    `Current task status: ${task.taskStatus ?? "none"}`,
    `Assigned to: ${task.ownerDiscordUsername ?? "Unassigned"}`,
    parent
      ? [
          "",
          `Parent ${parent.kind}: ${parent.title}`,
          `Parent id: ${parent.id}`,
          `Parent phase: ${parent.stage}`,
          `Parent category: ${parent.category ?? "none"}`,
          `Parent priority: ${parent.priority}`,
          `Parent assigned to: ${parent.ownerDiscordUsername ?? "Unassigned"}`,
          `Parent details:\n${parent.details}`,
          parent.contextJson ? `Parent context JSON:\n${parent.contextJson}` : ""
        ].join("\n")
      : "",
    parentComments.length ? `\nParent ${parent?.kind ?? "item"} comments:\n${parentComments.join("\n")}` : "",
    taskComments.length ? `\nThis task comments:\n${taskComments.join("\n")}` : "",
    referencedItems.length ? `\nReferenced pages from side discussions or context:\n${referencedItems.join("\n\n")}` : "",
    siblingAndRelatedTasks.length ? `\nAll tasks on the parent item, including this task:\n${siblingAndRelatedTasks.join("\n\n")}` : "",
    directChildren.length ? `\nChild items under this task:\n${directChildren.join("\n\n")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function resultComment(result: ProcessResult, restartRequired: boolean): string {
  const cleanStdout = sanitizeCodexOutput(result.stdout);
  const cleanStderr = sanitizeCodexOutput(result.stderr);
  const status = restartRequired
    ? "Needs npm restart"
    : result.timedOut
    ? "Timed out"
    : result.exitCode === 0
      ? "Completed"
      : `Exited with ${result.exitCode ?? result.signal ?? "unknown status"}`;

  const sections = [`## Local Codex Run`, `**Status:** ${status}`];

  if (cleanStdout) {
    sections.push("", cleanStdout);
  } else {
    sections.push("", "_Codex did not print a final message._");
  }

  if (cleanStderr && result.exitCode !== 0) {
    sections.push("", "### Runner output", "```text", cleanStderr.slice(0, 4000), "```");
  }

  return sections.join("\n");
}

const restartSensitiveFiles = [
  "package.json",
  "package-lock.json",
  "apps/server/package.json",
  "apps/server/tsconfig.json",
  "apps/server/tsconfig.scripts.json"
];
const restartSensitiveDirectories = ["apps/server/src"];

function hasModifiedFileSince(path: string, sinceMs: number): boolean {
  try {
    const stat = statSync(path);

    if (stat.mtimeMs > sinceMs) {
      return true;
    }

    if (!stat.isDirectory()) {
      return false;
    }

    return readdirSync(path, { withFileTypes: true }).some((entry) => hasModifiedFileSince(join(path, entry.name), sinceMs));
  } catch {
    return false;
  }
}

function needsBackendRestartSince(sinceMs: number): boolean {
  const workspaceDir = resolve(config.localCodex.workspaceDir);
  const fileChanged = restartSensitiveFiles.some((path) => hasModifiedFileSince(resolve(workspaceDir, path), sinceMs));
  const directoryChanged = restartSensitiveDirectories.some((path) => hasModifiedFileSince(resolve(workspaceDir, path), sinceMs));

  return fileChanged || directoryChanged;
}

export class LocalCodexRunner {
  private readonly queue: QueuedCodexTask[] = [];
  private readonly queuedIds = new Set<string>();
  private readonly runs = new Map<string, LocalCodexRunState>();
  private readonly listeners = new Map<string, Set<LocalCodexOutputListener>>();
  private activeCount = 0;

  getSnapshot(workItemId: string): LocalCodexRunSnapshot {
    const run = this.runs.get(workItemId);

    if (!run) {
      return {
        workItemId,
        status: this.queuedIds.has(workItemId) ? "queued" : "idle",
        reason: null,
        startedAt: null,
        endedAt: null,
        output: []
      };
    }

    return {
      ...run,
      output: [...run.output]
    };
  }

  subscribeOutput(workItemId: string, listener: LocalCodexOutputListener): () => void {
    const listeners = this.listeners.get(workItemId) ?? new Set<LocalCodexOutputListener>();
    listeners.add(listener);
    this.listeners.set(workItemId, listeners);
    listener("snapshot", this.getSnapshot(workItemId));

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0) {
        this.listeners.delete(workItemId);
      }
    };
  }

  enqueueTask(workItemId: string, actorName: string, reason: string): { queued: boolean; reason?: string } {
    if (!config.localCodex.enabled) {
      return { queued: false, reason: "Local Codex runner is disabled." };
    }

    if (this.queuedIds.has(workItemId)) {
      return { queued: false, reason: "Local Codex is already queued or running for this task." };
    }

    const task = getWorkItemById(workItemId);

    if (!task || task.kind !== "task") {
      return { queued: false, reason: "Only tasks can be assigned to local Codex." };
    }

    this.startRun(workItemId, reason);
    this.queue.push({ workItemId, actorName, reason, queuedAt: new Date().toISOString() });
    this.queuedIds.add(workItemId);

    this.appendRunOutput(workItemId, "system", `${projectDeskAiDisplayName} queued a local Codex run for this task.\n`);
    insertSystemComment(
      workItemId,
      `${projectDeskAiDisplayName} queued a local Codex run for this task.`
    );
    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId,
      type: "local_codex_queued",
      actorName,
      body: reason,
      metadataJson: JSON.stringify({ workspaceDir: config.localCodex.workspaceDir })
    });

    emitProjectDeskEvent({ type: "work_item_changed", workItemId });
    void this.processQueue();

    return { queued: true };
  }

  private startRun(workItemId: string, reason: string): LocalCodexRunState {
    const run: LocalCodexRunState = {
      workItemId,
      status: "queued",
      reason,
      startedAt: null,
      endedAt: null,
      output: []
    };

    this.runs.set(workItemId, run);
    this.emitSnapshot(workItemId);
    return run;
  }

  private setRunStatus(
    workItemId: string,
    status: LocalCodexRunStatus,
    options: { startedAt?: string | null; endedAt?: string | null } = {}
  ): void {
    const run = this.runs.get(workItemId) ?? this.startRun(workItemId, "Local Codex run.");
    run.status = status;

    if (options.startedAt !== undefined) {
      run.startedAt = options.startedAt;
    }

    if (options.endedAt !== undefined) {
      run.endedAt = options.endedAt;
    }

    this.emitSnapshot(workItemId);
  }

  private appendRunOutput(workItemId: string, stream: LocalCodexOutputEntry["stream"], text: string): void {
    const cleanText = formatLiveCodexOutput(stream, text);

    if (!cleanText) {
      return;
    }

    const run = this.runs.get(workItemId) ?? this.startRun(workItemId, "Local Codex run.");
    const entry: LocalCodexOutputEntry = {
      id: crypto.randomUUID(),
      stream,
      text: cleanText,
      at: new Date().toISOString()
    };
    run.output.push(entry);

    if (run.output.length > maxLiveOutputEntries) {
      run.output.splice(0, run.output.length - maxLiveOutputEntries);
    }

    this.emitToListeners(workItemId, "output", entry);
  }

  private emitSnapshot(workItemId: string): void {
    this.emitToListeners(workItemId, "snapshot", this.getSnapshot(workItemId));
  }

  private emitToListeners(
    workItemId: string,
    eventName: "snapshot" | "output",
    payload: LocalCodexRunSnapshot | LocalCodexOutputEntry
  ): void {
    const listeners = this.listeners.get(workItemId);

    if (!listeners) {
      return;
    }

    for (const listener of [...listeners]) {
      listener(eventName, payload);
    }
  }

  private processQueue(): void {
    while (this.queue.length > 0 && this.activeCount < config.localCodex.maxConcurrency) {
      const task = this.dequeueNextTask()!;
      this.activeCount += 1;
      void this.runQueuedTask(task)
        .catch((error) => {
          console.error("Unhandled local Codex task failure.", error);
        })
        .finally(() => {
          this.activeCount -= 1;
          this.queuedIds.delete(task.workItemId);
          this.processQueue();
        });
    }
  }

  private dequeueNextTask(): QueuedCodexTask | null {
    let bestIndex = -1;
    let bestRank = Number.POSITIVE_INFINITY;
    let bestQueuedAt = "";

    this.queue.forEach((queuedTask, index) => {
      const record = getWorkItemById(queuedTask.workItemId);
      const rank = priorityRank(record?.priority);

      if (bestIndex === -1 || rank < bestRank || (rank === bestRank && queuedTask.queuedAt < bestQueuedAt)) {
        bestIndex = index;
        bestRank = rank;
        bestQueuedAt = queuedTask.queuedAt;
      }
    });

    if (bestIndex === -1) {
      return null;
    }

    return this.queue.splice(bestIndex, 1)[0] ?? null;
  }

  private async runQueuedTask(taskRef: QueuedCodexTask): Promise<void> {
    const task = getWorkItemById(taskRef.workItemId);

    if (!task || task.kind !== "task") {
      return;
    }

    const parent = task.parentId ? getWorkItemById(task.parentId) : null;
    const reasoning = task.codexReasoning ?? "medium";
    const runStartedAtMs = Date.now();
    const startedAt = new Date(runStartedAtMs).toISOString();

    this.setRunStatus(task.id, "running", { startedAt, endedAt: null });
    updateWorkItemTaskStatus(task.id, "in_progress", null);
    this.appendRunOutput(
      task.id,
      "system",
      `${projectDeskAiDisplayName} started local Codex in ${config.localCodex.workspaceDir} with ${codexReasoningLabel(reasoning)} reasoning.\n`
    );
    insertSystemComment(
      task.id,
      `${projectDeskAiDisplayName} started local Codex in \`${config.localCodex.workspaceDir}\` with ${codexReasoningLabel(reasoning)} reasoning.`
    );
    insertActivityEvent({
      id: crypto.randomUUID(),
      workItemId: task.id,
      type: "local_codex_started",
      actorName: projectDeskAiDisplayName,
      body: taskRef.reason,
      metadataJson: JSON.stringify({
        command: config.localCodex.command,
        workspaceDir: config.localCodex.workspaceDir,
        reasoningEffort: reasoning,
        priority: task.priority
      })
    });
    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: task.id });

    try {
      const result = await this.runCodex(task.id, buildPrompt(task, parent, reasoning), reasoning);

      const succeeded = result.exitCode === 0 && !result.timedOut;
      const restartRequired = succeeded && needsBackendRestartSince(runStartedAtMs);

      insertAiComment(task.id, resultComment(result, restartRequired));

      if (succeeded) {
        updateWorkItemTaskStatus(task.id, "complete", "done");
        insertSystemComment(task.id, `${projectDeskAiDisplayName} marked this task complete.`, { reopenCompletedTask: false });
        if (notifyAiCompletedTaskFollowers(task, parent) > 0) {
          emitProjectDeskEvent({ type: "notifications_changed" });
        }

        if (restartRequired) {
          insertSystemComment(
            task.id,
            `${projectDeskAiDisplayName} finished this task, but the backend npm server needs to be restarted before the app reflects the server changes.`,
            { reopenCompletedTask: false }
          );
        }
      }

      this.setRunStatus(task.id, result.timedOut ? "timed_out" : restartRequired ? "restart_required" : succeeded ? "succeeded" : "failed", {
        endedAt: new Date().toISOString()
      });
      this.appendRunOutput(
        task.id,
        "system",
        restartRequired
          ? "Local Codex finished. Restart the backend npm server to apply server changes.\n"
          : result.timedOut
            ? "Local Codex timed out.\n"
            : `Local Codex exited with ${result.exitCode ?? result.signal ?? "unknown status"}.\n`
      );
      insertActivityEvent({
        id: crypto.randomUUID(),
        workItemId: task.id,
        type: succeeded ? "local_codex_completed" : "local_codex_failed",
        actorName: projectDeskAiDisplayName,
        body: restartRequired
          ? "Local Codex finished. Restart the backend npm server to apply server changes."
          : result.timedOut
            ? "Local Codex timed out."
            : `Local Codex exited with ${result.exitCode ?? result.signal ?? "unknown status"}.`,
        metadataJson: JSON.stringify({
          exitCode: result.exitCode,
          signal: result.signal,
          timedOut: result.timedOut,
          reasoningEffort: reasoning,
          restartRequired
        })
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local Codex failed to start.";

      this.setRunStatus(task.id, "start_failed", { endedAt: new Date().toISOString() });
      this.appendRunOutput(task.id, "system", `${message}\n`);
      updateWorkItemTaskStatus(task.id, "todo", null);
      insertAiComment(
        task.id,
        [
          "## Local Codex Run",
          "**Status:** Failed to start",
          "",
          message,
          "",
          `Command attempted: \`${config.localCodex.command} ${codexCommandArgs(reasoning).join(" ")}\``
        ].join("\n")
      );
      insertActivityEvent({
        id: crypto.randomUUID(),
        workItemId: task.id,
        type: "local_codex_failed",
        actorName: projectDeskAiDisplayName,
        body: message,
        metadataJson: JSON.stringify({ command: config.localCodex.command, workspaceDir: config.localCodex.workspaceDir, reasoningEffort: reasoning })
      });
    }

    emitProjectDeskEvent({ type: "work_items_changed" });
    emitProjectDeskEvent({ type: "work_item_changed", workItemId: task.id });
  }

  private runCodex(workItemId: string, prompt: string, reasoning: CodexReasoningEffort): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        config.localCodex.command,
        codexCommandArgs(reasoning),
        {
          cwd: config.localCodex.workspaceDir,
          env: { ...process.env, RUST_LOG: process.env.RUST_LOG ?? "error" },
          windowsHide: true
        }
      );
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000).unref();
      }, config.localCodex.timeoutMs);

      child.stdout?.on("data", (chunk) => {
        stdout = appendLimited(stdout, chunk);
        this.appendRunOutput(workItemId, "stdout", chunk.toString());
      });
      child.stderr?.on("data", (chunk) => {
        stderr = appendLimited(stderr, chunk);
        this.appendRunOutput(workItemId, "stderr", chunk.toString());
      });
      child.stdin?.end(prompt);

      child.on("error", (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        reject(error);
      });

      child.on("close", (exitCode, signal) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve({ exitCode, signal, stdout, stderr, timedOut });
      });
    });
  }
}
