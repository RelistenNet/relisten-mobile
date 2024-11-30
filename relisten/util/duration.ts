import dayjs from 'dayjs';

export const duration = (time: number) => {
  const internal = dayjs.duration(time, 'seconds');

  return internal.format('H[h]mm[m]');
};

export const trackDuration = (time: number) => {
  const internal = dayjs.duration(time, 'seconds');

  if (internal.hours() >= 1) return internal.format('H:mm:ss');
  if (internal.minutes() >= 1) return internal.format('m:ss');

  return dayjs.duration(time ?? 0, 'seconds').format('0:ss');
};
