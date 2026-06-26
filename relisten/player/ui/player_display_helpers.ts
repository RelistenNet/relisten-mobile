const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const SHORT_MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

export function playerDisplayDate(displayDate: string) {
  const [year = '', month = '', day = ''] = displayDate.split('-');
  const monthName = LONG_MONTHS[Number(month) - 1];

  return monthName ? `${monthName} ${Number(day)}, ${year}` : displayDate;
}

export function playerPosterDate(displayDate: string) {
  const [year = '', month = '', day = ''] = displayDate.split('-');

  return {
    day,
    month: SHORT_MONTHS[Number(month) - 1] ?? month,
    year,
  };
}

export function playerQueueDate(displayDate: string) {
  const [year = '', month = '', day = ''] = displayDate.split('-');
  const uppercaseMonth = SHORT_MONTHS[Number(month) - 1];
  const monthName = uppercaseMonth
    ? `${uppercaseMonth[0]}${uppercaseMonth.slice(1).toLowerCase()}`
    : month;

  return `${monthName} ${Number(day)}, ${year}`;
}

export function playerDisplayTitle(title: string) {
  return title.replace(/\s*>\s*/g, ' > ');
}
