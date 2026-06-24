import assert from "node:assert/strict";
import test from "node:test";
import { codexInlineStatusDisplay, taskNeedsApply } from "./codexStatusDisplay";

test("restart-required task status is presented as apply required", () => {
  assert.equal(taskNeedsApply("restart_required"), true);
  assert.deepEqual(codexInlineStatusDisplay("restart_required"), {
    className: "restart_required",
    label: "Apply required"
  });
});

test("succeeded task status is presented as AI complete", () => {
  assert.equal(taskNeedsApply("succeeded"), false);
  assert.deepEqual(codexInlineStatusDisplay("succeeded"), {
    className: "succeeded",
    label: "AI complete"
  });
});
