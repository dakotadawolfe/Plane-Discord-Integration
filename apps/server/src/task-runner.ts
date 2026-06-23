export type AiTaskRunStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "restart_required"
  | "failed"
  | "timed_out"
  | "start_failed";

export interface AiTaskOutputEntry {
  id: string;
  stream: "system" | "stdout" | "stderr";
  text: string;
  at: string;
}

export interface AiTaskRunSnapshot {
  workItemId: string;
  status: AiTaskRunStatus;
  reason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  output: AiTaskOutputEntry[];
}

export type AiTaskOutputListener = (
  eventName: "snapshot" | "output",
  payload: AiTaskRunSnapshot | AiTaskOutputEntry
) => void;

export interface AiTaskRunner {
  readonly enabled: boolean;
  readonly label: string;
  readonly requireAdmin: boolean;
  getSnapshot(workItemId: string): AiTaskRunSnapshot;
  subscribeOutput(workItemId: string, listener: AiTaskOutputListener): () => void;
  enqueueTask(workItemId: string, actorName: string, reason: string): { queued: boolean; reason?: string };
}

export class DisabledAiTaskRunner implements AiTaskRunner {
  readonly enabled = false;
  readonly label = "AI task runner";
  readonly requireAdmin = true;

  getSnapshot(workItemId: string): AiTaskRunSnapshot {
    return {
      workItemId,
      status: "idle",
      reason: null,
      startedAt: null,
      endedAt: null,
      output: []
    };
  }

  subscribeOutput(workItemId: string, listener: AiTaskOutputListener): () => void {
    listener("snapshot", this.getSnapshot(workItemId));
    return () => undefined;
  }

  enqueueTask(): { queued: boolean; reason?: string } {
    return { queued: false, reason: "AI task runner is disabled." };
  }
}
