import { describe, expect, it } from 'vitest';
import { biped, box, part, run, type Scene } from '../utils/engineering.fixtures';
import type { WalkSim } from '../utils/engineeringTypes';
import { engineeringFindings } from './findings';
import { readinessOf } from './readiness';
import { shownDetail } from './shownDetail';

function opened(s: Scene, check: string, walk?: WalkSim) {
  const report = run(s, {}, { walk });
  const readiness = readinessOf(engineeringFindings(report), { parts: s.parts, fingerprint: 'f', rows: report.rows });
  const summary = readiness.checks.find((c) => c.name === check)!;
  const findings = [...readiness.blockers, ...readiness.notes].filter((f) => f.check === check);

  return { summary: shownDetail(summary, findings), findings: findings.map((f) => f.detail ?? f.text) };
}

const heavy = () => {
  const s = biped();

  s.parts.find((p) => p.id === 'torso')!.massG = 40000;

  return s;
};

const walking = (s: Scene, fellAt: number | null): WalkSim => ({
  policy: 'Walk',
  seconds: 14,
  fellAt,
  joints: Object.fromEntries(s.joints.map((j) => [j.id, { p99Nm: 1, rmsNm: 0.5, overS: 0 }])),
});

describe('the summary an open check shows', () => {
  it('drops a count its findings already list', () => {
    const { summary, findings } = opened(heavy(), 'Servo torque');

    expect(findings.length).toBeGreaterThan(0);
    expect(summary).toBe('');
  });

  it('keeps the note that no foot reaches the lowest point', () => {
    const s = biped();

    s.parts.find((p) => p.id === 'thighL')!.massG = 3000;
    s.measures.thighL = box([-80, 80, -20], [-40, 120, 20]);
    s.parts.push(part('tail', { massG: 10 }));
    s.joints[0] = { ...s.joints[0], parent: ['torso', 'tail'] };
    s.measures.tail = box([-5, -50, -5], [5, 450, 5]);

    const { summary, findings } = opened(s, 'Servo torque');

    expect(findings.length).toBeGreaterThan(0);
    expect(summary).toMatch(/No foot reaches the robot’s lowest point/);
  });

  it('keeps the fall above Peak torque’s joints', () => {
    const s = biped();
    const { summary, findings } = opened(s, 'Peak torque', walking(s, 1.2));

    expect(findings.length).toBeGreaterThan(0);
    expect(summary).toBe('Fell at 1.2 s walking with servos limited to 0.7 × stall');
  });

  it('drops a summary a finding says word for word', () => {
    const summary = { name: 'Joint support', status: 'warn' as const, detail: 'Held on one side', ids: [] };
    const finding = {
      key: 'k',
      level: 'note' as const,
      area: 'design' as const,
      check: 'Joint support',
      rule: 'joint-support',
      ruleName: 'Joint Support Checks',
      text: 'These joints are held on one side only, which strains the servo.',
      agentText: 'Joint support: Held on one side',
      detail: 'Held on one side',
      ids: [],
    };

    expect(shownDetail(summary, [finding])).toBe('');
    expect(shownDetail(summary, [])).toBe('Held on one side');
  });
});
