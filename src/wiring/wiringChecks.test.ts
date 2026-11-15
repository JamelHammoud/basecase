import { describe, expect, it } from 'vitest';
import { engineeringFindings } from '../readiness/findings';
import { runEngineering } from '../utils/engineering';
import { so101 } from './fixtures';
import { wiringNetlist, type Net } from './netlist';
import { wiringRows } from './wiringChecks';

const route = (status: 'pass' | 'fail' | 'unresolved'): NonNullable<Net['route']> => ({
  points: [
    [0, 0, 0],
    [250, 0, 0],
  ],
  requiredMm: 300,
  cableSupplyId: 'bus-servo-cable',
  lengthMm: 200,
  status,
  reason: status === 'unresolved' ? 'Choose a cable with a published length.' : null,
  limitingPose: { elbow: 90 },
});

describe('Cable reach checks', () => {
  it('keeps passing routes out of findings and selects both cable ends for a short cable', () => {
    const scene = so101();
    const wiring = wiringNetlist(scene);

    wiring.buses[0].nets.forEach((net) => {
      net.route = route('pass');
    });
    wiring.buses[0].nets[1].route = route('fail');

    const report = runEngineering({ ...scene, wiring, measures: {}, servoOutputs: {} });
    const rows = report.rows.filter((row) => row.check === 'Cable reach');
    const findings = engineeringFindings(report).filter((finding) => finding.check === 'Cable reach');

    expect(report.wiring).toBe(wiring);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'fail', items: [{ ids: ['servo1', 'servo2'], joint: 'elbow' }] });
    expect(rows[0].detail).toContain('300 mm');
    expect(rows[0].detail).toContain('200 mm');
    expect(findings).toMatchObject([{ level: 'blocker', ids: ['servo1', 'servo2'], joint: 'elbow' }]);
    expect(findings[0].text).not.toContain('300');
    expect(findings[0].agentText).toContain('elbow');
  });

  it('reports unresolved routing as a blocker with its reason and no guessed length', () => {
    const wiring = wiringNetlist(so101());

    wiring.buses[0].nets[0].route = { ...route('unresolved'), requiredMm: null, lengthMm: null };

    const row = wiringRows(wiring).find((item) => item.check === 'Cable reach');

    expect(row).toMatchObject({ status: 'fail', items: [{ status: 'fail', ids: ['adapter', 'servo1'] }] });
    expect(row?.detail).toContain('Choose a cable with a published length.');
    expect(row?.detail).not.toContain('null');
  });

  it('passes measured routes and leaves a topology-only netlist without a reach verdict', () => {
    const wiring = wiringNetlist(so101());

    expect(wiringRows(wiring).find((row) => row.check === 'Cable reach')).toBeUndefined();
    wiring.buses[0].nets.forEach((net) => {
      net.route = route('pass');
    });
    expect(wiringRows(wiring).find((row) => row.check === 'Cable reach')).toMatchObject({ status: 'pass' });
  });

  it('names limiting joints and formats slider travel as a signed length', () => {
    const scene = so101();
    const wiring = wiringNetlist(scene);
    const slider = { ...scene.project.joints![0], id: 'elbow', name: 'Wrist slide', type: 'prismatic' as const };

    wiring.buses[0].nets[0].route = { ...route('fail'), limitingPose: { elbow: -5 } };

    const row = wiringRows(wiring, [slider]).find((item) => item.check === 'Cable reach');

    expect(row?.detail).toContain('Wrist slide: −5 mm');
    expect(row?.items?.[0].joint).toBe('elbow');
  });
});
