const DAY = 86_400_000;
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long' });
const MONTH_YEAR = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

function calendarAt(now: Date) {
  const year = now.getFullYear();

  return {
    startOfToday: new Date(year, now.getMonth(), now.getDate()).getTime(),
    year,
  };
}

function labelAt(t: number, { startOfToday, year }: ReturnType<typeof calendarAt>): string {
  if (t >= startOfToday) return 'Today';

  if (t >= startOfToday - DAY) return 'Yesterday';

  if (t >= startOfToday - 7 * DAY) return 'Previous 7 days';

  const d = new Date(t);

  return (d.getFullYear() === year ? MONTH : MONTH_YEAR).format(d);
}

export function dateGroupLabel(iso: string, now: Date): string {
  return labelAt(Date.parse(iso), calendarAt(now));
}

export function groupByDate<T extends { updatedAt: string }>(items: T[], now: Date) {
  const groups: { label: string; items: T[] }[] = [];
  const calendar = calendarAt(now);
  const dated = items.map((item) => ({ item, time: Date.parse(item.updatedAt) }));

  dated.sort((a, b) => b.time - a.time);

  for (const { item, time } of dated) {
    const label = labelAt(time, calendar);
    const last = groups[groups.length - 1];

    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return groups;
}
