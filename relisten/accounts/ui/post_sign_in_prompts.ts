import { useAccount } from '@/relisten/accounts/account_context';
import { accountErrorMessage } from '@/relisten/accounts/ui/account_error_notice';
import { showAnonymousFavoritesImportPrompt } from '@/relisten/accounts/ui/anonymous_favorites_import_prompt';
import { claimInitialUsernameReviewPresentation } from '@/relisten/accounts/ui/initial_username_review';
import { useAnonymousFavoriteImport } from '@/relisten/library/favorite_hooks';
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

type PromptError = {
  message: string;
  userUuid: string;
};

/**
 * Sequences the two one-time decisions after sign-in. Username review comes first so the
 * favorites prompt can name the account the listener just reviewed. Keeping this state
 * machine outside AccountScreen also makes normal account actions independent of onboarding.
 */
export function usePostSignInPrompts() {
  const account = useAccount();
  const anonymousImport = useAnonymousFavoriteImport();
  const { defer: deferAnonymousFavorites, importToActiveAccount: importAnonymousFavorites } =
    anonymousImport;
  const router = useRouter();
  const isFocused = useIsFocused();
  const checkedInitialReviewUser = useRef<string | null>(null);
  const importAfterReviewUser = useRef<string | null>(null);
  const promptedImportKey = useRef<string | null>(null);
  const [reviewCheckCompletedForUser, setReviewCheckCompletedForUser] = useState<string | null>(
    null
  );
  const [promptError, setPromptError] = useState<PromptError | null>(null);

  const importFavorites = useCallback(async () => {
    const userUuid = account.profile?.userUuid;
    if (!userUuid) {
      return;
    }

    setPromptError(null);
    try {
      await importAnonymousFavorites();
    } catch (error) {
      setPromptError({ message: accountErrorMessage(error), userUuid });
    }
  }, [account.profile?.userUuid, importAnonymousFavorites]);

  const deferFavorites = useCallback(async () => {
    const userUuid = account.profile?.userUuid;
    if (!userUuid) {
      return;
    }

    setPromptError(null);
    try {
      await deferAnonymousFavorites();
    } catch (error) {
      setPromptError({ message: accountErrorMessage(error), userUuid });
    }
  }, [account.profile?.userUuid, deferAnonymousFavorites]);

  const presentImportPrompt = useCallback(() => {
    if (!account.profile || anonymousImport.anonymousFavoriteCount === 0) {
      return;
    }

    showAnonymousFavoritesImportPrompt({
      count: anonymousImport.anonymousFavoriteCount,
      username: account.profile.username,
      onImport: importFavorites,
      onDefer: deferFavorites,
    });
  }, [account.profile, anonymousImport.anonymousFavoriteCount, deferFavorites, importFavorites]);

  const presentImportPromptOnce = useCallback(() => {
    if (!account.profile || anonymousImport.state !== 'available') {
      return;
    }

    const promptKey = `${account.profile.userUuid}:${anonymousImport.anonymousFavoriteCount}`;
    if (promptedImportKey.current === promptKey) {
      return;
    }

    promptedImportKey.current = promptKey;
    presentImportPrompt();
  }, [
    account.profile,
    anonymousImport.anonymousFavoriteCount,
    anonymousImport.state,
    presentImportPrompt,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (
        !account.profile ||
        importAfterReviewUser.current !== account.profile.userUuid ||
        anonymousImport.state === 'notApplicable'
      ) {
        return;
      }

      importAfterReviewUser.current = null;
      presentImportPromptOnce();
    }, [account.profile, anonymousImport.state, presentImportPromptOnce])
  );

  useEffect(() => {
    if (account.status !== 'signedIn' || !account.profile) {
      checkedInitialReviewUser.current = null;
      importAfterReviewUser.current = null;
      setReviewCheckCompletedForUser(null);
      return;
    }

    const { userUuid, usernameReviewNeeded } = account.profile;
    if (!usernameReviewNeeded) {
      setReviewCheckCompletedForUser(userUuid);
      return;
    }
    if (checkedInitialReviewUser.current === userUuid) {
      return;
    }

    checkedInitialReviewUser.current = userUuid;
    let active = true;

    void claimInitialUsernameReviewPresentation(userUuid).then((shouldPresent) => {
      if (!active) {
        return;
      }

      setReviewCheckCompletedForUser(userUuid);
      if (!shouldPresent) {
        return;
      }

      importAfterReviewUser.current = userUuid;
      router.push('/relisten/account/username');
    });

    return () => {
      active = false;
    };
  }, [account.profile?.userUuid, account.profile?.usernameReviewNeeded, account.status, router]);

  useEffect(() => {
    if (
      account.status !== 'signedIn' ||
      !account.profile ||
      !isFocused ||
      importAfterReviewUser.current === account.profile.userUuid ||
      (account.profile.usernameReviewNeeded &&
        reviewCheckCompletedForUser !== account.profile.userUuid) ||
      anonymousImport.state !== 'available'
    ) {
      return;
    }

    presentImportPromptOnce();
  }, [
    account.profile,
    account.status,
    anonymousImport.state,
    isFocused,
    presentImportPromptOnce,
    reviewCheckCompletedForUser,
  ]);

  return {
    anonymousImport,
    errorMessage:
      promptError && promptError.userUuid === account.profile?.userUuid
        ? promptError.message
        : undefined,
    presentImportPrompt,
  };
}
