# Project Desk

Project Desk is a self-hostable Discord mini app for AI-assisted idea, project, task, and review workflows. Users authenticate with Discord, create ideas, turn them into plans, break work into tasks, review progress, and receive DM-first follow-ups without needing their own AI keys.

The app now treats local SQLite as the Project Desk source of truth. Plane remains available as a future execution-board sync target, but Plane is not required for local/demo workflows.

## Stack

- React + Vite + TypeScript frontend
- Node.js + Express backend
- `discord.js` bot and DM notification worker
- SQLite workflow store
- Hermes/OpenAI-compatible background AI worker
- Optional Plane REST API integration
- Docker Compose deployment

## What Project Desk Does

- Discord OAuth login
- Home, Ideas, Projects, Tasks, Board, and Reviews tabs
- Idea intake with title, priority, and details
- Local lifecycle stages: Inbox, Review, Validated, Planning, Active, Reviewing, Done, Parked, and Killed
- Request/project/task detail pages with comments, AI artifacts, child tasks, and activity
- Workflow AI jobs for idea briefs, validation reviews, project plans, task breakdowns, progress reviews, and Build Demo packages
- DM-first notification records for assignments, review-ready items, blockers, and digests
- Local board drag/drop across Project Desk stages
- Public Discord channel posting disabled by default
- Local demo mode without Plane or Hermes required

Plane itself is not included. Point Project Desk at an existing Plane workspace and project when you are ready to sync execution work to Plane.

## Environment

Copy `.env.example` to `.env` and fill in the values.

```bash
cp .env.example .env
```

Required variables:

| Variable | Purpose |
| --- | --- |
| `DEMO_MODE` | Set `true` to demo without Plane, or `false` to use real Plane |
| `DISCORD_CLIENT_ID` | Discord application client ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth client secret |
| `DISCORD_BOT_TOKEN` | Bot token used for role lookup and channel embeds |
| `DISCORD_GUILD_ID` | Guild where users and admin roles are checked |
| `DISCORD_REQUEST_CHANNEL_ID` | Text channel used by the pinned Activity launcher |
| `DISCORD_ADMIN_ROLE_IDS` | Comma-separated role IDs that can open Plane links |
| `DISCORD_PUBLIC_CHANNEL_POSTING` | Set `true` only if legacy public request embeds should be posted |
| `DISCORD_PUBLIC_KEY` | Discord application public key for interaction signature verification |
| `AI_PROVIDER` | `demo`, `hermes`, or `disabled`; demo mode defaults to deterministic local AI artifacts |
| `AI_WORKER_ENABLED` | Set `false` to stop background AI job processing |
| `HERMES_API_BASE_URL` | Hermes OpenAI-compatible API base URL, usually `http://127.0.0.1:9119/v1` |
| `HERMES_API_KEY` | Server-only API key for Hermes, if the API server requires one |
| `HERMES_MODEL` | Hermes model id, default `hermes-agent` |
| `AI_EXECUTION_PROVIDER` | `local`, `hermes`, or `disabled`; controls who executes assigned Project Desk AI tasks |
| `AI_EXECUTION_COMMAND` | CLI command for task execution, usually `codex` locally or `hermes` on the server |
| `AI_EXECUTION_WORKSPACE_DIR` | Repository/worktree used by AI task execution |
| `AI_EXECUTION_RUN_DIR` | Private directory where large task briefs are written for Hermes |
| `AI_EXECUTION_TIMEOUT_SECONDS` | AI task execution timeout, default `1200` |
| `AI_EXECUTION_MAX_CONCURRENCY` | Maximum simultaneous AI task runners, capped at `5` |
| `AI_EXECUTION_REQUIRE_ADMIN` | Set `false` only on trusted servers if non-admins may assign tasks to Project Desk AI |
| `LOCAL_CODEX_ENABLED` | Set `true` to allow Administrator task assignment to launch local `codex exec` |
| `LOCAL_CODEX_COMMAND` | Optional Codex CLI command or full path; blank auto-discovers the Codex app CLI on Windows before falling back to `codex` |
| `LOCAL_CODEX_WORKSPACE_DIR` | Workspace used by local Codex runs, default repo root |
| `LOCAL_CODEX_TIMEOUT_SECONDS` | Local Codex task timeout, default `1200` |
| `LOCAL_CODEX_MAX_CONCURRENCY` | Maximum simultaneous local Codex task runners, capped at `5` |
| `LOCAL_CODEX_REQUIRE_ADMIN` | Set `false` only on trusted private demos if non-admins may assign tasks to local Codex |
| `PLANE_BASE_URL` | Plane API base URL, for example `https://api.plane.so` |
| `PLANE_API_KEY` | Plane API key, used only by the backend |
| `PLANE_WORKSPACE_SLUG` | Plane workspace slug |
| `PLANE_PROJECT_ID` | Plane project ID |
| `PLANE_FULL_BOARD_URL` | Browser URL for the Plane board |
| `DATABASE_URL` | SQLite URL, for example `file:./data/project-desk.db` |
| `SESSION_SECRET` | Long random cookie signing secret |

