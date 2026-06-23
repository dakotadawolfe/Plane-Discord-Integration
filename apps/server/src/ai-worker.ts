import crypto from "node:crypto";
import type { AiClient } from "./ai.js";
import { AiUnavailableError } from "./ai.js";
import { collectReferencedItemIdsFromContextJsons } from "./collaboration-context.js";
import { config } from "./config.js";
import {
  getWorkItemById,
  followWorkItem,
  insertActivityEvent,
  insertAiArtifact,
  insertAiJob,
  insertNotification,
  insertWorkComment,
  insertWorkItem,
  listAiArtifacts,
  listPendingAiJobs,
  listWorkComments,
  listWorkItemsByParent,
  markAiJobFailed,
  markAiJobRunning,
  markAiJobSucceeded,
  updateNotificationStatus,
  type AiJobRecord,
  type WorkItemRecord
} from "./db.js";
import type { AiJobType, WorkStage } from "./domain.js";
import { isArchivedStage } from "./domain.js";
import type { DiscordService } from "./discord.js";
import { emitProjectDeskEvent } from "./events.js";

type LocalAiAction = "create_artifact" | "add_comment" | "update_stage" | "create_tasks" | "assign_owner" | "send_dm";

const phaseActionRegistry: Record<WorkStage, LocalAiAction[]> = {
  review: ["create_artifact", "add_comment", "send_dm"],
  planning: ["create_artifact", "add_comment", "create_tasks", "send_dm"],
  active: ["create_artifact", "add_comment", "create_tasks", "assign_owner", "send_dm"],
  reviewing: ["create_artifact", "add_comment", "send_dm"],
  done: ["create_artifact", "add_comment"],
  parked: ["create_artifact", "add_comment"]
};

function canRunLocalAction(stage: WorkStage, action: LocalAiAction): boolean {
  return phaseActionRegistry[stage]?.includes(action) ?? false;
}

