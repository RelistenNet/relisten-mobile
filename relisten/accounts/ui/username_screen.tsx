import { useAccount } from '@/relisten/accounts/account_context';
import {
  AccountErrorNotice,
  accountErrorMessage,
} from '@/relisten/accounts/ui/account_error_notice';
import Flex from '@/relisten/components/flex';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

function changeAvailableAt(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function UsernameScreen() {
  const account = useAccount();
  const router = useRouter();
  const [username, setUsername] = useState(
    account.pendingUsername ?? account.profile?.username ?? ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const profileIdentity = account.profile
    ? `${account.profile.userUuid}:${account.profile.usernameVersion}`
    : null;
  const previousProfileIdentity = useRef(profileIdentity);

  useEffect(() => {
    const profileChanged = previousProfileIdentity.current !== profileIdentity;
    previousProfileIdentity.current = profileIdentity;

    if (account.pendingUsername) {
      setUsername(account.pendingUsername);
    } else if (profileChanged && account.profile?.username) {
      setUsername(account.profile.username);
    }
  }, [account.pendingUsername, account.profile?.username, profileIdentity]);

  const normalizedUsername = username.toLowerCase();
  const formatIsValid = USERNAME_PATTERN.test(normalizedUsername);
  const usernameChanged = normalizedUsername !== account.profile?.username;
  const isReview = account.profile?.usernameReviewNeeded === true;
  const hasPendingUsername = account.pendingUsername !== null;
  const nextChangeAt = useMemo(
    () => changeAvailableAt(account.profile?.usernameChangeAvailableAt),
    [account.profile?.usernameChangeAvailableAt]
  );
  const changeIsCoolingDown = !isReview && !!nextChangeAt && nextChangeAt.getTime() > Date.now();
  const canSubmit =
    formatIsValid &&
    (!changeIsCoolingDown || hasPendingUsername) &&
    !submitting &&
    (hasPendingUsername
      ? normalizedUsername === account.pendingUsername
      : isReview || usernameChanged);

  if (account.status === 'restoring') {
    return (
      <View className="flex-1 items-center justify-center bg-relisten-blue-950">
        <ActivityIndicator color="white" size="large" />
      </View>
    );
  }

  if (account.status !== 'signedIn' || !account.profile) {
    return <Redirect href="/relisten/account" />;
  }

  const saveUsername = async () => {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setActionError(null);
    account.clearError();

    try {
      await account.updateUsername(normalizedUsername);
      router.dismissTo('/relisten/account');
    } catch (error) {
      setActionError(accountErrorMessage(error));
    }

    setSubmitting(false);
  };

  const onChangeText = (value: string) => {
    account.clearError();
    setActionError(null);
    setUsername(value.toLowerCase());
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-relisten-blue-950"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Flex column className="gap-5">
          <View className="gap-2">
            <RelistenText className="text-3xl font-bold">
              {isReview ? 'Choose how you appear on Relisten' : 'Change username'}
            </RelistenText>
            <RelistenText className="text-gray-300">
              This is your public Relisten username. It is not used to sign in.
            </RelistenText>
          </View>

          <View className="gap-2">
            <RelistenText className="text-sm font-semibold text-gray-300">Username</RelistenText>
            <View className="flex-row items-center rounded-lg border border-relisten-blue-700 bg-relisten-blue-900 px-4">
              <RelistenText className="text-lg text-gray-400" selectable={false}>
                @
              </RelistenText>
              <TextInput
                accessibilityLabel="Relisten username"
                autoCapitalize="none"
                autoCorrect={false}
                className="min-h-12 flex-1 py-3 text-lg text-white"
                editable={!hasPendingUsername && !submitting}
                maxLength={30}
                onChangeText={onChangeText}
                placeholder="username"
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
                value={username}
                onSubmitEditing={() => void saveUsername()}
              />
            </View>
            <RelistenText className="text-sm text-gray-400">
              Use 3-30 letters, numbers, or underscores.
            </RelistenText>
          </View>

          {!formatIsValid && username.length > 0 && (
            <AccountErrorNotice message="Use 3-30 letters, numbers, or underscores." />
          )}

          {hasPendingUsername && (
            <RelistenText className="text-sm text-amber-300">
              @{account.pendingUsername} is saved on this device and waiting to sync.
            </RelistenText>
          )}

          {changeIsCoolingDown && nextChangeAt && (
            <RelistenText className="text-sm text-amber-300">
              You can change your username again after {nextChangeAt.toLocaleDateString()}.
            </RelistenText>
          )}

          {(actionError || account.error) && (
            <AccountErrorNotice message={actionError ?? accountErrorMessage(account.error)} />
          )}

          <RelistenButton
            automaticLoadingIndicator
            disabled={!canSubmit}
            intent="primary"
            asyncOnPress={saveUsername}
            fill
            size="lg"
          >
            {hasPendingUsername
              ? `Try @${account.pendingUsername} again`
              : isReview
                ? usernameChanged
                  ? `Use @${normalizedUsername}`
                  : `Keep @${account.profile.username}`
                : 'Change username'}
          </RelistenButton>

          {isReview && (
            <RelistenButton
              disabled={submitting}
              intent="outline"
              onPress={() => router.dismissTo('/relisten/account')}
            >
              {hasPendingUsername ? 'Finish later' : `Use @${account.profile.username} for now`}
            </RelistenButton>
          )}
        </Flex>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
