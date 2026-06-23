type DiagnosticValue = string | number | boolean | null;

export interface ClientDiagnosticPayload {
  event: string;
  href?: string;
  userAgent?: string;
  details: Record<string, DiagnosticValue>;
}

export function buildClientDiagnosticPayload(
  event: string,
  details: Record<string, unknown> = {},
  browser: Pick<Window, "location" | "navigator"> | null = typeof window === "undefined" ? null : window
): ClientDiagnosticPayload {
  return {
    event: truncate(event, 80),
    href: browser ? truncate(browser.location.href, 500) : undefined,
    userAgent: browser ? truncate(browser.navigator.userAgent, 240) : undefined,
    details: sanitizeDiagnosticDetails(details)
  };
}

export function reportClientDiagnostic(event: string, details: Record<string, unknown> = {}): void {
  const payload = buildClientDiagnosticPayload(event, details);
  const body = JSON.stringify(payload);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });

      if (navigator.sendBeacon("/api/client-diagnostics", blob)) {
        return;
      }
    }

    void fetch("/api/client-diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "include",
      keepalive: true
    }).catch(() => undefined);
  } catch {
    // Diagnostics should never affect the user-facing app.
  }
}

function sanitizeDiagnosticDetails(details: Record<string, unknown>): Record<string, DiagnosticValue> {
  return Object.fromEntries(
    Object.entries(details)
      .filter(([key]) => !/token|secret|cookie|authorization|password/i.test(key))
      .slice(0, 20)
      .map(([key, value]) => [truncate(key, 80), sanitizeDiagnosticValue(value)])
  );
}

function sanitizeDiagnosticValue(value: unknown): DiagnosticValue {
  if (typeof value === "string") {
    return truncate(value, 240);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "boolean" || value === null) {
    return value;
  }

  if (value instanceof Error) {
    return truncate(value.message, 240);
  }

  if (value === undefined) {
    return null;
  }

  try {
    return truncate(JSON.stringify(value), 240);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
