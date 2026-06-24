import assert from "node:assert/strict";
import test from "node:test";
import { sourceSyncActions, sourceSyncSuccessMessage } from "../src/source-sync-actions.js";

test("source sync supports applying built app changes from the UI", () => {
  assert.deepEqual(sourceSyncActions, ["pull", "push", "restart", "apply"]);
});

test("apply action explains that it builds before restart", () => {
  assert.equal(sourceSyncSuccessMessage("apply"), "Built Project Desk and restarted the app.");
});
