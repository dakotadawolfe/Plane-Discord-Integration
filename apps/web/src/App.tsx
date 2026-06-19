import {
  Archive,
  ArrowRight,
  Bell,
  Bot,
  CheckCircle2,
  ExternalLink,
  FileText,
  Home,
  Kanban,
  Lightbulb,
  ListChecks,
  LogIn,
  LogOut,
  MessageCircle,
  PauseCircle,
  RefreshCw,
  Send,
  Shield,
  Skull,
  Sparkles,
  Workflow
} from "lucide-react";
import {
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import { NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import {
  addWorkComment,
  ApiError,
  createWorkItem,
  enqueueAiJob,
  exchangeDiscordActivityCode,
  getBoard,
  getMe,
  getNotifications,
  getPublicConfig,
  getWorkItem,
  listPeople,
  listWorkItems,
  login,
  logout,
  subscribeProjectDeskEvents,
  updateBoardItemState,
  updateWorkItemStage
} from "./api";
import type {
  AiJobType,
  BoardItem,
  CurrentUser,
  KnownPerson,
  MeResponse,
  NotificationRecord,
  ProjectDeskEvent,
  PublicConfig,
  RequestPriority,
  WorkComment,
  WorkItemDetail,
  WorkItemKind,
  WorkItemSummary,
  WorkStage
} from "./types";
import { useDiscordActivity, type DiscordActivityState } from "./useDiscordActivity";

const priorityOptions: { value: RequestPriority; label: string }[] = [
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
  { value: "low", label: "Low" },
  { value: "none", label: "None" }
];

const stageActions: Array<{ stage: WorkStage; label: string; icon: ReactNode }> = [
  { stage: "review", label: "Review", icon: <Sparkles size={16} /> },
  { stage: "validated", label: "Validate", icon: <CheckCircle2 size={16} /> },
  { stage: "planning", label: "Plan", icon: <FileText size={16} /> },
  { stage: "active", label: "Activate", icon: <Workflow size={16} /> },
  { stage: "reviewing", label: "Review progress", icon: <Bot size={16} /> },
  { stage: "done", label: "Done", icon: <CheckCircle2 size={16} /> },
  { stage: "parked", label: "Park", icon: <PauseCircle size={16} /> },
  { stage: "killed", label: "Kill", icon: <Skull size={16} /> }
];

const aiActions: Array<{ type: AiJobType; label: string; stages?: WorkStage[] }> = [
  { type: "idea_brief", label: "Idea brief", stages: ["inbox"] },
  { type: "validation_review", label: "AI review", stages: ["review", "validated"] },
  { type: "project_plan", label: "Plan", stages: ["validated", "planning"] },
  { type: "task_breakdown", label: "Tasks", stages: ["planning", "active"] },
  { type: "progress_review", label: "Progress review", stages: ["active", "reviewing"] },
  { type: "build_demo", label: "Build demo package", stages: ["planning", "active", "reviewing"] }
];

const markdownPlugins = [remarkGfm];

type CommentNode = WorkComment & { replies: CommentNode[] };

interface SideChatMessage {
  id: string;
  authorName: string;
  body: string;
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

type MentionMode = "people" | "idea" | "project";

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

function humanize(value: string | null | undefined) {
  if (!value) {
    return "None";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  useEffect(() => {
    void getPublicConfig().then(setPublicConfig).catch(() => setPublicConfig(null));
  }, []);

  useEffect(() => {
    void refreshMe();
  }, []);

  const discordActivity = useDiscordActivity(publicConfig?.discordClientId);

  async function refreshMe() {
    setLoadingMe(true);
    try {
      setMe(await getMe());
    } finally {
      setLoadingMe(false);
    }
  }

  async function handleLogout() {
    await logout();
    await refreshMe();
  }

  async function handleLogin() {
    if (!publicConfig?.discordClientId || !discordActivity.embedded || !discordActivity.ready || !discordActivity.sdk) {
      login(window.location.pathname);
      return;
    }

    const { code } = await discordActivity.sdk.commands.authorize({
      client_id: publicConfig.discordClientId,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify"]
    });
    const { accessToken } = await exchangeDiscordActivityCode(code);

    await discordActivity.sdk.commands.authenticate({
      access_token: accessToken
    });
    await refreshMe();
  }

  const user = me?.user ?? null;

  const session = loadingMe ? (
    <span className="muted">Checking session</span>
  ) : user ? (
    <UserCard user={user} onLogout={handleLogout} />
  ) : (
    <button className="primary-button full" onClick={() => void handleLogin()}>
      <LogIn size={16} />
      Log in
    </button>
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
          <TabLink to="/tasks" icon={<ListChecks size={16} />} label="Tasks" />
          <TabLink to="/board" icon={<Kanban size={16} />} label="Board" />
          <TabLink to="/reviews" icon={<Bot size={16} />} label="Reviews" />
        </nav>

        <div className="sidebar-footer">{session}</div>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage me={me} loading={loadingMe} onLogin={handleLogin} activity={discordActivity} />} />
          <Route path="/ideas" element={<ItemsPage user={user} onLogin={handleLogin} activity={discordActivity} mode="ideas" />} />
          <Route path="/ideas/new" element={<NewIdeaPage user={user} onLogin={handleLogin} activity={discordActivity} />} />
          <Route path="/projects" element={<ItemsPage user={user} onLogin={handleLogin} activity={discordActivity} mode="projects" />} />
          <Route path="/tasks" element={<ItemsPage user={user} onLogin={handleLogin} activity={discordActivity} mode="tasks" />} />
          <Route path="/reviews" element={<ItemsPage user={user} onLogin={handleLogin} activity={discordActivity} mode="reviews" />} />
          <Route path="/items/:id" element={<WorkItemDetailPage user={user} onLogin={handleLogin} activity={discordActivity} />} />
          <Route path="/board" element={<BoardPage user={user} boardUrl={me?.planeFullBoardUrl ?? null} onLogin={handleLogin} activity={discordActivity} />} />
        </Routes>
      </main>
    </div>
  );
}

function TabLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

function UserCard({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  return (
    <div className="user-card">
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="avatar" />
      ) : (
        <div className="avatar fallback">{user.displayName.slice(0, 1).toUpperCase()}</div>
      )}
      <div className="user-text">
        <strong>{user.displayName}</strong>
        <span>{user.isAdmin ? "Power user" : "Member"}</span>
      </div>
      <button className="icon-button" onClick={onLogout} title="Log out" aria-label="Log out">
        <LogOut size={16} />
      </button>
    </div>
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

function mentionTokenForPerson(person: KnownPerson): string {
  const label = person.displayName.replace(/[[\]]/g, "").trim() || person.discordUserId;
  return `[@${label}](mention:${person.discordUserId})`;
}

function mentionTokenForItem(item: Pick<WorkItemSummary, "id" | "kind" | "title">): string {
  const label = `${item.kind.toUpperCase()}: ${item.title}`.replace(/[[\]]/g, "").trim();
  return `[${label}](work-item:${item.id})`;
}

function peopleMentionOptions(people: KnownPerson[]): MentionOption[] {
  return people.map((person) => ({
    kind: "person" as const,
    key: person.discordUserId,
    label: person.displayName,
    token: mentionTokenForPerson(person),
    description: "Send a DM notification",
    discordUserId: person.discordUserId,
    avatarUrl: person.avatarUrl
  }));
}

function itemMentionOptions(items: WorkItemSummary[], kind: "idea" | "project", filter: string): MentionOption[] {
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
  if (mode === "idea" || mode === "project") {
    return itemMentionOptions(items, mode, filter);
  }

  const normalizedFilter = normalizeMentionFilter(filter);
  const peopleOptions = peopleMentionOptions(people).filter((option) =>
    !normalizedFilter || normalizeMentionFilter(option.label).includes(normalizedFilter)
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
    return option.itemKind === "project" ? "PR" : "ID";
  }

  return option.kind === "ai" ? "AI" : option.label.slice(0, 1).toUpperCase();
}

function mentionOptionDisplayLabel(option: MentionOption): string {
  return option.kind === "item" ? option.label : `@${option.label}`;
}

function mentionMenuStatus(mode: MentionMode, search: string): string {
  if (mode === "idea") {
    return search ? `Searching ideas for "${search}"` : "Search ideas";
  }

  if (mode === "project") {
    return search ? `Searching projects for "${search}"` : "Search projects";
  }

  return search ? `Tag people matching "${search}"` : "Tag people";
}

function MentionComposer({
  value,
  people,
  items = [],
  rows,
  placeholder,
  onChange
}: {
  value: string;
  people: KnownPerson[];
  items?: WorkItemSummary[];
  rows: number;
  placeholder: string;
  onChange: (value: string) => void;
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
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
      />
      {query ? (
        <div className="mention-menu" onBlur={handleMentionBlur}>
          <div className="mention-menu-header">
            <div className="mention-mode-tabs" role="tablist" aria-label="Mention type">
              {(["people", "idea", "project"] as MentionMode[]).map((mode) => (
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
                  {mode === "people" ? "People" : mode === "idea" ? "Ideas" : "Projects"}
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
              placeholder={`Search ${pickerMode === "people" ? "people" : pickerMode === "idea" ? "ideas" : "projects"}`}
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

function withCurrentUserAsKnownPerson(people: KnownPerson[], user: CurrentUser): KnownPerson[] {
  const existing = people.find((person) => person.discordUserId === user.id);
  const currentUserPerson: KnownPerson = {
    discordUserId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl
  };

  if (!existing) {
    return [currentUserPerson, ...people];
  }

  return people.map((person) =>
    person.discordUserId === user.id
      ? {
          ...person,
          displayName: user.displayName,
          avatarUrl: person.avatarUrl ?? user.avatarUrl
        }
      : person
  );
}

function LoginPanel({ onLogin, activity }: { onLogin: () => Promise<void>; activity: DiscordActivityState }) {
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      {error ? <p className="error-text">{error}</p> : null}
      <button className="primary-button" onClick={() => void handleClick()} disabled={loggingIn || (activity.embedded && !activity.ready)}>
        {loggingIn ? <RefreshCw size={16} className="spin" /> : <LogIn size={16} />}
        {loggingIn ? "Continuing" : "Continue"}
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
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  useEffect(() => {
    if (me?.user) {
      void load();
    }
  }, [me?.user]);

  useLiveRefresh(
    Boolean(me?.user),
    load,
    (event) => event.type === "work_items_changed" || event.type === "notifications_changed",
    10000
  );

  async function load() {
    try {
      const [itemPayload, notificationPayload] = await Promise.all([listWorkItems(), getNotifications()]);
      setItems(itemPayload.items);
      setNotifications(notificationPayload.notifications);
    } catch {
      setItems([]);
      setNotifications([]);
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading Project Desk" />;
  }

  if (!me?.user) {
    return <LoginPanel onLogin={onLogin} activity={activity} />;
  }

  const activeCount = items.filter((item) => item.stage === "active").length;
  const reviewCount = items.filter((item) => item.stage === "review" || item.stage === "reviewing").length;
  const failedDms = notifications.filter((item) => item.status === "failed").length;

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
        <Metric label="Tracked" value={items.length.toString()} />
        <Metric label="Active" value={activeCount.toString()} />
        <Metric label="In review" value={reviewCount.toString()} />
        <Metric label="DM issues" value={failedDms.toString()} />
      </section>

      <section className="panel">
        <PanelTitle title="Needs attention" action={<NavLink to="/reviews">View reviews</NavLink>} />
        <WorkItemList
          items={items.filter((item) => ["review", "reviewing", "active"].includes(item.stage)).slice(0, 6)}
          empty="Nothing needs attention."
        />
      </section>

      <section className="panel">
        <PanelTitle title="Recent AI and DM status" icon={<Bell size={18} />} />
        {notifications.length === 0 ? <p className="muted">No DM events yet.</p> : null}
        <div className="request-list">
          {notifications.slice(0, 5).map((notification) => (
            <div className="request-row" key={notification.id}>
              <div>
                <strong>{humanize(notification.type)}</strong>
                <span>{formatDate(notification.createdAt)}</span>
              </div>
              <div className="row-pills">
                <span className={`pill priority ${notification.status === "failed" ? "urgent" : "low"}`}>
                  {humanize(notification.status)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
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

    try {
      const payload = await createWorkItem({ title, priority, details, kind: "idea" });
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
  mode: "ideas" | "projects" | "tasks" | "reviews";
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
  return item.stage === "parked" || item.stage === "killed";
}

function filterItems(items: WorkItemSummary[], mode: "ideas" | "projects" | "tasks" | "reviews", showArchive = false) {
  if (mode === "ideas") {
    return items.filter((item) => item.kind === "idea" && (showArchive ? isArchiveItem(item) : !isArchiveItem(item)));
  }

  if (mode === "projects") {
    return items.filter((item) => item.kind === "project" && !isArchiveItem(item));
  }

  if (mode === "tasks") {
    return items.filter((item) => item.kind === "task" && !isArchiveItem(item));
  }

  return items.filter((item) => (item.stage === "review" || item.stage === "reviewing") && !isArchiveItem(item));
}

function modeTitle(mode: "ideas" | "projects" | "tasks" | "reviews") {
  if (mode === "ideas") {
    return "Ideas";
  }

  if (mode === "projects") {
    return "Projects";
  }

  if (mode === "tasks") {
    return "Tasks";
  }

  return "Reviews";
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
              {humanize(item.kind)} / {item.owner?.displayName ?? item.createdBy.displayName}
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
            <PriorityPill priority={item.priority} />
            <StagePill item={item} />
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
  activity
}: {
  user: CurrentUser | null;
  onLogin: () => Promise<void>;
  activity: DiscordActivityState;
}) {
  const { id } = useParams();
  const [item, setItem] = useState<WorkItemDetail | null>(null);
  const [comments, setComments] = useState<WorkComment[]>([]);
  const [childItems, setChildItems] = useState<WorkItemSummary[]>([]);
  const [people, setPeople] = useState<KnownPerson[]>([]);
  const [mentionItems, setMentionItems] = useState<WorkItemSummary[]>([]);
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<WorkComment | null>(null);
  const [sideChatOpen, setSideChatOpen] = useState(false);
  const [sideChatMessages, setSideChatMessages] = useState<SideChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);

  useEffect(() => {
    if (!user || !id) {
      return;
    }

    void load();
  }, [user, id]);

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
      setComments(payload.comments);
      setChildItems(payload.childItems);
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

  async function handleComment(event: FormEvent) {
    event.preventDefault();

    if (!id || !comment.trim()) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await addWorkComment(id, comment, replyTo?.id ?? null);
      setComment("");
      setReplyTo(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add comment.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSideChatSummary(summary: string) {
    if (!id) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await addWorkComment(id, summary);
      setSideChatMessages([]);
      setSideChatOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save side chat summary.");
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

  async function runAi(type: AiJobType) {
    if (!id) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await enqueueAiJob(id, type, "Workflow action from Project Desk UI.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not queue AI work.");
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

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{humanize(item.kind)}</p>
          <h1>{item.title}</h1>
        </div>
        {item.canOpenInPlane && item.plane.url ? (
          <a className="secondary-button" href={item.plane.url} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Open in Plane
          </a>
        ) : null}
      </header>

      <section className="detail-grid">
        <div className="panel stack">
          <div className="detail-meta">
            <StagePill item={item} />
            <PriorityPill priority={item.priority} />
            <span className="pill neutral">{item.owner?.displayName ?? "Unassigned"}</span>
          </div>
          <p className="details-text">{item.details}</p>
        </div>

        <aside className="panel meta-panel">
          <span>Updated</span>
          <strong>{formatDate(item.updatedAt)}</strong>
          <span>Created by</span>
          <strong>{item.createdBy.displayName}</strong>
          <span>AI mode</span>
          <strong>Workflow worker</strong>
        </aside>
      </section>

      <section className="panel stack">
        <PanelTitle title="Phase actions" icon={<Workflow size={18} />} />
        <div className="toolbar-row">
          {stageActions.map((action) => (
            <button
              className={action.stage === item.stage ? "primary-button" : "secondary-button"}
              key={action.stage}
              disabled={saving || action.stage === item.stage}
              onClick={() => void moveStage(action.stage)}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <PanelTitle title="AI workflow" icon={<Bot size={18} />} />
        <div className="toolbar-row">
          {aiActions
            .filter((action) => !action.stages || action.stages.includes(item.stage))
            .map((action) => (
              <button className="secondary-button" key={action.type} disabled={saving} onClick={() => void runAi(action.type)}>
                <Sparkles size={16} />
                {action.label}
              </button>
            ))}
        </div>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      {childItems.length ? (
        <section className="panel stack">
          <PanelTitle title="Child tasks" icon={<ListChecks size={18} />} />
          <WorkItemList items={childItems} empty="No child tasks yet." />
        </section>
      ) : null}

      <section className="panel stack">
        <PanelTitle title="Conversation" icon={<MessageCircle size={18} />} />
        <div className="comments">
          {comments.length === 0 ? <p className="muted">No comments yet.</p> : null}
          {commentTree.map((entry) => (
            <CommentCard entry={entry} depth={0} key={`${entry.source}-${entry.id}`} onReply={setReplyTo} />
          ))}
        </div>

        <form className="comment-form" onSubmit={handleComment}>
          {replyTo ? (
            <div className="reply-target">
              <span>Replying to {replyTo.authorName}</span>
              <button type="button" onClick={() => setReplyTo(null)}>
                Cancel
              </button>
            </div>
          ) : null}
          <MentionComposer
            value={comment}
            onChange={setComment}
            people={people}
            items={mentionItems}
            placeholder="Add a comment. Type @ to tag people, @idea for ideas, @project for projects, or @AI."
            rows={4}
          />
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
            {saving ? "Saving" : replyTo ? "Reply" : "Comment"}
          </button>
        </form>
      </section>

      <SideChat
        item={item}
        people={people}
        items={mentionItems}
        user={user}
        open={sideChatOpen}
        messages={sideChatMessages}
        saving={saving}
        onOpenChange={setSideChatOpen}
        onMessagesChange={setSideChatMessages}
        onSaveSummary={saveSideChatSummary}
      />
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

  return roots;
}

function CommentCard({
  entry,
  depth,
  onReply
}: {
  entry: CommentNode;
  depth: number;
  onReply: (comment: WorkComment) => void;
}) {
  const offset = Math.min(depth, 3) * 32;
  const avatarFallback = entry.authorType === "ai" ? "AI" : entry.authorName.slice(0, 1).toUpperCase();

  return (
    <div className="comment-thread" style={{ "--reply-offset": `${offset}px` } as CSSProperties}>
      <article className={`comment ${depth > 0 ? "comment-reply" : ""}`}>
        {entry.avatarUrl ? (
          <img src={entry.avatarUrl} alt="" className="comment-avatar comment-avatar-image" />
        ) : (
          <div className="comment-avatar">{avatarFallback}</div>
        )}
        <div className="comment-content">
          <div className="comment-header">
            <strong>{entry.authorName}</strong>
            <span>{formatDate(entry.createdAt)}</span>
            <button type="button" onClick={() => onReply(entry)}>
              Reply
            </button>
          </div>
          <MarkdownBody value={entry.body} />
        </div>
      </article>
      {entry.replies.map((reply) => (
        <CommentCard entry={reply} depth={depth + 1} key={`${reply.source}-${reply.id}`} onReply={onReply} />
      ))}
    </div>
  );
}

function SideChat({
  item,
  people,
  items,
  user,
  open,
  messages,
  saving,
  onOpenChange,
  onMessagesChange,
  onSaveSummary
}: {
  item: WorkItemDetail;
  people: KnownPerson[];
  items: WorkItemSummary[];
  user: CurrentUser;
  open: boolean;
  messages: SideChatMessage[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onMessagesChange: (messages: SideChatMessage[]) => void;
  onSaveSummary: (summary: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const contextLabel = `@${item.kind}`;
  const contextToken = mentionTokenForItem(item);

  function addMessage() {
    if (!draft.trim()) {
      return;
    }

    onMessagesChange([
      ...messages,
      {
        id: crypto.randomUUID(),
        authorName: user.displayName,
        body: draft.trim()
      }
    ]);
    setDraft("");
  }

  async function finishChat() {
    if (messages.length === 0) {
      onOpenChange(false);
      return;
    }

    const participants = [...new Set(messages.map((message) => message.authorName))];
    const mentions = [...new Set(messages.flatMap((message) => parseRecognizedMentions(message.body, people).map((mention) => `@${mention.label}`)))];
    const summary = [
      "## Side discussion summary",
      `**Context:** ${contextToken}`,
      `**Discussed with:** ${participants.join(", ")}`,
      mentions.length ? `**Mentions:** ${mentions.join(", ")}` : null,
      "",
      ...messages.map((message) => `- **${message.authorName}:** ${message.body}`)
    ]
      .filter(Boolean)
      .join("\n");

    await onSaveSummary(summary);
  }

  return (
    <div className={`side-chat ${open ? "open" : ""}`}>
      {open ? (
        <section className="side-chat-panel" aria-label="Side discussion">
          <div className="side-chat-header">
            <div>
              <strong>Side discussion</strong>
              <span>{contextLabel} summary posts as one comment</span>
            </div>
            <button type="button" onClick={() => onOpenChange(false)}>
              Close
            </button>
          </div>
          <div className="side-chat-messages">
            {messages.length === 0 ? <p className="muted">Draft notes here, then post one summary when done.</p> : null}
            {messages.map((message) => (
              <div className="side-chat-message" key={message.id}>
                <strong>{message.authorName}</strong>
                <MarkdownBody value={message.body} />
              </div>
            ))}
          </div>
          <MentionComposer
            value={draft}
            onChange={setDraft}
            people={people}
            items={items}
            placeholder={`Discuss ${contextLabel}. Type @, @idea, @project, or @AI without flooding the ticket.`}
            rows={4}
          />
          <div className="side-chat-actions">
            <button type="button" className="secondary-button" onClick={() => setDraft((value) => `${value}${value ? " " : ""}${contextToken}`)}>
              {contextLabel}
            </button>
            <button type="button" className="secondary-button" onClick={addMessage}>
              Add
            </button>
            <button type="button" className="primary-button" disabled={saving} onClick={() => void finishChat()}>
              Done
            </button>
          </div>
        </section>
      ) : null}
      <button type="button" className="side-chat-button" onClick={() => onOpenChange(!open)} aria-label="Open side discussion">
        <MessageCircle size={20} />
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
                  <span className="pill neutral">{humanize(item.kind)}</span>
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
  const order = ["inbox", "review", "validated", "planning", "active", "reviewing", "done", "parked", "killed"];
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