When `DEMO_MODE=true`, Plane variables can be left empty. Discord variables are still required because demo mode keeps Discord OAuth, role checks, bot DMs, and the Activity launcher real.

Optional variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Backend HTTP port |
| `APP_BASE_URL` | Request host | Public base URL for Discord OAuth redirects |
| `COOKIE_SECURE` | `true` in production | Set to `true` behind HTTPS |
| `COOKIE_SAMESITE` | `none` in production, `lax` in dev | Use `none` for Discord iframe hosting over HTTPS |
| `REQUEST_BODY_LIMIT` | `50mb` | Max JSON request body size; large files should still use attachments |
| `SOURCE_SYNC_ENABLED` | `true` | Enables the admin settings Source Sync buttons |
| `SOURCE_SYNC_REPO_DIR` | `.` | Repo directory used by Source Sync |
| `SOURCE_SYNC_REMOTE` | `origin` | Git remote used by Source Sync |
| `SOURCE_SYNC_BRANCH` | `main` | Git branch used by Source Sync |

## Discord Setup

Create a Discord application and bot, then add the bot to your guild.

Add this OAuth redirect URL to the Discord application:

```text
https://your-project-desk-host.example.com/api/auth/discord/callback
```

For local development with the default port:

```text
http://localhost:3000/api/auth/discord/callback
```

The OAuth flow requests the `identify` scope. Guild roles are checked server-side with the bot token, so Plane and Hermes credentials never reach the browser.

## AI Worker Setup

Project Desk users do not provide AI keys. The backend calls a shared Hermes API server, and Hermes owns Codex OAuth and credential pooling.

For a no-dependency local demo, use:

```text
AI_PROVIDER=demo
```

For shared Hermes/Codex-backed AI, run Hermes' OpenAI-compatible API server and set:

```text
AI_PROVIDER=hermes
HERMES_API_BASE_URL=http://127.0.0.1:9119/v1
HERMES_API_KEY=<server-only-key-if-required>
HERMES_MODEL=hermes-agent
```

For server-side task execution through Hermes, also set:

```text
AI_EXECUTION_PROVIDER=hermes
AI_EXECUTION_COMMAND=/home/discord/.local/bin/hermes
AI_EXECUTION_WORKSPACE_DIR=/opt/project-desk
AI_EXECUTION_RUN_DIR=/var/lib/project-desk/ai-runs
AI_EXECUTION_MAX_CONCURRENCY=5
AI_EXECUTION_REQUIRE_ADMIN=true
```

Never put Codex OAuth tokens, OpenAI keys, Hermes auth files, cookies, or other provider secrets in Project Desk data, Discord messages, or frontend code.

Temporary local-PC Codex bridge:

```text
AI_EXECUTION_PROVIDER=local
LOCAL_CODEX_ENABLED=true
LOCAL_CODEX_COMMAND=
LOCAL_CODEX_WORKSPACE_DIR=.
LOCAL_CODEX_MAX_CONCURRENCY=5
LOCAL_CODEX_REQUIRE_ADMIN=true
```

When an Administrator assigns a task to **Project Desk AI**, the backend queues that task for the configured execution provider. Local mode runs `codex --ask-for-approval never exec --sandbox workspace-write -`; server mode runs `hermes chat --accept-hooks --yolo` with the task brief written to a private run directory. Up to five runs can process queued tasks at once. Each task moves to In progress, AI writes its final report back as a comment, and a successful run marks the task Complete.

## Server Source Sync

Administrators can open Settings and use Source Sync to:

- sync app code from GitHub and restart Project Desk;
- sync safe app code changes back to GitHub;
- restart Project Desk.

