const DAY = 86_400_000;

export interface Span {
  after: number;
  before: number;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

const startOfMonth = (d: Date, offset = 0) => new Date(d.getFullYear(), d.getMonth() + offset, 1);

const span = (after: Date, before: Date): Span => ({ after: after.getTime(), before: before.getTime() });

const NAMED: Record<string, (now: Date) => Span> = {
  today: (now) => span(startOfDay(now), addDays(startOfDay(now), 1)),
  yesterday: (now) => span(addDays(startOfDay(now), -1), startOfDay(now)),
  'this week': (now) => span(startOfWeek(now), addDays(startOfWeek(now), 7)),
  'last week': (now) => span(addDays(startOfWeek(now), -7), startOfWeek(now)),
  'this month': (now) => span(startOfMonth(now), startOfMonth(now, 1)),
  'last month': (now) => span(startOfMonth(now, -1), startOfMonth(now)),
};

const LAST_DAYS = /\b(?:last|past) (\d{1,4}) days?\b/;

export const DATE_PATTERN = new RegExp(`\\b(?:${Object.keys(NAMED).join('|')})\\b|${LAST_DAYS.source}`, 'g');

export function dateSpan(phrase: string, now: Date): Span | null {
  const named = NAMED[phrase];

  if (named) return named(now);

  const days = LAST_DAYS.exec(phrase);

  if (!days) return null;

  const today = startOfDay(now);

  return { after: today.getTime() - (Number(days[1]) - 1) * DAY, before: addDays(today, 1).getTime() };
}
