export interface AccountTransitionEffects {
  beforeLeavingAuthenticatedScope(): Promise<void>;
}
