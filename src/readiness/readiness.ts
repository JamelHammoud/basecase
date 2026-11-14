import { hashText, itemKeyOf } from '../guide/guideItems';
import { jsonHash, numbersHash } from '../utils/geometryHash';
import type { MessageQuote, ScenePart } from '../types/robotics';
import type { CheckRow } from '../utils/engineeringTypes';
import type { CheckStatus, CheckSummary, Finding, Readiness, ReadinessDecisions, ReadinessFinding } from './types';
import { READINESS_CHECKS, ruleFinding } from './wording';
import { errorMessage } from '../utils/errorMessage';
import { plural } from '../../electron/plural.mjs';

const round = (v: number) => Math.round(v * 10) / 10;

function partLine(p: ScenePart): string {
  return [p.id, itemKeyOf(p), ...p.position.map(round), ...p.rotation.map(round), hashText(p.cad?.code ?? '')].join(
    '|',
  );
}

function readingsLine(p: ScenePart): string {
  return [
    p.name,
    p.note,
    p.role,
    p.visible,
    p.printMaterial,
    p.mechanicalTag,
    p.massG,
    p.group?.id,
    p.print?.skip,
    p.print?.copies,
    p.print?.down?.join(','),
    !!p.robotLink,
    !!p.simready,
    !!p.physics?.dynamic,
    JSON.stringify(p.dimensions),
    jsonHash(p.deformers),
    jsonHash(p.edges),
    jsonHash(p.customNodes),
    numbersHash(p.cad?.positions),
    numbersHash(p.sculptMesh?.positions),
    numbersHash(p.mesh?.positions),
  ].join('|');
}

export function readinessFingerprint(parts: ScenePart[], extra: unknown): string {
  return hashText([...parts.map((p) => `${partLine(p)}|${readingsLine(p)}`).sort(), JSON.stringify(extra)].join('\n'));
}

export const UNSETTLED_FINGERPRINT = '';

export function failedReadiness(
  error: unknown,
  ctx: { parts: ScenePart[]; decisions?: ReadinessDecisions },
): Readiness {
  const reason = errorMessage(error);
  const failed = ruleFinding('unfinished', 'blocker', {
    agentText: `The checks stopped with an error, so nothing here is measured: ${reason}. Run get_readiness again.`,
    subject: 'error',
  });

  return readinessOf([failed], { ...ctx, fingerprint: UNSETTLED_FINGERPRINT });
}

export function findingSignature(finding: Pick<Finding, 'ids'>, parts: ScenePart[]): string {
  const wanted = new Set(finding.ids);

  return hashText(
    parts
      .filter((p) => wanted.has(p.id))
      .map(partLine)
      .sort()
      .join('\n'),
  );
}

export function ignoreFinding(decisions: ReadinessDecisions | undefined, finding: Pick<Finding, 'key'>) {
  return { ...decisions, ignored: { ...decisions?.ignored, [finding.key]: { at: new Date().toISOString() } } };
}

export function restoreFinding(decisions: ReadinessDecisions | undefined, finding: Pick<Finding, 'key'>) {
  const ignored = { ...decisions?.ignored };

  delete ignored[finding.key];

  return { ...decisions, ignored };
}

export function ignoreRule(decisions: ReadinessDecisions | undefined, finding: Pick<Finding, 'rule' | 'ruleName'>) {
  return {
    ...decisions,
    ignoredRules: {
      ...decisions?.ignoredRules,
      [finding.rule]: { name: finding.ruleName, at: new Date().toISOString() },
    },
  };
}

export function restoreRule(decisions: ReadinessDecisions | undefined, rule: string) {
  const ignoredRules = { ...decisions?.ignoredRules };

  delete ignoredRules[rule];

  return { ...decisions, ignoredRules };
}

const STAND_IN_RULE = 'stand-in';

type CheckOwner = Pick<CheckSummary, 'name' | 'caseId'>;

