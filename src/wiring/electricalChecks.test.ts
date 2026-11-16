import { describe, expect, it } from 'vitest';
import { electricalFindings, electricalRows, inspectElectrical } from './electricalChecks';
import { electricalProjection } from './electrical';
import { component, sceneOf } from './fixtures';
import { ignoreFinding, readinessOf } from '../readiness/readiness';

describe('electrical readiness findings', () => {
  it('keeps multiple requirements on one part independent through inspection and Ignore', async () => {
    const scene = sceneOf([component('adapter', 'waveshare-bus-servo-adapter-a')], []);
    const projection = electricalProjection(scene);
    const inspected = await inspectElectrical(scene);
    const findings = electricalFindings(projection);

    expect(inspected).toEqual({ rows: electricalRows(projection), findings });
    expect(findings.filter((finding) => finding.ids.includes('adapter')).length).toBeGreaterThan(1);
    expect(new Set(findings.map((finding) => finding.key)).size).toBe(findings.length);

    const target = findings.find((finding) => finding.ids.includes('adapter'))!;
    const after = readinessOf(findings, {
      parts: scene.parts,
      rows: inspected.rows,
      fingerprint: 'scene',
      decisions: ignoreFinding(undefined, target),
    });

    expect(after.ignored).toEqual([target]);
    expect(after.blockers).toEqual(findings.filter((finding) => finding.key !== target.key));
    expect(after.checks.find((check) => check.name === 'Electrical connections')?.status).toBe('fail');
  });
});
