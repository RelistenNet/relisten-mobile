import { RelistenText } from '@/relisten/components/relisten_text';
import dayjs from 'dayjs';
import { type ReactNode } from 'react';
import TimeAgo, { type Formatter, type Unit } from 'react-timeago';

const COMPACT_UNITS: Record<Exclude<Unit, 'second'>, string> = {
  minute: 'min',
  hour: 'hr',
  day: 'd',
  week: 'wk',
  month: 'mo',
  year: 'yr',
};

const compactPlaybackTime: Formatter = (value, unit) =>
  unit === 'second' ? 'now' : `${value} ${COMPACT_UNITS[unit]}`;

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
