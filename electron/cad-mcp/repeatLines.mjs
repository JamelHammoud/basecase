const SHOWN_UNCHANGED = 6;

export function lineMemory() {
  let previous = null;

  return (lines) => {
    const before = previous;

    previous = new Set(lines);

    if (!before) return { fresh: lines, unchanged: [], fixed: 0 };

    return {
      fresh: lines.filter((l) => !before.has(l)),
      unchanged: lines.filter((l) => before.has(l)),
      fixed: [...before].filter((l) => !previous.has(l)).length,
    };
  };
}

export function reportLines({ fresh, unchanged, fixed }, firstRun) {
  if (firstRun) return fresh.map((l) => `- ${l}`);

  const out = [];

  if (fresh.length) out.push(`New since the last check (${fresh.length}):`, ...fresh.map((l) => `- ${l}`));

  if (unchanged.length) out.push(`Still open from the last check (${unchanged.length}):`, ...shortList(unchanged));

  if (fixed) out.push(`Fixed since the last check: ${fixed}.`);

  return out;
}

function shortList(lines) {
  const shown = lines.slice(0, SHOWN_UNCHANGED).map((l) => `- ${l}`);

  return lines.length > SHOWN_UNCHANGED ? [...shown, `- …and ${lines.length - SHOWN_UNCHANGED} more`] : shown;
}
