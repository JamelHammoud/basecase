import { CHANGE_SCHEMA, runAgent } from '../lib/agent.mjs';
import { createIssue, issues } from '../lib/github.mjs';
import { publish } from '../lib/pull.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

const IDEA = 'loop:idea';
const TAKEN_LABELS = [IDEA, 'loop:next'];

const idea = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'The step, verb first, sentence case, no period' },
    kind: { type: 'string', enum: ['feature', 'integration', 'refine'] },
    body: {
      type: 'string',
      description: 'What to build and why, what Basecase has already, and links to the market entries behind it',
    },
  },
  required: ['title', 'kind', 'body'],
};

const SCHEMA = {
  ...CHANGE_SCHEMA,
  properties: { ...CHANGE_SCHEMA.properties, ideas: { type: 'array', items: idea, maxItems: 5 } },
  required: [...CHANGE_SCHEMA.required, 'ideas'],
};

const titleKey = (title) => title.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');

const takenTitles = () => TAKEN_LABELS.flatMap((label) => issues(label)).map((issue) => issue.title);

export const freshIdeas = (ideas, taken) => {
  const seen = new Set(taken.map(titleKey));

  return ideas.filter((candidate) => {
    const key = titleKey(candidate.title);

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
};

const prompt = (taken) =>
  [
    `Today is ${new Date().toISOString().slice(0, 10)}. Research the market and update docs/market/, following your brief.`,
    `## Steps already open\n\n${taken.map((title) => `- ${title}`).join('\n') || 'None.'}`,
  ].join('\n\n');

const withNotes = (change) =>
  change.notes ? { ...change, summary: `${change.summary}\n\n**For Jamel:** ${change.notes}` } : change;

const ideaBody = (candidate, url) =>
  [`Kind: ${candidate.kind}`, `From the market lane${url ? `, ${url}` : ''}.`, '', candidate.body].join('\n');

export default function market({ log }) {
  const taken = takenTitles();
  const worktree = openBranch('market', 'research');

  try {
    const result = runAgent({ cwd: worktree.dir, name: 'market', prompt: prompt(taken), schema: SCHEMA, hours: 3 });

    if (!result.ok) {
      log(`market session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    const { ideas = [], ...change } = result.output;
    const url = publish(withNotes({ ...change, kind: 'market' }), worktree);

    log(url ? `opened ${url}` : `no doc change: ${change.notes}`);

    for (const candidate of freshIdeas(ideas, taken)) {
      log(`idea ${createIssue({ title: candidate.title, body: ideaBody(candidate, url), labels: [IDEA] })}`);
    }
  } finally {
    close(worktree);
  }
}
