export const SELF = /^s7-/;

export function rehearsalProblems(gates, results) {
  const required = gates.filter((g) => g.state === 'required' && !SELF.test(g.id));
  const problems = [];

  for (const g of required) {
    const r = results[g.id];

    if (!r) problems.push(`${g.id}: not run`);
    else if (r.voided) problems.push(`${g.id}: void (${r.voided})`);
    else if (!r.ok) problems.push(`${g.id}: failed`);
  }

  for (const g of gates.filter((x) => x.state === 'parked' && !String(x.parked ?? '').trim())) {
    problems.push(`${g.id}: parked without a reason`);
  }

  return problems;
}

const firstFailure = (r) => [...(r.checks ?? []), ...(r.canaries ?? [])].find((c) => !c.ok);

export function rehearsalReport({ commit, gates, results, problems }) {
  const lines = [`# Dress rehearsal at ${commit}`, '', '## Required gates, rerun from a clean checkout', ''];

  for (const g of gates.filter((x) => x.state === 'required' && !SELF.test(x.id))) {
    const r = results[g.id];
    const failed = r && firstFailure(r);
    const verdict = r?.ok && !r.voided ? 'pass' : 'FAIL';

    lines.push(`- ${verdict} ${g.id}${failed ? `: ${failed.name}` : ''}`);
  }

  lines.push('', '## Parked', '');

  for (const g of gates.filter((x) => x.state === 'parked')) lines.push(`- ${g.id}: ${g.parked ?? 'no reason given'}`);

  lines.push(
    '',
    problems.length ? `## Problems\n\n${problems.map((p) => `- ${p}`).join('\n')}` : 'Every required gate passed.',
  );

  return `${lines.join('\n')}\n`;
}
