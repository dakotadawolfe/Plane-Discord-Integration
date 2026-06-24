import type { LocalCodexRunStatus } from "./types";

export interface CodexInlineStatusDisplay {
  className: LocalCodexRunStatus;
  label: string;
}

export function taskNeedsApply(status: LocalCodexRunStatus | undefined): boolean {
  return status === "restart_required";
}

export function codexInlineStatusDisplay(status: LocalCodexRunStatus): CodexInlineStatusDisplay {
  const labels: Record<LocalCodexRunStatus, string> = {
    idle: "AI idle",
    queued: "AI queued",
    running: "AI working",
    succeeded: "AI complete",
    restart_required: "Apply required",
    failed: "AI failed",
    timed_out: "AI timed out",
    start_failed: "AI failed to start"
  };

  return {
    className: status,
    label: labels[status]
  };
}
