import assert from "node:assert/strict";
import test from "node:test";
import { describeDiscordActivityLoginError, discordActivityAuthScopes } from "./discordActivityAuth";

test("requests the Discord scopes expected by the Activity SDK auth flow", () => {
  assert.deepEqual(discordActivityAuthScopes, ["identify", "guilds"]);
});

test("formats object-shaped Discord SDK errors", () => {
  const error = describeDiscordActivityLoginError("Discord Activity authorization", {
    code: 4006,
    message: "Not authorized",
    data: { scope: "applications.commands" }
  });

  assert.equal(
    error.message,
    'Discord Activity authorization failed: {"code":4006,"message":"Not authorized","data":{"scope":"applications.commands"}}'
  );
});
