import Realm from 'realm';
import {
  ActiveUserDataScope,
  ACTIVE_USER_DATA_SCOPE_KEY,
  ActiveUserDataScopeProps,
} from '@/relisten/realm/models/user_library/scope';
import {
  DEFAULT_ANONYMOUS_DEVICE_ID,
  scopedUserDataPrimaryKey,
  userDataScopeId,
  UserDataScopeDescriptor,
  UserDataScopeKind,
} from '@/relisten/user_library/user_data_scope';

export interface SetActiveUserDataScopeOptions {
  activatedAt?: Date;
  displayName?: string;
}

function propsForDescriptor(
  descriptor: UserDataScopeDescriptor,
  options: SetActiveUserDataScopeOptions = {}
): ActiveUserDataScopeProps {
  const base = {
    key: ACTIVE_USER_DATA_SCOPE_KEY,
    scopeId: userDataScopeId(descriptor),
    scopeKind: descriptor.kind,
    displayName: options.displayName,
    lastActivatedAt: options.activatedAt ?? new Date(),
  };

  switch (descriptor.kind) {
    case UserDataScopeKind.Anonymous:
      return {
        ...base,
        deviceId: descriptor.deviceId ?? DEFAULT_ANONYMOUS_DEVICE_ID,
        userUuid: undefined,
        externalProvider: undefined,
        externalSubject: undefined,
      };
    case UserDataScopeKind.Authenticated:
      return {
        ...base,
        userUuid: descriptor.userUuid,
        deviceId: undefined,
        externalProvider: undefined,
        externalSubject: undefined,
      };
    case UserDataScopeKind.External:
      return {
        ...base,
        externalProvider: descriptor.provider,
        externalSubject: descriptor.subject,
        userUuid: undefined,
        deviceId: undefined,
      };
  }
}

export function getActiveUserDataScope(realm: Realm): ActiveUserDataScope | null {
  return ActiveUserDataScope.defaultObject(realm);
}

export function setActiveUserDataScope(
  realm: Realm,
  descriptor: UserDataScopeDescriptor,
  options?: SetActiveUserDataScopeOptions
): ActiveUserDataScope {
  const props = propsForDescriptor(descriptor, options);

  const write = () => {
    const existing = ActiveUserDataScope.defaultObject(realm);

    if (existing) {
      existing.scopeId = props.scopeId;
      existing.scopeKind = props.scopeKind;
      existing.userUuid = props.userUuid;
      existing.deviceId = props.deviceId;
      existing.externalProvider = props.externalProvider;
      existing.externalSubject = props.externalSubject;
      existing.displayName = props.displayName;
      existing.lastActivatedAt = props.lastActivatedAt;
      return existing;
    }

    return realm.create(ActiveUserDataScope, props);
  };

  return realm.isInTransaction ? write() : realm.write(write);
}

export function ensureAnonymousUserDataScope(
  realm: Realm,
  deviceId: string = DEFAULT_ANONYMOUS_DEVICE_ID
): ActiveUserDataScope {
  return (
    ActiveUserDataScope.defaultObject(realm) ??
    setActiveUserDataScope(realm, {
      kind: UserDataScopeKind.Anonymous,
      deviceId,
    })
  );
}

export function scopedRealmObjects(realm: Realm, modelName: string, scopeId: string) {
  return realm.objects(modelName).filtered('scopeId == $0', scopeId);
}

export function scopedRealmObjectForPrimaryKey(
  realm: Realm,
  modelName: string,
  scopeId: string,
  localId: string
) {
  return realm.objectForPrimaryKey(modelName, scopedUserDataPrimaryKey(scopeId, localId));
}
