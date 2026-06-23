import assert from "node:assert/strict";
import test from "node:test";
import type { SessionUser } from "../src/domain.js";
import { createActivitySessionToken, verifyActivitySessionToken } from "../src/activity-session.js";

const user: SessionUser = {
  id: "123456789",
  username: "dakota",
  displayName: "Dakota",
  avatarUrl: null,
  tagName: "Dakota",
  notificationPreferences: {},
  roles: ["admin"],
  isAdmin: true
};

test("activity session tokens round-trip signed session users", () => {
  const token = createActivitySessionToken(user, "test-secret", 1000, 60_000);

  assert.deepEqual(verifyActivitySessionToken(token, "test-secret", 1001), user);
});

test("activity session tokens reject tampered signatures", () => {
  const token = createActivitySessionToken(user, "test-secret", 1000, 60_000);
  const tampered = `${token.slice(0, -1)}x`;

  assert.equal(verifyActivitySessionToken(tampered, "test-secret", 1001), null);
});

test("activity session tokens reject expired payloads", () => {
  const token = createActivitySessionToken(user, "test-secret", 1000, 60_000);

  assert.equal(verifyActivitySessionToken(token, "test-secret", 61_001), null);
});
