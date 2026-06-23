import { useEffect, useState } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";
import { reportClientDiagnostic } from "./clientDiagnostics";

export interface DiscordActivityState {
  sdk: DiscordSDK | null;
  ready: boolean;
  embedded: boolean;
  error: string | null;
}

export function useDiscordActivity(clientId?: string) {
  const [state, setState] = useState<DiscordActivityState>({
    sdk: null,
    ready: false,
    embedded: false,
    error: null
  });

  useEffect(() => {
    const embedded = window.parent !== window;

    if (!clientId || !embedded) {
      reportClientDiagnostic("activity-sdk-skipped", { embedded, hasClientId: Boolean(clientId) });
      setState({ sdk: null, ready: false, embedded, error: null });
      return;
    }

    let cancelled = false;
    const sdk = new DiscordSDK(clientId);
    reportClientDiagnostic("activity-sdk-init", {
      platform: sdk.platform,
      hasGuildId: Boolean(sdk.guildId),
      hasChannelId: Boolean(sdk.channelId)
    });
    setState({ sdk, ready: false, embedded: true, error: null });

    const readyTimeout = window.setTimeout(() => {
      if (!cancelled) {
        reportClientDiagnostic("activity-sdk-ready-timeout", {
          platform: sdk.platform,
          hasGuildId: Boolean(sdk.guildId),
          hasChannelId: Boolean(sdk.channelId)
        });
        setState({
          sdk,
          ready: false,
          embedded: true,
          error: "Discord Activity did not become ready. Close and reopen the Activity, then try again."
        });
      }
    }, 8000);

    sdk
      .ready()
      .then(() => {
        if (!cancelled) {
          window.clearTimeout(readyTimeout);
          reportClientDiagnostic("activity-sdk-ready", {
            platform: sdk.platform,
            hasGuildId: Boolean(sdk.guildId),
            hasChannelId: Boolean(sdk.channelId)
          });
          setState({ sdk, ready: true, embedded: true, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          window.clearTimeout(readyTimeout);
          reportClientDiagnostic("activity-sdk-ready-error", {
            message: error instanceof Error ? error.message : error
          });
          setState({
            sdk: null,
            ready: false,
            embedded: true,
            error: error instanceof Error ? error.message : "Discord Activity SDK failed to initialize."
          });
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(readyTimeout);
    };
  }, [clientId]);

  return state;
}