export const ownedBy =
  (owner: CheckOwner) =>
  (f: Pick<Finding, 'check' | 'caseId'>): boolean =>
    owner.caseId ? f.caseId === owner.caseId : !f.caseId && f.check === owner.name;

function checkStatus(owner: CheckOwner, open: Finding[], fallback: CheckStatus = 'pass'): CheckStatus {
  const own = open.filter(ownedBy(owner));

  if (own.some((f) => f.level === 'blocker')) return 'fail';

  if (own.length) return 'warn';

  return fallback === 'not run' ? 'not run' : 'pass';
}

const ownerOf = (row: CheckRow): CheckOwner => ({ name: row.check, caseId: row.caseId });

function rowStatus(row: CheckRow, open: Finding[]): CheckStatus {
  const status = checkStatus(ownerOf(row), open, row.status);

  return row.caseId && row.status === 'fail' && status === 'warn' ? 'fail' : status;
}

function checkSummaries(open: Finding[], rows: CheckRow[]): CheckSummary[] {
  const idsOf = (owner: CheckOwner) => [...new Set(open.filter(ownedBy(owner)).flatMap((f) => f.ids))];
  const seen = new Set(rows.filter((r) => !r.caseId).map((r) => r.check));
  const extra = [...new Set(open.filter((f) => !f.caseId).map((f) => f.check))].filter(
    (name) => !READINESS_CHECKS.includes(name) && !seen.has(name),
  );

  return [
    ...[...READINESS_CHECKS, ...extra].map((name) => ({
      name,
      status: checkStatus({ name }, open),
      detail: '',
      ids: idsOf({ name }),
    })),
    ...rows.map((row) => ({
      name: row.check,
      status: rowStatus(row, open),
      detail: row.detail,
      ids: idsOf(ownerOf(row)),
      ...(row.caseId ? { caseId: row.caseId } : {}),
      ...(row.dots?.length ? { hasDots: true } : {}),
      ...(row.detailInItems ? { detailInItems: true } : {}),
      ...(row.envelopes?.length ? { envelopes: row.envelopes } : {}),
    })),
  ];
}

function ignoredRuleSummaries(findings: Finding[], rules: NonNullable<ReadinessDecisions['ignoredRules']>) {
  return Object.entries(rules).map(([rule, { name }]) => {
    const current = findings.filter((f) => f.rule === rule);

    return { rule, name: current[0]?.ruleName ?? name, count: current.length };
  });
}

export function readinessOf(
  findings: Finding[],
  ctx: {
    parts: ScenePart[];
    decisions?: ReadinessDecisions;
    fingerprint: string;
    rows?: CheckRow[];
    now?: Date;
  },
): Readiness {
  const ignored = ctx.decisions?.ignored ?? {};
  const rules = ctx.decisions?.ignoredRules ?? {};
  const disputes = ctx.decisions?.disputes ?? {};
  const signature = (f: Finding) => findingSignature(f, ctx.parts);
  const withDispute = (f: Finding): ReadinessFinding => {
    const dispute = disputes[f.key];

    return dispute && dispute.signature === signature(f) ? { ...f, dispute } : f;
  };
  const isOff = (f: Finding) => !!ignored[f.key] || !!rules[f.rule];
  const open = findings.filter((f) => !isOff(f));
  const blockers = open.filter((f) => f.level === 'blocker').map(withDispute);
  const built = ctx.parts.length > 0;
  const blockout = blockers.some((f) => f.rule === STAND_IN_RULE);

  return {
    status: statusOf({ built, blockout, blocked: blockers.length > 0 }),
    checks: checkSummaries(open, ctx.rows ?? []),
    blockers,
    notes: open.filter((f) => f.level === 'note'),
    ignored: findings.filter((f) => !!ignored[f.key] && !rules[f.rule]),
    ignoredRules: ignoredRuleSummaries(findings, rules),
    findings,
    rows: ctx.rows ?? [],
    fingerprint: ctx.fingerprint,
    checkedAt: (ctx.now ?? new Date()).toISOString(),
  };
}

