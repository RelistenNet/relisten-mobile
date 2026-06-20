export const DEFAULT_ANONYMOUS_DEVICE_ID = 'local-device';

export enum UserDataScopeKind {
  Anonymous = 'anonymous',
  Authenticated = 'user',
  External = 'external',
}

export interface AnonymousUserDataScopeDescriptor {
  kind: UserDataScopeKind.Anonymous;
  deviceId?: string;
}

export interface AuthenticatedUserDataScopeDescriptor {
  kind: UserDataScopeKind.Authenticated;
  userUuid: string;
}

export interface ExternalUserDataScopeDescriptor {
  kind: UserDataScopeKind.External;
  provider: string;
  subject: string;
}

export type UserDataScopeDescriptor =
  | AnonymousUserDataScopeDescriptor
  | AuthenticatedUserDataScopeDescriptor
  | ExternalUserDataScopeDescriptor;

function normalizedScopePart(value: string, label: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${label} cannot be empty`);
  }

  return encodeURIComponent(trimmed);
}

export function anonymousUserDataScopeId(deviceId: string = DEFAULT_ANONYMOUS_DEVICE_ID): string {
  return `${UserDataScopeKind.Anonymous}:${normalizedScopePart(deviceId, 'deviceId')}`;
}

export function authenticatedUserDataScopeId(userUuid: string): string {
  return `${UserDataScopeKind.Authenticated}:${normalizedScopePart(userUuid, 'userUuid')}`;
}

export function externalUserDataScopeId(provider: string, subject: string): string {
  return [
    UserDataScopeKind.External,
    normalizedScopePart(provider, 'provider'),
    normalizedScopePart(subject, 'subject'),
  ].join(':');
}

export function userDataScopeId(descriptor: UserDataScopeDescriptor): string {
  switch (descriptor.kind) {
    case UserDataScopeKind.Anonymous:
      return anonymousUserDataScopeId(descriptor.deviceId);
    case UserDataScopeKind.Authenticated:
      return authenticatedUserDataScopeId(descriptor.userUuid);
    case UserDataScopeKind.External:
      return externalUserDataScopeId(descriptor.provider, descriptor.subject);
  }
}

export function scopedUserDataPrimaryKey(scopeId: string, localId: string): string {
  return `${normalizedScopePart(scopeId, 'scopeId')}:${normalizedScopePart(localId, 'localId')}`;
}
