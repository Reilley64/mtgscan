const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const dayOfYearFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

export function shownDay(time: string) {
  return dayFormat.format(new Date(time));
}

export function shownDayOfYear(time: string) {
  return dayOfYearFormat.format(new Date(time));
}
