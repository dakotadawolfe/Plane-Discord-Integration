import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Crosshair,
  Download,
  ExternalLink,
  Eye,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileText,
  FileVideoCamera,
  Home,
  Image as ImageIcon,
  Inbox,
  Kanban,
  Lightbulb,
  Link2,
  ListChecks,
  LogIn,
  LogOut,
  MessageCircle,
  MousePointer2,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  SquareDashedMousePointer,
  Terminal,
  Trash2,
  Unlink,
  Wand2,
  Workflow,
  X
} from "lucide-react";
import {
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import { NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import {
  addWorkComment,
  addWorkItemLink,
  ApiError,
  createWorkItem,
  deleteWorkItemLink,
  deleteWorkItem,
  establishDiscordActivitySession,
  exchangeDiscordActivityCode,
  getBoard,
  getInbox,
  getInboxUnreadCount,
  getLocalCodexOutputSnapshot,
  getMe,
  getPublicConfig,
  getRecentWorkItemVisits,
  getSourceSyncStatus,
  getWorkItem,
  listAdminUsers,
  listPeople,
  listWorkItems,
  login,
  logout,
  markAllInboxRead,
  markInboxNotificationRead,
  markInboxTargetRead,
  promoteIdea,
  subscribeProjectDeskEvents,
  subscribeLocalCodexOutput,
  startSourceSync,
  suggestWorkItemTitle,
  updateWorkItemAssignee,
  updateWorkItemCategory,
  updateWorkItemPriority,
  updateAdminUser,
  updateProfile,
  updateBoardItemState,
  updateTaskStatus,
  updateWorkItemFollow,
  updateWorkItemStage,
  updateWorkItemTitle,
  uploadAttachments
} from "./api";
import type {
  AnnotationMetadata,
  BoardItem,
  CollaborationItemReference,
  CollaborationContext,
  CodexReasoningEffort,
  CurrentUser,
  IdeaCategory,
  InboxNotification,
  KnownPerson,
  LocalCodexOutputEntry,
  LocalCodexRunSnapshot,
  LocalCodexRunStatus,
  MeResponse,
  NotificationPreferenceKey,
  NotificationPreferences,
  ProjectDeskEvent,
  PublicConfig,
  RecentWorkItemVisit,
  RequestPriority,
  SourceSyncAction,
  SourceSyncStatus,
  TaskCompletionReason,
  TaskStatus,
  UploadedAttachment,
  WorkComment,
  WorkItemDetail,
  WorkItemDetailPayload,
  WorkItemKind,
  WorkItemLink,
  WorkItemLinkRelationship,
  WorkItemSummary,
  WorkItemTitleSuggestion,
  UserProfile,
  WorkStage
} from "./types";
import { reportClientDiagnostic } from "./clientDiagnostics";
import {
  browserDiscordActivityTokenStore,
  browserProjectDeskActivitySessionTokenStore,
  completeDiscordActivityLogin
} from "./discordActivityAuth";
import { useDiscordActivity, type DiscordActivityState } from "./useDiscordActivity";
import { shouldAutoStartActivityLogin } from "./activityAutoLogin";

const priorityOptions: { value: RequestPriority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "None" }
];

const workItemLinkOptions: { value: WorkItemLinkRelationship; label: string; incomingLabel: string }[] = [
  { value: "relates_to", label: "Relates to", incomingLabel: "Related from" },
  { value: "blocked_by", label: "Blocked by", incomingLabel: "Blocks" },
  { value: "blocks", label: "Blocks", incomingLabel: "Blocked by" },
  { value: "caused_by", label: "Caused by", incomingLabel: "Caused" },
  { value: "causes", label: "Causes", incomingLabel: "Caused by" },
  { value: "duplicates", label: "Duplicates", incomingLabel: "Duplicated by" }
];

const codexReasoningOptions: { value: CodexReasoningEffort; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" }
];

const ideaCategoryOptions: Array<{ value: IdeaCategory; label: string }> = [
  { value: "product", label: "Product" },
  { value: "automation", label: "Automation" },
  { value: "content", label: "Content" },
  { value: "operations", label: "Operations" },
  { value: "community", label: "Community" },
  { value: "research", label: "Research" },
  { value: "games", label: "Games" },
  { value: "learning", label: "Learning" },
  { value: "other", label: "Other" }
];

const phaseOptions: Array<{ value: WorkStage; label: string }> = [
  { value: "review", label: "Review" },
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "reviewing", label: "Reviewing" },
  { value: "done", label: "Done" },
  { value: "parked", label: "Parked" }
];

const taskStatusOptions: Array<{ value: TaskStatus; label: string; icon: ReactNode }> = [
  { value: "todo", label: "To do", icon: <Circle size={15} /> },
  { value: "in_progress", label: "In progress", icon: <Workflow size={15} /> },
  { value: "complete", label: "Complete", icon: <CheckCircle2 size={15} /> }
];

const taskCompletionReasonOptions: Array<{ value: TaskCompletionReason; label: string }> = [
  { value: "done", label: "Done" },
  { value: "canceled", label: "Canceled" },
  { value: "not_needed", label: "Not needed" },
  { value: "duplicate", label: "Duplicate" }
];

const projectDeskAiUserId = "project-desk-ai";

const notificationPreferenceOptions: Array<{ value: NotificationPreferenceKey; label: string; description: string }> = [
  { value: "item_assigned", label: "Item assignments", description: "When an idea or project is assigned to you" },
  { value: "task_assigned", label: "Task assignments", description: "When a task is assigned to you" },
  { value: "mention", label: "Mentions", description: "When someone tags you in a comment" },
  { value: "reply", label: "Replies", description: "When someone replies to your comment" },
  { value: "followed_comment", label: "Followed comments", description: "New comments on followed work" },
  { value: "followed_task_created", label: "New followed tasks", description: "Tasks added to followed ideas or projects" },
  { value: "followed_item_promoted", label: "Promotions", description: "Followed ideas promoted to projects" },
  { value: "followed_task_status", label: "Task status", description: "Status changes on followed tasks" },
  { value: "review_needed", label: "Review needed", description: "Review requests and handoffs" },
  { value: "blocker", label: "Blockers", description: "Blocked work updates" },
  { value: "ai_question", label: "AI questions", description: "AI follow-up questions" },
  { value: "digest", label: "Digests", description: "Summary messages and reminders" }
];

const markdownPlugins = [remarkGfm];

type CommentNode = WorkComment & { replies: CommentNode[] };

interface SideChatMessage {
  id: string;
  authorName: string;
  body: string;
  attachments: UploadedAttachment[];
}

interface AiChatPageState {
  label: string;
  summary: string;
  currentItem: WorkItemDetail | null;
  parentItem: WorkItemSummary | null;
  comments: WorkComment[];
  childItems: WorkItemSummary[];
}

interface AnnotationSaveResult {
  annotations: AnnotationMetadata[];
  screenshotAttachments: UploadedAttachment[];
  removedScreenshotIds: string[];
  captureErrors: string[];
}

type AnnotationToolMode = "cursor" | "box";

interface AnnotationSession {
  sourceItemId: string | null;
  sourceItemTitle: string;
  annotations: AnnotationMetadata[];
}

interface AnnotationTaskDraft {
  id: string;
  sourceItemId: string | null;
  sourceItemTitle: string | null;
  annotations: AnnotationMetadata[];
}

type MentionOption =
  | { kind: "ai"; key: "ai"; label: "AI"; token: "@AI"; description: string }
  | {
      kind: "person";
      key: string;
      label: string;
      token: string;
      description: string;
      discordUserId: string;
      avatarUrl: string | null;
    }
  | {
      kind: "item";
      key: string;
      label: string;
      token: string;
      description: string;
      itemId: string;
      itemKind: WorkItemKind;
    };

type MentionMode = "people" | "idea" | "project" | "task";
type InboxFilter = "all" | "unread" | "mentions" | "replies" | "assigned" | "tasks";

interface RecentTaskVisit {
  item: WorkItemSummary;
  visitedAt: string;
}

interface RecentProjectGroup {
  project: WorkItemSummary;
  visitedAt: string;
  tasks: RecentTaskVisit[];
}

const inboxFilterOptions: Array<{ value: InboxFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "mentions", label: "Mentions" },
  { value: "replies", label: "Replies" },
  { value: "assigned", label: "Assigned" },
  { value: "tasks", label: "Tasks" }
];

interface MentionQuery {
  range: Range;
  initialSearch: string;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const absMs = Math.abs(diffMs);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["week", 1000 * 60 * 60 * 24 * 7],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
    ["second", 1000]
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const [unit, unitMs] = units.find(([, size]) => absMs >= size) ?? ["second", 1000];
  return formatter.format(Math.round(-diffMs / unitMs), unit);
}

function humanize(value: string | null | undefined) {
  if (!value) {
    return "None";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function workItemNumberLabel(item: Pick<WorkItemSummary, "kind"> & { identifier?: string | null }): string {
  return item.identifier ?? humanize(item.kind);
}

function workItemNumberTitle(item: Pick<WorkItemSummary, "kind" | "identifier" | "title">): string {
  return `${workItemNumberLabel(item)}: ${item.title}`;
}

function pageLabelFromPath(pathname: string): string {
  if (pathname === "/") {
    return "Home";
  }

  if (pathname.startsWith("/ideas/new")) {
    return "New idea";
  }

  if (pathname.startsWith("/ideas")) {
    return "Ideas";
  }

  if (pathname.startsWith("/projects")) {
    return "Projects";
  }

  if (pathname.startsWith("/board")) {
    return "Board";
  }

  if (pathname.startsWith("/reviews")) {
    return "Reviews";
  }

  if (pathname.startsWith("/inbox")) {
    return "Inbox";
  }

  return "Current page";
}

function workItemIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/items\/([0-9a-f-]{36})\/?$/i);
  return match?.[1] ?? null;
}

function currentPageAnnotationTitle(fallback: string): string {
  return document.querySelector("main h1")?.textContent?.trim() || document.querySelector("h1")?.textContent?.trim() || fallback;
}

function pageSummaryFromPath(pathname: string, label: string): string {
  if (pathname === "/") {
    return "Home page with personalized recent projects, recent tasks, inbox access, and workspace overview.";
  }

  if (pathname.startsWith("/ideas/new")) {
    return "New idea form for capturing a new Project Desk idea.";
  }

  if (pathname.startsWith("/ideas")) {
    return "Ideas list page for reviewing and creating Project Desk ideas.";
  }

  if (pathname.startsWith("/projects")) {
    return "Projects list page for active Project Desk projects.";
  }

  if (pathname.startsWith("/board")) {
    return "Board page for moving work items through their workflow columns.";
  }

  if (pathname.startsWith("/reviews")) {
    return "Reviews page for AI-created or review-oriented work.";
  }

  if (pathname.startsWith("/inbox")) {
    return "Inbox page for user-specific notifications and unread activity.";
  }

  return `${label} in Project Desk.`;
}

function workItemPageSummary(payload: WorkItemDetailPayload): string {
  const { item, parentItem, comments, childItems } = payload;
  const parts = [
    `${workItemNumberLabel(item)} / ${item.title}`,
    `${humanize(item.kind)} in ${humanize(item.stage)}`,
    item.kind === "task" && item.taskStatus ? `Task status ${humanize(item.taskStatus)}` : null,
    `Priority ${humanize(item.priority)}`,
    `Assigned to ${item.owner?.displayName ?? "Unassigned"}`,
    parentItem ? `Parent ${workItemNumberLabel(parentItem)} / ${parentItem.title}` : null,
    childItems.length ? `${childItems.length} child task${childItems.length === 1 ? "" : "s"}` : null,
    comments.length ? `${comments.length} comment${comments.length === 1 ? "" : "s"}` : "No comments yet"
  ];

  return parts.filter(Boolean).join(". ");
}

function aiChatDefaultTaskParentId(pageState: AiChatPageState, items: WorkItemSummary[]): string {
  const current = pageState.currentItem;

  if (current?.kind === "idea" || current?.kind === "project") {
    return current.id;
  }

  if (current?.kind === "task" && current.parentId) {
    return current.parentId;
  }

  return "";
}

function compactChatTitle(value: string, fallback: string): string {
  const cleaned = value
    .replace(/\[[^\]]+\]\((?:mention|work-item):[^)]+\)/g, "")
    .replace(/[#*_`>\-()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return fallback;
  }

  return cleaned.length > 84 ? `${cleaned.slice(0, 81).trim()}...` : cleaned;
}

function aiChatDefaultTaskTitle(messages: SideChatMessage[], draft: string, pageLabel: string): string {
  const latest = draft.trim() || [...messages].reverse().find((message) => message.body.trim())?.body.trim() || "";
  return compactChatTitle(latest, `AI follow up from ${pageLabel}`).slice(0, 120);
}

function aiChatMessagesForSubmit(messages: SideChatMessage[], draft: string, draftAttachments: UploadedAttachment[], user: CurrentUser): SideChatMessage[] {
  if (!draft.trim() && draftAttachments.length === 0) {
    return messages;
  }

  return [
    ...messages,
    {
      id: crypto.randomUUID(),
      authorName: user.displayName,
      body: draft.trim() || "Shared files.",
      attachments: draftAttachments
    }
  ];
}

function aiChatTranscript(messages: SideChatMessage[]): string {
  return messages.map((message) => `- **${message.authorName}:** ${message.body}`).join("\n");
}

function aiChatAttachments(messages: SideChatMessage[]): UploadedAttachment[] {
  return messages.flatMap((message) => message.attachments);
}

function aiChatItemReferences(
  messages: SideChatMessage[],
  pageState: AiChatPageState,
  items: WorkItemSummary[]
): CollaborationItemReference[] {
  const current = pageState.currentItem;
  const candidates = current ? [current, ...items.filter((item) => item.id !== current.id)] : items;
  const references = [
    ...(current ? [workItemContextReference(current, "current_page")] : []),
    ...messages.flatMap((message) => parseRecognizedItemMentions(message.body, candidates))
  ];

  return mergeItemReferences(references);
}

function aiChatPageContext(pathname: string, pageState: AiChatPageState): NonNullable<CollaborationContext["pageContext"]> {
  return {
    label: pageState.label,
    path: pathname,
    summary: pageState.summary
  };
}

function aiChatScopeLabel(pageState: AiChatPageState): string {
  if (pageState.currentItem) {
    return workItemNumberLabel(pageState.currentItem).toUpperCase();
  }

  return `PAGE/${pageState.label.toUpperCase()}`;
}

function aiChatCommentBody(messages: SideChatMessage[], references: CollaborationItemReference[]): string {
  const mentionedReferences = references.filter((reference) => reference.source === "mentioned");
  const attachments = aiChatAttachments(messages);

  return [
    "@AI",
    "",
    "## AI chat",
    mentionedReferences.length ? `**Referenced pages:** ${mentionedReferences.map((reference) => mentionTokenForItem(reference)).join(", ")}` : null,
    attachments.length ? `**Attachments:** ${attachments.map(attachmentName).join(", ")}` : null,
    "",
    aiChatTranscript(messages)
  ]
    .filter(Boolean)
    .join("\n");
}

function aiChatTaskDetails(messages: SideChatMessage[], references: CollaborationItemReference[]): string {
  const mentionedReferences = references.filter((reference) => reference.source === "mentioned");
  const attachments = aiChatAttachments(messages);

  return [
    "Created from AI chat.",
    mentionedReferences.length ? `Referenced pages: ${mentionedReferences.map((reference) => mentionTokenForItem(reference)).join(", ")}` : null,
    attachments.length ? `Attachments: ${attachments.map(attachmentName).join(", ")}` : null,
    "",
    "Chat transcript:",
    aiChatTranscript(messages)
  ]
    .filter(Boolean)
    .join("\n");
}

function latestIso(left: string, right: string): string {
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function buildRecentProjectGroups(items: WorkItemSummary[], visits: RecentWorkItemVisit[]): RecentProjectGroup[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));

  for (const visit of visits) {
    if (!itemsById.has(visit.item.id)) {
      itemsById.set(visit.item.id, visit.item);
    }

    if (visit.parentItem && !itemsById.has(visit.parentItem.id)) {
      itemsById.set(visit.parentItem.id, visit.parentItem);
    }
  }

  const groups = new Map<string, { project: WorkItemSummary; visitedAt: string; tasksById: Map<string, RecentTaskVisit> }>();

  function ensureGroup(project: WorkItemSummary, visitedAt: string) {
    const existing = groups.get(project.id);

    if (existing) {
      existing.visitedAt = latestIso(existing.visitedAt, visitedAt);
      existing.project = project;
      return existing;
    }

    const group = {
      project,
      visitedAt,
      tasksById: new Map<string, RecentTaskVisit>()
    };
    groups.set(project.id, group);
    return group;
  }

  for (const visit of visits) {
    const item = itemsById.get(visit.item.id) ?? visit.item;

    if (item.kind === "project") {
      ensureGroup(item, visit.visitedAt);
      continue;
    }

    if (item.kind !== "task" || !item.parentId) {
      continue;
    }

    const project = visit.parentItem ?? itemsById.get(item.parentId);

    if (!project || project.kind !== "project") {
      continue;
    }

    const group = ensureGroup(project, visit.visitedAt);
    const existingTask = group.tasksById.get(item.id);

    if (!existingTask || new Date(visit.visitedAt).getTime() > new Date(existingTask.visitedAt).getTime()) {
      group.tasksById.set(item.id, { item, visitedAt: visit.visitedAt });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      project: group.project,
      visitedAt: group.visitedAt,
      tasks: [...group.tasksById.values()]
        .sort((left, right) => new Date(right.visitedAt).getTime() - new Date(left.visitedAt).getTime())
        .slice(0, 5)
    }))
    .sort((left, right) => new Date(right.visitedAt).getTime() - new Date(left.visitedAt).getTime())
    .slice(0, 8);
}

function isActiveCodexStatus(status: LocalCodexRunStatus | undefined): boolean {
  return status === "queued" || status === "running";
}

function isRestartRequiredCodexStatus(status: LocalCodexRunStatus | undefined): boolean {
  return status === "restart_required";
}

function normalizeGlobalSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function workItemMatchesGlobalSearch(item: WorkItemSummary, query: string): boolean {
  const normalizedQuery = normalizeGlobalSearch(query);

  if (!normalizedQuery) {
    return false;
  }

  const identifier = item.identifier ?? "";
  const numberOnly = item.sequenceId ? item.sequenceId.toString() : "";
  const searchable = [item.title, identifier, numberOnly, humanize(item.kind)]
    .map(normalizeGlobalSearch)
    .filter(Boolean);

  return searchable.some((value) => value.includes(normalizedQuery));
}

function categoryLabel(value: IdeaCategory | null | undefined) {
  return ideaCategoryOptions.find((option) => option.value === value)?.label ?? "Uncategorized";
}

function personOptionLabel(person: KnownPerson) {
  if (isProjectDeskAiPerson(person)) {
    return "Project Desk AI";
  }

  return person.tagName ? `${person.displayName} (@${person.tagName})` : person.displayName;
}

function isProjectDeskAiPerson(person: Pick<KnownPerson, "discordUserId">) {
  return person.discordUserId === projectDeskAiUserId;
}

function isProjectDeskAiAssignee(item: Pick<WorkItemSummary, "owner">) {
  return item.owner?.discordUserId === projectDeskAiUserId;
}

