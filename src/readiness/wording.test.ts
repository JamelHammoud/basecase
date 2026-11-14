import { describe, expect, it } from 'vitest';
import { engineeringFindings } from './findings';
import { engineeringFinding, ruleFinding, RULES } from './wording';

const JARGON = /_|0\.84|\bdriver|mm²|blocker|stand-in|referenceable|BLOCKER/;

describe('what the user reads', () => {
  it('has no tool names, ids or thresholds in any rule', () => {
    for (const [code, rule] of Object.entries(RULES)) {
      expect(rule.text, code).not.toMatch(JARGON);
      expect(rule.name, code).toMatch(/^[A-Z]/);
    }
  });

  it('keeps the technical text for the agent', () => {
    const f = ruleFinding('thin', 'blocker', { agentText: 'walls under 0.84 mm', ids: ['tub'] });

    expect(f.text).not.toContain('0.84');
    expect(f.agentText).toContain('0.84');
    expect(f).toMatchObject({ key: 'printing:thin:tub', check: 'Printing', rule: 'thin', ruleName: 'Thin Walls' });
  });

  it('puts a servo’s numbers in the detail, under a plain sentence', () => {
    const f = engineeringFinding('Servo torque', 'blocker', { detail: 'hip: 3 N·m, 120% of stall', ids: ['hip'] });

    expect(f.text).toBe('This servo is too weak for its joint.');
    expect(f.detail).toContain('120%');
    expect(f.ruleName).toBe('Servo Torque Checks');
    expect(engineeringFinding('Range of motion', 'note', { detail: '' }).ruleName).toBe('Range of Motion Checks');
  });
});

describe('engineering rows', () => {
  const report = (row: object) => ({ rows: [row] }) as never;

  it('only makes a blocker of the servo that fails, not its neighbours', () => {
    const levels = engineeringFindings(
      report({
        check: 'Servo torque',
        status: 'fail',
        detail: '',
        items: [
          { text: 'hip', ids: ['hip'], status: 'fail' },
          { text: 'knee', ids: ['knee'], status: 'warn' },
        ],
      }),
    ).map((f) => f.level);

    expect(levels).toEqual(['blocker', 'note']);
  });

  it('counts going over budget once, not once per costly part', () => {
    const found = engineeringFindings(
      report({
        check: 'Budget',
        status: 'fail',
        detail: 'BOM ≈ $602 of $500',
        itemsAreContext: true,
        items: [{ text: '6× servo' }, { text: '1× Pi' }],
      }),
    );

    expect(found.map((f) => f.text)).toEqual(['BOM ≈ $602 of $500']);
    expect(found[0].agentText).toBe('Budget: BOM ≈ $602 of $500. Biggest: 6× servo; 1× Pi');
  });

  it('tells the agent what takes the most time when Time fails', () => {
    const [found] = engineeringFindings(
      report({
        check: 'Time',
        status: 'fail',
        detail: '≈ 9 h 41 min of 2 h',
        itemsAreContext: true,
        items: [
          { text: 'Plate 1: 9 h 18 min' },
          { text: 'Step 3: 12 fasteners, 26 min' },
          { text: '3 servos: 15 min' },
        ],
      }),
    );

    expect(found.text).toBe('This robot takes longer to build than your time budget.');
    expect(found.detail).toBe('≈ 9 h 41 min of 2 h');
    expect(found.agentText).toContain('Plate 1: 9 h 18 min; Step 3: 12 fasteners, 26 min; 3 servos: 15 min');
  });

  it('keeps an ignored Time finding ignored when its hours change', () => {
    const time = (detail: string) =>
      engineeringFindings(
        report({ check: 'Time', status: 'fail', detail, itemsAreContext: true, items: [{ text: '3 servos: 15 min' }] }),
      )[0].key;

    expect(time('≈ 9 h 41 min of 2 h')).toBe(time('≈ 8 h 5 min of 2 h'));
  });

  it('leaves a check that did not apply out of the findings', () => {
    expect(engineeringFindings(report({ check: 'Budget', status: 'not run', detail: 'No budget set' }))).toEqual([]);
  });
});
