import { CHANGE_SCHEMA, runAgent } from './agent.mjs';
import { appendToIssue, closePull, commentOnIssue, commentOnPull, editIssueLabels } from './github.mjs';
import { HOME_CHECKOUT } from './paths.mjs';
import { publish } from './pull.mjs';
import { markRebuilt } from './pullState.mjs';
import { run } from './sh.mjs';
import { close, openBranch } from './worktree.mjs';

const SCHEMA = {
  ...CHANGE_SCHEMA,
  properties: {
    ...CHANGE_SCHEMA.properties,
    abandon: { type: 'boolean', description: 'True when the change should not be made at all' },
    verdict: { type: 'string', description: 'For the record: what kept failing and what this attempt did about it' },
  },
  required: [...CHANGE_SCHEMA.required, 'abandon', 'verdict'],
};

const stepOf = (pull) => Number(/Closes #(\d+)/.exec(pull.body)?.[1]) || null;

function retire(pull, { verdict, stuck }, log) {
  closePull(pull.number, `Closed after it ${stuck}. ${verdict}`);

  const step = stepOf(pull);

  if (step) {
    appendToIssue(step, `**An earlier attempt (#${pull.number}) was closed:** ${verdict}`);
    editIssueLabels(step, { add: ['loop:next'], remove: ['loop:building'] });
    commentOnIssue(step, `#${pull.number} was closed and this step is back in the queue, with the reason added above.`);
  }

  log(`#${pull.number}: retired: ${verdict}`);
}

function prompt(pull, { comments, stuck }) {
  run('git', ['fetch', '-q', 'origin', 'main', pull.headRefName], { cwd: HOME_CHECKOUT, allowFail: true });

  const diff = run('git', ['diff', `origin/main...origin/${pull.headRefName}`], {
    cwd: HOME_CHECKOUT,
    allowFail: true,
  }).out.slice(0, 300_000);
  const history = comments.map((c) => `${c.author} (${c.createdAt}):\n${c.body}`).join('\n\n---\n\n');

  return `Rebuild pull request #${pull.number}, which ${stuck}: ${pull.title}\n\n${pull.body}\n\n## Every comment, oldest first\n\n${history}\n\n## Its diff against main\n\n${diff}`;
}

export function rebuild(pull, { comments, stuck, log }) {
  markRebuilt(pull.number);

  const worktree = openBranch('rebuild', pull.title.replace(/^[A-Za-z]+: /, ''));

  try {
    const result = runAgent({
      cwd: worktree.dir,
      name: 'rebuild',
      prompt: prompt(pull, { comments, stuck }),
      schema: SCHEMA,
      hours: 8,
    });

    if (!result.ok) {
      log(`#${pull.number}: rebuild session failed; revising continues: ${String(result.error).slice(0, 300)}`);

      return;
    }

    const out = result.output;

    if (out.abandon || !out.changed) {
      retire(pull, { verdict: out.verdict, stuck }, log);

      return;
    }

    closePull(pull.number, `Rebuilding this from main after it ${stuck}. ${out.verdict}`);

    const step = stepOf(pull);
    const url = publish(
      { ...out, why: `${out.why}\n\nRebuilds #${pull.number}.${step ? ` Closes #${step}.` : ''}` },
      worktree,
    );

    if (url) commentOnPull(pull.number, `Rebuilt as ${url}.`);

    log(`#${pull.number}: rebuilt as ${url ?? 'nothing (a pull request with that title is open)'}`);
  } finally {
    close(worktree);
  }
}
