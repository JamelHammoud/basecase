import { describe, expect, it } from 'vitest';
import { registerSourced, type SourcedItem } from '../data/sourcedItems';
import type { ScenePart } from '../types/robotics';
import { buildBom } from '../utils/bom';
import type { CheckRow } from '../utils/engineeringTypes';
import { sourcingFindings, unprintableFindings } from './buildChecks';
import { bomFindings } from './findings';
import { thinWallOf } from '../utils/printReport';
import {
  failedReadiness,
  ignoreFinding,
  ignoreRule,
  restoreRule,
  withDecisions,
  findingSignature,
  fixPrompt,
  followUpPrompt,
  findingQuote,
  newBlockers,
  readinessDelta,
  readinessOf,
  readinessText,
  restoreFinding,
} from './readiness';
import type { Finding } from './types';

const part = (id: string, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'cad_part',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#eeeeee',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const blocker = (key: string, ids = ['a']): Finding => ({
  key,
  level: 'blocker',
  area: 'fit',
  check: 'Fit',
  rule: 'clash',
  ruleName: 'Overlapping Parts',
  text: key,
  agentText: key,
  ids,
});
const verdict = (findings: Finding[], parts = [part('a')], decisions = {}) =>
  readinessOf(findings, { parts, decisions, fingerprint: 'f' });

describe('the verdict', () => {
  it('is ready only with no blockers', () => {
    expect(verdict([]).status).toBe('ready');
    expect(verdict([blocker('x')]).status).toBe('blocked');
    expect(readinessText(verdict([]))).toContain('READY TO BUILD');
    expect(readinessText(verdict([blocker('x')]))).toContain('NOT READY');
  });

  it('never counts notes against the verdict', () => {
    expect(verdict([{ ...blocker('x'), level: 'note' }]).status).toBe('ready');
  });

  it('keeps a disputed blocker blocking', () => {
    const parts = [part('a')];
    const signature = findingSignature(blocker('x'), parts);
    const r = verdict([blocker('x')], parts, { disputes: { x: { reason: 'wrong', signature, at: '' } } });

    expect(r.status).toBe('blocked');
    expect(r.blockers[0].dispute?.reason).toBe('wrong');
  });

  it('remembers what the user ignores, even after its parts change', () => {
    const parts = [part('a')];
    const decisions = ignoreFinding(undefined, blocker('x'));

    expect(verdict([blocker('x')], parts, decisions).status).toBe('ready');
    expect(verdict([blocker('x')], parts, decisions).ignored.map((f) => f.key)).toEqual(['x']);
    expect(verdict([blocker('x')], [part('a', { position: [9, 9, 9] })], decisions).status).toBe('ready');
    expect(verdict([blocker('x')], parts, restoreFinding(decisions, blocker('x'))).status).toBe('blocked');
  });

  it('applies an ignore to the last result without measuring again', () => {
    const parts = [part('a')];
    const measured = verdict([blocker('x')], parts);
    const now = withDecisions(measured, parts, ignoreFinding(undefined, blocker('x')));

    expect(now.status).toBe('ready');
    expect(now.fingerprint).toBe(measured.fingerprint);
    expect(withDecisions(now, parts, {}).status).toBe('blocked');
  });

  it('can ignore a whole kind of problem for the project', () => {
    const thin = { ...blocker('thin-a'), rule: 'thin', ruleName: 'Thin Walls' };
    const later = { ...blocker('thin-b'), rule: 'thin', ruleName: 'Thin Walls' };
    const decisions = ignoreRule(undefined, thin);
    const r = verdict([thin, later, blocker('clash')], [part('a')], decisions);

    expect(r.blockers.map((f) => f.key)).toEqual(['clash']);
    expect(r.ignoredRules).toEqual([{ rule: 'thin', name: 'Thin Walls', count: 2 }]);
    expect(verdict([thin], [part('a')], restoreRule(decisions, 'thin')).status).toBe('blocked');
    expect(readinessText(r)).toContain('Thin Walls');
  });

  it('names an ignored kind of problem the way its checks name it now', () => {
    const saved = ignoreRule(undefined, { rule: 'screw-in-part', ruleName: 'Screws Into Parts' });
    const screw = { ...blocker('s'), rule: 'screw-in-part', ruleName: 'Screws into Parts' };

    expect(verdict([screw], [part('a')], saved).ignoredRules[0].name).toBe('Screws into Parts');
    expect(verdict([], [part('a')], saved).ignoredRules[0].name).toBe('Screws Into Parts');
  });

  it('shows every check with its live status', () => {
    const rows: CheckRow[] = [
      { check: 'Weight', status: 'pass', detail: '1 kg' },
      { check: 'Budget', status: 'not run', detail: 'No budget set' },
    ];
    const note = { ...blocker('n'), level: 'note' as const, check: 'Printing' };
    const r = readinessOf([blocker('x'), note], { parts: [part('a')], fingerprint: 'f', rows });
    const statusOf = (name: string) => r.checks.find((c) => c.name === name)?.status;

    expect(statusOf('Fit')).toBe('fail');
    expect(statusOf('Printing')).toBe('warn');
    expect(statusOf('Screws')).toBe('pass');
    expect(statusOf('Weight')).toBe('pass');
    expect(statusOf('Budget')).toBe('not run');
  });

  it('gives the agent the technical detail and the user plain words', () => {
    const f = { ...blocker('x'), text: 'Too thin to print.', agentText: 'walls under 0.84 mm' };

    expect(fixPrompt(f)).toContain('Too thin to print.');
    expect(fixPrompt(f)).toContain('walls under 0.84 mm');
    expect(readinessText(verdict([f]))).toContain('walls under 0.84 mm');
  });

  it('quotes a problem in plain words and keeps the detail for the agent', () => {
    const f = { ...blocker('x', ['a']), text: 'Too thin to print.', agentText: 'walls under 0.84 mm' };
    const quote = findingQuote(f, [part('a', { name: 'Body Tub' })]);

    expect(quote).toMatchObject({ id: f.key, source: 'Checks', text: 'Too thin to print.', parts: 'Body Tub' });
    expect(quote.context).toContain('walls under 0.84 mm');
    expect(quote.context).toContain(`Check: ${f.key}`);
  });
});

