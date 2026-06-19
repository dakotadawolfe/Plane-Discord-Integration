import {
  ArrowRight,
  ExternalLink,
  Home,
  Kanban,
  ListChecks,
  LogIn,
  LogOut,
  MessageCircle,
  RefreshCw,
  Send,
  Shield
} from "lucide-react";
import { type DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  addComment,
  ApiError,
  createRequest,
  exchangeDiscordActivityCode,
  getBoard,
  getMe,
  getPublicConfig,
  getRequest,
  listRequests,
  login,
  logout,
  updateBoardItemState
} from "./api";
import type {
  BoardItem,
  CurrentUser,
  MeResponse,
  PublicConfig,
  RequestComment,
  RequestDetail,
  RequestPriority,
  RequestSummary,
  RequestType
} from "./types";
import { useDiscordActivity } from "./useDiscordActivity";
import type { DiscordActivityState } from "./useDiscordActivity";

const typeOptions: { value: RequestType; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "support", label: "Support" },
  { value: "task", label: "Task" },
  { value: "other", label: "Other" }
];

const priorityOptions: { value: RequestPriority; label: string }[] = [
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
  { value: "low", label: "Low" },
  { value: "none", label: "None" }
];

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

  return value.charAt(0).toUpperCase() + value.slice(1);
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

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-title">Project Desk</div>

        <nav className="nav-tabs" aria-label="Project Desk navigation">
          <TabLink to="/" icon={<Home size={16} />} label="Home" />
          <TabLink to="/submit" icon={<Send size={16} />} label="Submit" />
          <TabLink to="/requests" icon={<ListChecks size={16} />} label="Requests" />
          <TabLink to="/board" icon={<Kanban size={16} />} label="Board" />
        </nav>

        <div className="topbar-session">
          {loadingMe ? (
            <span className="muted">Checking session</span>
          ) : user ? (
            <UserCard user={user} onLogout={handleLogout} />
          ) : (
            <button className="primary-button full" onClick={() => void handleLogin()}>
              <LogIn size={16} />
              Log in
            </button>
          )}
        </div>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage me={me} loading={loadingMe} onLogin={handleLogin} activity={discordActivity} />} />
          <Route path="/submit" element={<SubmitPage user={user} onLogin={handleLogin} activity={discordActivity} />} />
          <Route path="/requests" element={<RequestsPage user={user} onLogin={handleLogin} activity={discordActivity} />} />
          <Route path="/requests/:id" element={<RequestDetailPage user={user} onLogin={handleLogin} activity={discordActivity} />} />
          <Route path="/board" element={<BoardPage user={user} boardUrl={me?.planeFullBoardUrl ?? null} onLogin={handleLogin} activity={discordActivity} />} />
        </Routes>
      </main>
    </div>
  );
}

function TabLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
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
        <span>{user.isAdmin ? "Power user" : "Requester"}</span>
      </div>
      <button className="icon-button" onClick={onLogout} title="Log out" aria-label="Log out">
        <LogOut size={16} />
      </button>
    </div>
  );
}

