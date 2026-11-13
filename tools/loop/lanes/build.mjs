import { CHANGE_SCHEMA, runAgent } from '../lib/agent.mjs';
import { claim } from '../lib/claim.mjs';
import { commentOnIssue, editIssueLabels, hasLabel, issues } from '../lib/github.mjs';
import { OWNER_LOGIN } from '../lib/paths.mjs';
import { publish } from '../lib/pull.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

const NEXT = 'loop:next';
const BUILDING = 'loop:building';
const PRIORITY = 'loop:priority';

const byPriorityThenAge = (a, b) =>
  Number(hasLabel(b, PRIORITY)) - Number(hasLabel(a, PRIORITY)) || a.createdAt.localeCompare(b.createdAt);

const waitingSteps = () =>
  issues(NEXT)
    .filter((issue) => issue.author?.login === OWNER_LOGIN && !hasLabel(issue, BUILDING))
    .sort(byPriorityThenAge);

function claimNextStep() {
  for (const step of waitingSteps()) {
    const release = claim(`step-${step.number}`);

    if (release) return { step, release };
  }

  return null;
}

function buildStep(step, { log, slot }) {
  editIssueLabels(step.number, { add: [BUILDING], remove: [NEXT] });

  const worktree = openBranch('build', `${step.number}-${slot}-${step.title}`);
  const giveBack = () => editIssueLabels(step.number, { add: [NEXT], remove: [BUILDING] });

  try {
    const prompt = `Build this step, issue #${step.number}: ${step.title}\n\n${step.body}`;
    const result = runAgent({ cwd: worktree.dir, name: 'build', prompt, schema: CHANGE_SCHEMA, hours: 12 });

    if (!result.ok || !result.output.changed) {
      giveBack();
      log(`#${step.number} not built: ${String(result.error ?? result.output.notes).slice(0, 500)}`);

      return;
    }

    const change = { ...result.output, why: `${result.output.why}\n\nCloses #${step.number}.` };
    const onDuplicate = (open) => {
      commentOnIssue(step.number, `Already being built in #${open.number}.`);
      log(`#${step.number}: #${open.number} already has this title`);
    };
    const url = publish(change, { ...worktree, onDuplicate });

    if (url) log(`#${step.number}: opened ${url}`);
  } catch (error) {
    giveBack();

    throw error;
  } finally {
    close(worktree);
  }
}

export default function build({ log, slot }) {
  const next = claimNextStep();

  if (!next) {
    log('no step waiting');

    return;
  }

  try {
    buildStep(next.step, { log, slot });
  } finally {
    next.release();
  }
}
