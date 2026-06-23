import assert from "node:assert/strict";
import test from "node:test";
import { DiscordGuildMembershipRequiredError, requireDiscordGuildMembership } from "../src/auth.js";

test("rejects Discord login when guild membership is missing", () => {
  assert.throws(() => requireDiscordGuildMembership(null), DiscordGuildMembershipRequiredError);
});

test("returns Discord membership when the user belongs to the guild", () => {
  const member = { roles: ["admin-role"] };

  assert.equal(requireDiscordGuildMembership(member), member);
});
