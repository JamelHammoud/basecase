export const SEVERITIES = ['critical', 'high', 'moderate', 'low', 'review', 'info'];

const rank = (severity) => SEVERITIES.indexOf(severity);

export function countBySeverity(sections) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));

  for (const section of sections) for (const f of section.findings ?? []) counts[f.severity] += 1;

  return counts;
}

function sectionMarkdown(section) {
  if (section.error) return [`## ${section.name}`, '', `Couldn’t run: ${section.error}`, ''];

  const findings = [...section.findings].sort((a, b) => rank(a.severity) - rank(b.severity));

  if (findings.length === 0) return [`## ${section.name}`, '', 'Clean.', ''];

  return [
    `## ${section.name}`,
    '',
    ...findings.flatMap((f) => [
      `- **${f.severity}** ${f.title}`,
      ...(f.detail ? [`  - ${f.detail}`] : []),
      ...(f.fix ? [`  - Fix: ${f.fix}`] : []),
    ]),
    '',
  ];
}

export function toMarkdown(sections, date) {
  const counts = countBySeverity(sections);
  const summary = SEVERITIES.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`)
    .join(', ');

  return [`# Security scan ${date}`, '', summary || 'No findings.', '', ...sections.flatMap(sectionMarkdown)].join(
    '\n',
  );
}
