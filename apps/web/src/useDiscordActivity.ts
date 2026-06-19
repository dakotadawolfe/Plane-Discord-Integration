import { useEffect, useState } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";

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
      setState({ sdk: null, ready: false, embedded, error: null });
      return;
    }

    let cancelled = false;
    const sdk = new DiscordSDK(clientId);
    setState({ sdk, ready: false, embedded: true, error: null });

    sdk
      .ready()
      .then(() => {
        if (!cancelled) {
          setState({ sdk, ready: true, embedded: true, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
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
    };
  }, [clientId]);

  return state;
}
