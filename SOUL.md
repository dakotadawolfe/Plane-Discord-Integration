# Project Desk Soul

Project Desk is a Discord-authenticated productivity OS for a small, trusted group. It should feel like a focused team workspace, not a public ticket queue and not a general AI chatroom.

## Product Intent

- Ideas are lightweight thoughts worth tracking. They do not have phases until they become projects.
- Projects are committed work with phases, tasks, owners, comments, and review.
- Tasks are concrete executable units assigned to people or Project Desk AI.
- Comments are the shared record. AI should behave like a teammate that leaves useful notes, summaries, and completion reports.
- Discord is identity and notification infrastructure. Avoid public channel spam; use DMs and in-app inbox records first.

## AI Operating Rules

- Users authenticate only with Discord. No user supplies personal OpenAI, Codex, or Hermes credentials.
- Hermes owns shared Codex/auth infrastructure on the server.
- Project Desk must never expose AI keys, Codex OAuth material, cookies, env files, tunnel credentials, Discord bot tokens, or other secrets in frontend payloads, database records, comments, logs, or Discord messages.
- AI task work must use the configured Project Desk repository as its workspace unless a task explicitly says otherwise and a server-side allowlist permits it.
- AI should not ask for permission during server task execution. If a human login, missing credential, or unsafe action blocks progress, it should document the blocker and stop that action.
- AI should mark a task complete only after it has actually completed the requested work or produced a clear blocked report.
- `@AI` on a task means continue or re-run task work with the full task, parent item, comments, sibling tasks, references, and scoped memory as context.

## Scoped Memory

- Memory is scoped to a single idea, project, or task unless explicitly linked.
- Scoped memory should capture durable context: goals, constraints, decisions, names, architecture notes, and “do not repeat this mistake” guidance.
- Scoped memory should not contain secrets, credentials, private tokens, raw env values, personal access tokens, Cloudflare tunnel credentials, Discord bot tokens, or session cookies.
- AI may use scoped memory as context, but comments and item state remain the visible source of truth for the team.

## Source Sync

- Source sync is for Project Desk application code and docs only.
- Do not sync SQLite databases, uploads, project data, generated runtime state, env files, secrets, tunnel credentials, or unrelated workspaces.
- Safe app changes may include `apps/`, `docs/`, package metadata, `.env.example`, `.gitignore`, `README.md`, and `SOUL.md`.
- Server sync should rely on GitHub auth configured on the server and should fail closed if Git cannot push without prompting.

## UX Principles

- Keep primary work fields stable and obvious: title, details, category, priority, assigned to, phase, status, comments, and tasks.
- AI-only settings should live in a secondary panel or modal so normal task creation stays understandable.
- Prefer compact, Discord-like density without copying Discord chrome already provided by the host app.
- Every page should refresh on open and respond to real-time changes where possible.
