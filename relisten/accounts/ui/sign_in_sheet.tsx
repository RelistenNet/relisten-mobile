import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAccount } from '@/relisten/accounts/account_context';
import type { AccountProvider } from '@/relisten/accounts/auth/account_auth_types';
import { accountErrorMessage } from '@/relisten/accounts/ui/account_error_notice';
import { claimInitialUsernameReviewPresentation } from '@/relisten/accounts/ui/initial_username_review';
import { useProviderSignIn } from '@/relisten/accounts/ui/provider_sign_in';
import { SignedOutAccountScreen } from '@/relisten/accounts/ui/signed_out_account_screen';
import { UsernameScreen } from '@/relisten/accounts/ui/username_screen';

/**
 * Sign-in over the screen that asked for it, so the listener stays where they
 * were. The screen that opened it finishes its action once the account is
 * signed in (see `usePlaylistReaderActions`).
 *
 * A first sign-in reviews the username here before closing. That claims the
 * one-time review, so the Account screen won't show it again; it still offers
 * to import favorites saved before signing in the next time it opens.
 */
export function SignInSheet() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const router = useRouter();
  const account = useAccount();
  const providerSignIn = useProviderSignIn();
  const [step, setStep] = useState<'signIn' | 'finishing' | 'username'>('signIn');
  const profile = account.status === 'signedIn' ? account.profile : null;
  const userId = profile?.userId;
  const reviewNeeded = profile?.usernameReviewNeeded === true;

  // After sign-in, review a new account's username once, then close. Keyed on
  // the user, not the profile object, so a profile refresh mid-claim can't
  // claim the review a second time and skip it.
  useEffect(() => {
    if (step !== 'finishing' || !userId) {
      return;
    }

    let active = true;
    const review = reviewNeeded
      ? claimInitialUsernameReviewPresentation(userId)
      : Promise.resolve(false);
    void review.then((shouldReview) => {
      if (!active) {
        return;
      }
      if (shouldReview) {
        setStep('username');
      } else {
        router.back();
      }
    });

    return () => {
      active = false;
    };
  }, [step, userId, reviewNeeded, router]);

  const signIn = async (provider: AccountProvider) => {
    if (await providerSignIn.signIn(provider)) {
      setStep('finishing');
    }
  };

  if (step === 'username') {
    return <UsernameScreen onDone={() => router.back()} />;
  }

  return (
    <SignedOutAccountScreen
      title={reason ? `Sign in to ${reason}` : undefined}
      busy={account.status === 'signingIn' || step === 'finishing'}
      errorMessage={
        providerSignIn.error ?? (account.error ? accountErrorMessage(account.error) : undefined)
      }
      onSignIn={signIn}
      openingProvider={providerSignIn.openingProvider}
      // Closing signed out drops the action that asked for the sheet.
      onCancel={() => router.back()}
    />
  );
}
