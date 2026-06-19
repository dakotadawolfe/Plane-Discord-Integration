export const requestTypes = ["bug", "feature", "support", "task", "other"] as const;
export const requestPriorities = ["urgent", "high", "medium", "low", "none"] as const;

export type RequestType = (typeof requestTypes)[number];
export type RequestPriority = (typeof requestPriorities)[number];

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