Source Sync stages only app and doc paths (`apps/`, `docs/`, package metadata, `.env.example`, `.gitignore`, `README.md`, and `SOUL.md`). It refuses to sync env files, SQLite databases, uploads, obvious secret-looking diffs, or runtime data. GitHub auth must be configured on the server so `git push` works non-interactively.

## Local Discord Demo Without Plane

Demo mode lets you test Project Desk on this PC with real Discord login, bot DMs, a pinned launcher, local workflow data, and deterministic demo AI artifacts stored in SQLite.

1. Install Node.js 22 or newer.
2. Create a Discord application and bot in the Discord Developer Portal.
3. Invite the bot to a private test server and allow it to post the pinned Activity launcher.
4. Copy `.env.example` to `.env`.
5. Fill in the Discord values, then set:

```text
DEMO_MODE=true
DATABASE_URL=file:./data/project-desk-demo.db
SESSION_SECRET=replace-with-a-long-random-secret
```

Plane values can stay empty in demo mode.

Run the app:

```bash
npm install
npm run build
npm start
```

Expose the local app with Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

In the Discord Developer Portal, configure:

```text
OAuth redirect: https://<tunnel-host>/api/auth/discord/callback
Interactions Endpoint URL: https://<tunnel-host>/api/interactions
Activity URL Mapping root: https://<tunnel-host>
```

After the Interactions Endpoint URL validates, switch the default Activity launcher to app-handled mode:

```bash
npm run discord:entrypoint
```

This updates the global `Launch` Entry Point command to `APP_HANDLER`. In that mode, Project Desk responds with Discord's `LAUNCH_ACTIVITY` callback instead of Discord's default `DISCORD_LAUNCH_ACTIVITY` handler, which avoids the repeated Game Invitation card in the channel.

To create one pinned channel launcher with a `Play` button, run:

```bash
npm run discord:pin-launch
```

This creates or updates a pinned Project Desk message in `DISCORD_REQUEST_CHANNEL_ID`. Re-running the command updates the existing pinned launcher instead of posting another one, and it unpins duplicate Project Desk launch pins if any were created while testing. The `Play` button uses the same signed `/api/interactions` endpoint and launches the Activity without posting a new Game Invitation card.

Open the Activity in your test server. New ideas start in `Inbox`; board drag/drop moves items through Project Desk stages and queues AI work for eligible phases.

## Plane Setup

Skip this section for `DEMO_MODE=true`.

Create a Plane API key with access to the target workspace and project. Project Desk calls the Plane REST API from the backend only:

- `POST /api/v1/workspaces/{workspace}/projects/{project}/work-items/`
- `GET /api/v1/workspaces/{workspace}/projects/{project}/work-items/{id}`
- `GET/POST /api/v1/workspaces/{workspace}/projects/{project}/work-items/{id}/comments/`

If your Plane deployment uses a different API base path, set `PLANE_BASE_URL` to the API host root. For example, `https://plane.example.com`.

## Local Development

Install dependencies:

```bash
npm install
```

Run the API and Vite dev server:

```bash
npm run dev
```

Open the Vite app:

```text
http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:3000`.

## Docker Compose

Build and run the self-hosted app:

```bash
docker compose up --build
```

The app listens on:

```text
http://localhost:3000
```

SQLite data is stored in the `project-desk-data` Docker volume when using the default Compose file. Compose sets `DATABASE_URL=file:/data/project-desk.db` inside the container.

## Scripts

```bash
npm run typecheck
npm run build
npm run discord:entrypoint
npm run discord:pin-launch
npm start
```

## Notes

- Plane API calls are server-side only.
- Hermes API calls are server-side only.
- The frontend uses relative `/api` routes and never receives `PLANE_API_KEY`, `HERMES_API_KEY`, Codex OAuth tokens, or OpenAI keys.
- `DEMO_MODE=true` uses local SQLite workflow data and does not call Plane.
- `AI_PROVIDER=demo` creates deterministic local AI artifacts without calling Hermes.
- `DISCORD_PUBLIC_CHANNEL_POSTING=false` keeps workflow updates out of public channels by default.
- Admin access is controlled by `DISCORD_ADMIN_ROLE_IDS`.
- `Open in Plane` is shown on item details for admin users.
- `Open Full Board` is shown on the Board tab for admin users.
