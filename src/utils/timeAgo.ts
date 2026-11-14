const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const FULL_DATE = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const CLOCK = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

const parseWhen = (when: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(when) ? `${when}T12:00:00` : when);

export function dayLabel(when: string, now = new Date()): string {
  const d = parseWhen(when);

  if (Number.isNaN(d.getTime())) return when;

  return (d.getFullYear() === now.getFullYear() ? MONTH_DAY : MONTH_DAY_YEAR).format(d);
}

export const fullDate = (when = new Date()) => FULL_DATE.format(when);

export const clockTime = (when: Date | number) => CLOCK.format(when).replace(/\s/g, ' ');

export function timeAgo(iso: string, now = new Date()): string {
  const s = (now.getTime() - Date.parse(iso)) / 1000;

  if (s < 60) return 'now';

  if (s < 3600) return `${Math.floor(s / 60)}m`;

  if (s < 86400) return `${Math.floor(s / 3600)}h`;

  if (s < 604800) return `${Math.floor(s / 86400)}d`;

  return dayLabel(iso, now);
}

export function agoPhrase(iso: string, now = new Date()): string {
  const t = timeAgo(iso, now);

  if (t === 'now') return 'just now';

  return /^\d+[mhd]$/.test(t) ? `${t} ago` : t;
}
