const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function shownDay(time: string) {
  return dayFormat.format(new Date(time));
}
