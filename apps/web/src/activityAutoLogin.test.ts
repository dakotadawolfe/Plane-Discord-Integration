import assert from "node:assert/strict";
import test from "node:test";
import { shouldAutoStartActivityLogin } from "./activityAutoLogin";

test("starts Activity login when embedded SDK is ready and no user session exists", () => {
  assert.equal(
    shouldAutoStartActivityLogin({
      loadingMe: false,
      hasUser: false,
      embedded: true,
      ready: true,
      hasSdk: true,
      hasClientId: true,
      attempted: false,
      inFlight: false
    }),
    true
  );
});

test("does not start Activity login while session check is still loading", () => {
  assert.equal(
    shouldAutoStartActivityLogin({
      loadingMe: true,
      hasUser: false,
      embedded: true,
      ready: true,
      hasSdk: true,
      hasClientId: true,
      attempted: false,
      inFlight: false
    }),
    false
  );
});

test("does not start Activity login after an attempt has already started", () => {
  assert.equal(
    shouldAutoStartActivityLogin({
      loadingMe: false,
      hasUser: false,
      embedded: true,
      ready: true,
      hasSdk: true,
      hasClientId: true,
      attempted: true,
      inFlight: false
    }),
    false
  );
});
