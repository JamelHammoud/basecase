export const TEXT_LIMITS = { name: 60, group: 40, note: 400 };

function clipPart(part) {
  const cut = Object.keys(TEXT_LIMITS).filter(
    (field) => typeof part[field] === 'string' && part[field].length > TEXT_LIMITS[field],
  );

  if (!cut.length) return { part, cut };

  const clipped = { ...part };

  for (const field of cut) clipped[field] = part[field].slice(0, TEXT_LIMITS[field]).trimEnd();

  return { part: clipped, cut };
}

export function clipTexts(parts) {
  const results = parts.map(clipPart);
  const notices = results.flatMap(({ part, cut }) =>
    cut.map((field) => `Cut the ${field} of ${part.id} to ${TEXT_LIMITS[field]} characters.`),
  );

  return { parts: results.map((r) => r.part), notice: notices.length ? `\n${notices.join('\n')}` : '' };
}
