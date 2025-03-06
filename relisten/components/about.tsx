import Flex from '@/relisten/components/flex';
import { SectionHeader } from '@/relisten/components/section_header';
import { RowWithAction } from '@/relisten/components/row_with_action';
import { RelistenButton } from '@/relisten/components/relisten_button';
import * as Linking from 'expo-linking';
import * as Sentry from '@sentry/react-native';
import * as StoreReview from 'expo-store-review';

/*
- [ ]
    - [ ]  about
    - [ ]  thanks/FOSS credits
    - [ ]  rate the app
    - [ ]  what's new/changelog
    - [ ]  support links to discord/email
 */

export function RelistenAbout() {
  return (
    <Flex column>
      <SectionHeader title="About" />

      <Flex column className="gap-4 p-4">
        <RowWithAction
          title="Built by the team at relisten.net"
          subtitle="This app was written by Alec Gorge, with help from Daniel Saewitz and Thenlie"
        >
          <RelistenButton onPress={() => Linking.openURL('https://relisten.net')}>
            relisten.net
          </RelistenButton>
        </RowWithAction>
        <RowWithAction
          title="Free and open source on Github"
          subtitle="This app is free and open-source under the MIT license at github.com/relistennet/relisten-mobile"
        >
          <RelistenButton
            onPress={() => Linking.openURL('https://github.com/relistennet/relisten-mobile')}
          >
            Open Github
          </RelistenButton>
        </RowWithAction>
        <RowWithAction
          title="Feedback"
          subtitle="You can submit feedback in-app, via email (team@relisten.net) or on Discord"
        >
          <Flex column className="gap-2">
            <RelistenButton onPress={() => Sentry.showFeedbackWidget()}>
              Submit feedback
            </RelistenButton>
            <RelistenButton onPress={() => Linking.openURL('mailto:team@relisten.net')}>
              Email us
            </RelistenButton>
            <RelistenButton onPress={() => Linking.openURL('https://discord.gg/TSaj6vU')}>
              Join Discord
            </RelistenButton>
          </Flex>
        </RowWithAction>
        <RowWithAction
          title="Ratings & reviews"
          subtitle="Ratings and reviews are never expected, but it helps give us motivation to build this app 💪"
        >
          <RelistenButton onPress={() => StoreReview.requestReview()}>
            Leave a review
          </RelistenButton>
        </RowWithAction>
      </Flex>
    </Flex>
  );
}
