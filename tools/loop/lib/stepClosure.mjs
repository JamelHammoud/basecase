import { claim } from './claim.mjs';
import { closeIssue, editPullLabels, issueIsOpen } from './github.mjs';
import { stepLabels, stepsOf } from './stepLinks.mjs';

function closeStep(step, pull, { log, dry = false }) {
  if (dry) {
    log(`would close step #${step}, built in #${pull.number}`);

    return;
  }

  if (!issueIsOpen(step)) return;

  const missing = stepLabels({ body: `Closes #${step}.` }).filter(
    (label) => !(pull.labels ?? []).some((item) => item.name === label),
  );

  if (missing.length > 0) editPullLabels(pull.number, { add: missing });

  const result = closeIssue(step, `Built in #${pull.number}.`);

  log(result?.ok === false ? `could not close step #${step}` : `closed step #${step}, built in #${pull.number}`);
}

export function closePullSteps(pull, log) {
  for (const step of stepsOf(pull)) closeStep(step, pull, { log });
}

export function sweepMergedSteps(steps, index, options) {
  const closed = new Set();

  for (const step of steps) {
    const pull = (index.get(step.number) ?? []).find((item) => item.state === 'MERGED');
    const release = pull ? claim(`step-${step.number}`) : null;

    if (!release) continue;

    try {
      closeStep(step.number, pull, options);
      closed.add(step.number);
    } finally {
      release();
    }
  }

  return closed;
}
