import { config } from "./config.js";
import { createAiClient } from "./ai.js";
import { AiWorker } from "./ai-worker.js";
import { DemoPlaneClient } from "./demo-plane.js";
import { DiscordService } from "./discord.js";
import { heartbeatEventClients } from "./events.js";
import { runInactiveArchiveSweep } from "./maintenance.js";
import { PlaneClient } from "./plane.js";
import { createApp } from "./routes.js";

const discord = new DiscordService();
await discord.start();
const aiWorker = new AiWorker(createAiClient(), discord);
aiWorker.start();
const eventHeartbeat = setInterval(heartbeatEventClients, 25000);
runInactiveArchiveSweep();
const inactiveArchiveSweep = setInterval(runInactiveArchiveSweep, 60 * 60 * 1000);

const app = createApp({
  plane: config.demoMode ? new DemoPlaneClient() : new PlaneClient(),
  discord,
  aiWorker
});

const server = app.listen(config.port, () => {
  console.log(
    `Project Desk listening on port ${config.port} in ${config.demoMode ? "demo" : "Plane"} mode with ${config.ai.provider} AI.`
  );
});

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
