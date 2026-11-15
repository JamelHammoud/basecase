const STEP_BRANCH = /^loop\/build\/(\d+)-/;
const STEP_LABEL = /^loop:step:(\d+)$/;
const LINK = /\b(?:Closes|Rebuilds) #\d+\.?/g;

export function stepsOf(pull) {
  const labels = (pull.labels ?? []).map((label) => Number(STEP_LABEL.exec(label.name)?.[1])).filter(Boolean);
  const closes = [...(pull.body ?? '').matchAll(/\bCloses #(\d+)\b/g)].map((match) => Number(match[1]));
  const branch = Number(STEP_BRANCH.exec(pull.headRefName ?? '')?.[1]);

  return [...new Set([...labels, ...closes, ...(branch ? [branch] : [])])];
}

export const stepOf = (pull) => stepsOf(pull)[0] ?? null;

export const stepLabels = (pull) => stepsOf(pull).map((step) => `loop:step:${step}`);

export const linkLines = (body) => [...new Set((body ?? '').match(LINK) ?? [])];

export function keepStepLinks(body, pull) {
  const links = [...linkLines(pull.body), ...stepsOf(pull).map((step) => `Closes #${step}.`)];
  const key = (link) => link.replace(/\.$/, '');
  const present = new Set(linkLines(body).map(key));
  const missing = [...new Map(links.map((link) => [key(link), link])).values()].filter(
    (link) => !present.has(key(link)),
  );

  return missing.length === 0 ? body : `${body.trimEnd()}\n\n${missing.join('\n')}`;
}
