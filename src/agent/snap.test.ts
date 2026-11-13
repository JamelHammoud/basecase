import { describe, expect, it } from 'vitest';
import type { V3 } from './agentFrame';
import { applySpec } from './agentScene';
import { HORN_CIRCLE, M5, PIVOT, portOf, servoAt, servoWithPortNear, snapBracket } from './fixtures/snapBracket';
import { planMate } from './mate';
import { followHandEdit } from './mateFollow';
import { findPort } from './ports';
import { fitProblem, mateTypeFor, nearbyPorts, nearestPair, portsAt, snapPart, snapTargets, SNAP_MM } from './snap';

const bracket = snapBracket();

describe('which ports fit', () => {
  const horn = findPort(servoAt([0, 0, 0]), 'horn')!;
  const output = findPort(servoAt([0, 0, 0]), 'output')!;

  it('fastens a servo horn to a bracket hole circle of the same pattern', () => {
    expect(mateTypeFor(horn, { ...HORN_CIRCLE })).toBe('fastened');
  });

  it('puts a servo output coaxially into a bore that fits it', () => {
    expect(mateTypeFor(output, PIVOT)).toBe('coaxial');
  });

  it('never pairs a mismatched thread, pattern or bore', () => {
    expect(mateTypeFor(horn, { ...HORN_CIRCLE, thread: 'M2' })).toBeNull();
    expect(mateTypeFor(horn, { ...HORN_CIRCLE, count: 6 })).toBeNull();
    expect(mateTypeFor(output, { ...PIVOT, diameterMm: 5 })).toBeNull();
    expect(fitProblem(horn, { ...HORN_CIRCLE, thread: 'M2' })).toBe('M3 against M2');
  });

  it('never pairs kinds that don’t meet, like an output and a screw hole', () => {
    expect(mateTypeFor(output, M5)).toBeNull();
  });
});

describe('the nearest compatible pair', () => {
  it('finds the horn and the bracket’s hole circle when they come within reach', () => {
    const servo = servoWithPortNear('horn', bracket, 'horn', [2, -3, 1]);
    const pair = nearestPair(portsAt(servo), snapTargets([bracket, servo], 'servo'), SNAP_MM);

    expect(pair).toMatchObject({ port: 'horn', target: 'bracket', targetPort: 'horn', type: 'fastened' });
    expect(pair!.distanceMm).toBeCloseTo(Math.hypot(2, 3, 1), 5);
  });

  it('finds the output and the bracket’s bore', () => {
    const servo = servoWithPortNear('output', bracket, 'pivot', [0, -4, 0]);
    const pair = nearestPair(portsAt(servo), snapTargets([bracket, servo], 'servo'), SNAP_MM);

    expect(pair).toMatchObject({ port: 'output', targetPort: 'pivot', type: 'coaxial' });
  });

  it('leaves out the numbered holes of a hole circle', () => {
    expect(portsAt(servoAt([0, 0, 0])).map((p) => p.port.name)).not.toContain('horn-1');
  });

  it('finds nothing beyond reach', () => {
    const servo = servoWithPortNear('horn', bracket, 'horn', [0, -SNAP_MM - 1, 0]);

    expect(nearestPair(portsAt(servo), snapTargets([bracket, servo], 'servo'), SNAP_MM)).toBeNull();
  });

  it('never snaps onto incompatible ports, however close', () => {
    const servo = servoWithPortNear('output', bracket, 'm5', [0, 0, 0]);
    const pair = nearestPair(portsAt(servo), snapTargets([bracket, servo], 'servo'), SNAP_MM);

    expect(pair).toBeNull();
  });

  it('never targets a part that is mated to the dragged one', () => {
    const servo = {
      ...servoAt([0, 0, 0]),
      mates: [{ port: 'horn', target: 'bracket', targetPort: 'horn', type: 'fastened' as const }],
    };

    expect(snapTargets([bracket, servo], 'bracket')).toEqual([]);
  });

  it('shows dots only on ports that have a partner nearby', () => {
    const servo = servoWithPortNear('horn', bracket, 'horn', [0, -2, 0]);
    const near = nearbyPorts(portsAt(servo), snapTargets([bracket, servo], 'servo'), 10);

    expect(near.mover.map((p) => p.port.name)).toContain('horn');
    expect(near.targets.map((p) => p.port.name)).toEqual(['horn']);
  });
});