describe('what changed in a turn', () => {
  it('names only new blockers', () => {
    const [before, after] = [verdict([blocker('old')]), verdict([blocker('old'), blocker('new')])];

    expect(newBlockers(before, after).map((f) => f.key)).toEqual(['new']);
    expect(readinessDelta(before, after)).toContain('blockers 1 → 2');
    expect(followUpPrompt(newBlockers(before, after))).toContain('dispute_finding');
  });

  it('says nothing when a clean design stays clean', () => {
    expect(readinessDelta(verdict([]), verdict([]))).toBe('');
  });
});

describe('thin walls', () => {
  const check = (minWallMm: number, thinAreaMm2: number, thinShare = 0.001) => ({ minWallMm, thinAreaMm2, thinShare });

  it('passes a thick part', () => {
    expect(thinWallOf(check(1.2, 0))).toBe('none');
  });

  it('notes a knife edge', () => {
    expect(thinWallOf(check(0.08, 40))).toBe('edge');
  });

  it('flags a real thin panel', () => {
    expect(thinWallOf(check(0.5, 400))).toBe('panel');
  });

  it('flags a small part that is thin all over', () => {
    expect(thinWallOf(check(0.5, 30, 0.6))).toBe('panel');
  });
});

describe('parts-list checks', () => {
  const battery = part('pack', { kind: 'component', componentId: 'ovonic-3s-2200-50c' });
  const bomOf = (parts: ScenePart[], extras: Array<{ key: string; qty: number }> = []) =>
    buildBom({ parts, project: { extras } as never, purchases: {}, measures: {} });

  it('puts what a battery needs on the list by itself', () => {
    const keys = bomOf([battery]).lines.map((l) => l.key);

    expect(keys).toEqual(
      expect.arrayContaining(['supply:rocker-switch-20a', 'supply:blade-fuse-holder', 'supply:wire-18awg-silicone']),
    );
  });

  it('never doubles a supply already on the list', () => {
    const lines = bomOf([battery], [{ key: 'supply:rocker-switch-20a', qty: 2 }]).lines;

    expect(lines.filter((l) => /switch/i.test(l.name)).map((l) => l.qty)).toEqual([2]);
  });

  it('refuses to print a clear window', () => {
    const found = unprintableFindings([part('w', { name: 'Camera Window', note: 'Clear acrylic disc' })]);

    expect(found.map((f) => f.key)).toEqual(['printing:unprintable:w']);
  });

  const item = (over: Partial<SourcedItem>): SourcedItem => ({
    id: 'maker-thing',
    kind: 'material',
    name: 'Thing',
    maker: 'Maker',
    mpn: 'T-1',
    spec: 'A thing',
    url: 'https://maker.example/t-1',
    sources: [{ claim: 'size', url: 'https://maker.example/t-1.pdf' }],
    addedAt: '2026-11-07',
    link: { status: 'confirmed', checkedAt: '2026-11-07' },
    ...over,
  });

  it('marks sourced items separately and blocks unreferenced ones', () => {
    registerSourced([
      item({ id: 'good-thing' }),
      item({ id: 'bad-link', link: { status: 'unconfirmed', checkedAt: '' } }),
    ]);

    const bom = bomOf(
      [],
      [
        { key: 'supply:good-thing', qty: 1 },
        { key: 'supply:bad-link', qty: 1 },
      ],
    );

    expect(bom.lines.map((l) => l.category)).toEqual(['Materials', 'Materials']);
    expect(sourcingFindings(bom).map((f) => f.key)).toEqual(['parts:unreferenced:bad-link']);
  });

  it('needs real geometry for a part that takes up space', () => {
    registerSourced([item({ id: 'no-mesh', kind: 'part' })]);

    const bom = bomOf([], [{ key: 'supply:no-mesh', qty: 1 }]);

    expect(bom.lines[0].category).toBe('Added by Agent');
    expect(sourcingFindings(bom)[0].agentText).toContain('import_maker_cad');
    expect(sourcingFindings(bom)[0].text).not.toContain('import_maker_cad');
  });

  it('keeps equipment out of the robot cost', () => {
    const bom = bomOf([], [{ key: 'supply:hex-key-set', qty: 1 }]);

    expect(bom.lines[0].category).toBe('Equipment');
    expect(bom.totals.estimatedUsd).toBe(0);
  });

  it('asks no price for a part the user owns enough of', () => {
    registerSourced([item({ id: 'owned-thing' })]);

    const extras = [{ key: 'supply:owned-thing', qty: 2 }];
    const priceNotes = (onHand: number) =>
      bomFindings(
        buildBom({
          parts: [],
          project: { extras } as never,
          purchases: { 'supply:owned-thing': { onHand } },
          measures: {},
        }),
      ).filter((f) => f.rule === 'no-price');

    expect(priceNotes(1)).toHaveLength(1);
    expect(priceNotes(2)).toEqual([]);
  });
});

describe('a run that fails', () => {
  const failed = failedReadiness(new Error('worker died'), { parts: [part('a')] });

  it('blocks the verdict instead of leaving the last one up', () => {
    expect(failed.status).toBe('blocked');
    expect(failed.blockers.map((f) => f.rule)).toEqual(['unfinished']);
    expect(failed.blockers[0].agentText).toContain('worker died');
  });

  it('never counts as measured, so asking again measures again', () => {
    expect(failed.fingerprint).toBe('');
  });
});
