import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { useMemo, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import Flex from '@/relisten/components/flex';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RowWithAction } from '@/relisten/components/row_with_action';
import { SectionHeader } from '@/relisten/components/section_header';
import {
  ActiveUserDataScope,
  ACTIVE_USER_DATA_SCOPE_KEY,
} from '@/relisten/realm/models/user_library/scope';
import { UserAuthSessionMetadata } from '@/relisten/realm/models/user_library/auth';
import { useObject, useQuery, useRealm } from '@/relisten/realm/schema';
import {
  currentUserLibrarySessionMetadata,
  UserLibraryDevelopmentAuthController,
} from '@/relisten/user_library/development_auth';
import { UserDataScopeKind } from '@/relisten/user_library/user_data_scope';
import { createUserLibrarySyncServices } from '@/relisten/user_library/user_library_sync_services';

export function DevelopmentUserLibraryAuthPanel() {
  if (!__DEV__) {
    return null;
  }

  return <DevelopmentUserLibraryAuthPanelContent />;
}

function DevelopmentUserLibraryAuthPanelContent() {
  const realm = useRealm();
  const activeScope = useObject(ActiveUserDataScope, ACTIVE_USER_DATA_SCOPE_KEY, [
    'scopeId',
    'scopeKind',
    'displayName',
  ]);
  useQuery(
    UserAuthSessionMetadata,
    (query) =>
      activeScope
        ? query.filtered('scopeId == $0 && signedOutAt == null', activeScope.scopeId)
        : query.filtered('scopeId == $0', '__no_active_scope__'),
    [activeScope?.scopeId]
  );
  const services = useMemo(() => createUserLibrarySyncServices(realm), [realm]);
  const controller = useMemo(
    () => new UserLibraryDevelopmentAuthController(realm, services.authSession),
    [realm, services.authSession]
  );
  const [username, setUsername] = useState('ios_simulator');
  const [error, setError] = useState<string | undefined>(undefined);
  const metadata = currentUserLibrarySessionMetadata(realm);
  const signedIn =
    activeScope?.scopeKind === UserDataScopeKind.Authenticated && !!metadata?.sessionUuid;

  const onSignIn = async () => {
    setError(undefined);

    try {
      await controller.signIn({
        username,
        deviceId: `${developmentPlatform()}-development-device`,
        deviceName: developmentDeviceName(),
        platform: developmentPlatform(),
      });
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : String(signInError));
    }
  };

  const onSignOut = async () => {
    setError(undefined);

    try {
      await controller.signOut();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : String(signOutError));
    }
  };

  return (
    <Flex column>
      <SectionHeader title="Relisten Account (Dev)" />

      <Flex column className="gap-4 p-4 pr-8">
        {signedIn ? (
          <RowWithAction
            title={`Signed in as ${metadata.displayName ?? metadata.username ?? activeScope.displayName}`}
            subtitle={metadata.deviceId ? `Device ${metadata.deviceId}` : undefined}
          >
            <RelistenButton intent="outline" asyncOnPress={onSignOut} automaticLoadingIndicator>
              Sign Out
            </RelistenButton>
          </RowWithAction>
        ) : (
          <RowWithAction
            title="Development Sign In"
            subtitle="Uses the local user-library API development session endpoint"
            className="items-start"
          >
            <View className="min-w-44 gap-2">
              <TextInput
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                className="rounded-md border border-white/20 px-3 py-2 text-white"
              />
              <RelistenButton asyncOnPress={onSignIn} automaticLoadingIndicator>
                Sign In
              </RelistenButton>
            </View>
          </RowWithAction>
        )}

        {error && <RelistenText className="text-sm text-red-300">{error}</RelistenText>}
      </Flex>
    </Flex>
  );
}

function developmentPlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') {
    return Platform.OS;
  }

  return 'ios';
}

function developmentDeviceName() {
  return (
    [Device.deviceName, Application.nativeApplicationVersion].filter((part) => !!part).join(' ') ||
    'Relisten Development Device'
  );
}
