export const sourceSyncActions = ["pull", "push", "restart", "apply"] as const;

export type SourceSyncAction = (typeof sourceSyncActions)[number];

export function sourceSyncSuccessMessage(action: SourceSyncAction): string {
  switch (action) {
    case "pull":
      return "Synced app code from GitHub and restarted Project Desk.";
    case "push":
      return "Synced safe app code changes to GitHub.";
    case "restart":
      return "Restarted Project Desk.";
    case "apply":
      return "Built Project Desk and restarted the app.";
  }
}
