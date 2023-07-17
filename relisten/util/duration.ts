import dayjs from 'dayjs';

export const duration = (time: number, max?: number) => {
  const maxInternal = dayjs.duration(max, 'seconds');
  const internal = dayjs.duration(time, 'seconds');

  if (maxInternal.hours() >= 1) internal.format('HH:mm:ss');
  if (maxInternal.minutes() >= 10) internal.format('mm:ss');

  return dayjs.duration(time, 'seconds').format('m:ss');
};
