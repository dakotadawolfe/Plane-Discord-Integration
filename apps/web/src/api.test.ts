import assert from "node:assert/strict";
import test from "node:test";
import { getMe } from "./api";
import { browserProjectDeskActivitySessionTokenStore } from "./discordActivityAuth";

test("API requests include the stored Project Desk Activity session token", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const storage = new Map<string, string>();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    }
  });

  browserProjectDeskActivitySessionTokenStore.write("signed-session-token");

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(input, "/api/me");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer signed-session-token");

    return new Response(
      JSON.stringify({
        authenticated: false,
        user: null,
        planeFullBoardUrl: null,
        aiProvider: "disabled",
        dmFirst: true
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }) as typeof fetch;

  try {
    await getMe();
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  }
});