export class AiWorker {
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly ai: AiClient,
    private readonly discord: DiscordService
  ) {}

  start(): void {
    if (!config.ai.workerEnabled || this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.processPending();
    }, 8000);
    void this.processPending();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  enqueueWorkItemJob(workItemId: string, type: AiJobType, reason: string): AiJobRecord {
    const job = insertAiJob({
      id: crypto.randomUUID(),
      workItemId,
      type,
      reason,
      runAfter: new Date().toISOString()
    });

    if (config.ai.workerEnabled) {
      void this.processPending();
    }

    return job;
  }

  async processPending(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      for (const pending of listPendingAiJobs(3)) {
        const job = markAiJobRunning(pending.id);

        if (!job || job.status !== "running") {
          continue;
        }

        await this.processJob(job);
      }
    } finally {
      this.processing = false;
    }
  }

  private async processJob(job: AiJobRecord): Promise<void> {
    if (!job.workItemId) {
      markAiJobSucceeded(job.id);
      return;
    }

    const workItem = getWorkItemById(job.workItemId);

    if (!workItem) {
      markAiJobFailed(job.id, "Work item was not found.");
      return;
    }

    if (isArchivedStage(workItem.stage) && job.type !== "digest") {
      insertActivityEvent({
        id: crypto.randomUUID(),
        workItemId: workItem.id,
        type: "ai_skipped",
        actorName: "Project Desk AI",
        body: `Skipped ${job.type} because ${workItem.stage} is archived.`,
        metadataJson: JSON.stringify({ jobId: job.id })
      });
      markAiJobSucceeded(job.id);
      return;
    }

    try {
      const comments = listWorkComments(workItem.id);
      const childItems = listWorkItemsByParent(workItem.id);
      const referencedItems = collectReferencedItemIdsFromContextJsons(
        [workItem.contextJson, ...comments.map((comment) => comment.contextJson)],
        [workItem.id, ...childItems.map((item) => item.id)]
      )
        .map((id) => getWorkItemById(id))
        .filter((item): item is WorkItemRecord => Boolean(item))
        .map((item) => ({
          item,
          comments: listWorkComments(item.id)
        }));
      let createdChildItems = false;
      const result = await this.ai.generate({
        workItem,
        comments,
        artifacts: listAiArtifacts(workItem.id),
        childItems,
        referencedItems,
        jobType: job.type,
        reason: job.reason
      });

      if (canRunLocalAction(workItem.stage, "create_artifact")) {
        insertAiArtifact({
          id: crypto.randomUUID(),
          workItemId: workItem.id,
          type: job.type,
          title: result.title,
          body: result.body,
          rawJson: result.rawJson ?? null
        });
      }

      if (canRunLocalAction(workItem.stage, "add_comment")) {
        insertWorkComment({
          id: crypto.randomUUID(),
          workItemId: workItem.id,
          parentCommentId: null,
          discordUserId: null,
          discordAvatarUrl: null,
          discordUsername: "Project Desk AI",
          authorType: "ai",
          body: result.body
        });
      }

      if (result.suggestedTasks?.length && childItems.length === 0 && canRunLocalAction(workItem.stage, "create_tasks")) {
        for (const task of result.suggestedTasks.slice(0, 7)) {
          const child = insertWorkItem({
            id: crypto.randomUUID(),
            kind: "task",
            parentId: workItem.id,
            createdByDiscordUserId: workItem.createdByDiscordUserId,
            createdByDiscordUsername: "Project Desk AI",
            ownerDiscordUserId: workItem.ownerDiscordUserId ?? workItem.createdByDiscordUserId,
            ownerDiscordUsername: workItem.ownerDiscordUsername ?? workItem.createdByDiscordUsername,
            title: task.title,
            details: task.details,
            category: workItem.category,
            priority: task.priority,
            codexReasoning: null,
            stage: "active",
            taskStatus: "todo",
            taskCompletionReason: null,
            planeIssueId: null,
            planeSequenceId: null,
            planeIdentifier: null,
            planeUrl: null
          });

          followWorkItem(child.id, child.createdByDiscordUserId);

          if (child.ownerDiscordUserId) {
            followWorkItem(child.id, child.ownerDiscordUserId);
          }

          insertActivityEvent({
            id: crypto.randomUUID(),
            workItemId: child.id,
            type: "ai_created_task",
            actorName: "Project Desk AI",
            body: `Created from ${workItem.title}.`,
            metadataJson: JSON.stringify({ parentId: workItem.id, jobId: job.id })
          });
          createdChildItems = true;
        }
      }

      insertActivityEvent({
        id: crypto.randomUUID(),
        workItemId: workItem.id,
        type: "ai_artifact_created",
        actorName: "Project Desk AI",
        body: result.title,
        metadataJson: JSON.stringify({ jobId: job.id, jobType: job.type })
      });

      await this.sendOwnerDm(workItem, job, result.dmBody);
      markAiJobSucceeded(job.id);
      emitProjectDeskEvent({ type: "work_item_changed", workItemId: workItem.id });

      if (createdChildItems) {
        emitProjectDeskEvent({ type: "work_items_changed" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI job failed.";
      const retry = !(error instanceof AiUnavailableError) && job.attempts < 3;

      insertActivityEvent({
        id: crypto.randomUUID(),
        workItemId: workItem.id,
        type: "ai_job_failed",
        actorName: "Project Desk AI",
        body: message,
        metadataJson: JSON.stringify({ jobId: job.id, jobType: job.type, retry })
      });
      markAiJobFailed(job.id, message, retry);
      emitProjectDeskEvent({ type: "work_item_changed", workItemId: workItem.id });
    }
  }

  private async sendOwnerDm(workItem: WorkItemRecord, job: AiJobRecord, body?: string | null): Promise<void> {
    const recipientId = workItem.ownerDiscordUserId ?? workItem.createdByDiscordUserId;

    if (!body || !recipientId || !canRunLocalAction(workItem.stage, "send_dm")) {
      return;
    }

    const notification = insertNotification({
      id: crypto.randomUUID(),
      workItemId: workItem.id,
      discordUserId: recipientId,
      type: job.type,
      channel: "dm",
      body,
      status: "pending",
      reason: null
    });
    const result = await this.discord.sendDm(recipientId, body);

    updateNotificationStatus(notification.id, result.sent ? "sent" : "failed", result.reason ?? null);
    emitProjectDeskEvent({ type: "notifications_changed" });
  }
}