export const withDecisions = (r: Readiness, parts: ScenePart[], decisions?: ReadinessDecisions): Readiness =>
  readinessOf(r.findings, { parts, decisions, fingerprint: r.fingerprint, rows: r.rows });

function statusOf(s: { built: boolean; blockout: boolean; blocked: boolean }): Readiness['status'] {
  if (!s.built) return 'empty';

  if (s.blockout) return 'blockout';

  return s.blocked ? 'blocked' : 'ready';
}

export function newBlockers(before: Readiness | null, after: Readiness): Finding[] {
  const known = new Set(before?.blockers.map((f) => f.key));

  return after.blockers.filter((f) => !known.has(f.key));
}

const countText = (n: number) => plural(n, 'blocker');

export function readinessText(r: Readiness): string {
  if (r.status === 'empty') return 'Nothing to check yet.';

  const head =
    r.status === 'ready'
      ? 'READY TO BUILD. No blockers.'
      : `NOT READY${r.status === 'blockout' ? ' (still a block-out)' : ''}: ${countText(r.blockers.length)}.`;
  const row = (f: ReadinessFinding) =>
    `- [${f.key}] ${f.agentText}${f.dispute ? ` (disputed: ${f.dispute.reason}; the user decides)` : ''}`;

  return [
    head,
    ...(r.blockers.length ? ['Blockers:', ...r.blockers.map(row)] : []),
    ...(r.ignored.length ? [`The user ignores: ${r.ignored.map((f) => f.key).join(', ')}. Leave these alone.`] : []),
    ...(r.ignoredRules.length
      ? [`The user ignores all: ${r.ignoredRules.map((x) => x.name).join(', ')}. Leave these alone.`]
      : []),
    ...(r.notes.length ? ['Notes:', ...r.notes.slice(0, 15).map((f) => `- ${f.agentText}`)] : []),
  ].join('\n');
}

export function readinessDelta(before: Readiness | null, after: Readiness): string {
  const added = newBlockers(before, after);
  const was = before?.blockers.length ?? 0;
  const count = after.blockers.length;

  if (!added.length && count === was) return count ? `Build check: ${countText(count)}, none new.` : '';

  const listed = added.slice(0, 3).map((f) => f.agentText);
  const more = added.length > 3 ? ` (${added.length - 3} more)` : '';

  return `Build check: blockers ${was} → ${count}.${listed.length ? ` New: ${listed.join(' ')}${more}` : ''}`;
}

const partList = (f: Finding, parts: ScenePart[]) => {
  const names = f.ids.flatMap((id) => parts.find((p) => p.id === id)?.name ?? []);

  return [...new Set(names)].join(', ');
};

export interface FindingRequest {
  text: string;
  quotes: MessageQuote[];
}

const FIX_NOTE = 'Run get_readiness when you’re done. If it’s wrong, call dispute_finding with your evidence.';

const findingContext = (f: Finding, note?: string) =>
  [...(f.ids.length ? [`Parts: ${f.ids.join(', ')}`] : []), `Detail: ${f.agentText}`, `Check: ${f.key}`, note]
    .filter(Boolean)
    .join('\n');

const quoteOf = (f: Finding, parts: ScenePart[], note?: string): MessageQuote => ({
  id: f.key,
  source: 'Checks',
  text: f.text,
  parts: partList(f, parts) || undefined,
  context: findingContext(f, note),
});

export const findingQuote = (f: Finding, parts: ScenePart[]): MessageQuote => quoteOf(f, parts);

export function fixRequest(f: Finding, parts: ScenePart[]): FindingRequest {
  return { text: 'Fix this.', quotes: [quoteOf(f, parts, FIX_NOTE)] };
}

export function followUpRequest(added: Finding[], parts: ScenePart[]): FindingRequest {
  return {
    text: `Fix what the last change added: ${plural(added.length, 'problem')}.`,
    quotes: added.slice(0, 10).map((f) => quoteOf(f, parts, FIX_NOTE)),
  };
}
