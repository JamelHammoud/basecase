export function timeAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;

  if (s < 60) return 'now';

  if (s < 3600) return `${Math.floor(s / 60)}m`;

  if (s < 86400) return `${Math.floor(s / 3600)}h`;

  if (s < 604800) return `${Math.floor(s / 86400)}d`;

  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
