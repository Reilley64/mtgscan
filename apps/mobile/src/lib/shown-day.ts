const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const dayAndMonthFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

export function shownDay(time: string) {
  return dayFormat.format(new Date(time));
}

export function shownDayAndMonth(time: string) {
  return dayAndMonthFormat.format(new Date(time));
}

const rateDayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function shownRateDay(date: string) {
  return rateDayFormat.format(new Date(date));
}
