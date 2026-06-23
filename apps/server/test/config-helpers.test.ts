import assert from "node:assert/strict";
import test from "node:test";
import { resolveHermesTaskModel } from "../src/config-helpers.js";

test("Hermes task model does not inherit the general Hermes model", () => {
  assert.equal(
    resolveHermesTaskModel({
      hermesModel: "hermes-agent",
      hermesTaskModel: undefined
    }),
    undefined
  );
});

test("Hermes task model uses the explicit task override when set", () => {
  assert.equal(
    resolveHermesTaskModel({
      hermesModel: "hermes-agent",
      hermesTaskModel: "gpt-5.5"
    }),
    "gpt-5.5"
  );
});
