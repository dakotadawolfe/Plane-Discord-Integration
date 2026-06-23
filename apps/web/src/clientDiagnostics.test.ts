import assert from "node:assert/strict";
import test from "node:test";
import { buildClientDiagnosticPayload } from "./clientDiagnostics";

test("client diagnostics redact sensitive detail keys", () => {
  const payload = buildClientDiagnosticPayload(
    "activity-login",
    {
      step: "restore",
      accessToken: "do-not-log",
      session_secret: "do-not-log",
      ok: true
    },
    null
  );

  assert.deepEqual(payload, {
    event: "activity-login",
    href: undefined,
    userAgent: undefined,
    details: {
      step: "restore",
      ok: true
    }
  });
});

test("client diagnostics bound long values", () => {
  const payload = buildClientDiagnosticPayload(
    "x".repeat(120),
    {
      message: "m".repeat(300)
    },
    {
      location: { href: `https://example.com/${"p".repeat(600)}` } as Location,
      navigator: { userAgent: "u".repeat(300) } as Navigator
    }
  );

  assert.equal(payload.event.length, 80);
  assert.equal(payload.href?.length, 500);
  assert.equal(payload.userAgent?.length, 240);
  assert.equal(String(payload.details.message).length, 240);
});