function LoginPanel({
  onLogin,
  activity
}: {
  onLogin: () => Promise<void>;
  activity: DiscordActivityState;
}) {
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
  const [requests, setRequests] = useState<RequestSummary[]>([]);

  useEffect(() => {
    if (me?.user) {
      void listRequests()
        .then((payload) => setRequests(payload.requests))
        .catch(() => setRequests([]));
    }
  }, [me?.user]);

  if (loading) {
    return <LoadingBlock label="Loading Project Desk" />;
  }

  if (!me?.user) {
    return <LoginPanel onLogin={onLogin} activity={activity} />;
  }

  const openCount = requests.filter((request) => request.status.group !== "completed").length;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Home</h1>
        </div>
        <NavLink className="primary-button" to="/submit">
          <Send size={16} />
          New request
        </NavLink>
      </header>

      <section className="metrics-grid">
        <Metric label="My requests" value={requests.length.toString()} />
        <Metric label="Open" value={openCount.toString()} />
        <Metric label="Role" value={me.user.isAdmin ? "Power" : "User"} />
      </section>

      <section className="panel">
        <PanelTitle title="Recent requests" action={<NavLink to="/requests">View all</NavLink>} />
        <RequestList requests={requests.slice(0, 5)} empty="No requests yet." />
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

function SubmitPage({
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
  const [type, setType] = useState<RequestType>("support");
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
      const payload = await createRequest({ title, type, priority, details });
      navigate(`/requests/${payload.request.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Submit</h1>
        </div>
      </header>

      <form className="panel form-grid" onSubmit={handleSubmit}>
        <label className="field full">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} />
        </label>

        <label className="field">
          <span>Type</span>
          <select value={type} onChange={(event) => setType(event.target.value as RequestType)}>
            {typeOptions.map((option) => (
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
          />
        </label>

        {error ? <p className="error-text full">{error}</p> : null}

        <div className="form-actions full">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
            {saving ? "Submitting" : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RequestsPage({
  user,
  onLogin,
  activity
}: {
  user: CurrentUser | null;
  onLogin: () => Promise<void>;
  activity: DiscordActivityState;
}) {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    void load();
  }, [user]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const payload = await listRequests();
      setRequests(payload.requests);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load requests.");
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return <LoginPanel onLogin={onLogin} activity={activity} />;
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Requests</h1>
        </div>
        <button className="secondary-button" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      <section className="panel">
        {loading ? <LoadingBlock label="Loading requests" /> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!loading && !error ? <RequestList requests={requests} empty="No requests yet." /> : null}
      </section>
    </div>
  );
}

function RequestList({ requests, empty }: { requests: RequestSummary[]; empty: string }) {
  if (requests.length === 0) {
    return <p className="muted">{empty}</p>;
  }

  return (
    <div className="request-list">
      {requests.map((request) => (
        <NavLink to={`/requests/${request.id}`} className="request-row" key={request.id}>
          <div>
            <strong>{request.title}</strong>
            <span>
              {humanize(request.type)} / {formatDate(request.createdAt)}
            </span>
          </div>
          <div className="row-pills">
            <PriorityPill priority={request.priority} />
            <StatusPill request={request} />
            <ArrowRight size={16} />
          </div>
        </NavLink>
      ))}
    </div>
  );
}

function RequestDetailPage({
  user,
  onLogin,
  activity
}: {
  user: CurrentUser | null;
  onLogin: () => Promise<void>;
  activity: DiscordActivityState;
}) {
  const { id } = useParams();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [comments, setComments] = useState<RequestComment[]>([]);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) {
      return;
    }

    void load();
  }, [user, id]);

  async function load() {
    if (!id) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await getRequest(id);
      setRequest(payload.request);
      setComments(payload.comments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load request.");
    } finally {
      setLoading(false);
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
      await addComment(id, comment);
      setComment("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add comment.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return <LoginPanel onLogin={onLogin} activity={activity} />;
  }

  if (loading) {
    return <LoadingBlock label="Loading request" />;
  }

  if (error && !request) {
    return <p className="error-text">{error}</p>;
  }

  if (!request) {
    return <p className="muted">Request not found.</p>;
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{request.plane.identifier ?? request.plane.sequenceId ?? "Request"}</p>
          <h1>{request.title}</h1>
        </div>
        {request.canOpenInPlane && request.plane.url ? (
          <a className="secondary-button" href={request.plane.url} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Open in Plane
          </a>
        ) : null}
      </header>

      <section className="detail-grid">
        <div className="panel stack">
          <div className="detail-meta">
            <StatusPill request={request} />
            <PriorityPill priority={request.priority} />
            <span className="pill neutral">{humanize(request.type)}</span>
          </div>
          <p className="details-text">{request.details}</p>
        </div>

        <aside className="panel meta-panel">
          <span>Created</span>
          <strong>{formatDate(request.createdAt)}</strong>
          <span>Submitted by</span>
          <strong>{request.discordUsername}</strong>
        </aside>
      </section>

      <section className="panel stack">
        <PanelTitle title="Comments" icon={<MessageCircle size={18} />} />
        <div className="comments">
          {comments.length === 0 ? <p className="muted">No comments yet.</p> : null}
          {comments.map((item) => (
            <article className="comment" key={`${item.source}-${item.id}`}>
              <div className="comment-avatar">{item.authorName.slice(0, 1).toUpperCase()}</div>
              <div>
                <strong>{item.authorName}</strong>
                <span>{formatDate(item.createdAt)}</span>
              </div>
              <p>{item.body}</p>
            </article>
          ))}
        </div>

        <form className="comment-form" onSubmit={handleComment}>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={4}
            placeholder="Add a comment"
          />
          {error ? <p className="error-text">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
            {saving ? "Posting" : "Comment"}
          </button>
        </form>
      </section>
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
  const [recent, setRecent] = useState<RequestSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropStateId, setDropStateId] = useState<string | null>(null);
  const [movingItemId, setMovingItemId] = useState<string | null>(null);

  const columns = useMemo(() => buildBoardColumns(items, states), [items, states]);

  useEffect(() => {
    if (user?.isAdmin) {
      void load();
    }
  }, [user?.isAdmin]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const payload = await getBoard();
      setItems(payload.workItems);
      setStates(payload.states);
      setRecent(payload.recentRequests);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load board.");
    } finally {
      setLoading(false);
    }
  }

  async function moveItemToState(item: BoardItem, targetStateId: string) {
    if (item.status.id === targetStateId || movingItemId) {
      return;
    }

    const targetStatus = columns.find((column) => column.stateId === targetStateId)?.status;

    if (!targetStatus) {
      return;
    }

    const previousItems = items;
    setMovingItemId(item.id);
    setError(null);
    setItems((current) =>
      current.map((currentItem) => (currentItem.id === item.id ? { ...currentItem, status: targetStatus } : currentItem))
    );

    try {
      const payload = await updateBoardItemState(item.id, targetStateId);
      setItems((current) =>
        current.map((currentItem) => (currentItem.id === payload.workItem.id ? payload.workItem : currentItem))
      );
    } catch (err) {
      setItems(previousItems);
      setError(err instanceof ApiError ? err.message : "Could not move work item.");
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

  if (!user.isAdmin) {
    return (
      <section className="panel center-panel">
        <Shield size={30} />
        <h1>Board access</h1>
        <p className="muted">Configured Discord roles can open the Plane board here.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Board</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={load}>
            <RefreshCw size={16} />
            Refresh
          </button>
          {boardUrl ? (
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
              <a
                className={`board-card ${draggingItemId === item.id ? "dragging" : ""} ${
                  movingItemId === item.id ? "moving" : ""
                }`}
                href={item.url ?? boardUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
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
                  <PriorityPill priority={(item.priority ?? "none") as RequestPriority} />
                  {item.identifier || item.sequenceId ? (
                    <span className="pill neutral">{item.identifier ?? item.sequenceId}</span>
                  ) : null}
                </div>
              </a>
            ))}
            {column.items.length === 0 ? <p className="board-empty">Drop a request here.</p> : null}
          </div>
        ))}
      </section>

      <section className="panel">
        <PanelTitle title="Recent Project Desk requests" />
        <RequestList requests={recent} empty="No local requests yet." />
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

  return [...columns.values()].sort((left, right) => {
    const rankDelta = statusRank(left.status) - statusRank(right.status);
    return rankDelta === 0 ? left.status.name.localeCompare(right.status.name) : rankDelta;
  });
}

function statusRank(status: BoardItem["status"]): number {
  const value = `${status.group ?? ""} ${status.name}`.toLowerCase();

  if (value.includes("triage") || value.includes("backlog") || value.includes("todo")) {
    return 0;
  }

  if (value.includes("progress") || value.includes("started")) {
    return 1;
  }

  if (value.includes("done") || value.includes("complete")) {
    return 2;
  }

  if (value.includes("cancel")) {
    return 3;
  }

  return 10;
}

function StatusPill({ request }: { request: RequestSummary }) {
  const style = request.status.color ? { "--pill-color": request.status.color } : undefined;

  return (
    <span className="pill status" style={style as React.CSSProperties}>
      {request.status.name}
    </span>
  );
}

function PriorityPill({ priority }: { priority: RequestPriority }) {
  return <span className={`pill priority ${priority}`}>{humanize(priority)}</span>;
}

function PanelTitle({
  title,
  action,
  icon
}: {
  title: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
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
