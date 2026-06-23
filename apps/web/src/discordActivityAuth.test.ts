import assert from "node:assert/strict";
import test from "node:test";
import {
  completeDiscordActivityLogin,
  describeDiscordActivityLoginError,
  discordActivityAuthScopes
} from "./discordActivityAuth";

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

test("authorizes, exchanges the code, and authenticates a fresh Activity session", async () => {
  const calls: unknown[] = [];

  await completeDiscordActivityLogin({
    clientId: "client-id",
    sdk: {
      commands: {
        authorize: async (input) => {
          calls.push(["authorize", input]);
          return { code: "fresh-code" };
        },
        authenticate: async (input) => {
          calls.push(["authenticate", input]);
          return { access_token: "fresh-token" };
        }
      }
    },
    exchangeCode: async (code) => {
      calls.push(["exchangeCode", code]);
      return { accessToken: "fresh-token" };
    },
    establishSession: async (accessToken) => {
      calls.push(["establishSession", accessToken]);
    }
  });

  assert.deepEqual(calls, [
    [
      "authorize",
      {
        client_id: "client-id",
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "guilds"]
      }
    ],
    ["exchangeCode", "fresh-code"],
    ["authenticate", { access_token: "fresh-token" }]
  ]);
});

test("restores an already-authenticated Activity session", async () => {
  const calls: unknown[] = [];

  await completeDiscordActivityLogin({
    clientId: "client-id",
    sdk: {
      commands: {
        authorize: async () => {
          throw { code: 4002, message: "Already authenticated" };
        },
        authenticate: async (input) => {
          calls.push(["authenticate", input]);
          return { access_token: "existing-token" };
        }
      }
    },
    exchangeCode: async () => {
      throw new Error("exchangeCode should not run for an existing Activity session.");
    },
    establishSession: async (accessToken) => {
      calls.push(["establishSession", accessToken]);
    }
  });

  assert.deepEqual(calls, [
    ["authenticate", { access_token: null }],
    ["establishSession", "existing-token"]
  ]);
});
