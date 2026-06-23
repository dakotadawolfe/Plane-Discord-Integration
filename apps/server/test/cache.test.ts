import assert from "node:assert/strict";
import test from "node:test";
import { preventApiResponseCaching } from "../src/routes.js";

test("API responses are marked no-store", () => {
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