describe('the snapped pose', () => {
  it('equals the agent’s mate plan for the same pair', () => {
    const servo = servoWithPortNear('horn', bracket, 'horn', [3, -2, 1]);
    const parts = [bracket, servo];
    const snap = snapPart({ parts, mover: servo, reachMm: SNAP_MM, free: false })!;
    const plan = planMate(parts, {
      part: 'servo',
      port: 'horn',
      target: 'bracket',
      targetPort: 'horn',
      type: 'fastened',
    });

    if (typeof plan === 'string' || plan.op.op !== 'update') throw new Error('no plan');

    const agent = applySpec(servo, plan.op.part);

    expect(snap.placement.position).toEqual(agent.position);
    expect(snap.placement.rotation).toEqual(agent.rotation);
    expect(snap.placement.mates).toEqual(agent.mates);
    portOf({ ...servo, ...snap.placement }, 'horn').position.forEach((v, k) =>
      expect(v).toBeCloseTo(portOf(bracket, 'horn').position[k], 1),
    );
  });

  it('records the mate the agent would', () => {
    const servo = servoWithPortNear('output', bracket, 'pivot', [1, -1, 0]);
    const snap = snapPart({ parts: [bracket, servo], mover: servo, reachMm: SNAP_MM, free: false })!;

    expect(snap.placement.mates).toEqual([{ port: 'output', target: 'bracket', targetPort: 'pivot', type: 'coaxial' }]);
  });

  it('is suppressed while ⌘ is held', () => {
    const servo = servoWithPortNear('horn', bracket, 'horn', [1, 0, 0]);

    expect(snapPart({ parts: [bracket, servo], mover: servo, reachMm: SNAP_MM, free: true })).toBeNull();
  });
});

describe('hand edits keep mates', () => {
  const snapped = () => {
    const servo = servoWithPortNear('horn', bracket, 'horn', [1, -1, 0]);
    const snap = snapPart({ parts: [bracket, servo], mover: servo, reachMm: SNAP_MM, free: false })!;

    return [bracket, { ...servo, ...snap.placement }];
  };

  it('moves a mated part when its target is moved by hand', () => {
    const before = snapped();
    const moved = [applySpec(before[0], { id: 'bracket', position: [30, 0, 140] }), before[1]];
    const after = followHandEdit(before, moved);

    portOf(after[1], 'horn').position.forEach((v, k) => expect(v).toBeCloseTo(portOf(after[0], 'horn').position[k], 1));
  });

  it('drops the mate when the mated part is moved beyond the snap distance', () => {
    const before = snapped();
    const away = {
      ...before[1],
      position: [before[1].position[0] + 40, before[1].position[1], before[1].position[2]] as V3,
    };
    const after = followHandEdit(before, [before[0], away]);

    expect(after[1].mates).toBeUndefined();
    expect(after[1].position).toEqual(away.position);
  });

  it('keeps the mate and reseats a part nudged within the snap distance', () => {
    const before = snapped();
    const nudged = {
      ...before[1],
      position: [before[1].position[0] + 2, before[1].position[1], before[1].position[2]] as V3,
    };
    const after = followHandEdit(before, [before[0], nudged]);

    expect(after[1].mates).toHaveLength(1);
    after[1].position.forEach((v, k) => expect(v).toBeCloseTo(before[1].position[k], 2));
  });
});

describe('the agent’s mate tool', () => {
  it('says when the two ports don’t fit, with the same rule snapping uses', () => {
    const odd = { ...bracket, cad: { ...bracket.cad!, ports: [{ ...HORN_CIRCLE, thread: 'M2' }] } };
    const plan = planMate([odd, servoAt([0, 0, 0])], {
      part: 'servo',
      port: 'horn',
      target: 'bracket',
      targetPort: 'horn',
      type: 'fastened',
    });

    expect(typeof plan === 'string' ? plan : plan.text).toContain('These ports don’t fit: M3 against M2.');
  });
});
