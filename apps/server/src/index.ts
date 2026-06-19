import { config } from "./config.js";
import { DemoPlaneClient } from "./demo-plane.js";
import { DiscordService } from "./discord.js";
import { PlaneClient } from "./plane.js";
import { createApp } from "./routes.js";

const discord = new DiscordService();
await discord.start();

const app = createApp({
  plane: config.demoMode ? new DemoPlaneClient() : new PlaneClient(),
  discord
});

const server = app.listen(config.port, () => {
  console.log(`Project Desk listening on port ${config.port} in ${config.demoMode ? "demo" : "Plane"} mode.`);
});

async function shutdown() {
  console.log("Shutting down Project Desk.");
  await discord.stop();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
