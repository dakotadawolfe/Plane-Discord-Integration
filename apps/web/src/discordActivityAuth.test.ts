import assert from "node:assert/strict";
import test from "node:test";
import {
  browserDiscordActivityTokenStore,
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
  const tokenStore = createTokenStore(calls);

  await completeDiscordActivityLogin({
    clientId: "client-id",
    tokenStore,
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
    ["writeToken", "fresh-token"],
    ["authenticate", { access_token: "fresh-token" }]
  ]);
});

test("restores an already-authenticated Activity session from a stored token", async () => {
  const calls: unknown[] = [];
  const tokenStore = createTokenStore(calls, "stored-token");

  await completeDiscordActivityLogin({
    clientId: "client-id",
    tokenStore,
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
    ["readToken"],
    ["authenticate", { access_token: "stored-token" }],
    ["establishSession", "stored-token"]
  ]);
});

test("falls back to normal Discord OAuth when already authenticated without a stored token", async () => {
  const calls: unknown[] = [];
  const tokenStore = createTokenStore(calls);

  await completeDiscordActivityLogin({
    clientId: "client-id",
    tokenStore,
    sdk: {
      commands: {
        authorize: async () => {
          throw { code: 4002, message: "Already authenticated" };
        },
        authenticate: async (input) => {
          calls.push(["authenticate", input]);
          return { access_token: "unexpected-token" };
        }
      }
    },
    exchangeCode: async () => {
      throw new Error("exchangeCode should not run without a fresh Activity code.");
    },
    establishSession: async (accessToken) => {
      calls.push(["establishSession", accessToken]);
    },
    fallbackLogin: () => {
      calls.push(["fallbackLogin"]);
    }
  });

  assert.deepEqual(calls, [["readToken"], ["fallbackLogin"]]);
});

test("clears a stored token when Activity authentication rejects it", async () => {
  const calls: unknown[] = [];
  const tokenStore = createTokenStore(calls, "bad-token");

  await assert.rejects(
    completeDiscordActivityLogin({
      clientId: "client-id",
      tokenStore,
      sdk: {
        commands: {
          authorize: async () => {
            throw { code: 4002, message: "Already authenticated" };
          },
          authenticate: async (input) => {
            calls.push(["authenticate", input]);
            throw { code: 4009, message: "No access token provided" };
          }
        }
      },
      exchangeCode: async () => {
        throw new Error("exchangeCode should not run for an existing Activity session.");
      },
      establishSession: async (accessToken) => {
        calls.push(["establishSession", accessToken]);
      }
    }),
    /Discord Activity session restore failed/
  );

  assert.deepEqual(calls, [["readToken"], ["authenticate", { access_token: "bad-token" }], ["clearToken"]]);
});

test("browser token store handles unavailable local storage", () => {
  assert.equal(browserDiscordActivityTokenStore.read(), null);
  assert.doesNotThrow(() => browserDiscordActivityTokenStore.write("token"));
  assert.doesNotThrow(() => browserDiscordActivityTokenStore.clear());
});

function createTokenStore(calls: unknown[], initialToken: string | null = null) {
  let token = initialToken;

  return {
    read: () => {
      calls.push(["readToken"]);
      return token;
    },
    write: (nextToken: string) => {
      calls.push(["writeToken", nextToken]);
      token = nextToken;
    },
    clear: () => {
      calls.push(["clearToken"]);
      token = null;
    }
  };
}
