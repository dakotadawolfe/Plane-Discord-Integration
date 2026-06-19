# Project Desk

Project Desk is a self-hostable Discord mini app for Plane-backed requests. Users authenticate with Discord, submit requests, view their own Plane-linked work items, and comment without needing direct Plane access. Admin or power users, defined by Discord role IDs, can open the underlying Plane issue or full board.

## Stack

- React + Vite + TypeScript frontend
- Node.js + Express backend
- `discord.js` bot notification worker
- SQLite local mapping store
- Plane REST API integration
- Docker Compose deployment

## What Project Desk Does

- Discord OAuth login
- Home, Submit, My Requests, and Board tabs
- Request form with title, type, priority, and details
- Server-side Plane work-item creation
- Local Discord user to Plane issue mapping
- Per-user request list with live Plane status pills
- Request detail page with comments
- Comment creation back into Plane
- Discord embed posted when a request is created
- Admin-only Open in Plane and Open Full Board links
- Local demo mode with fake Plane data

Plane itself is not included. Point Project Desk at an existing Plane workspace and project.

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
| `DISCORD_REQUEST_CHANNEL_ID` | Text channel for new request embeds |
| `DISCORD_ADMIN_ROLE_IDS` | Comma-separated role IDs that can open Plane links |
| `DISCORD_PUBLIC_KEY` | Discord application public key for interaction signature verification |
| `PLANE_BASE_URL` | Plane API base URL, for example `https://api.plane.so` |
| `PLANE_API_KEY` | Plane API key, used only by the backend |
| `PLANE_WORKSPACE_SLUG` | Plane workspace slug |
| `PLANE_PROJECT_ID` | Plane project ID |
| `PLANE_FULL_BOARD_URL` | Browser URL for the Plane board |
| `DATABASE_URL` | SQLite URL, for example `file:./data/project-desk.db` |
| `SESSION_SECRET` | Long random cookie signing secret |

When `DEMO_MODE=true`, Plane variables can be left empty. Discord variables are still required because demo mode keeps Discord OAuth, role checks, and bot embeds real.

Optional variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Backend HTTP port |
| `APP_BASE_URL` | Request host | Public base URL for Discord OAuth redirects |
| `COOKIE_SECURE` | `true` in production | Set to `true` behind HTTPS |
| `COOKIE_SAMESITE` | `none` in production, `lax` in dev | Use `none` for Discord iframe hosting over HTTPS |

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

The OAuth flow requests the `identify` scope. Guild roles are checked server-side with the bot token, so the Plane API key never reaches the browser.

## Local Discord Demo Without Plane

Demo mode lets you test Project Desk on this PC with real Discord login and bot embeds while fake Plane work items/comments are stored in SQLite.

1. Install Node.js 22 or newer.
2. Create a Discord application and bot in the Discord Developer Portal.
3. Invite the bot to a private test server and allow it to post in the request channel.
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

Open the Activity in your test server. New requests start in `Triage`; the admin Board tab also includes demo `Triage`, `In Progress`, and `Done` work items so the full board can be shown without Plane.

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
- The frontend uses relative `/api` routes and never receives `PLANE_API_KEY`.
- `DEMO_MODE=true` uses local SQLite fake Plane data and does not call Plane.
- Admin access is controlled by `DISCORD_ADMIN_ROLE_IDS`.
- `Open in Plane` is shown on request details for admin users.
- `Open Full Board` is shown on the Board tab for admin users.
