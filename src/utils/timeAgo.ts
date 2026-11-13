const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const parseWhen = (when: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(when) ? `${when}T12:00:00` : when);

export function dayLabel(when: string, now = new Date()): string {
  const d = parseWhen(when);

  return (d.getFullYear() === now.getFullYear() ? MONTH_DAY : MONTH_DAY_YEAR).format(d);
}

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