function assignablePeopleForKind(people: KnownPerson[], kind: WorkItemKind) {
  return kind === "task" ? people : people.filter((person) => !isProjectDeskAiPerson(person));
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [annotationSession, setAnnotationSession] = useState<AnnotationSession | null>(null);
  const [annotationTaskDraft, setAnnotationTaskDraft] = useState<AnnotationTaskDraft | null>(null);
  const [activityLoginInProgress, setActivityLoginInProgress] = useState(false);
  const [activityLoginError, setActivityLoginError] = useState<string | null>(null);
  const activityAutoLoginAttemptedRef = useRef(false);
  const activityLoginInFlightRef = useRef(false);
  const user = me?.user ?? null;

  useEffect(() => {
    void getPublicConfig().then(setPublicConfig).catch(() => setPublicConfig(null));
  }, []);

  useEffect(() => {
    void refreshMe();
  }, []);

  const discordActivity = useDiscordActivity(publicConfig?.discordClientId);

  useEffect(() => {
    if (!user) {
      setInboxUnreadCount(0);
      return;
    }

    void refreshInboxUnreadCount();
  }, [user?.id]);

  useLiveRefresh(
    Boolean(user),
    refreshInboxUnreadCount,
    (event) => event.type === "notifications_changed" || event.type === "work_items_changed" || event.type === "work_item_changed",
    5000
  );

  async function refreshMe() {
    setLoadingMe(true);
    try {
      const payload = await getMe();
      reportClientDiagnostic("me-refresh", {
        authenticated: payload.authenticated,
        hasUser: Boolean(payload.user)
      });
      setMe(payload);
    } finally {
      setLoadingMe(false);
    }
  }

  async function handleLogout() {
    browserDiscordActivityTokenStore.clear();
    browserProjectDeskActivitySessionTokenStore.clear();
    await logout();
    await refreshMe();
  }

  async function handleLogin() {
    if (activityLoginInFlightRef.current) {
      return;
    }

    activityLoginInFlightRef.current = true;
    setActivityLoginInProgress(true);
    setActivityLoginError(null);
    try {
      if (!publicConfig?.discordClientId || !discordActivity.embedded || !discordActivity.ready || !discordActivity.sdk) {
        reportClientDiagnostic("login-browser-redirect", {
          embedded: discordActivity.embedded,
          ready: discordActivity.ready,
          hasSdk: Boolean(discordActivity.sdk)
        });
        login(window.location.pathname);
        return;
      }

      reportClientDiagnostic("activity-login-start", {
        ready: discordActivity.ready
      });

      await completeDiscordActivityLogin({
        clientId: publicConfig.discordClientId,
        sdk: discordActivity.sdk,
        tokenStore: browserDiscordActivityTokenStore,
        sessionTokenStore: browserProjectDeskActivitySessionTokenStore,
        exchangeCode: async (code) => {
          const { accessToken, sessionToken } = await exchangeDiscordActivityCode(code);
          return { accessToken, sessionToken };
        },
        establishSession: async (accessToken) => {
          reportClientDiagnostic("activity-login-establish-session");
          const { sessionToken } = await establishDiscordActivitySession(accessToken);
          return { sessionToken };
        },
        fallbackLogin: () => {
          reportClientDiagnostic("activity-login-fallback");
          login(window.location.pathname);
        }
      });
      reportClientDiagnostic("activity-login-success");
      await refreshMe();
    } catch (error) {
      reportClientDiagnostic("activity-login-error", {
        message: error instanceof Error ? error.message : error
      });
      setActivityLoginError(error instanceof Error ? error.message : "Discord login failed.");
      throw error;
    } finally {
      activityLoginInFlightRef.current = false;
      setActivityLoginInProgress(false);
    }
  }

  async function refreshInboxUnreadCount() {
    try {
      const payload = await getInboxUnreadCount();
      setInboxUnreadCount(payload.unreadCount);
    } catch {
      setInboxUnreadCount(0);
    }
  }

  useEffect(() => {
    if (
      !shouldAutoStartActivityLogin({
        loadingMe,
        hasUser: Boolean(user),
        embedded: discordActivity.embedded,
        ready: discordActivity.ready,
        hasSdk: Boolean(discordActivity.sdk),
        hasClientId: Boolean(publicConfig?.discordClientId),
        attempted: activityAutoLoginAttemptedRef.current,
        inFlight: activityLoginInFlightRef.current
      })
    ) {
      return;
    }

    activityAutoLoginAttemptedRef.current = true;
    reportClientDiagnostic("activity-auto-login-start");

    void handleLogin()
      .then(() => reportClientDiagnostic("activity-auto-login-success"))
      .catch((error) => {
        reportClientDiagnostic("activity-auto-login-error", {
          message: error instanceof Error ? error.message : error
        });
      });
  }, [loadingMe, user, discordActivity.embedded, discordActivity.ready, discordActivity.sdk, publicConfig?.discordClientId]);

  function startAnnotationSession(session: AnnotationSession) {
    setAnnotationSession({
      ...session,
      annotations: session.annotations.map((annotation) => ({ ...annotation }))
    });
  }

  function startGlobalAnnotationSession() {
    startAnnotationSession({
      sourceItemId: workItemIdFromPath(location.pathname),
      sourceItemTitle: currentPageAnnotationTitle(pageLabelFromPath(location.pathname)),
      annotations: []
    });
  }

  function createTaskFromAnnotationSession(result: AnnotationSaveResult) {
    if (!annotationSession || result.annotations.length === 0) {
      return;
    }

    const draft: AnnotationTaskDraft = {
      id: crypto.randomUUID(),
      sourceItemId: annotationSession.sourceItemId,
      sourceItemTitle: annotationSession.sourceItemTitle,
      annotations: result.annotations
    };

    setAnnotationTaskDraft(draft);
    setAnnotationSession(null);
  }

  if (loadingMe) {
    return (
      <main className="login-shell">
        <div className="panel center-panel">
          <RefreshCw size={22} className="spin" />
          <h1>Project Desk</h1>
          <p className="muted">Checking session</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="login-shell">
        <LoginPanel onLogin={handleLogin} activity={discordActivity} busy={activityLoginInProgress} externalError={activityLoginError} />
      </main>
    );
  }

  const session = loadingMe ? (
    <span className="muted">Checking session</span>
  ) : (
    <UserCard
      user={user}
      inboxUnreadCount={inboxUnreadCount}
      onLogout={handleLogout}
      onOpenProfile={() => setProfileOpen(true)}
      onOpenAdminSettings={() => setAdminSettingsOpen(true)}
    />
  );

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">PD</div>
          <div>
            <strong>Project Desk</strong>
            <span>{user ? "Plane workspace" : "Private workspace"}</span>
          </div>
        </div>

        <nav className="nav-tabs" aria-label="Project Desk navigation">
          <TabLink to="/" icon={<Home size={16} />} label="Home" />
          <TabLink to="/ideas" icon={<Lightbulb size={16} />} label="Ideas" />
          <TabLink to="/projects" icon={<Workflow size={16} />} label="Projects" />
          <TabLink to="/board" icon={<Kanban size={16} />} label="Board" />
          <TabLink to="/reviews" icon={<Bot size={16} />} label="Reviews" />
        </nav>

        <div className="sidebar-footer">{session}</div>
      </aside>

      <main className="content">
        <GlobalSearch />
        <Routes>
          <Route path="/" element={<HomePage me={me} loading={loadingMe} onLogin={handleLogin} activity={discordActivity} />} />
          <Route path="/ideas" element={<ItemsPage user={user} onLogin={handleLogin} activity={discordActivity} mode="ideas" />} />
          <Route path="/ideas/new" element={<NewIdeaPage user={user} onLogin={handleLogin} activity={discordActivity} />} />
          <Route path="/projects" element={<ItemsPage user={user} onLogin={handleLogin} activity={discordActivity} mode="projects" />} />
          <Route path="/reviews" element={<ItemsPage user={user} onLogin={handleLogin} activity={discordActivity} mode="reviews" />} />
          <Route path="/inbox" element={<InboxPage user={user} onLogin={handleLogin} activity={discordActivity} onInboxUnreadChange={setInboxUnreadCount} />} />
          <Route
            path="/items/:id"
            element={
              <WorkItemDetailPage
                user={user}
                onLogin={handleLogin}
                activity={discordActivity}
                onInboxUnreadChange={setInboxUnreadCount}
              />
            }
          />
          <Route path="/board" element={<BoardPage user={user} boardUrl={me?.planeFullBoardUrl ?? null} onLogin={handleLogin} activity={discordActivity} />} />
        </Routes>
      </main>
      <GlobalAiChat user={user} onTaskCreated={(createdItem) => navigate(`/items/${createdItem.id}`)} />
      <GlobalAnnotationButton active={Boolean(annotationSession)} onClick={startGlobalAnnotationSession} />
      <AnnotationOverlay
        open={Boolean(annotationSession)}
        annotations={annotationSession?.annotations ?? []}
        sourceLabel={annotationSession?.sourceItemTitle ?? "Current page"}
        onCancel={() => setAnnotationSession(null)}
        onCreateTask={createTaskFromAnnotationSession}
      />
      <GlobalAnnotationTaskModal
        draft={annotationTaskDraft}
        user={user}
        onClose={() => setAnnotationTaskDraft(null)}
        onCreated={(createdItem) => {
          setAnnotationTaskDraft(null);
          navigate(`/items/${createdItem.id}`);
        }}
      />
      <ProfileSettingsModal
        open={profileOpen}
        user={user}
        onClose={() => setProfileOpen(false)}
        onSaved={async () => {
          await refreshMe();
          setProfileOpen(false);
        }}
      />
      {user.isAdmin ? (
        <AdminSettingsModal open={adminSettingsOpen} onClose={() => setAdminSettingsOpen(false)} currentUserId={user.id} onSaved={refreshMe} />
      ) : null}
    </div>
  );
}

function TabLink({ to, icon, label, badge = 0 }: { to: string; icon: ReactNode; label: string; badge?: number }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}>
      {icon}
      <span>{label}</span>
      {badge > 0 ? <strong className="nav-badge">{badge > 99 ? "99+" : badge}</strong> : null}
    </NavLink>
  );
}

function GlobalAnnotationButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      className={`global-annotation-button ${active ? "active" : ""}`}
      type="button"
      title="Annotate page"
      aria-label="Annotate page"
      aria-pressed={active}
      disabled={active}
      onClick={onClick}
    >
      <SquareDashedMousePointer size={20} />
    </button>
  );
}

function defaultAnnotationParentId(draft: AnnotationTaskDraft, items: WorkItemSummary[]): string {
  const sourceItem = draft.sourceItemId ? items.find((item) => item.id === draft.sourceItemId) : null;

  if (sourceItem?.kind === "idea" || sourceItem?.kind === "project") {
    return sourceItem.id;
  }

  if (sourceItem?.kind === "task" && sourceItem.parentId) {
    const parent = items.find((item) => item.id === sourceItem.parentId);

    if (parent?.kind === "idea" || parent?.kind === "project") {
      return parent.id;
    }
  }

  return "";
}

