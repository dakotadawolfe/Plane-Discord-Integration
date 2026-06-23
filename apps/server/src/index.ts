import { config } from "./config.js";
import { createAiClient } from "./ai.js";
import { AiWorker } from "./ai-worker.js";
import { DemoPlaneClient } from "./demo-plane.js";
import { DiscordService } from "./discord.js";
import { heartbeatEventClients } from "./events.js";
import { LocalCodexRunner } from "./local-codex-runner.js";
import { runInactiveArchiveSweep } from "./maintenance.js";
import { PlaneClient } from "./plane.js";
import { createApp } from "./routes.js";
import { DisabledAiTaskRunner, type AiTaskRunner } from "./task-runner.js";

const discord = new DiscordService();
await discord.start();
const ai = createAiClient();
const aiWorker = new AiWorker(ai, discord);
const taskRunner: AiTaskRunner =
  config.aiExecution.provider === "hermes"
    ? new LocalCodexRunner("hermes")
    : config.aiExecution.provider === "local"
      ? new LocalCodexRunner("local")
      : new DisabledAiTaskRunner();
aiWorker.start();
const eventHeartbeat = setInterval(heartbeatEventClients, 25000);
runInactiveArchiveSweep();
const inactiveArchiveSweep = setInterval(runInactiveArchiveSweep, 60 * 60 * 1000);

const app = createApp({
  plane: config.demoMode ? new DemoPlaneClient() : new PlaneClient(),
  discord,
  aiWorker,
  ai,
  taskRunner
});

const server = config.host
  ? app.listen(config.port, config.host, onListening)
  : app.listen(config.port, onListening);

function onListening() {
  console.log(
    `Project Desk listening on ${config.host ?? "0.0.0.0"}:${config.port} in ${config.demoMode ? "demo" : "Plane"} mode with ${config.ai.provider} AI and ${taskRunner.label} execution.`
  );
}

async function shutdown() {
  console.log("Shutting down Project Desk.");
  clearInterval(eventHeartbeat);
  clearInterval(inactiveArchiveSweep);
  aiWorker.stop();
  await discord.stop();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
