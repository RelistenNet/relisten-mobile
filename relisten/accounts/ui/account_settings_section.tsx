import { useAccount } from '@/relisten/accounts/account_context';
import Flex from '@/relisten/components/flex';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RowWithAction } from '@/relisten/components/row_with_action';
import { SectionHeader } from '@/relisten/components/section_header';
import { Link } from 'expo-router';

export function AccountSettingsSection() {
  const { pendingUsername, profile, status } = useAccount();
  const signedIn = status === 'signedIn' && profile;
  const title = signedIn ? `@${profile.username}` : 'Relisten account';
  const subtitle = signedIn
    ? pendingUsername
      ? `@${pendingUsername} is waiting to sync.`
      : profile.usernameReviewNeeded
        ? 'Review your public username and manage this account.'
        : 'Check favorites sync, change your username, or sign out.'
    : 'Sign in to sync favorites between devices.';

  return (
    <Flex column>
      <SectionHeader title="Account" />
      <Flex column className="gap-4 p-4 pr-8">
        <RowWithAction title={title} subtitle={subtitle}>
          <Link href="/relisten/account" asChild>
            <RelistenButton intent="outline" disabled={status === 'restoring'}>
              {signedIn ? 'Manage' : 'Sign in'}
            </RelistenButton>
          </Link>
        </RowWithAction>
      </Flex>
    </Flex>
  );
}
