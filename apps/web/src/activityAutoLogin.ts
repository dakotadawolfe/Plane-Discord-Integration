export interface ActivityAutoLoginState {
  loadingMe: boolean;
  hasUser: boolean;
  embedded: boolean;
  ready: boolean;
  hasSdk: boolean;
  hasClientId: boolean;
  attempted: boolean;
  inFlight: boolean;
}

export function shouldAutoStartActivityLogin(state: ActivityAutoLoginState): boolean {
  return (
    !state.loadingMe &&
    !state.hasUser &&
    state.embedded &&
    state.ready &&
    state.hasSdk &&
    state.hasClientId &&
    !state.attempted &&
    !state.inFlight
  );
}
