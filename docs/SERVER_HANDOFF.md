# Project Desk Server Handoff

Target host: `discord@discord`

Public URL: `https://discord.file-host.net`

## Goal

Run Project Desk on the Discord server with:

- Project Desk web app behind Cloudflare Tunnel;
- Discord OAuth, Activity launch, bot DMs, and role checks using the existing Discord app;
- Hermes as the shared background AI and task execution layer;
- no frontend AI keys, Codex OAuth, passwords, or approval prompts;
- safe app-code-only source sync from the admin settings menu.

## Server Layout

Use these paths:

```text
/opt/project-desk                 # git checkout of the app
/etc/project-desk/project-desk.env # chmod 600 runtime env
/var/lib/project-desk              # SQLite, uploads, AI run files
/var/log/project-desk              # optional service logs
```

Recommended services:

```text
project-desk.service
hermes-proxy.service
cloudflared.service
```

## Project Desk Env

The server env should keep Discord values from the current local `.env`, then override runtime paths:

```text
NODE_ENV=production
DEMO_MODE=true
HOST=127.0.0.1
PORT=3000
APP_BASE_URL=https://discord.file-host.net
COOKIE_SECURE=true
COOKIE_SAMESITE=none
DATABASE_URL=file:/var/lib/project-desk/project-desk.db

AI_PROVIDER=hermes
AI_WORKER_ENABLED=true
HERMES_TRANSPORT=cli
HERMES_CLI_COMMAND=/home/discord/.local/bin/hermes
HERMES_CLI_PROVIDER=openai-codex
HERMES_CLI_WORKSPACE_DIR=/opt/project-desk
HERMES_CLI_TIMEOUT_SECONDS=180
HERMES_API_BASE_URL=http://127.0.0.1:9119/v1
HERMES_MODEL=hermes-agent

AI_EXECUTION_PROVIDER=hermes
AI_EXECUTION_COMMAND=/home/discord/.local/bin/hermes
AI_EXECUTION_WORKSPACE_DIR=/opt/project-desk
AI_EXECUTION_RUN_DIR=/var/lib/project-desk/ai-runs
AI_EXECUTION_MAX_CONCURRENCY=5
AI_EXECUTION_REQUIRE_ADMIN=true
HERMES_TASK_PROVIDER=openai-codex

LOCAL_CODEX_ENABLED=false
SOURCE_SYNC_ENABLED=true
SOURCE_SYNC_REPO_DIR=/opt/project-desk
SOURCE_SYNC_REMOTE=origin
SOURCE_SYNC_BRANCH=main
```

Plane values may remain empty while `DEMO_MODE=true`.

## Hermes

Hermes CLI execution should work without a prompt:

```bash
/home/discord/.local/bin/hermes chat -q PROJECT_DESK_HERMES_OK --provider openai-codex --accept-hooks --yolo --max-turns 1 --quiet
```

Hermes proxy is optional when `HERMES_TRANSPORT=cli`. If you later want the OpenAI-compatible API transport, Hermes should expose its proxy locally:

```bash
/home/discord/.local/bin/hermes proxy start --provider nous --host 127.0.0.1 --port 9119
```

Task execution uses:

```bash
/home/discord/.local/bin/hermes chat --accept-hooks --yolo --quiet --source project-desk --worktree /opt/project-desk
```

Hermes/Codex credentials stay in the `discord` user account. Project Desk stores only server-side Hermes endpoint/config values.

## Cloudflare Tunnel

Install `cloudflared`, then authenticate interactively when prompted:

```bash
cloudflared tunnel login
cloudflared tunnel create project-desk-discord
cloudflared tunnel route dns project-desk-discord discord.file-host.net
```

Tunnel config:

```yaml
tunnel: project-desk-discord
credentials-file: /home/discord/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: discord.file-host.net
    service: http://127.0.0.1:3000
  - service: http_status:404
```

## Discord Developer Portal Changes

In the existing Discord application:

- OAuth2 redirect:

```text
https://discord.file-host.net/api/auth/discord/callback
```

- Interactions endpoint:

```text
https://discord.file-host.net/api/interactions
```

- Activity URL mapping root:

```text
https://discord.file-host.net
```

- iOS/mobile Activity support: enable the mobile platform checkbox in the application settings if you want Activity launch on iOS.

After changing URLs, save the app settings and use `npm run discord:entrypoint` plus `npm run discord:pin-launch` from the server checkout if the Activity entrypoint or pinned launcher needs to be refreshed.

## Sudo And Autonomy

The `discord` user should have passwordless sudo for operational commands used by Project Desk and Hermes.

Validate:

```bash
sudo -n true
sudo -n systemctl restart project-desk
```

If either command prompts for a password, the web app cannot be 100 percent autonomous for restarts/source sync.

## Source Sync

The admin settings Source Sync buttons run on the server:

- Sync from GitHub: requires a clean worktree, fast-forwards `origin/main`, runs `npm ci`, builds, and restarts `project-desk`.
- Sync app to GitHub: stages only app/docs/package paths, blocks env/DB/uploads/secret-looking diffs, runs typecheck/build, commits, and pushes `main`.
- Restart app: runs `sudo -n systemctl restart project-desk`.

Server GitHub auth must be non-interactive:

```bash
gh auth status
gh auth setup-git
git -C /opt/project-desk push --dry-run origin main
```

## Validation

Run:

```bash
npm ci
npm run typecheck
npm run build
sudo systemctl restart hermes-proxy
sudo systemctl restart project-desk
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://discord.file-host.net/api/health
```

Then verify in Discord:

- login works through the Activity;
- pinned launch opens the server URL;
- user/admin roles resolve;
- creating an idea/task works;
- assigning a task to Project Desk AI queues Hermes execution;
- task AI output streams in the task page;
- successful AI task runs add a comment and mark the task complete;
- Source Sync status loads for administrators.
