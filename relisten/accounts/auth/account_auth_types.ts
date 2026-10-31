export type AccountProvider = 'apple' | 'google';

export interface RefreshTokenEnvelope {
  version: 1;
  refreshToken: string;
  issuer: string;
  clientId: string;
  userId: string;
  nativeSessionId: string;
}

export interface PendingAuthTransaction {
  version: 1;
  transactionId: string;
  provider: AccountProvider;
  issuer: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: string;
  expiresAt: string;
}