function GlobalAnnotationTaskModal({
  draft,
  user,
  onClose,
  onCreated
}: {
  draft: AnnotationTaskDraft | null;
  user: CurrentUser;
  onClose: () => void;
  onCreated: (item: WorkItemSummary) => void;
}) {
  const [parents, setParents] = useState<WorkItemSummary[]>([]);
  const [people, setPeople] = useState<KnownPerson[]>([]);
  const [parentId, setParentId] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [priority, setPriority] = useState<RequestPriority>("medium");
  const [codexReasoning, setCodexReasoning] = useState<CodexReasoningEffort>("medium");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attachments = draft ? annotationScreenshotAttachments(draft.annotations) : [];
  const context = draft
    ? buildCollaborationContext(attachments, draft.annotations, {
        sourceItemId: draft.sourceItemId,
        sourceItemTitle: draft.sourceItemTitle
      })
    : null;

  useEffect(() => {
    if (!draft) {
      return;
    }

    let cancelled = false;

    setTitle(annotationTaskTitle(draft.annotations));
    setDetails(annotationTaskDetails(draft.annotations));
    setOwnerId("");
    setPriority("medium");
    setCodexReasoning("medium");
    setParentId("");
    setError(null);
    setLoading(true);

    void Promise.all([listWorkItems(), listPeople()])
      .then(([itemsPayload, peoplePayload]) => {
        if (cancelled) {
          return;
        }

        const parentCandidates = itemsPayload.items.filter((item) => item.kind === "idea" || item.kind === "project");
        setParents(parentCandidates);
        setPeople(withCurrentUserAsKnownPerson(peoplePayload.people, user));
        setParentId(defaultAnnotationParentId(draft, itemsPayload.items));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load projects and ideas.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draft?.id, user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!draft || !parentId || !title.trim() || !details.trim()) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = await createWorkItem({
        title: title.trim(),
        details: details.trim(),
        kind: "task",
        priority,
        codexReasoning: ownerId === projectDeskAiUserId ? codexReasoning : undefined,
        parentId,
        ownerDiscordUserId: ownerId || null,
        context
      });
      onCreated(payload.item);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create task.");
    } finally {
      setSaving(false);
    }
  }

  if (!draft) {
    return null;
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="modal-panel annotation-task-panel" role="dialog" aria-modal="true" aria-labelledby="annotation-task-modal-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Annotation</p>
            <h2 id="annotation-task-modal-title">Add task</h2>
          </div>
        </div>
        <form className="task-create-form task-create-modal-form annotation-task-form" onSubmit={(event) => void handleSubmit(event)}>
          {error ? <div className="error-banner full">{error}</div> : null}
          <label className="field full">
            <span>Project or idea</span>
            <select value={parentId} disabled={loading || saving} required onChange={(event) => setParentId(event.target.value)}>
              <option value="" disabled>
                {loading ? "Loading projects and ideas" : "Choose where to add this task"}
              </option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {workItemNumberLabel(parent)} / {parent.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Task</span>
            <input value={title} disabled={saving} onChange={(event) => setTitle(event.target.value)} placeholder="Add a concrete next step" />
          </label>
          <label className="field">
            <span>Assigned to</span>
            <select value={ownerId} disabled={saving} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">Me</option>
              {people.map((person) => (
                <option key={person.discordUserId} value={person.discordUserId}>
                  {personOptionLabel(person)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select value={priority} disabled={saving} onChange={(event) => setPriority(event.target.value as RequestPriority)}>
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {ownerId === projectDeskAiUserId ? (
            <div className="task-ai-reasoning-panel">
              <div>
                <strong>Project Desk AI</strong>
                <span>Queues this task for the configured AI task runner.</span>
              </div>
              <label className="field">
                <span>Reasoning</span>
                <select value={codexReasoning} disabled={saving} onChange={(event) => setCodexReasoning(event.target.value as CodexReasoningEffort)}>
                  {codexReasoningOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <label className="field full">
            <span>Details</span>
            <textarea value={details} disabled={saving} onChange={(event) => setDetails(event.target.value)} placeholder="What needs to happen?" />
          </label>
          <div className="annotation-task-context">
            <ContextPreview context={context ? { ...context, attachments: [] } : null} compact />
          </div>
          <div className="modal-actions">
            <button className="secondary-button" type="button" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={saving || loading || !parentId || !title.trim() || !details.trim()}>
              {saving ? <RefreshCw size={16} className="spin" /> : <Plus size={16} />}
              {saving ? "Creating" : "Create task"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<WorkItemSummary[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const results = useMemo(
    () => items.filter((item) => workItemMatchesGlobalSearch(item, query)).slice(0, 8),
    [items, query]
  );
  const open = focused && query.trim().length > 0;

  useEffect(() => {
    setFocused(false);
    setQuery("");
  }, [location.pathname]);

  useLiveRefresh(Boolean(focused), () => load(true), (event) => event.type === "work_items_changed", 10000);

  async function load(silent = false) {
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const payload = await listWorkItems();
      setItems(payload.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search unavailable.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  function openItem(item: WorkItemSummary) {
    setFocused(false);
    setQuery("");
    navigate(`/items/${item.id}`);
  }

  function handleFocus() {
    setFocused(true);

    if (items.length === 0) {
      void load();
    }
  }

  function handleBlur() {
    window.setTimeout(() => setFocused(false), 120);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setFocused(false);
      setQuery("");
      return;
    }

    if (event.key === "Enter" && results[0]) {
      event.preventDefault();
      openItem(results[0]);
    }
  }

  return (
    <div className="global-search-shell">
      <div className="global-search" onBlur={handleBlur}>
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search ideas, projects, tasks, or item number"
        />
        {open ? (
          <div className="global-search-results">
            {loading ? <p className="global-search-status">Searching Project Desk...</p> : null}
            {error ? <p className="global-search-status error-text">{error}</p> : null}
            {!loading && !error && results.length === 0 ? <p className="global-search-status">No matching items.</p> : null}
            {results.map((item) => (
              <button key={item.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => openItem(item)}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{humanize(item.kind)} / {item.owner?.displayName ?? "Unassigned"}</span>
                </div>
                <span className="pill neutral">{workItemNumberLabel(item)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UserCard({
  user,
  inboxUnreadCount,
  onLogout,
  onOpenProfile,
  onOpenAdminSettings
}: {
  user: CurrentUser;
  inboxUnreadCount: number;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenAdminSettings: () => void;
}) {
  const inboxBadgeLabel = inboxUnreadCount > 99 ? "99+" : inboxUnreadCount.toString();

  return (
    <div className="user-card">
      <button className="avatar-button" type="button" onClick={onOpenProfile} title="Profile settings" aria-label="Profile settings">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="avatar" />
        ) : (
          <div className="avatar fallback">{user.displayName.slice(0, 1).toUpperCase()}</div>
        )}
      </button>
      <div className="user-text">
        <strong>{user.displayName}</strong>
        <span>{user.tagName ? `@${user.tagName}` : user.isAdmin ? "Administrator" : "Member"}</span>
      </div>
      <NavLink
        className={({ isActive }) => `icon-button footer-inbox-button ${isActive ? "active" : ""}`}
        to="/inbox"
        title="Inbox"
        aria-label={inboxUnreadCount > 0 ? `Inbox, ${inboxBadgeLabel} unread` : "Inbox"}
      >
        <Inbox size={16} />
        {inboxUnreadCount > 0 ? <strong className="footer-inbox-badge">{inboxBadgeLabel}</strong> : null}
      </NavLink>
      {user.isAdmin ? (
        <button className="icon-button" onClick={onOpenAdminSettings} title="User settings" aria-label="User settings">
          <Settings size={16} />
        </button>
      ) : null}
      <button className="icon-button" onClick={onLogout} title="Log out" aria-label="Log out">
        <LogOut size={16} />
      </button>
    </div>
  );
}

function completeNotificationPreferences(preferences?: Partial<NotificationPreferences>): NotificationPreferences {
  return Object.fromEntries(
    notificationPreferenceOptions.map((option) => [option.value, preferences?.[option.value] ?? true])
  ) as NotificationPreferences;
}

function NotificationPreferencesEditor({
  preferences,
  onChange
}: {
  preferences: NotificationPreferences;
  onChange: (preferences: NotificationPreferences) => void;
}) {
  return (
    <div className="settings-checklist">
      {notificationPreferenceOptions.map((option) => (
        <label className="settings-check" key={option.value}>
          <input
            type="checkbox"
            checked={preferences[option.value]}
            onChange={(event) =>
              onChange({
                ...preferences,
                [option.value]: event.target.checked
              })
            }
          />
          <span>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

function ProfileSettingsModal({
  open,
  user,
  onClose,
  onSaved
}: {
  open: boolean;
  user: CurrentUser;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [tagName, setTagName] = useState(user.tagName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [preferences, setPreferences] = useState<NotificationPreferences>(completeNotificationPreferences(user.notificationPreferences));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDisplayName(user.displayName);
    setTagName(user.tagName ?? "");
    setAvatarUrl(user.avatarUrl ?? "");
    setPreferences(completeNotificationPreferences(user.notificationPreferences));
    setError(null);
  }, [open, user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await updateProfile({
        displayName,
        tagName: tagName || null,
        avatarUrl: avatarUrl || null,
        notificationPreferences: preferences
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel settings-panel" role="dialog" aria-modal="true" aria-labelledby="profile-settings-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Profile</p>
            <h2 id="profile-settings-title">Profile settings</h2>
          </div>
        </div>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          {error ? <div className="error-banner">{error}</div> : null}
          <div className="settings-preview">
            {avatarUrl ? <img src={avatarUrl} alt="" className="avatar large" /> : <div className="avatar large fallback">{displayName.slice(0, 1).toUpperCase()}</div>}
            <div>
              <strong>{displayName || user.displayName}</strong>
              <span>{tagName ? `@${tagName}` : user.username}</span>
            </div>
          </div>
          <div className="settings-grid">
            <label className="field">
              <span>Display name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label className="field">
              <span>Tag name</span>
              <input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="short mention alias" />
            </label>
            <label className="field full">
              <span>Profile picture URL</span>
              <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." />
            </label>
          </div>
          <div className="settings-section">
            <h3>DM notifications</h3>
            <NotificationPreferencesEditor preferences={preferences} onChange={setPreferences} />
          </div>
          <div className="modal-actions">
            <button className="secondary-button" type="button" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={saving || !displayName.trim()}>
              Save profile
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AdminSettingsModal({
  open,
  currentUserId,
  onClose,
  onSaved
}: {
  open: boolean;
  currentUserId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tagName, setTagName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [preferences, setPreferences] = useState<NotificationPreferences>(completeNotificationPreferences());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SourceSyncStatus | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncAction, setSyncAction] = useState<SourceSyncAction | null>(null);
  const selectedUser = users.find((profile) => profile.discordUserId === selectedId) ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    setLoading(true);
    setError(null);
    void listAdminUsers()
      .then((payload) => {
        setUsers(payload.users);
        setSelectedId((current) => current ?? payload.users[0]?.discordUserId ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load users."))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const refreshSync = async () => {
      try {
        const payload = await getSourceSyncStatus();

        if (!cancelled) {
          setSyncStatus(payload.sync);
          setSyncError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSyncError(err instanceof ApiError ? err.message : "Could not load source sync status.");
        }
      }
    };

    void refreshSync();
    const timer = window.setInterval(() => void refreshSync(), syncStatus?.running ? 2000 : 6000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, syncStatus?.running]);

  useEffect(() => {
    if (!selectedUser) {
      return;
    }

    setDisplayName(selectedUser.displayName);
    setTagName(selectedUser.tagName ?? "");
    setAvatarUrl(selectedUser.avatarUrl ?? "");
    setPreferences(completeNotificationPreferences(selectedUser.notificationPreferences));
  }, [selectedUser]);

  async function saveSelected(event: FormEvent) {
    event.preventDefault();

    if (!selectedUser) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = await updateAdminUser(selectedUser.discordUserId, {
        displayName,
        tagName: tagName || null,
        avatarUrl: avatarUrl || null,
        notificationPreferences: preferences
      });
      setUsers((current) => current.map((profile) => (profile.discordUserId === payload.user.discordUserId ? payload.user : profile)));

      if (payload.user.discordUserId === currentUserId) {
        await onSaved();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save user.");
    } finally {
      setSaving(false);
    }
  }

  async function runSourceSync(action: SourceSyncAction) {
    setSyncAction(action);
    setSyncError(null);

    try {
      const payload = await startSourceSync(action);
      setSyncStatus(payload.sync);
    } catch (err) {
      setSyncError(err instanceof ApiError ? err.message : "Could not start source sync.");
    } finally {
      setSyncAction(null);
    }
  }

  if (!open) {
    return null;
  }

  const normalizedSearch = normalizeMentionFilter(search);
  const visibleUsers = users.filter((profile) => {
    if (!normalizedSearch) {
      return true;
    }

    return [profile.displayName, profile.tagName, profile.discordUsername, profile.discordDisplayName, profile.discordUserId]
      .filter(Boolean)
      .some((value) => normalizeMentionFilter(String(value)).includes(normalizedSearch));
  });

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel settings-panel admin-settings-panel" role="dialog" aria-modal="true" aria-labelledby="admin-settings-title">
        <div className="modal-header settings-modal-header">
          <div>
            <p className="eyebrow">Administration</p>
            <h2 id="admin-settings-title">Users</h2>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {error ? <div className="error-banner settings-error">{error}</div> : null}
        <div className="admin-settings-layout">
          <aside className="settings-user-list">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" />
            <div className="settings-user-results">
              {loading ? <p className="muted">Loading users...</p> : null}
              {visibleUsers.map((profile) => (
                <button
                  className={`settings-user-row ${profile.discordUserId === selectedId ? "active" : ""}`}
                  key={profile.discordUserId}
                  type="button"
                  onClick={() => setSelectedId(profile.discordUserId)}
                >
                  {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="avatar" /> : <span className="avatar fallback">{profile.displayName.slice(0, 1).toUpperCase()}</span>}
                  <span>
                    <strong>{profile.displayName}</strong>
                    <small>{profile.tagName ? `@${profile.tagName}` : profile.discordUsername ?? profile.discordUserId}</small>
                  </span>
                </button>
              ))}
            </div>
          </aside>
          {selectedUser ? (
            <div className="admin-settings-content">
              <form className="settings-form admin-user-form" onSubmit={(event) => void saveSelected(event)}>
              <div className="settings-preview">
                {avatarUrl ? <img src={avatarUrl} alt="" className="avatar large" /> : <div className="avatar large fallback">{displayName.slice(0, 1).toUpperCase()}</div>}
                <div>
                  <strong>{displayName}</strong>
                  <span>{tagName ? `@${tagName}` : selectedUser.discordUsername ?? selectedUser.discordUserId}</span>
                </div>
                {selectedUser.isAdmin ? <span className="pill neutral">Administrator</span> : null}
              </div>
              <div className="settings-info-grid">
                <span>Discord ID</span>
                <code>{selectedUser.discordUserId}</code>
                <span>Discord username</span>
                <code>{selectedUser.discordUsername ?? "Unknown"}</code>
                <span>Discord display</span>
                <code>{selectedUser.discordDisplayName ?? "Unknown"}</code>
              </div>
              <div className="settings-grid">
                <label className="field">
                  <span>Display name</span>
                  <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                </label>
                <label className="field">
                  <span>Tag name</span>
                  <input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="short mention alias" />
                </label>
                <label className="field full">
                  <span>Profile picture URL</span>
                  <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." />
                </label>
              </div>
              <div className="settings-section">
                <h3>DM notifications</h3>
                <NotificationPreferencesEditor preferences={preferences} onChange={setPreferences} />
              </div>
              <div className="modal-actions">
                <button className="primary-button" type="submit" disabled={saving || !displayName.trim()}>
                  Save user
                </button>
              </div>
              </form>
              <SourceSyncPanel
                status={syncStatus}
                error={syncError}
                pendingAction={syncAction}
                onRun={(action) => void runSourceSync(action)}
              />
            </div>
          ) : (
            <p className="muted">No user selected.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function SourceSyncPanel({
  status,
  error,
  pendingAction,
  onRun
}: {
  status: SourceSyncStatus | null;
  error: string | null;
  pendingAction: SourceSyncAction | null;
  onRun: (action: SourceSyncAction) => void;
}) {
  const running = Boolean(status?.running);
  const disabled = running || Boolean(pendingAction) || status?.enabled === false;
  const statusLabel = status
    ? status.running
      ? `Running ${status.action ?? "sync"}`
      : status.state === "idle"
        ? "Idle"
        : humanize(status.state)
    : "Checking";

  return (
    <section className="settings-form source-sync-panel" aria-label="Source sync">
      <div className="source-sync-header">
        <div>
          <h3>Source sync</h3>
          <p className="muted">Syncs only Project Desk app code and docs. Project data, uploads, DB files, and env files stay local.</p>
        </div>
        <span className={`codex-status ${status?.state ?? "idle"}`}>{statusLabel}</span>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      {status?.enabled === false ? <p className="muted">Source sync is disabled on this server.</p> : null}
      <div className="source-sync-actions">
        <button className="secondary-button" type="button" disabled={disabled} onClick={() => onRun("pull")}>
          <Download size={16} /> Sync from GitHub
        </button>
        <button className="secondary-button" type="button" disabled={disabled} onClick={() => onRun("push")}>
          <ArrowRight size={16} /> Sync app to GitHub
        </button>
        <button className="secondary-button" type="button" disabled={disabled} onClick={() => onRun("restart")}>
          <RefreshCw size={16} /> Restart app
        </button>
      </div>
      {status?.message ? <p className={`source-sync-message ${status.state}`}>{status.message}</p> : null}
      {status?.output?.length ? (
        <pre className="source-sync-output" aria-live="polite">
          {status.output.join("\n")}
        </pre>
      ) : (
        <p className="muted">No sync output yet.</p>
      )}
    </section>
  );
}

function MarkdownBody({ value }: { value: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        components={{
          a({ href, children }) {
            if (href?.startsWith("mention:")) {
              return <span className="mention-pill person-mention">{children}</span>;
            }

            if (href?.startsWith("work-item:")) {
              const label = cleanWorkItemMentionLabel(childrenText(children));
              return (
                <NavLink
                  className={`mention-pill ${workItemMentionClass(label)}`}
                  to={`/items/${encodeURIComponent(href.slice("work-item:".length))}`}
                >
                  {label}
                </NavLink>
              );
            }

            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          }
        }}
        remarkPlugins={markdownPlugins}
        urlTransform={(url) => (url.startsWith("mention:") || url.startsWith("work-item:") ? url : defaultUrlTransform(url))}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}

function childrenText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map(childrenText).join("");
  }

  return "";
}

function useLiveRefresh(
  enabled: boolean,
  onRefresh: () => void | Promise<void>,
  shouldRefresh: (event: ProjectDeskEvent) => boolean,
  intervalMs = 12000
) {
  const refreshRef = useRef(onRefresh);
  const shouldRefreshRef = useRef(shouldRefresh);

  useEffect(() => {
    refreshRef.current = onRefresh;
    shouldRefreshRef.current = shouldRefresh;
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refresh = () => {
      void refreshRef.current();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    const unsubscribe = subscribeProjectDeskEvents((event) => {
      if (shouldRefreshRef.current(event)) {
        refresh();
      }
    });
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, intervalMs);

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs]);
}

function cleanMentionLabel(value: string): string {
  return value.replace(/^@+/, "").trim();
}

function personMentionLabel(person: KnownPerson): string {
  return cleanMentionLabel(person.tagName || person.displayName) || person.discordUserId;
}

function mentionTokenForPerson(person: KnownPerson): string {
  const label = personMentionLabel(person).replace(/[[\]]/g, "").trim() || person.discordUserId;
  return `[@${label}](mention:${person.discordUserId})`;
}

function mentionTokenForItem(item: Pick<WorkItemSummary, "id" | "kind" | "title">): string {
  const label = `${item.kind.toUpperCase()}: ${item.title}`.replace(/[[\]]/g, "").trim();
  return `[${label}](work-item:${item.id})`;
}

function peopleMentionOptions(people: KnownPerson[]): MentionOption[] {
  return people
    .filter((person) => !isProjectDeskAiPerson(person))
    .map((person) => ({
      kind: "person" as const,
      key: person.discordUserId,
      label: personMentionLabel(person),
      token: mentionTokenForPerson(person),
      description: person.tagName ? person.displayName : person.isAdmin ? "Administrator" : "Send a DM notification",
      discordUserId: person.discordUserId,
      avatarUrl: person.avatarUrl
    }));
}

function itemMentionOptions(items: WorkItemSummary[], kind: WorkItemKind, filter: string): MentionOption[] {
  const normalizedFilter = normalizeMentionFilter(filter);

  return items
    .filter((item) => item.kind === kind)
    .filter((item) => !normalizedFilter || normalizeMentionFilter(item.title).includes(normalizedFilter))
    .slice(0, 8)
    .map((item) => ({
      kind: "item" as const,
      key: `${item.kind}-${item.id}`,
      label: `${item.kind.toUpperCase()}: ${item.title}`,
      token: mentionTokenForItem(item),
      description: `${humanize(item.stage)} item`,
      itemId: item.id,
      itemKind: item.kind
    }));
}

function filteredMentionOptions(
  people: KnownPerson[],
  items: WorkItemSummary[],
  mode: MentionMode,
  filter: string
): MentionOption[] {
  if (mode !== "people") {
    return itemMentionOptions(items, mode, filter);
  }

  const normalizedFilter = normalizeMentionFilter(filter);
  const peopleOptions = peopleMentionOptions(people).filter((option) =>
    !normalizedFilter ||
    normalizeMentionFilter(option.label).includes(normalizedFilter) ||
    normalizeMentionFilter(option.description).includes(normalizedFilter) ||
    (option.kind === "person" && normalizeMentionFilter(option.discordUserId).includes(normalizedFilter))
  );
  const aiOption: MentionOption = { kind: "ai", key: "ai", label: "AI", token: "@AI", description: "Ask Project Desk AI to reply" };
  const aiMatches = !normalizedFilter || normalizeMentionFilter(aiOption.label).includes(normalizedFilter) ? [aiOption] : [];

  return [...peopleOptions.slice(0, 7), ...aiMatches].slice(0, 8);
}

function mentionQueryFromSelection(editor: HTMLDivElement): MentionQuery | null {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !editor.contains(selection.anchorNode)) {
    return null;
  }

  if (selection.anchorNode.nodeType !== Node.TEXT_NODE) {
    return null;
  }

  const text = selection.anchorNode.textContent ?? "";
  const cursor = selection.anchorOffset;
  const beforeCursor = text.slice(0, cursor);
  const match = /(^|[\s([{])@([A-Za-z0-9_.-]*)$/.exec(beforeCursor);

  if (!match) {
    return null;
  }

  const query = match[2];
  const range = selection.getRangeAt(0).cloneRange();
  const start = match.index + match[1].length;
  range.setStart(selection.anchorNode, start);
  range.setEnd(selection.anchorNode, cursor);

  return { range, initialSearch: query };
}

function parseRecognizedMentions(value: string, people: KnownPerson[]): MentionOption[] {
  const options: MentionOption[] = [
    { kind: "ai", key: "ai", label: "AI", token: "@AI", description: "Ask Project Desk AI to reply" },
    ...peopleMentionOptions(people)
  ];
  const found = new Map<string, MentionOption>();
  const markdownMentionPattern = /\[@[^\]]+\]\(mention:([^)]+)\)/g;
  let match: RegExpExecArray | null;

  if (/(^|[\s.,;:!?()[\]{}])@ai\b/i.test(value)) {
    const ai = options.find((option) => option.kind === "ai");

    if (ai) {
      found.set(ai.key, ai);
    }
  }

  while ((match = markdownMentionPattern.exec(value))) {
    const option = options.find((candidate) => candidate.kind === "person" && candidate.discordUserId === match?.[1]);

    if (option) {
      found.set(option.key, option);
    }
  }

  return [...found.values()];
}

function workItemContextReference(
  item: Pick<WorkItemSummary, "id" | "kind" | "title" | "identifier">,
  source: CollaborationItemReference["source"]
): CollaborationItemReference {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    identifier: item.identifier ?? null,
    source
  };
}

function mergeItemReferences(references: CollaborationItemReference[]): CollaborationItemReference[] {
  const merged = new Map<string, CollaborationItemReference>();

  for (const reference of references) {
    const existing = merged.get(reference.id);

    if (!existing || reference.source === "current_page") {
      merged.set(reference.id, {
        ...reference,
        source: existing?.source === "current_page" ? "current_page" : reference.source
      });
    }
  }

  return [...merged.values()];
}

function parseRecognizedItemMentions(value: string, items: WorkItemSummary[]): CollaborationItemReference[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const references: CollaborationItemReference[] = [];
  const markdownItemPattern = /\[[^\]]+\]\(work-item:([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = markdownItemPattern.exec(value))) {
    const item = itemsById.get(match[1]);

    if (item) {
      references.push(workItemContextReference(item, "mentioned"));
    }
  }

  return mergeItemReferences(references);
}

function tokenDisplay(token: string): { label: string; className: string } {
  const person = /^\[@([^\]]+)\]\(mention:([^)]+)\)$/.exec(token);
  const item = /^\[([^\]]+)\]\(work-item:([^)]+)\)$/.exec(token) ?? /^\[@([^\]]+)\]\(work-item:([^)]+)\)$/.exec(token);

  if (person) {
    return { label: `@${person[1]}`, className: "person-mention" };
  }

  if (item) {
    const label = cleanWorkItemMentionLabel(item[1]);
    return { label, className: workItemMentionClass(label) };
  }

  return { label: "@AI", className: "ai-mention" };
}

function createTokenNode(token: string): HTMLSpanElement {
  const display = tokenDisplay(token);
  const node = document.createElement("span");
  node.className = `mention-pill mention-pill-editor ${display.className}`;
  node.contentEditable = "false";
  node.dataset.token = token;
  node.textContent = display.label;
  return node;
}

function renderComposerValue(editor: HTMLDivElement, value: string): void {
  const tokenPattern = /(\[[^\]]+\]\((?:mention|work-item):[^)]+\)|@AI\b)/gi;
  let match: RegExpExecArray | null;
  let cursor = 0;
  const nodes: Node[] = [];

  while ((match = tokenPattern.exec(value))) {
    if (match.index > cursor) {
      nodes.push(document.createTextNode(value.slice(cursor, match.index)));
    }

    nodes.push(createTokenNode(match[1]));
    cursor = match.index + match[1].length;
  }

  if (cursor < value.length) {
    nodes.push(document.createTextNode(value.slice(cursor)));
  }

  editor.replaceChildren(...nodes);
}

function cleanWorkItemMentionLabel(value: string): string {
  const cleaned = value.replace(/^@+/, "").trim();
  const match = /^(idea|project|task)\s*:\s*(.+)$/i.exec(cleaned);

  if (!match) {
    return cleaned;
  }

  return `${match[1].toUpperCase()}: ${match[2]}`;
}

function workItemMentionClass(label: string): string {
  const normalized = label.toLowerCase();

  if (normalized.startsWith("idea:")) {
    return "idea-mention";
  }

  if (normalized.startsWith("project:")) {
    return "project-mention";
  }

  return "task-mention";
}

function serializeComposerNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;

  if (element.dataset.token) {
    return element.dataset.token;
  }

  if (element.tagName === "BR") {
    return "\n";
  }

  const value = [...element.childNodes].map(serializeComposerNode).join("");
  return element.tagName === "DIV" || element.tagName === "P" ? `${value}\n` : value;
}

function serializeComposer(editor: HTMLDivElement): string {
  return [...editor.childNodes]
    .map(serializeComposerNode)
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function mentionAvatar(option: MentionOption) {
  if (option.kind === "person" && option.avatarUrl) {
    return <img src={option.avatarUrl} alt="" />;
  }

  if (option.kind === "item") {
    return option.itemKind === "project" ? "PR" : option.itemKind === "task" ? "TS" : "ID";
  }

  return option.kind === "ai" ? "AI" : option.label.slice(0, 1).toUpperCase();
}

function mentionOptionDisplayLabel(option: MentionOption): string {
  return option.kind === "item" ? option.label : cleanMentionLabel(option.label);
}

function mentionMenuStatus(mode: MentionMode, search: string): string {
  if (mode === "idea") {
    return search ? `Searching ideas for "${search}"` : "Search ideas";
  }

  if (mode === "project") {
    return search ? `Searching projects for "${search}"` : "Search projects";
  }

  if (mode === "task") {
    return search ? `Searching tasks for "${search}"` : "Search tasks";
  }

  return search ? `Tag people matching "${search}"` : "Tag people";
}

function MentionComposer({
  value,
  people,
  items = [],
  rows,
  placeholder,
  onChange,
  onFilesPasted
}: {
  value: string;
  people: KnownPerson[];
  items?: WorkItemSummary[];
  rows: number;
  placeholder: string;
  onChange: (value: string) => void;
  onFilesPasted?: (files: File[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const queryOpenRef = useRef(false);
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [pickerMode, setPickerMode] = useState<MentionMode>("people");
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const options = filteredMentionOptions(people, items, pickerMode, search);

  useEffect(() => {
    setActiveIndex(0);
  }, [pickerMode, search, options.length]);

  useEffect(() => {
    if (query) {
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [query]);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || ((document.activeElement === editor || queryOpenRef.current) && value !== "")) {
      return;
    }

    renderComposerValue(editor, value);
  }, [value, people, items]);

  function closeMentionPicker() {
    queryOpenRef.current = false;
    setQuery(null);
    setSearch("");
    setPickerMode("people");
    setActiveIndex(0);
  }

  function handleMentionBlur() {
    window.setTimeout(() => {
      const activeElement = document.activeElement;

      if (activeElement && containerRef.current?.contains(activeElement)) {
        return;
      }

      closeMentionPicker();
    }, 120);
  }

  function updateQuery() {
    const editor = editorRef.current;

    if (!editor) {
      queryOpenRef.current = false;
      setQuery(null);
      return;
    }

    const nextQuery = mentionQueryFromSelection(editor);
    queryOpenRef.current = Boolean(nextQuery);

    if (nextQuery) {
      setPickerMode("people");
      setSearch(nextQuery.initialSearch);
    }

    setQuery(nextQuery);
  }

  function insertMention(option = options[activeIndex]) {
    const editor = editorRef.current;

    if (!editor || !query || !option) {
      return;
    }

    editor.focus();
    const activeRange = query.range.cloneRange();
    activeRange.deleteContents();
    const tokenNode = createTokenNode(option.token);
    const spacer = document.createTextNode(" ");
    const fragment = document.createDocumentFragment();
    fragment.append(tokenNode, spacer);
    activeRange.insertNode(fragment);

    const nextRange = document.createRange();
    nextRange.setStartAfter(spacer);
    nextRange.collapse(true);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(nextRange);

    const nextValue = serializeComposer(editor);
    onChange(nextValue);
    closeMentionPicker();
  }

  function handleMentionPickerKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMentionPicker();
      editorRef.current?.focus();
      return;
    }

    if (!query) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (options.length ? (index + 1) % options.length : 0));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (options.length ? (index - 1 + options.length) % options.length : 0));
      return;
    }

    if ((event.key === "Tab" || event.key === "Enter") && options.length > 0) {
      event.preventDefault();
      insertMention();
    }
  }

  function handleInput() {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const nextValue = serializeComposer(editor);
    onChange(nextValue);
    updateQuery();
  }

  return (
    <div className="mention-input" ref={containerRef}>
      <div
        ref={editorRef}
        className="mention-editor"
        contentEditable
        data-placeholder={placeholder}
        role="textbox"
        aria-multiline="true"
        style={{ minHeight: `${Math.max(rows, 2) * 24}px` }}
        onBlur={handleMentionBlur}
        onClick={updateQuery}
        onInput={handleInput}
        onKeyDown={handleMentionPickerKeyDown}
        onKeyUp={updateQuery}
        onPaste={(event) => {
          const files = filesFromFileList(event.clipboardData.files);

          if (files.length > 0 && onFilesPasted) {
            event.preventDefault();
            onFilesPasted(files);
            return;
          }

          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
      />
      {query ? (
        <div className="mention-menu" onBlur={handleMentionBlur}>
          <div className="mention-menu-header">
            <div className="mention-mode-tabs" role="tablist" aria-label="Mention type">
              {(["people", "idea", "project", "task"] as MentionMode[]).map((mode) => (
                <button
                  className={pickerMode === mode ? "active" : ""}
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={pickerMode === mode}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setPickerMode(mode);
                    setActiveIndex(0);
                    searchRef.current?.focus();
                  }}
                >
                  {mode === "people" ? "People" : mode === "idea" ? "Ideas" : mode === "project" ? "Projects" : "Tasks"}
                </button>
              ))}
            </div>
            <input
              ref={searchRef}
              className="mention-search"
              value={search}
              onBlur={handleMentionBlur}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={handleMentionPickerKeyDown}
              placeholder={`Search ${
                pickerMode === "people" ? "people" : pickerMode === "idea" ? "ideas" : pickerMode === "project" ? "projects" : "tasks"
              }`}
            />
            <div className={`mention-menu-filter ${pickerMode !== "people" ? `${pickerMode}-mention-filter` : ""}`}>
              {mentionMenuStatus(pickerMode, search)}
            </div>
          </div>
          <div className="mention-results" role="listbox" aria-label="Mention results">
            {options.length === 0 ? <p className="mention-empty">No matches.</p> : null}
            {options.map((option, index) => (
              <button
                className={`mention-option ${index === activeIndex ? "active" : ""}`}
                key={option.key}
                type="button"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => insertMention(option)}
              >
                <span className={`mention-menu-avatar ${option.kind === "item" ? `${option.itemKind}-mention-avatar` : `${option.kind}-mention-avatar`}`}>
                  {mentionAvatar(option)}
                </span>
                <div>
                  <strong>{mentionOptionDisplayLabel(option)}</strong>
                  <small>{option.description}</small>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeMentionFilter(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function filesFromFileList(fileList: FileList | null | undefined): File[] {
  return Array.from(fileList ?? []).filter((file) => file.size > 0);
}

function dataTransferHasFiles(dataTransfer: DataTransfer): boolean {
  return filesFromFileList(dataTransfer.files).length > 0 || Array.from(dataTransfer.types).includes("Files");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }

  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

function attachmentName(attachment: UploadedAttachment): string {
  return attachment.originalName || attachment.name || attachment.fileName || "attachment";
}

function attachmentFileExtension(attachment: UploadedAttachment): string {
  const name = attachmentName(attachment);
  const dotIndex = name.lastIndexOf(".");

  return dotIndex > -1 && dotIndex < name.length - 1 ? name.slice(dotIndex + 1).toLowerCase() : "";
}

function attachmentExtension(attachment: UploadedAttachment): string {
  return attachmentFileExtension(attachment).toUpperCase() || "FILE";
}

function attachmentMeta(attachment: UploadedAttachment): string {
  return `${attachmentExtension(attachment)} / ${formatFileSize(attachment.size)}`;
}

function attachmentIcon(attachment: UploadedAttachment): ReactNode {
  const name = attachmentName(attachment).toLowerCase();
  const mimeType = attachment.mimeType.toLowerCase();

  if (attachment.thumbnailUrl) {
    return <img className="attachment-thumbnail" src={attachment.thumbnailUrl} alt="" loading="lazy" />;
  }

  if (mimeType.startsWith("image/")) {
    return <ImageIcon size={13} />;
  }

  if (mimeType.startsWith("audio/")) {
    return <FileAudio size={13} />;
  }

  if (mimeType.startsWith("video/")) {
    return <FileVideoCamera size={13} />;
  }

  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) {
    return <FileArchive size={13} />;
  }

  if (/\.(js|ts|tsx|html|css|json|xml|ya?ml|env|sql|py|sh|bat|ps1|md)$/i.test(name)) {
    return <FileCode size={13} />;
  }

  if (/\.(pdf|docx?|txt|rtf|csv)$/i.test(name)) {
    return <FileText size={13} />;
  }

  return <FileIcon size={13} />;
}

function attachmentPreviewIcon(attachment: UploadedAttachment): ReactNode {
  const name = attachmentName(attachment).toLowerCase();
  const mimeType = attachment.mimeType.toLowerCase();

  if (mimeType.startsWith("image/")) {
    return <ImageIcon size={30} />;
  }

  if (mimeType.startsWith("audio/")) {
    return <FileAudio size={30} />;
  }

  if (mimeType.startsWith("video/")) {
    return <FileVideoCamera size={30} />;
  }

  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) {
    return <FileArchive size={30} />;
  }

  if (/\.(js|ts|tsx|html|css|json|xml|ya?ml|env|sql|py|sh|bat|ps1|md)$/i.test(name)) {
    return <FileCode size={30} />;
  }

  if (/\.(pdf|docx?|txt|rtf|csv)$/i.test(name)) {
    return <FileText size={30} />;
  }

  return <FileIcon size={30} />;
}

function normalizedAttachmentMimeType(attachment: UploadedAttachment): string {
  return attachment.mimeType.toLowerCase().split(";")[0].trim();
}

function attachmentUrlWithFlag(attachment: UploadedAttachment, flag: "download" | "preview"): string {
  try {
    const nextUrl = new URL(attachment.url, window.location.origin);
    nextUrl.searchParams.set(flag, "1");

    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  } catch {
    return `${attachment.url}${attachment.url.includes("?") ? "&" : "?"}${flag}=1`;
  }
}

function absoluteAttachmentUrl(url: string): string {
  return new URL(url, window.location.href).toString();
}

function openAttachmentUrl(url: string) {
  const opened = window.open(absoluteAttachmentUrl(url), "_blank", "noopener,noreferrer");

  if (!opened) {
    window.location.assign(url);
  }
}

async function downloadAttachmentUrl(url: string, fileName: string): Promise<void> {
  const response = await fetch(absoluteAttachmentUrl(url), { credentials: "include" });

  if (!response.ok) {
    throw new Error("Attachment download failed.");
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function isInlineImageAttachment(attachment: UploadedAttachment): boolean {
  return Boolean(attachment.thumbnailUrl) || ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(normalizedAttachmentMimeType(attachment));
}

function isInlineDocumentAttachment(attachment: UploadedAttachment): boolean {
  const mimeType = normalizedAttachmentMimeType(attachment);
  const extension = attachmentFileExtension(attachment);

  if (extension === "html" || extension === "htm" || extension === "svg") {
    return false;
  }

  return (
    mimeType === "application/pdf" ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "application/yaml" ||
    mimeType === "application/x-yaml" ||
    mimeType === "application/sql" ||
    (mimeType.startsWith("text/") && mimeType !== "text/html" && mimeType !== "text/xml")
  );
}

function canInlinePreviewAttachment(attachment: UploadedAttachment): boolean {
  return isInlineImageAttachment(attachment) || isInlineDocumentAttachment(attachment);
}

function normalizeContext(context: CollaborationContext | null | undefined): CollaborationContext {
  return {
    ...context,
    attachments: context?.attachments ?? [],
    annotations: context?.annotations ?? [],
    itemReferences: context?.itemReferences ?? [],
    pageContext: context?.pageContext ?? null,
    sourceReplies: context?.sourceReplies ?? []
  };
}

function contextHasContent(context: CollaborationContext | null | undefined): boolean {
  const normalized = normalizeContext(context);
  return Boolean(
      normalized.attachments?.length ||
      normalized.annotations?.length ||
      normalized.itemReferences?.length ||
      normalized.pageContext ||
      normalized.sourceCommentId ||
      normalized.sourceCommentBody ||
      normalized.sourceReplies?.length ||
      normalized.sourceItemId
  );
}

function buildCollaborationContext(
  attachments: UploadedAttachment[],
  annotations: AnnotationMetadata[],
  source?: Partial<CollaborationContext> | null
): CollaborationContext | null {
  const context: CollaborationContext = {
    ...source,
    attachments,
    annotations,
    itemReferences: source?.itemReferences ?? [],
    sourceReplies: source?.sourceReplies ?? []
  };

  return contextHasContent(context) ? context : null;
}

function annotationSummary(annotation: AnnotationMetadata): string {
  const { rect } = annotation;
  return `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

function annotationTaskTitle(annotations: AnnotationMetadata[]): string {
  const primary = annotations[0];

  if (!primary) {
    return "";
  }

  return (
    primary.note ? `Follow up: ${primary.note}` : `Follow up on ${annotations.length === 1 ? "marked area" : "marked areas"}`
  ).slice(0, 120);
}

function annotationTaskDetails(annotations: AnnotationMetadata[]): string {
  const primary = annotations[0];

  if (!primary) {
    return "";
  }

  return annotations.length === 1
    ? `Work from annotation on ${primary.screen} at ${annotationSummary(primary)}.`
    : [
        `Work from ${annotations.length} annotations:`,
        ...annotations.map(
          (annotation, index) =>
            `${index + 1}. ${annotation.note || "Marked area"} on ${annotation.screen} at ${annotationSummary(annotation)}`
        )
      ].join("\n");
}

function annotationScreenshotAttachments(annotations: AnnotationMetadata[]): UploadedAttachment[] {
  return annotations
    .map((annotation) => annotation.screenshot)
    .filter((attachment): attachment is UploadedAttachment => Boolean(attachment));
}

function annotationRectsMatch(left: AnnotationMetadata["rect"], right: AnnotationMetadata["rect"]): boolean {
  return (
    Math.round(left.x) === Math.round(right.x) &&
    Math.round(left.y) === Math.round(right.y) &&
    Math.round(left.width) === Math.round(right.width) &&
    Math.round(left.height) === Math.round(right.height) &&
    Math.round(left.viewportWidth) === Math.round(right.viewportWidth) &&
    Math.round(left.viewportHeight) === Math.round(right.viewportHeight)
  );
}

function annotationNeedsScreenshot(annotation: AnnotationMetadata, original: AnnotationMetadata | undefined): boolean {
  if (!annotation.screenshot) {
    return true;
  }

  return Boolean(original && !annotationRectsMatch(annotation.rect, original.rect));
}

function safeAnnotationScreenshotName(annotation: AnnotationMetadata, index: number): string {
  const screen = annotation.screen
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  const suffix = String(index + 1).padStart(2, "0");

  return `annotation-${screen || "capture"}-${suffix}.png`;
}

function xmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function styleSheetText(): string {
  return Array.from(document.styleSheets)
    .map((styleSheet) => {
      try {
        return Array.from(styleSheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n");
}

function rootCssVariables(): string {
  const computed = getComputedStyle(document.documentElement);
  const variables: string[] = [];

  for (let index = 0; index < computed.length; index += 1) {
    const name = computed.item(index);

    if (name.startsWith("--")) {
      variables.push(`${name}:${computed.getPropertyValue(name)};`);
    }
  }

  return variables.join("");
}

function copyMutableFormState(cloneRoot: HTMLElement) {
  const sourceFields = Array.from(document.body.querySelectorAll("input, textarea, select"));
  const cloneFields = Array.from(cloneRoot.querySelectorAll("input, textarea, select"));

  sourceFields.forEach((source, index) => {
    const target = cloneFields[index];

    if (!target) {
      return;
    }

    if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) {
      target.value = source.value;

      if (source.checked) {
        target.setAttribute("checked", "checked");
      } else {
        target.removeAttribute("checked");
      }
    } else if (source instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) {
      target.value = source.value;
      target.textContent = source.value;
    } else if (source instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
      target.value = source.value;
      Array.from(target.options).forEach((option) => {
        option.selected = option.value === source.value;
      });
    }
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image data."));
    reader.readAsDataURL(blob);
  });
}

async function inlineCloneImages(cloneRoot: HTMLElement) {
  const images = Array.from(cloneRoot.querySelectorAll("img"));

  await Promise.all(
    images.map(async (image) => {
      const source = image.currentSrc || image.getAttribute("src");

      if (!source || source.startsWith("data:")) {
        return;
      }

      try {
        const url = new URL(source, window.location.href);

        if (url.origin !== window.location.origin) {
          throw new Error("Cross-origin images are not inlined.");
        }

        const response = await fetch(url.toString(), { credentials: "include" });

        if (!response.ok) {
          throw new Error("Image request failed.");
        }

        image.setAttribute("src", await blobToDataUrl(await response.blob()));
      } catch {
        image.removeAttribute("src");
        image.style.background = "rgba(255, 255, 255, 0.12)";
      }
    })
  );
}

function replaceCloneIframes(cloneRoot: HTMLElement) {
  for (const frame of Array.from(cloneRoot.querySelectorAll("iframe"))) {
    const placeholder = document.createElement("div");
    placeholder.textContent = "Embedded preview";
    placeholder.style.display = "grid";
    placeholder.style.placeItems = "center";
    placeholder.style.width = `${frame.clientWidth || 240}px`;
    placeholder.style.height = `${frame.clientHeight || 160}px`;
    placeholder.style.border = "1px solid rgba(255,255,255,0.18)";
    placeholder.style.borderRadius = "7px";
    placeholder.style.color = "rgba(255,255,255,0.7)";
    frame.replaceWith(placeholder);
  }
}

async function clonedBodyForAnnotationCapture(): Promise<HTMLElement> {
  const cloneRoot = document.body.cloneNode(true) as HTMLElement;

  cloneRoot.querySelectorAll(".annotation-overlay, script").forEach((element) => element.remove());
  replaceCloneIframes(cloneRoot);
  copyMutableFormState(cloneRoot);
  await inlineCloneImages(cloneRoot);

  return cloneRoot;
}

function serializedCloneChildren(cloneRoot: HTMLElement): string {
  const serializer = new XMLSerializer();

  return Array.from(cloneRoot.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join("");
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not render annotation screenshot."));
    image.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not encode annotation screenshot."));
      }
    }, "image/png");
  });
}

async function captureAnnotationScreenshotFile(annotation: AnnotationMetadata, index: number): Promise<File> {
  const rect = annotation.rect;
  const cropWidth = Math.max(1, Math.round(rect.width));
  const cropHeight = Math.max(1, Math.round(rect.height));
  const viewportWidth = Math.max(1, Math.round(rect.viewportWidth || window.innerWidth));
  const viewportHeight = Math.max(1, Math.round(rect.viewportHeight || window.innerHeight));
  const documentWidth = Math.max(
    viewportWidth,
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
    document.documentElement.clientWidth
  );
  const documentHeight = Math.max(
    viewportHeight,
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    document.documentElement.clientHeight
  );
  const cloneRoot = await clonedBodyForAnnotationCapture();
  const backgroundColor = getComputedStyle(document.body).backgroundColor || "#101012";
  const captureCss = `
    ${styleSheetText()}
    * { animation: none !important; caret-color: transparent !important; transition: none !important; }
    html, body { margin: 0 !important; width: ${documentWidth}px !important; min-height: ${documentHeight}px !important; overflow: hidden !important; background: ${backgroundColor} !important; }
    .annotation-overlay { display: none !important; }
    .annotation-capture-root { ${rootCssVariables()} position: relative; width: ${documentWidth}px; min-height: ${documentHeight}px; overflow: hidden; background: ${backgroundColor}; transform: translate(${-Math.round(rect.x)}px, ${-Math.round(rect.y)}px); transform-origin: 0 0; }
  `;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${cropWidth}" height="${cropHeight}" viewBox="0 0 ${cropWidth} ${cropHeight}">
      <foreignObject x="0" y="0" width="${cropWidth}" height="${cropHeight}">
        <div xmlns="http://www.w3.org/1999/xhtml" class="annotation-capture-root">
          <style>${xmlText(captureCss)}</style>
          ${serializedCloneChildren(cloneRoot)}
        </div>
      </foreignObject>
    </svg>
  `;
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await loadImageFromUrl(svgUrl);
    const scale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cropWidth * scale);
    canvas.height = Math.round(cropHeight * scale);

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create annotation screenshot.");
    }

    context.scale(scale, scale);
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, cropWidth, cropHeight);
    context.drawImage(image, 0, 0, cropWidth, cropHeight);
    context.strokeStyle = "#f5b95b";
    context.lineWidth = 3;
    context.strokeRect(1.5, 1.5, cropWidth - 3, cropHeight - 3);

    return new File([await canvasToPngBlob(canvas)], safeAnnotationScreenshotName(annotation, index), {
      type: "image/png",
      lastModified: Date.now()
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

async function uploadAttachmentFilesInBatches(files: File[]): Promise<UploadedAttachment[]> {
  const uploaded: UploadedAttachment[] = [];

  for (let index = 0; index < files.length; index += 8) {
    const payload = await uploadAttachments(files.slice(index, index + 8));
    uploaded.push(...payload.attachments);
  }

  return uploaded;
}

async function attachScreenshotsToAnnotations(
  drafts: AnnotationMetadata[],
  originals: AnnotationMetadata[]
): Promise<AnnotationSaveResult> {
  const originalById = new Map(originals.map((annotation) => [annotation.id, annotation]));
  const draftIds = new Set(drafts.map((annotation) => annotation.id));
  const deletedScreenshotIds = originals
    .filter((annotation) => !draftIds.has(annotation.id))
    .map((annotation) => annotation.screenshot?.id)
    .filter((id): id is string => Boolean(id));
  const prepared = drafts.map((annotation) => ({
    ...annotation,
    screenshot: annotation.screenshot ?? originalById.get(annotation.id)?.screenshot ?? null
  }));
  const captureJobs = prepared
    .map((annotation, index) => ({ annotation, index, original: originalById.get(annotation.id) }))
    .filter(
      ({ annotation, original }) => annotationNeedsScreenshot(annotation, original) && annotation.path === window.location.pathname
    );

  if (captureJobs.length === 0) {
    return { annotations: prepared, screenshotAttachments: [], removedScreenshotIds: deletedScreenshotIds, captureErrors: [] };
  }

  const captureResults = await Promise.all(
    captureJobs.map(async (job) => {
      try {
        return { job, file: await captureAnnotationScreenshotFile(job.annotation, job.index), error: null };
      } catch (err) {
        return {
          job,
          file: null,
          error: err instanceof Error ? err.message : "Could not create annotation screenshot."
        };
      }
    })
  );
  const successfulCaptures = captureResults.filter(
    (result): result is { job: (typeof captureJobs)[number]; file: File; error: null } => Boolean(result.file)
  );
  const captureErrors = captureResults
    .map((result) => result.error)
    .filter((message): message is string => Boolean(message));
  let screenshotAttachments: UploadedAttachment[] = [];

  if (successfulCaptures.length > 0) {
    try {
      screenshotAttachments = await uploadAttachmentFilesInBatches(successfulCaptures.map((result) => result.file));
    } catch (err) {
      captureErrors.push(err instanceof ApiError ? err.message : "Could not upload annotation screenshot.");
      screenshotAttachments = [];
    }
  }

  const screenshotByIndex = new Map<number, UploadedAttachment>();
  const removedScreenshotIds = [
    ...deletedScreenshotIds,
    ...captureJobs.map(({ original }) => original?.screenshot?.id).filter((id): id is string => Boolean(id))
  ];

  successfulCaptures.forEach((result, index) => {
    const screenshot = screenshotAttachments[index];

    if (screenshot) {
      screenshotByIndex.set(result.job.index, screenshot);
    }
  });

  return {
    annotations: prepared.map((annotation, index) => ({
      ...annotation,
      screenshot: screenshotByIndex.get(index) ?? annotation.screenshot ?? null
    })),
    screenshotAttachments,
    removedScreenshotIds,
    captureErrors
  };
}

function commentToTaskTitle(comment: WorkComment): string {
  const cleaned = comment.body
    .replace(/\[[^\]]+\]\((?:mention|work-item):[^)]+\)/g, "")
    .replace(/[#*_`>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (cleaned ? `Follow up: ${cleaned}` : `Follow up from ${comment.authorName}`).slice(0, 120);
}

function AttachmentDropZone({
  children,
  disabled,
  onFiles
}: {
  children: ReactNode;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const [dragActive, setDragActive] = useState(false);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (disabled || !dataTransferHasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const files = filesFromFileList(event.dataTransfer.files);

    if (disabled || files.length === 0) {
      return;
    }

    event.preventDefault();
    setDragActive(false);
    onFiles(files);
  }

  return (
    <div
      className={`attachment-drop-zone ${dragActive ? "drag-active" : ""}`}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setDragActive(false);
        }
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {dragActive ? <div className="attachment-drop-hint">Drop files to attach</div> : null}
    </div>
  );
}

function AttachmentControl({
  attachments,
  disabled,
  onChange,
  onError
}: {
  attachments: UploadedAttachment[];
  disabled?: boolean;
  onChange: (attachments: UploadedAttachment[]) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function addFiles(files: File[]) {
    if (files.length === 0 || uploading) {
      return;
    }

    setUploading(true);
    onError("");

    try {
      const payload = await uploadAttachments(files);
      onChange([...attachments, ...payload.attachments]);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not upload attachment.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="attachment-control">
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void addFiles(filesFromFileList(event.target.files));
          event.target.value = "";
        }}
      />
      <button
        className="icon-button attachment-icon-button"
        type="button"
        disabled={disabled || uploading}
        title="Attach files"
        aria-label="Attach files"
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <RefreshCw size={15} className="spin" /> : <Paperclip size={15} />}
      </button>
      <AttachmentPreviewList
        attachments={attachments}
        onRemove={(id) => onChange(attachments.filter((attachment) => attachment.id !== id))}
      />
    </div>
  );
}

function AttachmentPreviewList({
  attachments,
  onRemove
}: {
  attachments: UploadedAttachment[];
  onRemove?: (id: string) => void;
}) {
  const [previewAttachment, setPreviewAttachment] = useState<UploadedAttachment | null>(null);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <div className="attachment-list">
        {attachments.map((attachment) => {
          const name = attachmentName(attachment);

          return (
            <div className={`attachment-chip ${attachment.thumbnailUrl ? "has-thumbnail" : ""}`} key={attachment.id}>
              <button
                className="attachment-preview-trigger"
                type="button"
                title={`Preview ${name}`}
                aria-label={`Preview ${name}`}
                onClick={() => setPreviewAttachment(attachment)}
              >
                {attachmentIcon(attachment)}
                <span>{name}</span>
                <small>{attachmentMeta(attachment)}</small>
              </button>
              {onRemove ? (
                <button
                  className="attachment-remove-button"
                  type="button"
                  title="Remove attachment"
                  aria-label={`Remove ${name}`}
                  onClick={() => onRemove(attachment.id)}
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {previewAttachment ? <AttachmentPreviewModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} /> : null}
    </>
  );
}

function AttachmentPreviewModal({ attachment, onClose }: { attachment: UploadedAttachment; onClose: () => void }) {
  const name = attachmentName(attachment);
  const previewUrl = attachmentUrlWithFlag(attachment, "preview");
  const downloadUrl = attachmentUrlWithFlag(attachment, "download");
  const canInlinePreview = canInlinePreviewAttachment(attachment);
  const isImagePreview = isInlineImageAttachment(attachment);
  const [downloading, setDownloading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function handleOpen() {
    setActionError(null);
    openAttachmentUrl(canInlinePreview ? previewUrl : attachment.url);
  }

  async function handleDownload() {
    if (downloading) {
      return;
    }

    setActionError(null);
    setDownloading(true);

    try {
      await downloadAttachmentUrl(downloadUrl, name);
    } catch {
      setActionError("Could not download this attachment.");
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop attachment-preview-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel attachment-preview-panel" role="dialog" aria-modal="true" aria-labelledby="attachment-preview-title">
        <div className="modal-header attachment-preview-header">
          <div className="attachment-preview-title">
            {attachmentPreviewIcon(attachment)}
            <div>
              <h2 id="attachment-preview-title">{name}</h2>
              <span>{attachmentMeta(attachment)}</span>
            </div>
          </div>
          <button className="icon-button" type="button" title="Close preview" aria-label="Close preview" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="attachment-preview-body">
          {isImagePreview ? (
            <img className="attachment-preview-image" src={previewUrl} alt={name} />
          ) : canInlinePreview ? (
            <iframe className="attachment-preview-frame" src={previewUrl} title={name} sandbox="" />
          ) : (
            <div className="attachment-file-preview">
              <div className="attachment-file-preview-icon">{attachmentPreviewIcon(attachment)}</div>
              <strong>{name}</strong>
              <span>{attachmentMeta(attachment)}</span>
              <p>No inline preview for this file type.</p>
            </div>
          )}
        </div>

        {actionError ? <p className="attachment-preview-error">{actionError}</p> : null}

        <div className="modal-actions attachment-preview-actions">
          <button className="secondary-button" type="button" onClick={handleOpen}>
            <ExternalLink size={14} />
            Open
          </button>
          <button className="primary-button" type="button" disabled={downloading} onClick={() => void handleDownload()}>
            {downloading ? <RefreshCw size={14} className="spin" /> : <Download size={14} />}
            {downloading ? "Downloading" : "Download"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ContextPreview({
  context,
  compact = false,
  hideSessionContext = false,
  onRemoveAnnotation,
  onCreateTaskFromAnnotation
}: {
  context: CollaborationContext | null | undefined;
  compact?: boolean;
  hideSessionContext?: boolean;
  onRemoveAnnotation?: (id: string) => void;
  onCreateTaskFromAnnotation?: (annotation: AnnotationMetadata) => void;
}) {
  const normalized = normalizeContext(context);

  if (!contextHasContent(normalized)) {
    return null;
  }

  return (
    <div className={`context-preview ${compact ? "compact" : ""}`}>
      {normalized.attachments?.length ? <AttachmentPreviewList attachments={normalized.attachments} /> : null}
      {!hideSessionContext && normalized.itemReferences?.length ? (
        <div className="context-item-list">
          {normalized.itemReferences.map((reference) => (
            <a className={`context-item-chip ${reference.kind}-mention`} href={`/items/${reference.id}`} key={`${reference.source}-${reference.id}`}>
              <span>{reference.source === "current_page" ? "Current page" : "Referenced page"}</span>
              <strong>
                {workItemNumberLabel(reference)} / {reference.title}
              </strong>
            </a>
          ))}
        </div>
      ) : null}
      {!hideSessionContext && normalized.pageContext ? (
        <div className="source-context">
          <span>Page context</span>
          <p>
            {normalized.pageContext.label}
            {normalized.pageContext.summary ? ` / ${normalized.pageContext.summary}` : ""}
          </p>
        </div>
      ) : null}
      {normalized.annotations?.length ? (
        <div className="annotation-preview-list">
          {normalized.annotations.map((annotation) => (
            <div className="annotation-preview" id={`annotation-${annotation.id}`} key={annotation.id}>
              {annotation.screenshot?.thumbnailUrl ? (
                <img className="annotation-preview-thumbnail" src={annotation.screenshot.thumbnailUrl} alt="" loading="lazy" />
              ) : (
                <Crosshair size={13} />
              )}
              <div>
                <strong>{annotation.note || "Marked area"}</strong>
                <span>
                  {annotation.screen} / {annotationSummary(annotation)}
                </span>
              </div>
              {onCreateTaskFromAnnotation ? (
                <button type="button" onClick={() => onCreateTaskFromAnnotation(annotation)}>
                  Task
                </button>
              ) : null}
              {onRemoveAnnotation ? (
                <button type="button" aria-label="Remove annotation" onClick={() => onRemoveAnnotation(annotation.id)}>
                  <X size={12} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {normalized.sourceCommentBody ? (
        <div className="source-context">
          <span>Source comment</span>
          <p>{normalized.sourceCommentBody}</p>
        </div>
      ) : null}
    </div>
  );
}

function withCurrentUserAsKnownPerson(people: KnownPerson[], user: CurrentUser): KnownPerson[] {
  const existing = people.find((person) => person.discordUserId === user.id);
  const currentUserPerson: KnownPerson = {
    discordUserId: user.id,
    displayName: user.displayName,
    tagName: user.tagName,
    avatarUrl: user.avatarUrl,
    isAdmin: user.isAdmin
  };

  if (!existing) {
    return [currentUserPerson, ...people];
  }

  return people.map((person) =>
    person.discordUserId === user.id
      ? {
          ...person,
          displayName: user.displayName,
          tagName: user.tagName,
          avatarUrl: person.avatarUrl ?? user.avatarUrl,
          isAdmin: user.isAdmin
        }
      : person
  );
}

function LoginPanel({
  onLogin,
  activity,
  busy = false,
  externalError = null
}: {
  onLogin: () => Promise<void>;
  activity: DiscordActivityState;
  busy?: boolean;
  externalError?: string | null;
}) {
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isWorking = loggingIn || busy;

  async function handleClick() {
    setLoggingIn(true);
    setError(null);

    try {
      await onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discord login failed.");
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <section className="panel center-panel">
      <Shield size={30} />
      <h1>Log in with Discord</h1>
      {activity.embedded && !activity.ready ? <p className="muted">Connecting to Discord</p> : null}
      {activity.error ? <p className="error-text">{activity.error}</p> : null}
      {externalError || error ? <p className="error-text">{externalError ?? error}</p> : null}
      <button className="primary-button" onClick={() => void handleClick()} disabled={isWorking || (activity.embedded && !activity.ready)}>
        {isWorking ? <RefreshCw size={16} className="spin" /> : <LogIn size={16} />}
        {isWorking ? "Continuing" : "Continue"}
      </button>
    </section>
  );
}

function HomePage({
  me,
  loading,
  onLogin,
  activity
}: {
  me: MeResponse | null;
  loading: boolean;
  onLogin: () => Promise<void>;
  activity: DiscordActivityState;
}) {
  const [items, setItems] = useState<WorkItemSummary[]>([]);
  const [recentVisits, setRecentVisits] = useState<RecentWorkItemVisit[]>([]);
  const [expandedRecentProjectIds, setExpandedRecentProjectIds] = useState<Set<string>>(new Set());
  const [recentCodexStatuses, setRecentCodexStatuses] = useState<Record<string, LocalCodexRunStatus>>({});
  const recentProjectGroups = useMemo(() => buildRecentProjectGroups(items, recentVisits), [items, recentVisits]);
  const recentProjectIdsKey = recentProjectGroups.map((group) => group.project.id).join("|");
  const recentTaskIds = useMemo(
    () => recentProjectGroups.flatMap((group) => group.tasks.map((task) => task.item.id)),
    [recentProjectGroups]
  );
  const recentTaskIdsKey = recentTaskIds.join("|");

  useEffect(() => {
    if (me?.user) {
      void load();
    }
  }, [me?.user]);

  useEffect(() => {
    setExpandedRecentProjectIds((current) => {
      const projectIds = new Set(recentProjectGroups.map((group) => group.project.id));
      const next = new Set([...current].filter((projectId) => projectIds.has(projectId)));

      if (next.size === 0 && recentProjectGroups[0]) {
        next.add(recentProjectGroups[0].project.id);
      }

      if (next.size === current.size && [...next].every((projectId) => current.has(projectId))) {
        return current;
      }

      return next;
    });
  }, [recentProjectIdsKey]);

  useEffect(() => {
    if (!me?.user || recentTaskIds.length === 0) {
      setRecentCodexStatuses({});
      return;
    }

    let cancelled = false;

    const refreshCodexStatuses = async () => {
      const next: Record<string, LocalCodexRunStatus> = {};

      await Promise.all(
        recentTaskIds.map(async (taskId) => {
          try {
            const snapshot = await getLocalCodexOutputSnapshot(taskId);
            next[taskId] = snapshot.status;
          } catch {
            next[taskId] = "idle";
          }
        })
      );

      if (!cancelled) {
        setRecentCodexStatuses(next);
      }
    };

    void refreshCodexStatuses();
    const timer = window.setInterval(() => void refreshCodexStatuses(), 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [me?.user?.id, recentTaskIdsKey]);

  useLiveRefresh(
    Boolean(me?.user),
    load,
    (event) => event.type === "work_items_changed",
    10000
  );

  async function load() {
    const [itemsPayload, visitsPayload] = await Promise.allSettled([listWorkItems(), getRecentWorkItemVisits()]);

    if (itemsPayload.status === "fulfilled") {
      setItems(itemsPayload.value.items);
    } else {
      setItems([]);
    }

    if (visitsPayload.status === "fulfilled") {
      setRecentVisits(visitsPayload.value.visits);
    } else {
      setRecentVisits([]);
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading Project Desk" />;
  }

  if (!me?.user) {
    return <LoginPanel onLogin={onLogin} activity={activity} />;
  }

  const userId = me.user.id;
  const projectPhaseItems = items.filter(hasProjectPhase);
  const openTasks = items.filter((item) => item.kind === "task" && item.taskStatus !== "complete");
  const followingCount = items.filter((item) => item.isFollowing && (item.kind === "idea" || item.kind === "project")).length;
  const activeCount = projectPhaseItems.filter((item) => item.stage === "active").length;
  const reviewCount = projectPhaseItems.filter((item) => item.stage === "review" || item.stage === "reviewing").length;
  const assignedOpenTasks = openTasks.filter((item) => item.owner?.discordUserId === userId);
  const assignedPhaseItems = projectPhaseItems.filter(
    (item) =>
      item.owner?.discordUserId === userId &&
      ["review", "reviewing", "active"].includes(item.stage) &&
      item.openChildTaskCount === 0
  );
  const attentionItems = [
    ...assignedOpenTasks,
    ...assignedPhaseItems
  ].slice(0, 8);

  function toggleRecentProject(projectId: string) {
    setExpandedRecentProjectIds((current) => {
      const next = new Set(current);

      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }

      return next;
    });
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Home</h1>
        </div>
        <NavLink className="primary-button" to="/ideas/new">
          <Lightbulb size={16} />
          New idea
        </NavLink>
      </header>

      <section className="metrics-grid">
        <Metric label="Following" value={followingCount.toString()} />
        <Metric label="Open tasks" value={openTasks.length.toString()} />
        <Metric label="Active" value={activeCount.toString()} />
        <Metric label="In review" value={reviewCount.toString()} />
      </section>

      <section className="panel recent-activity-panel">
        <PanelTitle title="Recently visited projects" />
        <RecentProjectActivity
          groups={recentProjectGroups}
          expandedProjectIds={expandedRecentProjectIds}
          codexTaskStatuses={recentCodexStatuses}
          onToggleProject={toggleRecentProject}
        />
      </section>

      <section className="panel">
        <PanelTitle title="Needs attention" action={<NavLink to="/reviews">View reviews</NavLink>} />
        <WorkItemList items={attentionItems} empty="Nothing needs attention." />
      </section>
    </div>
  );
}

function RecentProjectActivity({
  groups,
  expandedProjectIds,
  codexTaskStatuses,
  onToggleProject
}: {
  groups: RecentProjectGroup[];
  expandedProjectIds: Set<string>;
  codexTaskStatuses: Record<string, LocalCodexRunStatus>;
  onToggleProject: (projectId: string) => void;
}) {
  if (groups.length === 0) {
    return <p className="empty-state">Open a project or task to build your recent activity.</p>;
  }

  return (
    <div className="recent-project-list">
      {groups.map((group) => {
        const expanded = expandedProjectIds.has(group.project.id);

        return (
          <article className="recent-project-group" key={group.project.id}>
            <div className="recent-project-header">
              <button
                className="recent-expand-button"
                type="button"
                aria-expanded={expanded}
                aria-label={`${expanded ? "Collapse" : "Expand"} recent tasks for ${group.project.title}`}
                onClick={() => onToggleProject(group.project.id)}
              >
                {expanded ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
              </button>
              <NavLink className="recent-project-main" to={`/items/${group.project.id}`} title={workItemNumberTitle(group.project)}>
                <strong>{group.project.title}</strong>
                <span>
                  {workItemNumberLabel(group.project)} / visited {formatRelativeTime(group.visitedAt)}
                </span>
              </NavLink>
              <div className="row-pills recent-project-pills">
                <StagePill item={group.project} />
                <PriorityPill priority={group.project.priority} />
              </div>
            </div>

            {expanded ? (
              <div className="recent-task-list">
                {group.tasks.length > 0 ? (
                  group.tasks.map((task) => {
                    const codexStatus = codexTaskStatuses[task.item.id];
                    const codexActive = isActiveCodexStatus(codexStatus);
                    const codexRestartRequired = isRestartRequiredCodexStatus(codexStatus);

                    return (
                      <NavLink className="recent-task-row" to={`/items/${task.item.id}`} key={task.item.id}>
                        <div className="recent-task-copy">
                          <strong>{task.item.title}</strong>
                          <span>
                            {workItemNumberLabel(task.item)} / opened {formatRelativeTime(task.visitedAt)}
                          </span>
                        </div>
                        <div className="recent-task-progress">
                          {codexActive || codexRestartRequired ? (
                            <span className={`codex-inline-status compact ${codexStatus}`}>
                              {codexActive ? <span className="codex-live-dot" aria-hidden="true" /> : null}
                              {codexRestartRequired ? "Restart npm" : "AI working"}
                            </span>
                          ) : null}
                          <TaskStatusPill item={task.item} codexStatus={codexStatus} />
                        </div>
                      </NavLink>
                    );
                  })
                ) : (
                  <p className="recent-task-empty">No recently visited tasks for this project yet.</p>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NewIdeaPage({
  user,
  onLogin,
  activity
}: {
  user: CurrentUser | null;
  onLogin: () => Promise<void>;
  activity: DiscordActivityState;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<IdeaCategory | "">("");
  const [priority, setPriority] = useState<RequestPriority>("medium");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!user) {
    return <LoginPanel onLogin={onLogin} activity={activity} />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    if (!category) {
      setError("Choose a category.");
      setSaving(false);
      return;
    }

    try {
      const payload = await createWorkItem({ title, category, priority, details, kind: "idea" });
      navigate(`/items/${payload.item.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create idea.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>New idea</h1>
        </div>
      </header>

      <form className="panel form-grid" onSubmit={handleSubmit}>
        <label className="field full">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} />
        </label>

        <label className="field">
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as IdeaCategory | "")} required>
            <option value="" disabled>
              Select category
            </option>
            {ideaCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Priority</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value as RequestPriority)}>
            {priorityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field full">
          <span>Details</span>
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            required
            minLength={10}
            rows={9}
            placeholder="What is the idea, who is it for, and what would prove it is worth doing?"
          />
        </label>

        {error ? <p className="error-text full">{error}</p> : null}

        <div className="form-actions full">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
            {saving ? "Creating" : "Create idea"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ItemsPage({
  user,
  onLogin,
  activity,
  mode
}: {
  user: CurrentUser | null;
  onLogin: () => Promise<void>;
  activity: DiscordActivityState;
  mode: "ideas" | "projects" | "reviews";
}) {
  const [items, setItems] = useState<WorkItemSummary[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visibleItems = useMemo(() => filterItems(items, mode, showArchive), [items, mode, showArchive]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void load();
  }, [user, mode]);

  useEffect(() => {
    setShowArchive(false);
  }, [mode]);

  useLiveRefresh(Boolean(user), () => load(true), (event) => event.type === "work_items_changed", 10000);

  async function load(silent = false) {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const payload = await listWorkItems();
      setItems(payload.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load items.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  if (!user) {
    return <LoginPanel onLogin={onLogin} activity={activity} />;
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>{modeTitle(mode)}</h1>
        </div>
        <div className="header-actions">
          {mode === "ideas" ? (
            <button
              className={showArchive ? "primary-button compact-button" : "secondary-button compact-button"}
              onClick={() => setShowArchive((value) => !value)}
              type="button"
            >
              <Archive size={14} />
              {showArchive ? "Active" : "Archive"}
            </button>
          ) : null}
          {mode === "ideas" ? (
            <NavLink className="primary-button" to="/ideas/new">
              <Lightbulb size={16} />
              New idea
            </NavLink>
          ) : null}
        </div>
      </header>

      <section className="panel">
        {loading ? <LoadingBlock label={`Loading ${mode}`} /> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!loading && !error ? (
          <WorkItemList
            items={visibleItems}
            empty={mode === "ideas" && showArchive ? "No archived ideas yet." : `No ${mode} yet.`}
            showActivityDates={mode === "ideas"}
          />
        ) : null}
      </section>
    </div>
  );
}

function isArchiveItem(item: WorkItemSummary) {
  return item.stage === "parked";
}

function filterItems(items: WorkItemSummary[], mode: "ideas" | "projects" | "reviews", showArchive = false) {
  if (mode === "ideas") {
    return items.filter((item) => item.kind === "idea" && (showArchive ? isArchiveItem(item) : !isArchiveItem(item)));
  }

  if (mode === "projects") {
    return items.filter((item) => item.kind === "project" && !isArchiveItem(item));
  }

  return items.filter((item) => item.kind === "project" && (item.stage === "review" || item.stage === "reviewing") && !isArchiveItem(item));
}

function hasProjectPhase(item: Pick<WorkItemSummary, "kind">) {
  return item.kind === "project";
}

function isAiCreatedItem(item: Pick<WorkItemSummary, "createdBy">) {
  return item.createdBy.displayName.toLowerCase().includes("ai");
}

function modeTitle(mode: "ideas" | "projects" | "reviews") {
  if (mode === "ideas") {
    return "Ideas";
  }

  if (mode === "projects") {
    return "Projects";
  }

  return "Reviews";
}

function itemListPath(item: Pick<WorkItemSummary, "kind" | "parentId">) {
  if (item.kind === "task") {
    return item.parentId ? `/items/${item.parentId}` : "/";
  }

  if (item.kind === "project") {
    return "/projects";
  }

  return "/ideas";
}

function hierarchyRootFor(item: WorkItemDetail, parentItem: WorkItemSummary | null) {
  if (item.kind === "task" && parentItem) {
    return parentItem.kind === "project"
      ? { label: "Projects", to: "/projects" }
      : { label: "Ideas", to: "/ideas" };
  }

  if (item.kind === "project") {
    return { label: "Projects", to: "/projects" };
  }

  if (item.kind === "idea") {
    return { label: "Ideas", to: "/ideas" };
  }

  return { label: "Home", to: "/" };
}

function DetailHierarchy({ item, parentItem }: { item: WorkItemDetail; parentItem: WorkItemSummary | null }) {
  const root = hierarchyRootFor(item, parentItem);
  const parentLabel = parentItem ? workItemNumberTitle(parentItem) : null;

  return (
    <nav className="detail-hierarchy" aria-label="Work item hierarchy">
      <NavLink to={root.to}>{root.label}</NavLink>
      {parentItem ? (
        <>
          <span className="hierarchy-separator">/</span>
          <NavLink to={`/items/${parentItem.id}`} title={parentItem.title}>
            {parentLabel}
          </NavLink>
        </>
      ) : null}
      <span className="hierarchy-separator">/</span>
      <span className={`hierarchy-current ${item.kind}`} title={workItemNumberTitle(item)}>
        {workItemNumberLabel(item)}
      </span>
    </nav>
  );
}

function TaskList({
  items,
  saving,
  onUpdateTask
}: {
  items: WorkItemSummary[];
  saving: boolean;
  onUpdateTask: (itemId: string, taskStatus: TaskStatus, completionReason?: TaskCompletionReason | null) => Promise<void>;
}) {
  const [reasons, setReasons] = useState<Record<string, TaskCompletionReason>>({});
  const [codexStatuses, setCodexStatuses] = useState<Record<string, LocalCodexRunStatus>>({});
  const taskIdsKey = items.map((item) => item.id).join("|");

  useEffect(() => {
    if (items.length === 0) {
      setCodexStatuses({});
      return;
    }

    let cancelled = false;

    const refreshCodexStatuses = async () => {
      const next: Record<string, LocalCodexRunStatus> = {};

      await Promise.all(
        items.map(async (task) => {
          try {
            const snapshot = await getLocalCodexOutputSnapshot(task.id);
            next[task.id] = snapshot.status;
          } catch {
            next[task.id] = "idle";
          }
        })
      );

      if (!cancelled) {
        setCodexStatuses(next);
      }
    };

    void refreshCodexStatuses();
    const timer = window.setInterval(() => void refreshCodexStatuses(), 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [taskIdsKey]);

  if (items.length === 0) {
    return <p className="muted">No tasks yet.</p>;
  }

  return (
    <div className="task-list">
      {items.map((task) => {
        const completionReason = reasons[task.id] ?? task.taskCompletionReason ?? "done";
        const codexStatus = codexStatuses[task.id];
        const codexActive = isActiveCodexStatus(codexStatus);
        const codexRestartRequired = isRestartRequiredCodexStatus(codexStatus);

        return (
          <article className="task-row" key={task.id}>
            <div>
              <div className="task-row-title">
                <NavLink to={`/items/${task.id}`}>{task.title}</NavLink>
                <span className="pill neutral">{workItemNumberLabel(task)}</span>
                {isAiCreatedItem(task) ? <span className="pill neutral">AI</span> : null}
              </div>
              <span className="task-row-meta">
                <span>
                  Assigned to {task.owner?.displayName ?? "Unassigned"} / {formatDate(task.createdAt)} / Created by:{" "}
                  {task.createdBy.displayName}
                </span>
                {codexActive || codexRestartRequired ? (
                  <span className={`codex-inline-status compact ${codexStatus}`}>
                    {codexActive ? <span className="codex-live-dot" aria-hidden="true" /> : null}
                    {codexRestartRequired ? "Restart npm" : "AI working"}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="task-row-actions">
              <TaskStatusPill item={task} codexStatus={codexStatus} />
              {taskStatusOptions.map((option) => (
                <button
                  className={task.taskStatus === option.value ? "primary-button compact-button" : "secondary-button compact-button"}
                  disabled={saving || task.taskStatus === option.value}
                  key={option.value}
                  onClick={() => void onUpdateTask(task.id, option.value, option.value === "complete" ? completionReason : null)}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
              <select
                aria-label={`Completion reason for ${task.title}`}
                disabled={saving}
                value={completionReason}
                onChange={(event) =>
                  setReasons((current) => ({
                    ...current,
                    [task.id]: event.target.value as TaskCompletionReason
                  }))
                }
              >
                {taskCompletionReasonOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function inboxActionLabel(notification: Pick<InboxNotification, "type">) {
  switch (notification.type) {
    case "mention":
      return "mentioned you";
    case "reply":
      return "replied to you";
    case "assignment":
      return "assigned you";
    case "task_update":
      return "created a related task";
    case "ai_task_complete":
      return "completed a task";
    case "annotation":
      return "mentioned you in an annotation";
    default:
      return "updated your work";
  }
}

function inboxFilterMatches(notification: InboxNotification, filter: InboxFilter) {
  switch (filter) {
    case "unread":
      return !notification.readAt;
    case "mentions":
      return notification.type === "mention" || notification.type === "annotation";
    case "replies":
      return notification.type === "reply";
    case "assigned":
      return notification.type === "assignment";
    case "tasks":
      return notification.type === "task_update" || notification.type === "ai_task_complete";
    case "all":
    default:
      return true;
  }
}

function InboxNotificationItem({
  notification,
  onRead
}: {
  notification: InboxNotification;
  onRead?: (notification: InboxNotification, unreadCount: number) => void;
}) {
  async function handleRead() {
    if (notification.readAt) {
      return;
    }

    try {
      const payload = await markInboxNotificationRead(notification.id);
      onRead?.(payload.notification, payload.unreadCount);
    } catch {
      // Background refresh will recover if the click-side read update fails.
    }
  }

  return (
    <NavLink
      className={`inbox-item ${notification.readAt ? "read" : "unread"}`}
      key={notification.id}
      to={notification.targetUrl}
      onClick={() => void handleRead()}
    >
      <span className="inbox-unread-dot" aria-hidden="true" />
      <div className="inbox-item-body">
        <div className="inbox-item-header">
          <strong>
            {notification.actorDisplayName} {inboxActionLabel(notification)}
          </strong>
          <span title={formatDate(notification.createdAt)}>{formatRelativeTime(notification.createdAt)}</span>
        </div>
        <p>"{notification.previewText}"</p>
        <span>{notification.locationLabel}</span>
      </div>
    </NavLink>
  );
}

function InboxPage({
  user,
  onLogin,
  activity,
  onInboxUnreadChange
}: {
  user: CurrentUser | null;
  onLogin: () => Promise<void>;
  activity: DiscordActivityState;
  onInboxUnreadChange: (unreadCount: number) => void;
}) {
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filteredNotifications = useMemo(
    () => notifications.filter((notification) => inboxFilterMatches(notification, filter)),
    [notifications, filter]
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    void load();
  }, [user]);

  useLiveRefresh(Boolean(user), () => load(true), (event) => event.type === "notifications_changed", 6000);

  async function load(silent = false) {
    if (!user) {
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const payload = await getInbox();
      setNotifications(payload.notifications);
      setUnreadCount(payload.unreadCount);
      onInboxUnreadChange(payload.unreadCount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load inbox.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function handleMarkAllRead() {
    setSaving(true);
    setError(null);
    try {
      const payload = await markAllInboxRead();
      setUnreadCount(payload.unreadCount);
      onInboxUnreadChange(payload.unreadCount);
      await load(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not mark inbox read.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return <LoginPanel onLogin={onLogin} activity={activity} />;
  }

  return (
    <div className="stack inbox-page">
      <header className="page-header">
        <div>
          <h1>Inbox</h1>
        </div>
        <div className="header-actions">
          <span className="pill neutral">{unreadCount} unread</span>
          <button className="secondary-button compact-button" type="button" disabled={saving || unreadCount === 0} onClick={() => void handleMarkAllRead()}>
            Mark all read
          </button>
        </div>
      </header>

      <section className="panel inbox-panel">
        <div className="inbox-filters" role="tablist" aria-label="Inbox filters">
          {inboxFilterOptions.map((option) => (
            <button
              className={filter === option.value ? "primary-button compact-button" : "secondary-button compact-button"}
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {loading ? <LoadingBlock label="Loading inbox" /> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!loading && !error ? (
          filteredNotifications.length > 0 ? (
            <div className="inbox-list inbox-page-list">
              {filteredNotifications.map((notification) => (
                <InboxNotificationItem
                  notification={notification}
                  key={notification.id}
                  onRead={(updatedNotification, nextUnreadCount) => {
                    setNotifications((current) =>
                      current.map((currentNotification) =>
                        currentNotification.id === updatedNotification.id ? updatedNotification : currentNotification
                      )
                    );
                    setUnreadCount(nextUnreadCount);
                    onInboxUnreadChange(nextUnreadCount);
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="muted">No notifications match this filter.</p>
          )
        ) : null}
      </section>
    </div>
  );
}

function WorkItemList({
  items,
  empty,
  showActivityDates = false
}: {
  items: WorkItemSummary[];
  empty: string;
  showActivityDates?: boolean;
}) {
  if (items.length === 0) {
    return <p className="muted">{empty}</p>;
  }

  return (
    <div className="request-list">
      {items.map((item) => (
        <NavLink to={`/items/${item.id}`} className="request-row" key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <span className="request-meta">
              {workItemNumberLabel(item)} / Assigned to {item.owner?.displayName ?? "Unassigned"}
            </span>
            {showActivityDates ? (
              <span className="request-date-row">
                Created {formatDate(item.createdAt)} / Last activity {formatDate(item.updatedAt)}
              </span>
            ) : (
              <span className="request-meta">Last activity {formatDate(item.updatedAt)}</span>
            )}
          </div>
          <div className="row-pills">
            {item.identifier ? <span className="pill neutral">{item.identifier}</span> : null}
            {item.category ? <span className="pill neutral">{categoryLabel(item.category)}</span> : null}
            <PriorityPill priority={item.priority} />
            {item.kind === "task" ? <TaskStatusPill item={item} /> : null}
            {item.kind === "task" && isAiCreatedItem(item) ? <span className="pill neutral">AI</span> : null}
            {hasProjectPhase(item) ? <StagePill item={item} /> : null}
            <ArrowRight size={16} />
          </div>
        </NavLink>
      ))}
    </div>
  );
}

function WorkItemDetailPage({
  user,
  onLogin,
  activity,
  onInboxUnreadChange
}: {
  user: CurrentUser | null;
  onLogin: () => Promise<void>;
  activity: DiscordActivityState;
  onInboxUnreadChange: (unreadCount: number) => void;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const lastReadTargetRef = useRef<string | null>(null);
  const [item, setItem] = useState<WorkItemDetail | null>(null);
  const [parentItem, setParentItem] = useState<WorkItemSummary | null>(null);
  const [comments, setComments] = useState<WorkComment[]>([]);
  const [childItems, setChildItems] = useState<WorkItemSummary[]>([]);
  const [itemLinks, setItemLinks] = useState<WorkItemLink[]>([]);
  const [people, setPeople] = useState<KnownPerson[]>([]);
  const [mentionItems, setMentionItems] = useState<WorkItemSummary[]>([]);
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<WorkComment | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDetails, setTaskDetails] = useState("");
  const [taskOwnerId, setTaskOwnerId] = useState("");
  const [taskPriority, setTaskPriority] = useState<RequestPriority>("medium");
  const [taskCodexReasoning, setTaskCodexReasoning] = useState<CodexReasoningEffort>("medium");
  const [commentAttachments, setCommentAttachments] = useState<UploadedAttachment[]>([]);
  const [commentAnnotations, setCommentAnnotations] = useState<AnnotationMetadata[]>([]);
  const [taskAttachments, setTaskAttachments] = useState<UploadedAttachment[]>([]);
  const [taskAnnotations, setTaskAnnotations] = useState<AnnotationMetadata[]>([]);
  const [taskContextSource, setTaskContextSource] = useState<Partial<CollaborationContext> | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [aiAssignModalOpen, setAiAssignModalOpen] = useState(false);
  const [aiAssignReasoning, setAiAssignReasoning] = useState<CodexReasoningEffort>("medium");
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameSuggestion, setRenameSuggestion] = useState<WorkItemTitleSuggestion | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [linkTargetId, setLinkTargetId] = useState("");
  const [linkRelationship, setLinkRelationship] = useState<WorkItemLinkRelationship>("relates_to");
  const [linkNote, setLinkNote] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [codexOutputOpen, setCodexOutputOpen] = useState(false);
  const [codexHeaderSnapshot, setCodexHeaderSnapshot] = useState<LocalCodexRunSnapshot | null>(null);
  const [codexHeaderError, setCodexHeaderError] = useState(false);
  const [taskCompletionReason, setTaskCompletionReason] = useState<TaskCompletionReason>("done");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);
  const assignablePeople = item ? assignablePeopleForKind(people, item.kind) : people;
  const taskParentId = item?.kind === "task" ? parentItem?.id ?? null : id ?? null;
  const canCreateLinkedTask = Boolean(taskParentId);
  const pendingCommentContext = buildCollaborationContext(commentAttachments, commentAnnotations, {
    sourceItemId: item?.id,
    sourceItemTitle: item?.title
  });
  const pendingTaskContext = buildCollaborationContext(taskAttachments, taskAnnotations, {
    sourceItemId: item?.id,
    sourceItemTitle: item?.title,
    ...taskContextSource
  });
  const codexHeaderStatus = codexHeaderSnapshot?.status;
  const codexHeaderActiveStatus = codexHeaderStatus && isActiveCodexStatus(codexHeaderStatus) ? codexHeaderStatus : null;
  const codexHeaderRestartRequiredStatus =
    codexHeaderStatus && isRestartRequiredCodexStatus(codexHeaderStatus) ? codexHeaderStatus : null;

  useEffect(() => {
    if (!user || !id) {
      return;
    }

    void load();
  }, [user, id]);

  useEffect(() => {
    setCodexOutputOpen(false);
    setLinkTargetId("");
    setLinkRelationship("relates_to");
    setLinkNote("");
  }, [id]);

  useEffect(() => {
    if (!item || item.kind !== "task") {
      setCodexHeaderSnapshot(null);
      setCodexHeaderError(false);
      return;
    }

    let cancelled = false;

    const refreshSnapshot = async () => {
      try {
        const next = await getLocalCodexOutputSnapshot(item.id);

        if (!cancelled) {
          setCodexHeaderSnapshot(next);
          setCodexHeaderError(false);
        }
      } catch {
        if (!cancelled) {
          setCodexHeaderError(true);
        }
      }
    };
    const poll = window.setInterval(() => void refreshSnapshot(), 2000);
    void refreshSnapshot();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [item?.id, item?.kind]);

  useEffect(() => {
    if (!user || !id || !item || loading) {
      return;
    }

    const notificationId = new URLSearchParams(location.search).get("notification");
    const readKey = `${user.id}:${id}:${notificationId ?? "target"}`;

    if (lastReadTargetRef.current === readKey) {
      return;
    }

    lastReadTargetRef.current = readKey;

    if (notificationId) {
      void markInboxNotificationRead(notificationId)
        .then((payload) => onInboxUnreadChange(payload.unreadCount))
        .catch(() => undefined);
      return;
    }

    void markInboxTargetRead({ workItemId: id })
      .then((payload) => onInboxUnreadChange(payload.unreadCount))
      .catch(() => undefined);
  }, [user?.id, id, item?.id, loading, location.search]);

  useEffect(() => {
    if (!location.hash || loading) {
      return;
    }

    const targetId = decodeURIComponent(location.hash.slice(1));
    window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "center" });
    }, 50);
  }, [location.hash, loading, comments.length, item?.id]);

  useLiveRefresh(
    Boolean(user && id),
    () => load(true),
    (event) => event.type === "work_items_changed" || (event.type === "work_item_changed" && event.workItemId === id),
    6000
  );

  async function load(silent = false) {
    if (!id || !user) {
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [payload, peoplePayload, itemsPayload] = await Promise.all([getWorkItem(id), listPeople(), listWorkItems()]);
      setItem(payload.item);
      setParentItem(payload.parentItem);
      setComments(payload.comments);
      setChildItems(payload.childItems);
      setItemLinks(payload.links);
      setPeople(withCurrentUserAsKnownPerson(peoplePayload.people, user));
      setMentionItems(itemsPayload.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load item.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function addDraftFiles(
    files: File[],
    currentAttachments: UploadedAttachment[],
    onChange: (attachments: UploadedAttachment[]) => void
  ) {
    if (files.length === 0) {
      return;
    }

    setError(null);

    try {
      const payload = await uploadAttachments(files);
      onChange([...currentAttachments, ...payload.attachments]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload attachment.");
    }
  }

  function openTaskDraftFromComment(entry: CommentNode) {
    if (!canCreateLinkedTask) {
      setError("This item cannot create linked tasks.");
      return;
    }

    const context = normalizeContext(entry.context);
    setTaskTitle(commentToTaskTitle(entry));
    setTaskDetails(`Follow up on ${entry.authorName}'s comment from ${formatDate(entry.createdAt)}.`);
    setTaskPriority(item?.priority ?? "medium");
    setTaskCodexReasoning("medium");
    setTaskAttachments(context.attachments ?? []);
    setTaskAnnotations(context.annotations ?? []);
    setTaskContextSource({
      sourceCommentId: entry.id,
      sourceCommentBody: entry.body,
      sourceReplies: entry.replies.map((reply) => ({
        id: reply.id,
        authorName: reply.authorName,
        body: reply.body,
        createdAt: reply.createdAt
      }))
    });
    setTaskModalOpen(true);
  }

  function openTaskDraftFromAnnotations(annotations: AnnotationMetadata[]) {
    if (!canCreateLinkedTask) {
      setError("This item cannot create linked tasks.");
      return;
    }

    const primary = annotations[0];

    if (!primary) {
      setError("Draw at least one annotation before creating a task.");
      return;
    }

    setTaskTitle(annotationTaskTitle(annotations));
    setTaskDetails(annotationTaskDetails(annotations));
    setTaskPriority(item?.priority ?? "medium");
    setTaskCodexReasoning("medium");
    setTaskAttachments(annotationScreenshotAttachments(annotations));
    setTaskAnnotations(annotations);
    setTaskContextSource(null);
    setTaskModalOpen(true);
  }

  function openTaskDraftFromAnnotation(annotation: AnnotationMetadata) {
    openTaskDraftFromAnnotations([annotation]);
  }

  function removeCommentAnnotation(annotationId: string) {
    const removed = commentAnnotations.find((annotation) => annotation.id === annotationId);
    setCommentAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId));

    if (removed?.screenshot?.id) {
      setCommentAttachments((current) => current.filter((attachment) => attachment.id !== removed.screenshot?.id));
    }
  }

  function removeTaskAnnotation(annotationId: string) {
    const removed = taskAnnotations.find((annotation) => annotation.id === annotationId);
    setTaskAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId));

    if (removed?.screenshot?.id) {
      setTaskAttachments((current) => current.filter((attachment) => attachment.id !== removed.screenshot?.id));
    }
  }

  async function handleComment(event: FormEvent) {
    event.preventDefault();

    if (!id || (!comment.trim() && !contextHasContent(pendingCommentContext))) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await addWorkComment(id, comment.trim() || "Shared files or annotations.", replyTo?.id ?? null, pendingCommentContext);
      setComment("");
      setCommentAttachments([]);
      setCommentAnnotations([]);
      setReplyTo(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add comment.");
    } finally {
      setSaving(false);
    }
  }

  async function moveStage(stage: WorkStage) {
    if (!id) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateWorkItemStage(id, stage);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update stage.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFollow() {
    if (!id || !item) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateWorkItemFollow(id, !item.isFollowing);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update following.");
    } finally {
      setSaving(false);
    }
  }

  async function openAiRenameModal() {
    if (!id || !item) {
      return;
    }

    setRenameModalOpen(true);
    setRenameSuggestion(null);
    setRenameDraft(item.title);
    setRenameError(null);
    setRenameLoading(true);

    try {
      const payload = await suggestWorkItemTitle(id);
      setRenameSuggestion(payload.suggestion);
      setRenameDraft(payload.suggestion.title);
    } catch (err) {
      setRenameError(err instanceof ApiError ? err.message : "Could not suggest a title.");
    } finally {
      setRenameLoading(false);
    }
  }

  async function applyAiRename() {
    if (!id || !item || !renameDraft.trim()) {
      return;
    }

    setSaving(true);
    setRenameError(null);

    try {
      await updateWorkItemTitle(id, renameDraft.trim());
      setRenameModalOpen(false);
      await load();
    } catch (err) {
      setRenameError(err instanceof ApiError ? err.message : "Could not rename item.");
    } finally {
      setSaving(false);
    }
  }

  function resetTaskDraft() {
    setTaskTitle("");
    setTaskDetails("");
    setTaskOwnerId("");
    setTaskPriority("medium");
    setTaskCodexReasoning("medium");
    setTaskAttachments([]);
    setTaskAnnotations([]);
    setTaskContextSource(null);
  }

  async function createChildTask(event?: FormEvent) {
    event?.preventDefault();

    if (!taskParentId || !taskTitle.trim() || !taskDetails.trim()) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = await createWorkItem({
        title: taskTitle.trim(),
        details: taskDetails.trim(),
        kind: "task",
        priority: taskPriority,
        codexReasoning: taskOwnerId === projectDeskAiUserId ? taskCodexReasoning : undefined,
        parentId: taskParentId,
        ownerDiscordUserId: taskOwnerId || null,
        context: pendingTaskContext
      });
      resetTaskDraft();
      setTaskModalOpen(false);
      navigate(`/items/${payload.item.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create task.");
    } finally {
      setSaving(false);
    }
  }

  async function updateTask(itemId: string, taskStatus: TaskStatus, completionReason?: TaskCompletionReason | null) {
    setSaving(true);
    setError(null);
    try {
      await updateTaskStatus(itemId, taskStatus, completionReason);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update task.");
    } finally {
      setSaving(false);
    }
  }

  async function changeCategory(category: IdeaCategory) {
    if (!id || !item) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateWorkItemCategory(id, category);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update category.");
    } finally {
      setSaving(false);
    }
  }

  async function changePriority(priority: RequestPriority) {
    if (!id || !item) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateWorkItemPriority(id, priority);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update priority.");
    } finally {
      setSaving(false);
    }
  }

  async function changeAssignee(discordUserId: string) {
    if (!id || !item) {
      return;
    }

    if (item.kind === "task" && discordUserId === projectDeskAiUserId && item.owner?.discordUserId !== projectDeskAiUserId) {
      setAiAssignReasoning(item.codexReasoning ?? "medium");
      setAiAssignModalOpen(true);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateWorkItemAssignee(
        id,
        discordUserId || null,
        discordUserId === projectDeskAiUserId ? item.codexReasoning ?? "medium" : undefined
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update assignment.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmAiAssignment() {
    if (!id) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateWorkItemAssignee(id, projectDeskAiUserId, aiAssignReasoning);
      setAiAssignModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign Project Desk AI.");
    } finally {
      setSaving(false);
    }
  }

  async function changeCodexReasoning(reasoning: CodexReasoningEffort) {
    if (!id || !item || item.owner?.discordUserId !== projectDeskAiUserId) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateWorkItemAssignee(id, projectDeskAiUserId, reasoning);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update AI reasoning.");
    } finally {
      setSaving(false);
    }
  }

  async function promoteCurrentIdea() {
    if (!id) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = await promoteIdea(id);
      await load();
      navigate(`/items/${payload.item.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not promote idea.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrentItem() {
    if (!id || !item) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = await deleteWorkItem(id);
      setDeleteModalOpen(false);
      const target = item.kind === "task" && payload.parentId ? `/items/${payload.parentId}` : itemListPath(item);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete item.");
    } finally {
      setSaving(false);
    }
  }

  async function createLink(event: FormEvent) {
    event.preventDefault();

    if (!id || !linkTargetId) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await addWorkItemLink(id, {
        targetWorkItemId: linkTargetId,
        relationship: linkRelationship,
        note: linkNote.trim() || null
      });
      setLinkTargetId("");
      setLinkRelationship("relates_to");
      setLinkNote("");
      await load(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not link item.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLink(linkId: string) {
    if (!id) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await deleteWorkItemLink(id, linkId);
      await load(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove link.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return <LoginPanel onLogin={onLogin} activity={activity} />;
  }

  if (loading) {
    return <LoadingBlock label="Loading item" />;
  }

  if (error && !item) {
    return <p className="error-text">{error}</p>;
  }

  if (!item) {
    return <p className="muted">Item not found.</p>;
  }

  const itemHasPhases = hasProjectPhase(item);
  const linkCandidateItems = mentionItems.filter((candidate) => candidate.id !== item.id);

  return (
    <div className="stack">
      <header className="page-header detail-hero">
        <div className="detail-hero-main">
          <DetailHierarchy item={item} parentItem={parentItem} />
          <div className="title-row">
            <h1>{item.title}</h1>
            <button
              className="icon-button title-wand"
              type="button"
              disabled={saving || renameLoading}
              onClick={() => void openAiRenameModal()}
              title="Suggest title with AI"
              aria-label="Suggest title with AI"
            >
              <Wand2 size={17} />
            </button>
          </div>
        </div>
        <div className="header-actions detail-hero-actions">
          {item.kind === "idea" ? (
            <button className="primary-button" disabled={saving} onClick={() => void promoteCurrentIdea()}>
              <Workflow size={16} />
              Promote to project
            </button>
          ) : null}
          <button className={item.isFollowing ? "primary-button" : "secondary-button"} disabled={saving} onClick={() => void toggleFollow()}>
            <Eye size={16} />
            {item.isFollowing ? "Following" : "Follow"}
          </button>
          {item.canOpenInPlane && item.plane.url ? (
            <a className="secondary-button" href={item.plane.url} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Open in Plane
            </a>
          ) : null}
        </div>
      </header>

      <section className="detail-grid">
        <div className="detail-description-panel">
          <p className="details-text">{item.details || "No description provided."}</p>
          <ContextPreview context={item.context} onCreateTaskFromAnnotation={canCreateLinkedTask ? openTaskDraftFromAnnotation : undefined} />
        </div>

        <aside className="panel meta-panel">
          {itemHasPhases ? (
            <label>
              <span>Phase</span>
              <select value={item.stage} disabled={saving} onChange={(event) => void moveStage(event.target.value as WorkStage)}>
                {phaseOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {item.kind !== "task" ? (
            <label>
              <span>Category</span>
              <select
                value={item.category ?? "other"}
                disabled={saving}
                onChange={(event) => void changeCategory(event.target.value as IdeaCategory)}
              >
                {ideaCategoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            <span>Priority</span>
            <select value={item.priority} disabled={saving} onChange={(event) => void changePriority(event.target.value as RequestPriority)}>
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Assigned to</span>
            <select value={item.owner?.discordUserId ?? ""} disabled={saving} onChange={(event) => void changeAssignee(event.target.value)}>
              <option value="">Unassigned</option>
              {assignablePeople.map((person) => (
                <option key={person.discordUserId} value={person.discordUserId}>
                  {personOptionLabel(person)}
                </option>
              ))}
            </select>
          </label>
          {item.kind === "task" && item.owner?.discordUserId === projectDeskAiUserId ? (
            <label>
              <span>Reasoning</span>
              <select
                value={item.codexReasoning ?? "medium"}
                disabled={saving}
                onChange={(event) => void changeCodexReasoning(event.target.value as CodexReasoningEffort)}
              >
                {codexReasoningOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div>
            <span>Updated</span>
            <strong>{formatDate(item.updatedAt)}</strong>
          </div>
          <div>
            <span>Created</span>
            <strong>{formatDate(item.createdAt)}</strong>
          </div>
          <div>
            <span>Created by</span>
            <strong>{item.createdBy.displayName}</strong>
          </div>
        </aside>
      </section>

      <WorkItemLinksPanel
        links={itemLinks}
        candidates={linkCandidateItems}
        selectedTargetId={linkTargetId}
        relationship={linkRelationship}
        note={linkNote}
        saving={saving}
        onTargetChange={setLinkTargetId}
        onRelationshipChange={setLinkRelationship}
        onNoteChange={setLinkNote}
        onSubmit={createLink}
        onRemove={(linkId) => void removeLink(linkId)}
      />

      {item.kind === "task" ? (
        <section className="panel stack">
          <PanelTitle
            title="Task status"
            icon={<ListChecks size={18} />}
            action={
              <div className="codex-title-actions">
                <button className="secondary-button compact-button" type="button" onClick={() => setCodexOutputOpen((open) => !open)}>
                  <Terminal size={16} />
                  {codexOutputOpen ? "Hide AI" : "AI output"}
                </button>
                <CodexRunBadge snapshot={codexHeaderSnapshot} error={codexHeaderError} />
              </div>
            }
          />
          <div className="task-status-toolbar">
            {codexHeaderActiveStatus ? (
              <span className={`codex-inline-status compact ${codexHeaderActiveStatus}`}>
                <span className="codex-live-dot" aria-hidden="true" />
                AI actively working
              </span>
            ) : null}
            {codexHeaderRestartRequiredStatus ? (
              <span className={`codex-inline-status compact ${codexHeaderRestartRequiredStatus}`}>Restart npm</span>
            ) : null}
            {taskStatusOptions.map((option) => (
              <button
                className={item.taskStatus === option.value ? "primary-button" : "secondary-button"}
                disabled={saving || item.taskStatus === option.value}
                key={option.value}
                onClick={() => void updateTask(item.id, option.value, option.value === "complete" ? taskCompletionReason : null)}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
            <select
              aria-label="Completion reason"
              disabled={saving}
              onChange={(event) => setTaskCompletionReason(event.target.value as TaskCompletionReason)}
              value={taskCompletionReason}
            >
              {taskCompletionReasonOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {codexOutputOpen ? <LocalCodexOutputPanel taskId={item.id} /> : null}
        </section>
      ) : null}

      {item.kind !== "task" ? (
        <section className="panel stack">
          <PanelTitle
            title="Tasks"
            icon={<ListChecks size={18} />}
            action={
              <button className="primary-button compact-button" type="button" disabled={saving} onClick={() => setTaskModalOpen(true)}>
                <Plus size={16} />
                Add task
              </button>
            }
          />
          <TaskList items={childItems} saving={saving} onUpdateTask={updateTask} />
        </section>
      ) : null}

      <TaskCreateModal
        open={taskModalOpen}
        saving={saving}
        title={taskTitle}
        details={taskDetails}
        ownerId={taskOwnerId}
        priority={taskPriority}
        codexReasoning={taskCodexReasoning}
        people={people}
        attachments={taskAttachments}
        context={pendingTaskContext}
        onTitleChange={setTaskTitle}
        onDetailsChange={setTaskDetails}
        onOwnerChange={setTaskOwnerId}
        onPriorityChange={setTaskPriority}
        onCodexReasoningChange={setTaskCodexReasoning}
        onAttachmentsChange={setTaskAttachments}
        onRemoveAnnotation={removeTaskAnnotation}
        onAddFiles={(files) => void addDraftFiles(files, taskAttachments, setTaskAttachments)}
        onUploadError={setError}
        onSubmit={createChildTask}
        onClose={() => {
          setTaskModalOpen(false);
          resetTaskDraft();
        }}
      />

      <AiAssignmentModal
        open={aiAssignModalOpen}
        saving={saving}
        reasoning={aiAssignReasoning}
        onReasoningChange={setAiAssignReasoning}
        onConfirm={confirmAiAssignment}
        onCancel={() => setAiAssignModalOpen(false)}
      />

      {error ? <p className="error-text">{error}</p> : null}

      <section className="panel stack">
        <PanelTitle title="Conversation" icon={<MessageCircle size={18} />} />
        <form className="comment-form" onSubmit={handleComment}>
          {replyTo ? (
            <div className="reply-target">
              <span>Replying to {replyTo.authorName}</span>
              <button type="button" onClick={() => setReplyTo(null)}>
                Cancel
              </button>
            </div>
          ) : null}
          <AttachmentDropZone disabled={saving} onFiles={(files) => void addDraftFiles(files, commentAttachments, setCommentAttachments)}>
            <MentionComposer
              value={comment}
              onChange={setComment}
              people={people}
              items={mentionItems}
              placeholder="Add a comment. Type @ to tag people, ideas, projects, or AI."
              rows={4}
              onFilesPasted={(files) => void addDraftFiles(files, commentAttachments, setCommentAttachments)}
            />
            <ContextPreview
              context={pendingCommentContext ? { ...pendingCommentContext, attachments: [] } : null}
              compact
              onRemoveAnnotation={removeCommentAnnotation}
              onCreateTaskFromAnnotation={canCreateLinkedTask ? openTaskDraftFromAnnotation : undefined}
            />
          </AttachmentDropZone>
          <div className="composer-actions">
            <AttachmentControl
              attachments={commentAttachments}
              disabled={saving}
              onChange={setCommentAttachments}
              onError={(message) => setError(message || null)}
            />
            <button className="primary-button" type="submit" disabled={saving || (!comment.trim() && !contextHasContent(pendingCommentContext))}>
              {saving ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
              {saving ? "Saving" : replyTo ? "Reply" : "Comment"}
            </button>
          </div>
        </form>
        <div className="comments">
          {comments.length === 0 ? <p className="muted">No comments yet.</p> : null}
          {commentTree.map((entry) => (
            <CommentCard
              entry={entry}
              depth={0}
              key={`${entry.source}-${entry.id}`}
              canCreateTask={canCreateLinkedTask}
              onReply={setReplyTo}
              onCreateTask={openTaskDraftFromComment}
              onCreateTaskFromAnnotation={openTaskDraftFromAnnotation}
            />
          ))}
        </div>
      </section>

      {user.isAdmin ? (
        <section className="panel danger-zone">
          <div>
            <strong>Delete {humanize(item.kind)}</strong>
            <p>
              Fully removes this {item.kind}
              {item.kind !== "task" && childItems.length > 0 ? ` and ${childItems.length} linked task${childItems.length === 1 ? "" : "s"}` : ""}.
            </p>
          </div>
          <button className="secondary-button danger-button" type="button" disabled={saving} onClick={() => setDeleteModalOpen(true)}>
            <Trash2 size={16} />
            Delete
          </button>
        </section>
      ) : null}

      <DeleteWorkItemModal
        open={deleteModalOpen}
        item={item}
        childCount={childItems.length}
        saving={saving}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={deleteCurrentItem}
      />
      <AiRenameModal
        open={renameModalOpen}
        item={item}
        suggestion={renameSuggestion}
        draft={renameDraft}
        loading={renameLoading}
        saving={saving}
        error={renameError}
        onDraftChange={setRenameDraft}
        onCancel={() => setRenameModalOpen(false)}
        onConfirm={applyAiRename}
        onRetry={openAiRenameModal}
      />
    </div>
  );
}

function workItemLinkLabel(link: Pick<WorkItemLink, "relationship" | "direction">): string {
  const option = workItemLinkOptions.find((candidate) => candidate.value === link.relationship);

  if (!option) {
    return humanize(link.relationship);
  }

  return link.direction === "incoming" ? option.incomingLabel : option.label;
}

function WorkItemLinksPanel({
  links,
  candidates,
  selectedTargetId,
  relationship,
  note,
  saving,
  onTargetChange,
  onRelationshipChange,
  onNoteChange,
  onSubmit,
  onRemove
}: {
  links: WorkItemLink[];
  candidates: WorkItemSummary[];
  selectedTargetId: string;
  relationship: WorkItemLinkRelationship;
  note: string;
  saving: boolean;
  onTargetChange: (value: string) => void;
  onRelationshipChange: (value: WorkItemLinkRelationship) => void;
  onNoteChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void | Promise<void>;
  onRemove: (linkId: string) => void;
}) {
  return (
    <section className="panel stack linked-items-panel">
      <PanelTitle
        title="Linked items"
        icon={<Link2 size={18} />}
        action={links.length > 0 ? <span className="pill neutral">{links.length}</span> : null}
      />
      <form className="work-link-create-form" onSubmit={onSubmit}>
        <label>
          <span>Relation</span>
          <select
            value={relationship}
            disabled={saving}
            onChange={(event) => onRelationshipChange(event.target.value as WorkItemLinkRelationship)}
          >
            {workItemLinkOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Item</span>
          <select value={selectedTargetId} disabled={saving || candidates.length === 0} onChange={(event) => onTargetChange(event.target.value)}>
            <option value="">{candidates.length === 0 ? "No items available" : "Choose an item"}</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {workItemNumberLabel(candidate)} / {candidate.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Note</span>
          <input value={note} maxLength={1000} disabled={saving} onChange={(event) => onNoteChange(event.target.value)} placeholder="Optional context" />
        </label>
        <button className="primary-button compact-button" type="submit" disabled={saving || !selectedTargetId}>
          <Plus size={16} />
          Link
        </button>
      </form>

      <div className="work-link-list">
        {links.length === 0 ? <p className="empty-state">No linked items yet.</p> : null}
        {links.map((link) => (
          <div className="work-link-row" key={link.id}>
            <NavLink className="work-link-main" to={`/items/${link.item.id}`} title={workItemNumberTitle(link.item)}>
              <div className="work-link-relation-line">
                <span className={`work-link-relation relation-${link.relationship}`}>{workItemLinkLabel(link)}</span>
                <ArrowRight size={14} />
                <span className="work-link-number">{workItemNumberLabel(link.item)}</span>
              </div>
              <div className="work-link-title-line">
                <strong>{link.item.title}</strong>
                <ExternalLink size={13} />
              </div>
              <div className="work-link-meta">
                <span>{humanize(link.item.kind)}</span>
                <span>{link.item.owner?.displayName ?? "Unassigned"}</span>
                {link.item.kind === "task" ? <TaskStatusPill item={link.item} /> : <StagePill item={link.item} />}
              </div>
              {link.note ? <p className="work-link-note">{link.note}</p> : null}
            </NavLink>
            <button className="icon-button" type="button" disabled={saving} onClick={() => onRemove(link.id)} title="Remove link" aria-label="Remove link">
              <Unlink size={15} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function AiRenameModal({
  open,
  item,
  suggestion,
  draft,
  loading,
  saving,
  error,
  onDraftChange,
  onCancel,
  onConfirm,
  onRetry
}: {
  open: boolean;
  item: WorkItemDetail;
  suggestion: WorkItemTitleSuggestion | null;
  draft: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
}) {
  if (!open) {
    return null;
  }

  const unchanged = draft.trim() === item.title.trim();

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="modal-panel rename-panel" role="dialog" aria-modal="true" aria-labelledby="rename-modal-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">AI rename</p>
            <h2 id="rename-modal-title">Review suggested title</h2>
          </div>
        </div>
        <div className="rename-modal-body">
          {error ? <div className="error-banner">{error}</div> : null}
          <div className="rename-compare">
            <div>
              <span>Current</span>
              <strong>{item.title}</strong>
            </div>
            <ArrowRight size={16} />
            <label className="field">
              <span>Suggested</span>
              <input value={draft} disabled={loading || saving} maxLength={160} onChange={(event) => onDraftChange(event.target.value)} />
            </label>
          </div>
          <div className="rename-reason">
            {loading ? (
              <p>
                <RefreshCw size={14} className="spin" />
                Reading details, comments, and linked tasks...
              </p>
            ) : suggestion ? (
              <p>{suggestion.reason}</p>
            ) : (
              <p>No suggestion yet.</p>
            )}
          </div>
          <div className="modal-actions">
            <button className="secondary-button" type="button" disabled={saving} onClick={onCancel}>
              Cancel
            </button>
            <button className="secondary-button" type="button" disabled={loading || saving} onClick={() => void onRetry()}>
              <Wand2 size={16} />
              Try again
            </button>
            <button className="primary-button" type="button" disabled={loading || saving || !draft.trim() || unchanged} onClick={() => void onConfirm()}>
              {saving ? <RefreshCw size={16} className="spin" /> : <Wand2 size={16} />}
              Rename
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function AiAssignmentModal({
  open,
  saving,
  reasoning,
  onReasoningChange,
  onConfirm,
  onCancel
}: {
  open: boolean;
  saving: boolean;
  reasoning: CodexReasoningEffort;
  onReasoningChange: (value: CodexReasoningEffort) => void;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="ai-assignment-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Project Desk AI</p>
            <h2 id="ai-assignment-title">Assign Project Desk AI</h2>
          </div>
        </div>
        <div className="stack">
          <p className="muted">This queues the task for the configured AI task runner.</p>
          <label className="field">
            <span>Reasoning</span>
            <select value={reasoning} disabled={saving} onChange={(event) => onReasoningChange(event.target.value as CodexReasoningEffort)}>
              {codexReasoningOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button className="secondary-button" type="button" disabled={saving} onClick={onCancel}>
              Cancel
            </button>
            <button className="primary-button" type="button" disabled={saving} onClick={() => void onConfirm()}>
              {saving ? <RefreshCw size={16} className="spin" /> : <Bot size={16} />}
              Assign AI
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function TaskCreateModal({
  open,
  saving,
  title,
  details,
  ownerId,
  priority,
  codexReasoning,
  people,
  attachments,
  context,
  onTitleChange,
  onDetailsChange,
  onOwnerChange,
  onPriorityChange,
  onCodexReasoningChange,
  onAttachmentsChange,
  onRemoveAnnotation,
  onAddFiles,
  onUploadError,
  onSubmit,
  onClose
}: {
  open: boolean;
  saving: boolean;
  title: string;
  details: string;
  ownerId: string;
  priority: RequestPriority;
  codexReasoning: CodexReasoningEffort;
  people: KnownPerson[];
  attachments: UploadedAttachment[];
  context: CollaborationContext | null;
  onTitleChange: (value: string) => void;
  onDetailsChange: (value: string) => void;
  onOwnerChange: (value: string) => void;
  onPriorityChange: (value: RequestPriority) => void;
  onCodexReasoningChange: (value: CodexReasoningEffort) => void;
  onAttachmentsChange: (attachments: UploadedAttachment[]) => void;
  onRemoveAnnotation: (annotationId: string) => void;
  onAddFiles: (files: File[]) => void;
  onUploadError: (message: string | null) => void;
  onSubmit: (event: FormEvent) => void | Promise<void>;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Task</p>
            <h2 id="task-modal-title">Add task</h2>
          </div>
        </div>
        <form className="task-create-form task-create-modal-form" onSubmit={(event) => void onSubmit(event)}>
          <div className="field">
            <span>Task</span>
            <input value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="Add a concrete next step" autoFocus />
          </div>
          <div className="field">
            <span>Assigned to</span>
            <select value={ownerId} onChange={(event) => onOwnerChange(event.target.value)}>
              <option value="">Me</option>
              {people.map((person) => (
                <option key={person.discordUserId} value={person.discordUserId}>
                  {personOptionLabel(person)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span>Priority</span>
            <select value={priority} onChange={(event) => onPriorityChange(event.target.value as RequestPriority)}>
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {ownerId === projectDeskAiUserId ? (
            <div className="task-ai-reasoning-panel">
              <div>
                <strong>Project Desk AI</strong>
                <span>Queues this task for the configured AI task runner.</span>
              </div>
              <label className="field">
                <span>Reasoning</span>
                <select value={codexReasoning} onChange={(event) => onCodexReasoningChange(event.target.value as CodexReasoningEffort)}>
                  {codexReasoningOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <div className="field full">
            <span>Details</span>
            <AttachmentDropZone disabled={saving} onFiles={onAddFiles}>
              <textarea
                value={details}
                onChange={(event) => onDetailsChange(event.target.value)}
                onPaste={(event) => {
                  const files = filesFromFileList(event.clipboardData.files);

                  if (files.length > 0) {
                    event.preventDefault();
                    onAddFiles(files);
                  }
                }}
                placeholder="What needs to happen?"
              />
              <ContextPreview
                context={context ? { ...context, attachments: [] } : null}
                compact
                onRemoveAnnotation={onRemoveAnnotation}
              />
            </AttachmentDropZone>
          </div>
          <div className="task-attachment-row">
            <AttachmentControl
              attachments={attachments}
              disabled={saving}
              onChange={onAttachmentsChange}
              onError={onUploadError}
            />
          </div>
          <div className="modal-actions">
            <button className="secondary-button" type="button" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={saving || !title.trim() || !details.trim()}>
              <Plus size={16} />
              Create task
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AnnotationOverlay({
  open,
  annotations,
  sourceLabel,
  onCancel,
  onCreateTask
}: {
  open: boolean;
  annotations: AnnotationMetadata[];
  sourceLabel: string;
  onCancel: () => void;
  onCreateTask: (result: AnnotationSaveResult) => void;
}) {
  const location = useLocation();
  const currentPath = location.pathname;
  const [drafts, setDrafts] = useState<AnnotationMetadata[]>(annotations);
  const [selectedId, setSelectedId] = useState<string | null>(annotations[0]?.id ?? null);
  const [tool, setTool] = useState<AnnotationToolMode>("box");
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawingRect, setDrawingRect] = useState<AnnotationMetadata["rect"] | null>(null);
  const [savingScreenshots, setSavingScreenshots] = useState(false);
  const [capturingIds, setCapturingIds] = useState<Set<string>>(() => new Set());
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState(() => ({ x: window.scrollX, y: window.scrollY }));
  const moveRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setDrafts(annotations);
      setSelectedId(annotations[0]?.id ?? null);
      setTool("box");
      setDrawStart(null);
      setDrawingRect(null);
      setSavingScreenshots(false);
      setCapturingIds(new Set());
      setCaptureError(null);
      moveRef.current = null;
    }
  }, [open, annotations]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const currentPageDrafts = drafts.filter((annotation) => annotation.path === currentPath);

    if (selectedId && currentPageDrafts.some((annotation) => annotation.id === selectedId)) {
      return;
    }

    setSelectedId(currentPageDrafts[0]?.id ?? null);
  }, [open, currentPath, drafts, selectedId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updateScrollPosition() {
      setScrollPosition({ x: window.scrollX, y: window.scrollY });
    }

    updateScrollPosition();
    window.addEventListener("scroll", updateScrollPosition, { passive: true });
    window.addEventListener("resize", updateScrollPosition);

    return () => {
      window.removeEventListener("scroll", updateScrollPosition);
      window.removeEventListener("resize", updateScrollPosition);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const visibleDrafts = drafts.filter((annotation) => annotation.path === currentPath);
  const selected = visibleDrafts.find((annotation) => annotation.id === selectedId) ?? null;
  const selectedCapturing = selected ? capturingIds.has(selected.id) : false;

  function pagePointFromEvent(event: PointerEvent<HTMLElement>): { x: number; y: number } {
    return { x: event.clientX + window.scrollX, y: event.clientY + window.scrollY };
  }

  function documentBounds() {
    return {
      width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth),
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight)
    };
  }

  function rectFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): AnnotationMetadata["rect"] {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const bounds = documentBounds();
    const x = Math.max(0, Math.min(start.x, end.x));
    const y = Math.max(0, Math.min(start.y, end.y));
    const width = Math.min(bounds.width - x, Math.abs(end.x - start.x));
    const height = Math.min(bounds.height - y, Math.abs(end.y - start.y));

    return { x, y, width, height, viewportWidth, viewportHeight };
  }

  function fixedRectStyle(rect: AnnotationMetadata["rect"]): CSSProperties {
    return {
      left: rect.x - scrollPosition.x,
      top: rect.y - scrollPosition.y,
      width: rect.width,
      height: rect.height
    };
  }

  function currentScreenLabel(): string {
    return document.querySelector("main h1")?.textContent?.trim() || document.querySelector("h1")?.textContent?.trim() || sourceLabel;
  }

  function captureWarning(result: AnnotationSaveResult): string | null {
    return result.captureErrors.length > 0
      ? "Some annotation screenshots could not be captured. The task will still include the marked-area metadata."
      : null;
  }

  async function captureAnnotationNow(annotation: AnnotationMetadata) {
    setCapturingIds((current) => new Set(current).add(annotation.id));
    setCaptureError(null);

    try {
      const result = await attachScreenshotsToAnnotations([annotation], []);
      const captured = result.annotations[0];

      if (captured?.screenshot) {
        setDrafts((current) =>
          current.map((currentAnnotation) => (currentAnnotation.id === annotation.id ? captured : currentAnnotation))
        );
      }

      const warning = captureWarning(result);

      if (warning) {
        setCaptureError(warning);
      }
    } finally {
      setCapturingIds((current) => {
        const next = new Set(current);
        next.delete(annotation.id);
        return next;
      });
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (tool !== "box" || event.button !== 0 || event.target !== event.currentTarget) {
      return;
    }

    const start = pagePointFromEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(null);
    setDrawStart(start);
    setDrawingRect(rectFromPoints(start, start));
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (tool !== "box") {
      return;
    }

    const moving = moveRef.current;

    if (moving) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const bounds = documentBounds();
      const point = pagePointFromEvent(event);
      const deltaX = point.x - moving.startX;
      const deltaY = point.y - moving.startY;

      setDrafts((current) =>
        current.map((annotation) => {
          if (annotation.id !== moving.id) {
            return annotation;
          }

          return {
            ...annotation,
            screenshot: null,
            rect: {
              ...annotation.rect,
              viewportWidth,
              viewportHeight,
              x: Math.min(Math.max(0, moving.originalX + deltaX), Math.max(0, bounds.width - annotation.rect.width)),
              y: Math.min(Math.max(0, moving.originalY + deltaY), Math.max(0, bounds.height - annotation.rect.height))
            }
          };
        })
      );
      return;
    }

    if (drawStart) {
      setDrawingRect(rectFromPoints(drawStart, pagePointFromEvent(event)));
    }
  }

  function handlePointerUp() {
    if (drawStart && drawingRect && drawingRect.width >= 8 && drawingRect.height >= 8) {
      const annotation: AnnotationMetadata = {
        id: crypto.randomUUID(),
        screen: currentScreenLabel(),
        path: window.location.pathname,
        note: "",
        createdAt: new Date().toISOString(),
        rect: drawingRect
      };

      setDrafts((current) => [...current, annotation]);
      setSelectedId(annotation.id);
      void captureAnnotationNow(annotation);
    }

    setDrawStart(null);
    setDrawingRect(null);
    moveRef.current = null;
  }

  function updateSelectedNote(note: string) {
    if (!selectedId) {
      return;
    }

    setDrafts((current) => current.map((annotation) => (annotation.id === selectedId ? { ...annotation, note } : annotation)));
  }

  function deleteSelected() {
    if (!selectedId) {
      return;
    }

    setDrafts((current) => current.filter((annotation) => annotation.id !== selectedId));
    setSelectedId(null);
  }

  async function createTaskFromDrafts() {
    if (savingScreenshots || drafts.length === 0) {
      return;
    }

    setSavingScreenshots(true);
    setCaptureError(null);

    try {
      const result = await attachScreenshotsToAnnotations(drafts, annotations);
      const warning = captureWarning(result);
      setDrafts(result.annotations);

      if (warning) {
        setCaptureError(warning);
      }

      onCreateTask(result);
    } finally {
      setSavingScreenshots(false);
    }
  }

  return (
    <div
      className={`annotation-overlay ${tool === "cursor" ? "cursor-mode" : "box-mode"}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="annotation-toolbar" onPointerDown={(event) => event.stopPropagation()}>
        <div>
          <strong>Annotate</strong>
          <span>
            {tool === "cursor"
              ? "Cursor mode lets the app scroll and navigate."
              : visibleDrafts.length > 0
                ? `${visibleDrafts.length} mark${visibleDrafts.length === 1 ? "" : "s"} on this page.`
                : "Draw a box on this page."}
          </span>
        </div>
        <div className="annotation-toolbar-actions" role="toolbar" aria-label="Annotation tools">
          <button
            className={`icon-button annotation-tool-button ${tool === "cursor" ? "active" : ""}`}
            type="button"
            title="Cursor mode"
            aria-label="Cursor mode"
            disabled={savingScreenshots}
            onClick={() => setTool("cursor")}
          >
            <MousePointer2 size={16} />
          </button>
          <button
            className={`icon-button annotation-tool-button ${tool === "box" ? "active" : ""}`}
            type="button"
            title="Box annotation tool"
            aria-label="Box annotation tool"
            disabled={savingScreenshots}
            onClick={() => setTool("box")}
          >
            <SquareDashedMousePointer size={16} />
          </button>
          <button className="primary-button compact-button" type="button" disabled={savingScreenshots || drafts.length === 0} onClick={() => void createTaskFromDrafts()}>
            {savingScreenshots ? <RefreshCw size={15} className="spin" /> : <Plus size={15} />}
            {savingScreenshots ? "Capturing" : "+ Task"}
          </button>
          <button
            className="icon-button annotation-tool-button"
            type="button"
            title="Delete selected annotation"
            aria-label="Delete selected annotation"
            disabled={savingScreenshots || !selected}
            onClick={deleteSelected}
          >
            <Trash2 size={15} />
          </button>
          <button className="icon-button annotation-tool-button" type="button" title="Close annotate" aria-label="Close annotate" disabled={savingScreenshots} onClick={onCancel}>
            <X size={15} />
          </button>
        </div>
      </div>

      {[...visibleDrafts, ...(drawingRect ? [{ id: "drawing", rect: drawingRect, note: "", screen: sourceLabel, path: "", createdAt: "" }] : [])].map(
        (annotation) => (
          <div
            className={`annotation-box ${annotation.id === selectedId ? "selected" : ""} ${annotation.id === "drawing" ? "drawing" : ""}`}
            key={annotation.id}
            style={fixedRectStyle(annotation.rect)}
            onPointerDown={(event) => {
              if (tool !== "box") {
                return;
              }

              event.stopPropagation();

              if (annotation.id === "drawing") {
                return;
              }

              setSelectedId(annotation.id);
              event.currentTarget.setPointerCapture(event.pointerId);
              const startPoint = pagePointFromEvent(event);
              moveRef.current = {
                id: annotation.id,
                startX: startPoint.x,
                startY: startPoint.y,
                originalX: annotation.rect.x,
                originalY: annotation.rect.y
              };
            }}
          >
            {annotation.id !== "drawing" ? <span>{capturingIds.has(annotation.id) ? "Capturing..." : annotation.note || "Annotation"}</span> : null}
          </div>
        )
      )}

      <section className="annotation-editor" onPointerDown={(event) => event.stopPropagation()}>
        {selected ? (
          <>
            <label>
              <span>Note</span>
              <textarea value={selected.note} maxLength={1000} onChange={(event) => updateSelectedNote(event.target.value)} />
            </label>
            <div className="annotation-meta">
              {selected.screen} / {annotationSummary(selected)}
            </div>
            {selected.screenshot ? (
              <AttachmentPreviewList attachments={[selected.screenshot]} />
            ) : selectedCapturing ? (
              <div className="annotation-meta">Creating screenshot preview...</div>
            ) : (
              <div className="annotation-meta">A screenshot is captured for + Task when possible.</div>
            )}
            {captureError ? <p className="annotation-error">{captureError}</p> : null}
            <div className="annotation-editor-actions">
              <button className="primary-button compact-button" type="button" disabled={savingScreenshots || drafts.length === 0} onClick={() => void createTaskFromDrafts()}>
                {savingScreenshots ? <RefreshCw size={15} className="spin" /> : <Plus size={15} />}
                {savingScreenshots ? "Capturing" : "+ Task"}
              </button>
              <button className="secondary-button compact-button danger-button" type="button" disabled={savingScreenshots} onClick={deleteSelected}>
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </>
        ) : (
          <p>{visibleDrafts.length > 0 ? "Select an annotation on this page." : "Use the box tool to mark this page."}</p>
        )}
      </section>
    </div>
  );
}

function DeleteWorkItemModal({
  open,
  item,
  childCount,
  saving,
  onCancel,
  onConfirm
}: {
  open: boolean;
  item: WorkItemDetail;
  childCount: number;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  if (!open) {
    return null;
  }

  const childText =
    item.kind !== "task" && childCount > 0 ? ` This will also delete ${childCount} linked task${childCount === 1 ? "" : "s"}.` : "";

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="modal-panel confirm-panel" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
        <div className="confirm-icon">
          <AlertTriangle size={22} />
        </div>
        <div className="confirm-content">
          <h2 id="delete-modal-title">Delete {item.title}?</h2>
          <p>
            This fully removes the {item.kind}, comments, AI jobs, notifications, and history from this server.{childText}
          </p>
          <div className="modal-actions">
            <button className="secondary-button" type="button" disabled={saving} onClick={onCancel}>
              Cancel
            </button>
            <button className="secondary-button danger-button solid" type="button" disabled={saving} onClick={() => void onConfirm()}>
              <Trash2 size={16} />
              Delete forever
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function localCodexStatusLabel(status: LocalCodexRunStatus) {
  const labels: Record<LocalCodexRunStatus, string> = {
    idle: "Idle",
    queued: "Queued",
    running: "Running",
    succeeded: "Complete",
    restart_required: "Restart npm",
    failed: "Failed",
    timed_out: "Timed out",
    start_failed: "Failed to start"
  };

  return labels[status];
}

function CodexRunBadge({ snapshot, error }: { snapshot: LocalCodexRunSnapshot | null; error: boolean }) {
  if (error) {
    return <span className="codex-inline-status failed">AI unknown</span>;
  }

  const status = snapshot?.status ?? "idle";
  const label = snapshot ? localCodexStatusLabel(status) : "Checking";

  return (
    <span className={`codex-inline-status ${status}`}>
      {status === "queued" || status === "running" ? <span className="codex-live-dot" aria-hidden="true" /> : null}
      AI {label.toLowerCase()}
    </span>
  );
}

function stripCodexTerminalControls(value: string): string {
  return value
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function normalizeCodexOutputLine(value: string): string {
  return value
    .replace(/^[\s|>*+-]+/, "")
    .replace(/^[\u2500-\u257F\u2022\u203A\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeCodexToolNoise(line: string): boolean {
  return (
    !line ||
    line.startsWith("{") ||
    line.startsWith("[") ||
    /^(```|\*\*\*|@@|diff\b|index\b)/i.test(line) ||
    /^(tool|exec|shell|command|function|result|stdout|stderr|apply_patch|user|system)\b/i.test(line)
  );
}

function visibleCodexOutputText(entry: LocalCodexOutputEntry): string | null {
  const cleanText = stripCodexTerminalControls(entry.text);

  if (entry.stream === "system") {
    return cleanText.trim() || null;
  }

  const lines = cleanText.split("\n").map(normalizeCodexOutputLine);
  const visible: string[] = [];
  let inCodexBlock = false;

  for (const line of lines) {
    if (looksLikeCodexToolNoise(line)) {
      inCodexBlock = false;
      continue;
    }

    const codexLine = line.match(/^(?:codex|hermes|assistant|project desk ai|ai)\b[:\s-]*(.*)$/i);

    if (codexLine) {
      const message = (codexLine[1] ?? "").trim();
      inCodexBlock = true;

      if (message) {
        visible.push(`AI: ${message}`);
      }

      continue;
    }

    if (inCodexBlock) {
      visible.push(`AI: ${line}`);
    }
  }

  return visible.length ? visible.join("\n") : null;
}

function stripVisibleCodexPrefix(value: string): string {
  return value
    .split("\n")
    .map((line) => line.replace(/^(?:Codex|AI):\s*/i, ""))
    .join("\n")
    .trim();
}

function LocalCodexOutputPanel({ taskId }: { taskId: string }) {
  const [snapshot, setSnapshot] = useState<LocalCodexRunSnapshot | null>(null);
  const [streamError, setStreamError] = useState(false);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const output = snapshot?.output ?? [];
  const visibleOutput = useMemo(
    () =>
      output
        .map((entry) => {
          const visibleText = visibleCodexOutputText(entry);

          return { id: entry.id, stream: entry.stream, text: visibleText ? stripVisibleCodexPrefix(visibleText) : null };
        })
        .filter((entry): entry is { id: string; stream: LocalCodexOutputEntry["stream"]; text: string } => Boolean(entry.text)),
    [output]
  );
  const status = snapshot?.status ?? "idle";

  useEffect(() => {
    let cancelled = false;
    stickToBottomRef.current = true;
    setSnapshot(null);
    setStreamError(false);

    const refreshSnapshot = async () => {
      try {
        const next = await getLocalCodexOutputSnapshot(taskId);

        if (!cancelled) {
          setSnapshot(next);
          setStreamError(false);
        }
      } catch {
        if (!cancelled) {
          setStreamError(true);
        }
      }
    };
    const stopStream = subscribeLocalCodexOutput(taskId, {
      onSnapshot: (next) => {
        setSnapshot(next);
        setStreamError(false);
      },
      onOutput: (entry: LocalCodexOutputEntry) => {
        setStreamError(false);
        setSnapshot((current) => {
          const base: LocalCodexRunSnapshot =
            current ?? {
              workItemId: taskId,
              status: "running",
              reason: null,
              startedAt: null,
              endedAt: null,
              output: []
            };

          return {
            ...base,
            output: base.output.some((existing) => existing.id === entry.id) ? base.output : [...base.output, entry].slice(-500)
          };
        });
      },
      onError: () => setStreamError(true)
    });
    const poll = window.setInterval(() => void refreshSnapshot(), 2000);
    void refreshSnapshot();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      stopStream();
    };
  }, [taskId]);

  useEffect(() => {
    const stream = streamRef.current;

    if (!stream || !stickToBottomRef.current) {
      return;
    }

    stream.scrollTop = stream.scrollHeight;
  }, [visibleOutput.length]);

  function handleCodexStreamScroll() {
    const stream = streamRef.current;

    if (!stream) {
      return;
    }

    stickToBottomRef.current = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 48;
  }

  return (
    <div className="codex-output-panel">
      <div className="codex-output-header">
        <div>
          <strong>AI Updates</strong>
          <span>{snapshot?.startedAt ? `Started ${formatDate(snapshot.startedAt)}` : "Waiting for a local run"}</span>
        </div>
        <span className={`codex-status ${status}`}>{localCodexStatusLabel(status)}</span>
      </div>
      {streamError ? <p className="codex-output-error">Live stream disconnected. Reopen the panel if it does not reconnect.</p> : null}
      <div className="codex-output-stream" ref={streamRef} role="log" aria-live="polite" onScroll={handleCodexStreamScroll}>
        {visibleOutput.length === 0 ? (
          <p className="muted">{status === "idle" ? "No AI output for this task yet." : "Waiting for AI output..."}</p>
        ) : (
          visibleOutput.map((entry) => (
            <div className={`codex-output-entry ${entry.stream}`} key={entry.id}>
              <span>AI</span>
              <p>{entry.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function buildCommentTree(comments: WorkComment[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  for (const comment of comments) {
    nodes.set(comment.id, { ...comment, replies: [] });
  }

  for (const comment of comments) {
    const node = nodes.get(comment.id);

    if (!node) {
      continue;
    }

    const parent = comment.parentCommentId ? nodes.get(comment.parentCommentId) : null;

    if (parent) {
      parent.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNewestFirst = (entries: CommentNode[]) => {
    entries.sort((left, right) => commentNodeLatestAt(right).localeCompare(commentNodeLatestAt(left)));

    for (const entry of entries) {
      sortNewestFirst(entry.replies);
    }
  };

  sortNewestFirst(roots);
  return roots;
}

function commentNodeLatestAt(entry: CommentNode): string {
  return entry.replies.reduce(
    (latest, reply) => {
      const replyLatest = commentNodeLatestAt(reply);
      return replyLatest > latest ? replyLatest : latest;
    },
    entry.createdAt
  );
}

function CommentCard({
  entry,
  depth,
  canCreateTask,
  onReply,
  onCreateTask,
  onCreateTaskFromAnnotation
}: {
  entry: CommentNode;
  depth: number;
  canCreateTask: boolean;
  onReply: (comment: WorkComment) => void;
  onCreateTask: (comment: CommentNode) => void;
  onCreateTaskFromAnnotation: (annotation: AnnotationMetadata) => void;
}) {
  const offset = Math.min(depth, 3) * 14;
  const isSystem = entry.authorType === "system";
  const avatarFallback = entry.authorType === "ai" ? "AI" : entry.authorName.slice(0, 1).toUpperCase();
  const isAiChatRequest = entry.body.trimStart().startsWith("@AI\n\n## AI chat");

  return (
    <div className="comment-thread" style={{ "--reply-offset": `${offset}px` } as CSSProperties}>
      <article id={`comment-${entry.id}`} className={`comment ${depth > 0 ? "comment-reply" : ""} ${isSystem ? "comment-system" : ""}`}>
        {isSystem ? null : entry.avatarUrl ? (
          <img src={entry.avatarUrl} alt="" className="comment-avatar comment-avatar-image" />
        ) : (
          <div className="comment-avatar">{avatarFallback}</div>
        )}
        <div className="comment-content">
          <div className="comment-header">
            <strong>{entry.authorName}</strong>
            <span>{formatDate(entry.createdAt)}</span>
            {isSystem ? null : (
              <button type="button" onClick={() => onReply(entry)}>
                Reply
              </button>
            )}
            {!isSystem && canCreateTask ? (
              <button type="button" onClick={() => onCreateTask(entry)}>
                Task
              </button>
            ) : null}
          </div>
          <MarkdownBody value={entry.body} />
          <ContextPreview
            context={entry.context}
            compact
            hideSessionContext={isAiChatRequest}
            onCreateTaskFromAnnotation={canCreateTask ? onCreateTaskFromAnnotation : undefined}
          />
        </div>
      </article>
      {entry.replies.map((reply) => (
        <CommentCard
          entry={reply}
          depth={depth + 1}
          key={`${reply.source}-${reply.id}`}
          canCreateTask={canCreateTask}
          onReply={onReply}
          onCreateTask={onCreateTask}
          onCreateTaskFromAnnotation={onCreateTaskFromAnnotation}
        />
      ))}
    </div>
  );
}

function GlobalAiChat({ user, onTaskCreated }: { user: CurrentUser; onTaskCreated: (item: WorkItemSummary) => void }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SideChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<UploadedAttachment[]>([]);
  const [people, setPeople] = useState<KnownPerson[]>([]);
  const [items, setItems] = useState<WorkItemSummary[]>([]);
  const [pageState, setPageState] = useState<AiChatPageState>({
    label: pageLabelFromPath(location.pathname),
    summary: pageSummaryFromPath(location.pathname, pageLabelFromPath(location.pathname)),
    currentItem: null,
    parentItem: null,
    comments: [],
    childItems: []
  });
  const [targetParentId, setTargetParentId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<RequestPriority>("medium");
  const [ownerId, setOwnerId] = useState("");
  const [codexReasoning, setCodexReasoning] = useState<CodexReasoningEffort>("medium");
  const [titleTouched, setTitleTouched] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const currentWorkItemId = workItemIdFromPath(location.pathname);
  const isTaskPage = pageState.currentItem?.kind === "task";
  const parentCandidates = items.filter((item) => item.kind === "idea" || item.kind === "project");
  const taskPeople = assignablePeopleForKind(people, "task");
  const stagedMessages: SideChatMessage[] =
    draft.trim() || draftAttachments.length
      ? [
          ...messages,
          {
            id: "draft",
            authorName: user.displayName,
            body: draft.trim() || "Shared files.",
            attachments: draftAttachments
          }
        ]
      : messages;
  const canSubmit = stagedMessages.length > 0 && (isTaskPage || Boolean(targetParentId));

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    const fallbackLabel = pageLabelFromPath(location.pathname);

    setLoadingContext(true);
    setError(null);

    void Promise.all([
      listWorkItems(),
      listPeople(),
      currentWorkItemId ? getWorkItem(currentWorkItemId).catch(() => null) : Promise.resolve(null)
    ])
      .then(([itemsPayload, peoplePayload, detailPayload]) => {
        if (cancelled) {
          return;
        }

        const nextPeople = withCurrentUserAsKnownPerson(peoplePayload.people, user);
        const nextItems = itemsPayload.items;
        const nextPageState: AiChatPageState = detailPayload
          ? {
              label: `${workItemNumberLabel(detailPayload.item)} / ${detailPayload.item.title}`,
              summary: workItemPageSummary(detailPayload),
              currentItem: detailPayload.item,
              parentItem: detailPayload.parentItem,
              comments: detailPayload.comments,
              childItems: detailPayload.childItems
            }
          : {
              label: currentPageAnnotationTitle(fallbackLabel),
              summary: pageSummaryFromPath(location.pathname, fallbackLabel),
              currentItem: null,
              parentItem: null,
              comments: [],
              childItems: []
            };

        setPeople(nextPeople);
        setItems(nextItems);
        setPageState(nextPageState);
        setTargetParentId(aiChatDefaultTaskParentId(nextPageState, nextItems));
        setOwnerId((current) => current || (nextPeople.some((person) => isProjectDeskAiPerson(person)) ? projectDeskAiUserId : ""));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load AI chat context.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingContext(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, location.pathname, currentWorkItemId, user.id]);

  useEffect(() => {
    if (!titleTouched) {
      setTaskTitle(aiChatDefaultTaskTitle(messages, draft, pageState.label));
    }
  }, [messages, draft, pageState.label, titleTouched]);

  async function addDraftFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    setUploadError(null);

    try {
      const payload = await uploadAttachments(files);
      setDraftAttachments((current) => [...current, ...payload.attachments]);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Could not upload attachment.");
    }
  }

  function addMessage() {
    if (!draft.trim() && draftAttachments.length === 0) {
      return;
    }

    setMessages([
      ...messages,
      {
        id: crypto.randomUUID(),
        authorName: user.displayName,
        body: draft.trim() || "Shared files.",
        attachments: draftAttachments
      }
    ]);
    setDraft("");
    setDraftAttachments([]);
  }

  function resetChatDraft() {
    setMessages([]);
    setDraft("");
    setDraftAttachments([]);
    setTitleTouched(false);
    setError(null);
    setUploadError(null);
  }

  async function submitChat() {
    const finalMessages = aiChatMessagesForSubmit(messages, draft, draftAttachments, user);

    if (finalMessages.length === 0) {
      return;
    }

    const itemReferences = aiChatItemReferences(finalMessages, pageState, items);
    const attachments = aiChatAttachments(finalMessages);
    const context = buildCollaborationContext(attachments, [], {
      itemReferences,
      pageContext: aiChatPageContext(location.pathname, pageState),
      sourceItemId: pageState.currentItem?.id ?? null,
      sourceItemTitle: pageState.currentItem?.title ?? pageState.label
    });

    setSaving(true);
    setError(null);

    try {
      if (isTaskPage && pageState.currentItem) {
        await addWorkComment(pageState.currentItem.id, aiChatCommentBody(finalMessages, itemReferences), null, context);
        resetChatDraft();
        setOpen(false);
        return;
      }

      if (!targetParentId) {
        setError("Choose a project or idea before creating the task.");
        return;
      }

      const defaultTitle = aiChatDefaultTaskTitle(finalMessages, "", pageState.label);
      const effectiveTitle = taskTitle.trim().length >= 3 ? taskTitle.trim() : defaultTitle;
      const payload = await createWorkItem({
        title: effectiveTitle.slice(0, 160),
        details: aiChatTaskDetails(finalMessages, itemReferences),
        kind: "task",
        priority: taskPriority,
        parentId: targetParentId,
        ownerDiscordUserId: ownerId || null,
        codexReasoning: ownerId === projectDeskAiUserId ? codexReasoning : undefined,
        context
      });

      resetChatDraft();
      setOpen(false);
      onTaskCreated(payload.item);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit AI chat.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`side-chat ${open ? "open" : ""}`}>
      {open ? (
        <section className="side-chat-panel" aria-label="AI chat">
          <div className="side-chat-header">
            <div>
              <strong>AI CHAT - {aiChatScopeLabel(pageState)}</strong>
            </div>
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="side-chat-messages">
            {messages.length === 0 ? <p className="muted">{loadingContext ? "Loading page context..." : "Ask AI or describe the work."}</p> : null}
            {messages.map((message) => (
              <div className="side-chat-message" key={message.id}>
                <strong>{message.authorName}</strong>
                <MarkdownBody value={message.body} />
                <AttachmentPreviewList attachments={message.attachments} />
              </div>
            ))}
          </div>
          <AttachmentDropZone disabled={saving} onFiles={(files) => void addDraftFiles(files)}>
            <MentionComposer
              value={draft}
              onChange={setDraft}
              people={people}
              items={items}
              placeholder="Ask or describe the work. Type @ to tag people, ideas, projects, tasks, or AI."
              rows={4}
              onFilesPasted={(files) => void addDraftFiles(files)}
            />
          </AttachmentDropZone>
          {uploadError ? <p className="error-text">{uploadError}</p> : null}
          {isTaskPage ? (
            null
          ) : (
            <div className="ai-chat-task-fields">
              <label className="field full">
                <span>Task</span>
                <input
                  value={taskTitle}
                  disabled={saving}
                  onChange={(event) => {
                    setTitleTouched(true);
                    setTaskTitle(event.target.value);
                  }}
                  placeholder="Task title"
                />
              </label>
              <label className="field full">
                <span>Ticket</span>
                <select value={targetParentId} disabled={saving || loadingContext} onChange={(event) => setTargetParentId(event.target.value)}>
                  <option value="">{parentCandidates.length === 0 ? "No projects or ideas available" : "Choose a project or idea"}</option>
                  {parentCandidates.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {workItemNumberLabel(parent)} / {parent.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Assigned to</span>
                <select value={ownerId} disabled={saving} onChange={(event) => setOwnerId(event.target.value)}>
                  <option value="">Me</option>
                  {taskPeople.map((person) => (
                    <option key={person.discordUserId} value={person.discordUserId}>
                      {personOptionLabel(person)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Priority</span>
                <select value={taskPriority} disabled={saving} onChange={(event) => setTaskPriority(event.target.value as RequestPriority)}>
                  {priorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {ownerId === projectDeskAiUserId ? (
                <label className="field full">
                  <span>Reasoning</span>
                  <select value={codexReasoning} disabled={saving} onChange={(event) => setCodexReasoning(event.target.value as CodexReasoningEffort)}>
                    {codexReasoningOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          )}
          <div className="side-chat-actions">
            <AttachmentControl
              attachments={draftAttachments}
              disabled={saving}
              onChange={setDraftAttachments}
              onError={(message) => setUploadError(message || null)}
            />
            <button type="button" className="secondary-button" disabled={saving || (!draft.trim() && draftAttachments.length === 0)} onClick={addMessage}>
              <Send size={15} />
              Send
            </button>
            <button type="button" className="primary-button" disabled={saving || loadingContext || !canSubmit} onClick={() => void submitChat()}>
              {saving ? <RefreshCw size={15} className="spin" /> : isTaskPage ? <MessageCircle size={15} /> : <Plus size={15} />}
              {saving ? "Submitting" : isTaskPage ? "Comment @AI" : "Create task"}
            </button>
          </div>
        </section>
      ) : null}
      <button type="button" className="side-chat-button" onClick={() => setOpen(!open)} aria-label="Open AI chat" title="AI chat">
        <Bot size={20} />
      </button>
    </div>
  );
}

function BoardPage({
  user,
  boardUrl,
  onLogin,
  activity
}: {
  user: CurrentUser | null;
  boardUrl: string | null;
  onLogin: () => Promise<void>;
  activity: DiscordActivityState;
}) {
  const [items, setItems] = useState<BoardItem[]>([]);
  const [states, setStates] = useState<BoardItem["status"][]>([]);
  const [recent, setRecent] = useState<WorkItemSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropStateId, setDropStateId] = useState<string | null>(null);
  const [movingItemId, setMovingItemId] = useState<string | null>(null);

  const columns = useMemo(() => buildBoardColumns(items, states), [items, states]);

  useEffect(() => {
    if (user) {
      void load();
    }
  }, [user]);

  useLiveRefresh(Boolean(user), () => load(true), (event) => event.type === "work_items_changed", 6000);

  async function load(silent = false) {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const payload = await getBoard();
      setItems(payload.workItems);
      setStates(payload.states);
      setRecent(payload.recentItems);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load board.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function moveItemToState(item: BoardItem, targetStateId: string) {
    if (item.status.id === targetStateId || movingItemId) {
      return;
    }

    const targetStatus = columns.find((column) => column.stateId === targetStateId)?.status;

    if (!targetStatus?.id) {
      return;
    }

    const previousItems = items;
    setMovingItemId(item.id);
    setError(null);
    setItems((current) =>
      current.map((currentItem) => (currentItem.id === item.id ? { ...currentItem, status: targetStatus } : currentItem))
    );

    try {
      const payload = await updateBoardItemState(item.id, targetStatus.id as WorkStage);
      setItems((current) =>
        current.map((currentItem) => (currentItem.id === payload.workItem.id ? payload.workItem : currentItem))
      );
    } catch (err) {
      setItems(previousItems);
      setError(err instanceof ApiError ? err.message : "Could not move item.");
    } finally {
      setMovingItemId(null);
      setDraggingItemId(null);
      setDropStateId(null);
    }
  }

  function handleDragStart(event: DragEvent<HTMLAnchorElement>, item: BoardItem) {
    if (!item.status.id) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    setDraggingItemId(item.id);
  }

  function handleDragOver(event: DragEvent<HTMLElement>, stateId: string | null) {
    if (!draggingItemId || !stateId || movingItemId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropStateId(stateId);
  }

  async function handleDrop(event: DragEvent<HTMLElement>, stateId: string | null) {
    event.preventDefault();

    if (!stateId || movingItemId) {
      return;
    }

    const itemId = event.dataTransfer.getData("text/plain");
    const item = items.find((currentItem) => currentItem.id === itemId);

    if (!item) {
      return;
    }

    await moveItemToState(item, stateId);
  }

  if (!user) {
    return <LoginPanel onLogin={onLogin} activity={activity} />;
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Board</h1>
        </div>
        <div className="header-actions">
          {user.isAdmin && boardUrl ? (
            <a className="primary-button" href={boardUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Open Full Board
            </a>
          ) : null}
        </div>
      </header>

      {loading ? <LoadingBlock label="Loading board" /> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <section className="board-grid">
        {columns.map((column) => (
          <div
            className={`board-column ${dropStateId === column.stateId ? "drop-active" : ""}`}
            key={column.key}
            onDragOver={(event) => handleDragOver(event, column.stateId)}
            onDragLeave={() => setDropStateId(null)}
            onDrop={(event) => void handleDrop(event, column.stateId)}
          >
            <div className="board-column-title">
              <strong>{column.status.name || "Backlog"}</strong>
              <span>{column.items.length}</span>
            </div>
            {column.items.map((item) => (
              <NavLink
                className={`board-card ${draggingItemId === item.id ? "dragging" : ""} ${
                  movingItemId === item.id ? "moving" : ""
                }`}
                to={`/items/${item.id}`}
                key={item.id}
                draggable={Boolean(item.status.id)}
                onDragStart={(event) => handleDragStart(event, item)}
                onDragEnd={() => {
                  setDraggingItemId(null);
                  setDropStateId(null);
                }}
              >
                <strong>{item.title}</strong>
                <div className="row-pills">
                  <PriorityPill priority={item.priority} />
                  <span className="pill neutral">{item.identifier ?? humanize(item.kind)}</span>
                </div>
              </NavLink>
            ))}
            {column.items.length === 0 ? <p className="board-empty">Drop an item here.</p> : null}
          </div>
        ))}
      </section>

      <section className="panel">
        <PanelTitle title="Recent Project Desk items" />
        <WorkItemList items={recent} empty="No local items yet." />
      </section>
    </div>
  );
}

interface BoardColumn {
  key: string;
  stateId: string | null;
  status: BoardItem["status"];
  items: BoardItem[];
}

function buildBoardColumns(items: BoardItem[], states: BoardItem["status"][]): BoardColumn[] {
  const columns = new Map<string, BoardColumn>();

  for (const state of states) {
    const key = state.id ?? state.name ?? "backlog";
    columns.set(key, {
      key,
      stateId: state.id,
      status: state,
      items: []
    });
  }

  for (const item of items) {
    const key = item.status.id ?? item.status.name ?? "backlog";
    const existing = columns.get(key);

    if (existing) {
      existing.items.push(item);
      continue;
    }

    columns.set(key, {
      key,
      stateId: item.status.id,
      status: item.status,
      items: [item]
    });
  }

  return [...columns.values()].sort((left, right) => statusRank(left.status) - statusRank(right.status));
}

function statusRank(status: BoardItem["status"]): number {
  const order = ["review", "planning", "active", "reviewing", "done", "parked"];
  const index = order.indexOf(status.id ?? "");
  return index >= 0 ? index : 99;
}

function StagePill({ item }: { item: Pick<WorkItemSummary, "status"> }) {
  const style = item.status.color ? { "--pill-color": item.status.color } : undefined;

  return (
    <span className="pill status" style={style as CSSProperties}>
      {item.status.name}
    </span>
  );
}

function TaskStatusPill({
  item,
  codexStatus
}: {
  item: Pick<WorkItemSummary, "taskStatus" | "taskCompletionReason">;
  codexStatus?: LocalCodexRunStatus;
}) {
  if (isRestartRequiredCodexStatus(codexStatus)) {
    return <span className="pill task-status restart_required">Restart npm</span>;
  }

  if (!item.taskStatus) {
    return null;
  }

  const label =
    item.taskStatus === "complete"
      ? `Complete${item.taskCompletionReason ? ` / ${humanize(item.taskCompletionReason)}` : ""}`
      : item.taskStatus === "in_progress"
        ? "In progress"
        : "To do";

  return <span className={`pill task-status ${item.taskStatus}`}>{label}</span>;
}

function PriorityPill({ priority }: { priority: RequestPriority }) {
  return <span className={`pill priority ${priority}`}>{humanize(priority)}</span>;
}

function PanelTitle({ title, action, icon }: { title: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="panel-title">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="loading-block">
      <RefreshCw size={18} className="spin" />
      <span>{label}</span>
    </div>
  );
}

export default App;
