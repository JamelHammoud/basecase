const DAY = 86_400_000;

export function dateGroupLabel(iso: string, now: Date): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = Date.parse(iso);

  if (t >= startOfToday) return 'Today';

  if (t >= startOfToday - DAY) return 'Yesterday';

  if (t >= startOfToday - 7 * DAY) return 'Previous 7 days';

  const d = new Date(t);

  return d.toLocaleDateString(
    undefined,
    d.getFullYear() === now.getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' },
  );
}

export function groupByDate<T extends { updatedAt: string }>(items: T[], now: Date) {
  const groups: { label: string; items: T[] }[] = [];

  for (const item of [...items].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))) {
    const label = dateGroupLabel(item.updatedAt, now);
    const last = groups[groups.length - 1];

    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return groups;
}
