import assert from "node:assert/strict";
import test from "node:test";
import { discordActivityAuthScopes } from "./discordActivityAuth";

test("requests the Discord scopes expected by the Activity SDK auth flow", () => {
  assert.deepEqual(discordActivityAuthScopes, ["identify", "guilds", "applications.commands"]);
});
