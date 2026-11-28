import { MaterialIcons } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { PopularitySnapshot, popularityPlaysLabel } from '@/relisten/realm/models/popularity';
import { View } from 'react-native';

const getMomentumBucket = (momentumScore?: number) => {
  if (momentumScore === undefined || momentumScore === null) {
    return undefined;
  }

  if (momentumScore < 0.25) {
    return 1;
  }

  if (momentumScore < 0.5) {
    return 2;
  }

  if (momentumScore < 0.75) {
    return 3;
  }

  return 4;
};

const formatMomentumPercent = (score?: number) => {
  if (score === undefined || score === null) {
    return undefined;
  }

  const percent = Math.round(score * 100);
  const clamped = Math.max(0, Math.min(100, percent));

  return `${clamped}%`;
};

interface PopularityIndicatorProps {
  popularity?: PopularitySnapshot | null;
  isTrendingSort: boolean;
  cn?: string;
  iconSize?: number;
  showIcon?: boolean;
}

export const PopularityIndicator = ({
  popularity,
  isTrendingSort,
  cn,
  iconSize = 16,
  showIcon = true,
}: PopularityIndicatorProps) => {
  const momentumScore = popularity?.momentumScore;
  const bucket = getMomentumBucket(momentumScore);
  let detailText: string | undefined;

  if (isTrendingSort) {
    detailText = formatMomentumPercent(momentumScore);
  } else {
    detailText = popularityPlaysLabel(popularity);
  }

  if (!bucket && !detailText) {
    return null;
  }

  const icon =
    bucket &&
    {
      1: 'trending-down' as ComponentProps<typeof MaterialIcons>['name'],
      2: undefined,
      3: undefined,
      4: 'trending-up' as ComponentProps<typeof MaterialIcons>['name'],
    }[bucket];

  if (isTrendingSort) {
    return (
      <Flex cn={cn ?? 'items-center'}>
        {detailText ? (
          <RelistenText className="text-xs text-gray-400 pr-1">{detailText}</RelistenText>
        ) : null}
        {showIcon && icon ? <MaterialIcons name={icon} color="white" size={iconSize} /> : null}
      </Flex>
    );
  }

  return (
    <Flex cn={cn ?? 'items-center'}>
      {showIcon && icon ? (
        <View className="pr-1">
          <MaterialIcons name={icon} color="white" size={iconSize} />
        </View>
      ) : null}
      {detailText ? <RelistenText className="text-xs">{detailText}</RelistenText> : null}
    </Flex>
  );
};
