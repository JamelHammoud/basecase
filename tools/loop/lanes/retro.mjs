import { CHANGE_SCHEMA, runAgent } from '../lib/agent.mjs';
import { openPulls } from '../lib/github.mjs';
import { DAY_MS, HOUR_MS } from '../lib/history.mjs';
import { publish } from '../lib/pull.mjs';
import { retroEvidence } from '../lib/retroEvidence.mjs';
import { retroText } from '../lib/retroText.mjs';
import { store } from '../lib/store.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 1,
  everySeconds: 7 * 24 * 60 * 60,
  does: "Studies a week of the loop's own numbers and changes its harness: lanes, briefs, runner, merge rules and CI",
};

const EVERY_MS = 7 * DAY_MS - 2 * HOUR_MS;
const MAX_EVIDENCE = 200_000;
const MAX_APART = 2;
const runs = store('retro', { at: 0 });

const RETRO_SCHEMA = {
  ...CHANGE_SCHEMA,
  properties: {
    ...CHANGE_SCHEMA.properties,
    apart: {
      type: 'array',
      maxItems: MAX_APART,
      description:
        'Changes unrelated enough to the rest to review on their own, left out of this worktree; each gets its own session and pull request',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The change, verb first, sentence case' },
          plan: { type: 'string', description: 'What to change, in which files, and how to check it' },
          evidence: { type: 'string', description: "The week's numbers that call for it" },
        },
        required: ['title', 'plan', 'evidence'],
      },
    },
  },
  required: [...CHANGE_SCHEMA.required, 'apart'],
};

const promptFor = (evidence) =>
  [
    "Here is how Basecase's loop worked this week. Find the one to three changes to its own harness that would most improve throughput, quality or Jamel's satisfaction, and make them, following your brief.",
    retroText(evidence).slice(0, MAX_EVIDENCE),
  ].join('\n\n');

const apartPrompt = (evidence, change) =>
  [
    `Make this one change to the loop's harness, following your brief. Leave \`apart\` empty.\n\n## ${change.title}\n\n${change.plan}\n\nEvidence: ${change.evidence}`,
    retroText(evidence).slice(0, MAX_EVIDENCE),
  ].join('\n\n');

function session({ log, slug, prompt }) {
  const worktree = openBranch('retro', slug);

  try {
    const result = runAgent({ cwd: worktree.dir, name: 'retro', prompt, schema: RETRO_SCHEMA, hours: 4 });

    if (!result.ok) {
      log(`retro session failed: ${String(result.error).slice(0, 500)}`);

      return null;
    }

    const url = publish({ ...result.output, kind: 'loop' }, worktree);

    log(url ? `opened ${url}` : `no change: ${result.output.notes}`);

    return result.output;
  } finally {
    close(worktree);
  }
}

export default function retro({ log }) {
  const open = openPulls().find((pull) => pull.headRefName.startsWith('loop/retro/'));

  if (open) {
    log(`#${open.number} is already open`);

    return;
  }

  const last = runs.get('last').at;

  if (Date.now() - last < EVERY_MS) {
    log(`last retro ran ${new Date(last).toISOString()}`);

    return;
  }

  const evidence = retroEvidence();
  const output = session({ log, slug: 'harness', prompt: promptFor(evidence) });

  if (!output) return;

  runs.save('last', { at: Date.now() });

  for (const change of (output.apart ?? []).slice(0, MAX_APART)) {
    session({ log, slug: change.title, prompt: apartPrompt(evidence, change) });
  }
}
