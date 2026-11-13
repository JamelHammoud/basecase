import { describe, expect, it } from 'vitest';
import { engineeringFindings } from '../readiness/findings';
import { L_BRACKET, L_BRACKET_NAME, lBracketScene, ON_ITS_SIDE } from '../strength/fixtures/lBracket';
import { solveCpuMs, strengthReport } from '../strength/fixtures/run';
import { FACTOR_PASS, FACTOR_WARN } from '../strength/types';

const SOLVE_BUDGET_MS = 2000;

describe('Strength', () => {
  it('fails a 3 mm L-bracket under an STS3215’s load with its layers across the bend, and offers a better face', async () => {
    const { row, readings, jobs, scene } = await strengthReport(lBracketScene());
    const reading = readings.find((r) => r?.part === L_BRACKET)!;

    expect(reading.factor).toBeLessThan(FACTOR_WARN);
    expect(await solveCpuMs(scene, jobs[0])).toBeLessThan(SOLVE_BUDGET_MS);
    expect(row).toMatchObject({ check: 'Strength', status: 'fail', ids: [L_BRACKET] });
    expect(row!.items![0].text).toMatch(
      new RegExp(`^${L_BRACKET_NAME}: \\d\\.\\d×, \\d\\.\\d\\d N·m \\(Shoulder pitch\\)$`),
    );

    const [finding] = engineeringFindings({ rows: [row!], joints: [], massG: 0, com: [0, 0, 0], masses: [] });

    expect(finding).toMatchObject({ level: 'blocker', ids: [L_BRACKET], fix: { kind: 'print-face', part: L_BRACKET } });
    expect(finding.agentText).toContain(`Strength: ${L_BRACKET_NAME}`);
  }, 60000);

  it('passes the same bracket printed on its side, and the face Fix picks', async () => {
    const before = await strengthReport(lBracketScene());
    const fix = before.row!.items![0].fix!;

    if (fix.kind !== 'print-face') throw new Error(`Expected a print face, got ${fix.kind}`);

    for (const down of [ON_ITS_SIDE, fix.down]) {
      const { row, readings } = await strengthReport(lBracketScene({ down }));

      expect(readings[0]!.factor).toBeGreaterThanOrEqual(FACTOR_PASS);
      expect(row).toMatchObject({ status: 'pass', items: [] });
    }
  }, 60000);

  it('passes a 10 mm block in any orientation', async () => {
    const { row, readings } = await strengthReport(lBracketScene({ thickness: 10 }));

    expect(readings[0]!.factor).toBeGreaterThanOrEqual(FACTOR_PASS);
    expect(row!.status).toBe('pass');
  }, 60000);
});
