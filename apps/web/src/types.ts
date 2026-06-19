export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roles: string[];
  isAdmin: boolean;
}

export interface MeResponse {
  authenticated: boolean;
  user: CurrentUser | null;
  planeFullBoardUrl: string | null;
}

export interface PublicConfig {
  discordClientId: string;
}

export interface RequestStatus {
  id: string | null;
  name: string;
  group: string | null;
  color: string | null;
}

export interface PlaneReference {
  issueId: string;
  sequenceId: number | null;
  identifier: string | null;
  url: string | null;
}

export type RequestType = "bug" | "feature" | "support" | "task" | "other";
export type RequestPriority = "urgent" | "high" | "medium" | "low" | "none";

export interface RequestSummary {
  id: string;
  title: string;
  type: RequestType;
  priority: RequestPriority;
  details: string;
  createdAt: string;
  plane: PlaneReference;
  status: RequestStatus;
}

export interface RequestDetail extends RequestSummary {
  discordUserId: string;
  discordUsername: string;
  canOpenInPlane: boolean;
}

export interface RequestComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  source: "plane" | "local";
}

export interface BoardItem {
  id: string;
  title: string;
  priority: string | null;
  sequenceId: number | null;
  identifier: string | null;
  url: string | null;
  status: RequestStatus;
}
