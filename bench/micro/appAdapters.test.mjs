import { describe, expect, it } from 'vitest';
import { AdapterMissing } from './adapterMissing.mjs';
import { craft, enclosures, removalOrder, serviceDepth } from './appAdapters.mjs';

const data = {
  screws: { 's-1': { verdict: 'pass' }, 's-2': { verdict: 'stuck', blockers: ['shell'] } },
  stuckParts: [],
  service: [
    { id: 'battery', cls: 'battery', steps: 2, partsOut: ['hatch'], screwsOut: [], blockedBy: [] },
    {
      id: 'pi5',
      cls: 'electronics',
      steps: 6,
      partsOut: ['torso-frame', 'left-shoulder-servo'],
      screwsOut: [],
      blockedBy: [],
    },
  ],
  enclosing: ['torso-shell'],
};
const app = { call: async () => ({ text: '', data }) };
const scene = { parts: [{ id: 'left-shoulder-servo', jointId: 'left_shoulder' }] };

describe('app-backed graders', () => {
  it('read removal order, service depth and enclosures from check_assembly', async () => {
    expect((await removalOrder({ app }, scene, { screws: ['s-1'] })).pass).toBe(true);
    expect((await removalOrder({ app }, scene, {})).detail).toBe('stuck: s-2');
    expect((await serviceDepth({ app }, scene, { target: 'battery', maxSteps: 2, forbidJoints: true })).pass).toBe(
      true,
    );

    const pi = await serviceDepth({ app }, scene, {
      target: 'pi',
      maxSteps: 5,
      forbidJoints: true,
      forbidStructural: true,
    });

    expect(pi.pass).toBe(false);
    expect(pi.detail).toBe('6 steps; removes an actuated part; removes a structural part');
    expect((await enclosures({ app })).pass).toBe(false);
  });

  it('report unavailable instead of passing without data', async () => {
    await expect(removalOrder({ app: null }, scene)).rejects.toBeInstanceOf(AdapterMissing);
    expect(() => craft({}, { parts: [] }, { maxSolidity: 0.85 })).toThrow(AdapterMissing);
  });

  it('compare craft metrics before and after', () => {
    const part = (sharp, solidity) => ({ id: 'arm', cad: { audit: { craft: { envelopeSharp: sharp, solidity } } } });
    const ctx = { before: { parts: [part(0.9, 0.9)] }, after: { parts: [part(0.6, 0.7)] } };

    expect(craft(ctx, ctx.after, { part: 'arm', sharpShareDrops: true, maxSolidity: 0.85 }).pass).toBe(true);
    expect(craft(ctx, ctx.before, { maxSolidity: 0.85 }).detail).toContain('arm solidity 0.9');
  });
});
