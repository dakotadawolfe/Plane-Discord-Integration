import { spawn } from "node:child_process";
import { config } from "./config.js";
import { sourceSyncSuccessMessage, type SourceSyncAction } from "./source-sync-actions.js";

export type { SourceSyncAction } from "./source-sync-actions.js";
export type SourceSyncState = "idle" | "running" | "succeeded" | "failed";

export interface SourceSyncStatus {
  enabled: boolean;
  running: boolean;
  state: SourceSyncState;
  action: SourceSyncAction | null;
  actorName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  message: string | null;
  output: string[];
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

const maxOutputLines = 320;
const maxOutputChunk = 12_000;
const stagedAllowlist = [
  "apps",
  "docs",
  ".env.example",
  ".gitignore",
  "README.md",
  "SOUL.md",
  "package.json",
  "package-lock.json"
];
const forbiddenPathPatterns = [
  /^\.env(?:$|\.(?!example$))/i,
  /^data[\\/]/i,
  /project-desk.*\.db/i,
  /uploads[\\/]/i,
  /session/i,
  /secret/i,
  /token/i
];
const secretDiffPatterns = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /mfa\.[A-Za-z0-9_-]{20,}/,
  /(DISCORD_BOT_TOKEN|DISCORD_CLIENT_SECRET|SESSION_SECRET|HERMES_API_KEY|PLANE_API_KEY)\s*=\s*[^<\s#][^\n]+/i
];

let currentStatus: SourceSyncStatus = {
  enabled: config.sourceSync.enabled,
  running: false,
  state: "idle",
  action: null,
  actorName: null,
  startedAt: null,
  endedAt: null,
  message: null,
  output: []
};

function redact(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "sk-[redacted]")
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "gh_[redacted]")
    .replace(/mfa\.[A-Za-z0-9_-]{20,}/g, "mfa.[redacted]")
    .replace(/(DISCORD_BOT_TOKEN|DISCORD_CLIENT_SECRET|SESSION_SECRET|HERMES_API_KEY|PLANE_API_KEY)\s*=\s*[^\s]+/gi, "$1=[redacted]");
}

function pushOutput(line: string): void {
  const clean = redact(line).trimEnd();

  if (!clean) {
    return;
  }

  currentStatus.output.push(clean);

  if (currentStatus.output.length > maxOutputLines) {
    currentStatus.output.splice(0, currentStatus.output.length - maxOutputLines);
  }
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  pushOutput(`$ ${command} ${args.join(" ")}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: config.sourceSync.repoDir,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout = (stdout + text).slice(-maxOutputChunk);
      pushOutput(text);
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr = (stderr + text).slice(-maxOutputChunk);
      pushOutput(text);
    });

    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

async function runRequired(command: string, args: string[]): Promise<CommandResult> {
  const result = await runCommand(command, args);

  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.exitCode ?? "unknown"}.`);
  }

  return result;
}

async function git(args: string[]): Promise<CommandResult> {
  return runRequired("git", args);
}

async function npm(args: string[]): Promise<CommandResult> {
  return runRequired("npm", args);
}

async function sudo(args: string[]): Promise<CommandResult> {
  return runRequired("sudo", ["-n", ...args]);
}

async function scheduleProjectDeskRestart(): Promise<void> {
  await sudo([
    "systemd-run",
    "--on-active=2",
    "--unit=project-desk-delayed-restart",
    "/bin/systemctl",
    "restart",
    "project-desk"
  ]);
}

async function ensureCleanWorktreeForPull(): Promise<void> {
  const status = await git(["status", "--porcelain"]);

  if (status.stdout.trim()) {
    throw new Error("Cannot sync from GitHub while local app code has uncommitted changes.");
  }
}

async function ensureSafeStagedDiff(): Promise<boolean> {
  const staged = await git(["diff", "--cached", "--name-only"]);
  const stagedFiles = staged.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (stagedFiles.length === 0) {
    pushOutput("No app changes are staged.");
    return false;
  }

  const forbidden = stagedFiles.filter((file) => forbiddenPathPatterns.some((pattern) => pattern.test(file)));

  if (forbidden.length > 0) {
    throw new Error(`Refusing to sync forbidden paths: ${forbidden.join(", ")}`);
  }

  const diff = await git(["diff", "--cached", "--text", "--", ...stagedFiles]);

  for (const pattern of secretDiffPatterns) {
    if (pattern.test(diff.stdout)) {
      throw new Error("Refusing to sync because staged changes look like they contain a secret.");
    }
  }

  return true;
}

async function runPull(): Promise<void> {
  await ensureCleanWorktreeForPull();
  await git(["fetch", config.sourceSync.remote, config.sourceSync.branch]);
  await git(["merge", "--ff-only", `${config.sourceSync.remote}/${config.sourceSync.branch}`]);
  await npm(["ci"]);
  await npm(["run", "build"]);
  await scheduleProjectDeskRestart();
}

async function runPush(actorName: string): Promise<void> {
  await git(["add", "--", ...stagedAllowlist]);
  await git(["diff", "--cached", "--check"]);

  if (!(await ensureSafeStagedDiff())) {
    return;
  }

  await npm(["run", "typecheck"]);
  await npm(["run", "build"]);
  await git(["commit", "-m", `Sync Project Desk app changes from ${actorName}`]);
  await git(["push", config.sourceSync.remote, config.sourceSync.branch]);
}

async function runRestart(): Promise<void> {
  await scheduleProjectDeskRestart();
}

async function runApply(): Promise<void> {
  await npm(["run", "build"]);
  await scheduleProjectDeskRestart();
}

async function executeSourceSync(action: SourceSyncAction, actorName: string): Promise<void> {
  try {
    if (action === "pull") {
      await runPull();
    } else if (action === "push") {
      await runPush(actorName);
    } else if (action === "restart") {
      await runRestart();
    } else {
      await runApply();
    }

    currentStatus.message = sourceSyncSuccessMessage(action);
    currentStatus.state = "succeeded";
  } catch (error) {
    currentStatus.state = "failed";
    currentStatus.message = error instanceof Error ? error.message : "Source sync failed.";
    pushOutput(currentStatus.message);
  } finally {
    currentStatus.running = false;
    currentStatus.endedAt = new Date().toISOString();
  }
}

export function getSourceSyncStatus(): SourceSyncStatus {
  return {
    ...currentStatus,
    enabled: config.sourceSync.enabled,
    output: [...currentStatus.output]
  };
}

export function startSourceSync(action: SourceSyncAction, actorName: string): SourceSyncStatus {
  if (!config.sourceSync.enabled) {
    return {
      ...getSourceSyncStatus(),
      state: "failed",
      message: "Source sync is disabled on this server."
    };
  }

  if (currentStatus.running) {
    return getSourceSyncStatus();
  }

  currentStatus = {
    enabled: true,
    running: true,
    state: "running",
    action,
    actorName,
    startedAt: new Date().toISOString(),
    endedAt: null,
    message: null,
    output: []
  };

  void executeSourceSync(action, actorName);
  return getSourceSyncStatus();
}
