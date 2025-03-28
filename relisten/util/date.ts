import dayjs from 'dayjs';

export const getShowDate = (date: string) => {
  const internal = dayjs(date);

  return internal.format('YYYY-MM-DD');
};
