import { RelistenText } from '@/relisten/components/relisten_text';
import dayjs from 'dayjs';
import { type ReactNode } from 'react';
import TimeAgo, { type Formatter, type Unit } from 'react-timeago';

const compactPlaybackTime: Formatter = (value, unit: Unit) => {
  switch (unit) {
    case 'second':
      return 'now';
    case 'minute':
      return `${value} ${value === 1 ? 'min' : 'mins'} ago`;
    case 'hour':
      return `${value}hr ago`;
    case 'day':
      return `${value}d ago`;
    case 'week':
      return `${value}wk ago`;
    case 'month':
      return `${value}mo ago`;
    case 'year':
      return `${value}yr ago`;
  }
};

export function spokenRelativePlaybackTime(date: Date) {
  return `played ${dayjs(date).fromNow()}`;
}

function RelativePlaybackTimeText({ children }: { children?: ReactNode }) {
  return (
    <RelistenText
      className="text-sm text-gray-300"
      maxFontSizeMultiplier={1.6}
      numberOfLines={1}
      selectable={false}
    >
      {children}
    </RelistenText>
  );
}

export function RelativePlaybackTime({ date }: { date: Date }) {
  return (
    <TimeAgo
      component={RelativePlaybackTimeText}
      date={date}
      formatter={compactPlaybackTime}
      minPeriod={30}
    />
  );
}
