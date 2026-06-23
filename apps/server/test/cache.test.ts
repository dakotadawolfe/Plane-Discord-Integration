import assert from "node:assert/strict";
import test from "node:test";

function seedConfigEnv(): void {
  process.env.DEMO_MODE ??= "true";
  process.env.DISCORD_CLIENT_ID ??= "test-client-id";
  process.env.DISCORD_CLIENT_SECRET ??= "test-client-secret";
  process.env.DISCORD_BOT_TOKEN ??= "test-bot-token";
  process.env.DISCORD_GUILD_ID ??= "test-guild-id";
  process.env.DISCORD_REQUEST_CHANNEL_ID ??= "test-channel-id";
  process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters";
}

test("API responses are marked no-store", async () => {
  seedConfigEnv();
  const { preventApiResponseCaching } = await import("../src/routes.js");

  let nextCalled = false;
  const headers = new Map<string, string>();

  preventApiResponseCaching(
    {} as Parameters<typeof preventApiResponseCaching>[0],
    {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      }
    } as Parameters<typeof preventApiResponseCaching>[1],
    () => {
      nextCalled = true;
    }
  );

  assert.equal(headers.get("Cache-Control"), "no-store");
  assert.equal(nextCalled, true);
});
