import { useState } from 'react';
import { useAccount } from '@/relisten/accounts/account_context';
import type { AccountProvider } from '@/relisten/accounts/auth/account_auth_types';
import { accountErrorMessage } from '@/relisten/accounts/ui/account_error_notice';

/**
 * Signing in with Apple or Google, for the Account screen and the sign-in
 * sheet: which provider is opening, and the message when sign-in fails.
 * Resolves true once the account is signed in, false if sign-in was
 * cancelled or failed.
 */
export function useProviderSignIn() {
  const account = useAccount();
  const [openingProvider, setOpeningProvider] = useState<AccountProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (provider: AccountProvider) => {
    setError(null);
    account.clearError();
    setOpeningProvider(provider);

    let signedIn = false;
    try {
      signedIn = (await account.signIn(provider)) === 'signedIn';
    } catch (caught) {
      setError(accountErrorMessage(caught));
    }

    setOpeningProvider(null);
    return signedIn;
  };

  return { signIn, openingProvider, error };
}
