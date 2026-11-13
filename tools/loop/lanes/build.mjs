import { CHANGE_SCHEMA, runAgent } from '../lib/agent.mjs';
import { editIssueLabels, issues } from '../lib/github.mjs';
import { OWNER_LOGIN } from '../lib/paths.mjs';
import { publish } from '../lib/pull.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

const NEXT = 'loop:next';
const BUILDING = 'loop:building';

const nextStep = () =>
  issues(NEXT)
    .filter((issue) => issue.author?.login === OWNER_LOGIN)
    .filter((issue) => !issue.labels.some((label) => label.name === BUILDING))[0] ?? null;

export default function build({ log }) {
  const step = nextStep();

  if (!step) {
    log('no step waiting');

    return;
  }

  editIssueLabels(step.number, { add: [BUILDING], remove: [NEXT] });

  const worktree = openBranch('build', step.title);

  try {
    const prompt = `Build this step, issue #${step.number}: ${step.title}\n\n${step.body}`;
    const result = runAgent({ cwd: worktree.dir, name: 'build', prompt, schema: CHANGE_SCHEMA, hours: 12 });

    if (!result.ok || !result.output.changed) {
      editIssueLabels(step.number, { add: [NEXT], remove: [BUILDING] });
      log(`#${step.number} not built: ${String(result.error ?? result.output.notes).slice(0, 500)}`);

      return;
    }

    const change = { ...result.output, why: `${result.output.why}\n\nCloses #${step.number}.` };
    const url = publish(change, worktree);

    log(url ? `#${step.number}: opened ${url}` : `#${step.number}: a pull request with this title is already open`);
  } catch (error) {
    editIssueLabels(step.number, { add: [NEXT], remove: [BUILDING] });

    throw error;
  } finally {
    close(worktree);
  }
}
