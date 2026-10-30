import { describe, expect, it } from 'vitest';
import { toCad } from '../agent/agentFrame';
import { applySpec, specToPart, type AgentCadPayload } from '../agent/agentScene';
import { planMate } from '../agent/mate';
import { findPort, worldPort } from '../agent/ports';
import type { Port } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import { ActorIndex } from './agentActors';
import { applyAgentOps, type AgentOpsContext } from './applyAgentOps';

function slab(id: string, z: number, port: Port): ScenePart {
  const cad: AgentCadPayload = {
    language: 'openscad',
    code: 'cube([20, 20, 5]);',
    positions: [0, 0, 0, 20, 0, 0, 0, 20, 0, 0, 0, 5],
    indices: [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3],
    ports: [port],
  };

  return specToPart({ id, shape: 'cad_part', cad, position: [0, 0, z] });
}

function scene(initial: ScenePart[], actors: ActorIndex, actor: string) {
  let parts = initial;
  const commits: boolean[] = [];
  const ctx: AgentOpsContext = {
    current: () => parts,
    commitParts: (fn, live) => {
      parts = fn(parts);
      commits.push(!!live);
    },
    viewport: () => null,
    setCursor: () => {},
    setAction: () => {},
    isFollowing: () => false,
    guard: (id) => {
      actors.claim(id, actor);

      return null;
    },
    touch: () => {},
  };

  return { parts: () => parts, ctx, commits };
}

const top: Port = { name: 'top', position: [10, 10, 5], axis: [0, 0, 1], kind: 'face' };
const under: Port = { name: 'under', position: [10, 10, 0], axis: [0, 0, -1], kind: 'face' };

describe('applyAgentOps with mates', () => {
  it('moves a mated part with its target in the same undo step, and records who edited what', async () => {
    const base = slab('base', 0, top);
    const plan = planMate([base, slab('lid', 30, under)], {
      part: 'lid',
      port: 'under',
      target: 'base',
      targetPort: 'top',
      type: 'face',
    });

    if (typeof plan === 'string') throw new Error(plan);

    const lid = applySpec(slab('lid', 30, under), plan.op.op === 'update' ? plan.op.part : { id: 'lid' });
    const actors = new ActorIndex();
    const { parts, ctx, commits } = scene([base, lid], actors, 'main/agent-1');
    const summary = await applyAgentOps([{ op: 'update', part: { id: 'base', position: [40, 0, 12] } }], ctx);
    const placed = (id: string, name: string) => {
      const p = parts().find((q) => q.id === id)!;

      return toCad(worldPort(p, findPort(p, name)!).position);
    };

    expect(summary).toContain('Moved with their mates: lid.');
    placed('lid', 'under').forEach((v, k) => expect(v).toBeCloseTo(placed('base', 'top')[k], 2));
    expect(commits).toEqual([true, false]);
    expect(actors.editsFor('main/agent-1', 'Left leg')?.sort()).toEqual(['base', 'lid']);
  });
});
