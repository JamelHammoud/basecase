import { CHANGE_SCHEMA } from '../lib/agent.mjs';
import { inFlight, inFlightText } from '../lib/inFlight.mjs';
import { checkedRun } from '../lib/preflight.mjs';
import { publish } from '../lib/pull.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 1,
  everySeconds: 24 * 60 * 60,
  does: 'Audits existing screens for UI and UX defects and opens tested fixes',
};

export const AREAS = ['Build', 'Agent', 'Inspector', 'Parts', 'Play', 'Library', 'Settings', 'Shared controls'];

const SCHEMA = {
  ...CHANGE_SCHEMA,
  properties: {
    ...CHANGE_SCHEMA.properties,
    audit: {
      type: 'object',
      properties: Object.fromEntries(
        AREAS.map((area) => [
          area,
          { type: 'string', description: 'Source and test evidence, findings or open PR link' },
        ]),
      ),
      required: AREAS,
      additionalProperties: false,
    },
  },
  required: [...CHANGE_SCHEMA.required, 'audit'],
};

const LIVE = { inFlight, checkedRun, publish, openBranch, close };

export const completeAudit = (audit) =>
  AREAS.every((area) => typeof audit?.[area] === 'string' && audit[area].trim().length > 0);

export default function ux({ log }, deps = LIVE) {
  const taken = deps.inFlight();

  if (taken.open.some((pull) => pull.headRefName?.startsWith('loop/ux/'))) {
    log('waiting: a UI and UX audit pull request is already open');

    return;
  }

  const worktree = deps.openBranch('ux', 'screens');

  try {
    const result = deps.checkedRun({
      cwd: worktree.dir,
      name: 'ux',
      taskKind: 'refine',
      prompt: `Audit every area: ${AREAS.join(', ')}. Follow your brief and return evidence for each area in audit.\n\nAvoid duplicating this open or recently merged work:\n\n${inFlightText(taken)}`,
      schema: SCHEMA,
      hours: 6,
      kind: 'refine',
      log,
    });

    if (!result.ok) {
      log(`UI and UX audit failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    if (!completeAudit(result.output.audit)) {
      log('UI and UX audit incomplete: every area needs evidence; nothing published');

      return;
    }

    for (const area of AREAS) log(`${area}: ${result.output.audit[area]}`);

    const output = result.output;
    const coverage = AREAS.map((area) => `${area}: ${output.audit[area]}`).join('\n');
    const url = output.changed
      ? deps.publish({ ...output, kind: 'refine', checked: `${output.checked}\n\n${coverage}` }, worktree)
      : null;

    log(url ? `opened ${url}` : `UI and UX audit: ${output.notes}`);
  } finally {
    deps.close(worktree);
  }
}
