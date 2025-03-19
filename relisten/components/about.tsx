import Flex from '@/relisten/components/flex';
import { SectionHeader } from '@/relisten/components/section_header';
import { RowWithAction } from '@/relisten/components/row_with_action';
import { RelistenButton } from '@/relisten/components/relisten_button';
import * as Linking from 'expo-linking';
import * as Sentry from '@sentry/react-native';
import * as StoreReview from 'expo-store-review';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { View, ViewProps } from 'react-native';
import * as Application from 'expo-application';
import { tw } from '@/relisten/util/tw';

const openEmail = async () => {
  const url = 'mailto:team@relisten.net';
  if (await Linking.canOpenURL(url)) {
    Linking.openURL(url);
  }
};

export function SocialButtons({ className, ...props }: ViewProps) {
  return (
    <Flex className={tw('w-full flex-wrap', className)} {...props}>
      <View className="basis-1/2 pb-1 pr-1">
        <RelistenButton
          onPress={openEmail}
          icon={<MaterialIcons name="email" size={16} color="white" />}
          textClassName="text-xs"
        >
          team@relisten.net
        </RelistenButton>
      </View>
      <View className="basis-1/2 pb-1 pl-1">
        <RelistenButton
          onPress={() => Linking.openURL('https://discord.gg/TSaj6vU')}
          icon={<MaterialIcons name="discord" size={16} color="white" />}
        >
          Discord
        </RelistenButton>
      </View>
      <View className="basis-1/2 pr-1 pt-1">
        <RelistenButton
          onPress={() => Linking.openURL('https://instagram.com/relistenapp')}
          icon={<MaterialCommunityIcons name="instagram" size={16} color="white" />}
        >
          @relistenapp
        </RelistenButton>
      </View>
      <View className="basis-1/2 pl-1 pt-1">
        <RelistenButton
          onPress={() => Linking.openURL('https://twitter.com/relistenapp')}
          icon={<MaterialCommunityIcons name="twitter" size={16} color="white" />}
        >
          @relistenapp
        </RelistenButton>
      </View>
    </Flex>
  );
}

export function RelistenAbout() {
  const userFacingVersion = Application.nativeApplicationVersion;
  const buildVersion = Application.nativeBuildVersion;

  return (
    <Flex column>
      <SectionHeader title={`Relisten ${userFacingVersion} (${buildVersion})`} />

      <Flex column className="gap-4 p-4">
        <SocialButtons className="pb-2 pr-4" />
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
            <RelistenButton onPress={openEmail}>Email us</RelistenButton>
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
