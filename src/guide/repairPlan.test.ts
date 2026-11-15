import { describe, expect, it } from 'vitest';
import { bracket, objectsOf } from '../assembly/assembly.fixtures';
import { fastenerInput } from '../assembly/fastenerSpec';
import { planRemoval } from '../assembly/removalOrder';
import { provenOrder } from '../assembly/provenOrder';
import { quadrupedFixture } from '../print/merge/merge.fixtures';
import { servoArm } from '../sim/fixtures/servoArm';
import { assemblyIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildAlongSteps } from './buildAlong';
import { buildGuidePlan } from './guidePlan';
import { boxCenter } from './guideMath';
import { approximateScene } from './guideScene';
import { repairInWorker } from './repairClient';
import { buildRepairPlan } from './repairPlan';
import { repairRecord } from './repairFixture';

async function fixture(parts: ScenePart[], target: string, joints: RobotJoint[] = []) {
  const geometry = await assemblyIn(snapshotShapes(objectsOf(parts)), {
    ...fastenerInput(parts),
    serviceable: [target],
    budgetMs: 20000,
  });
  const removal = planRemoval(geometry, Object.fromEntries(parts.map((p) => [p.id, p.group?.id])));
  const scene = approximateScene('Robot', parts, joints);
  const plan = buildGuidePlan({ ...scene, order: provenOrder(removal, Object.keys(geometry.moves)) }, 'PETG');

  return { geometry, removal, plan, boxes: scene.boxes };
}

describe('repair guide', () => {
  it('proves removal, one replacement and reassembly for the browser fixture', async () => {
    const f = await fixture(repairRecord.parts, 'bracket');
    const repair = await repairInWorker({ ...f, target: 'bracket', groups: {} });

    expect(f.geometry.timedOut).toBe(false);
    expect(repair?.repair).toEqual({ partId: 'bracket', printed: true });
    expect(repair?.steps.map((step) => step.repairPhase)).toEqual(['remove', 'swap', 'reassemble']);
    expect(repair?.steps.filter((step) => step.repairPhase === 'swap').map((step) => step.partIds)).toEqual([
      ['bracket'],
    ]);
    expect(new Set(buildAlongSteps(repair!, []).at(-1)!.shown)).toEqual(new Set(f.plan.partIds));
  });

  it('removes only the target and its fasteners, preserves item letters and restores the full scene', async () => {
    const parts = bracket({ cover: true });
    const f = await fixture(parts, 'plate');
    const before = JSON.stringify(f.plan);
    const input = { plan: f.plan, target: 'plate', geometry: f.geometry, boxes: f.boxes, groups: {} };
    const repair = (await repairInWorker(input))!;
    const removals = repair.steps.filter((step) => step.repairPhase === 'remove');
    const ids = removals.flatMap((step) => step.partIds);
    const targetItem = f.plan.items.find((item) => item.partIds.includes('plate'))!;
    const playback = buildAlongSteps(repair, []);

    expect(ids).toContain('plate');
    expect(ids).toContain('screw-1');
    expect(ids).toContain('screw-2');
    expect(ids).not.toContain('boss');
    expect(ids).toEqual(['screw-2', 'cover', 'screw-1', 'plate']);
    expect(await repairInWorker(input)).toEqual(repair);
    expect(repair.items).toBe(f.plan.items);
    expect(repair.repair).toEqual({ partId: 'plate', printed: true });
    expect(repair.steps.find((step) => step.repairPhase === 'swap')?.callout).toEqual([
      { key: targetItem.key, qty: 1 },
    ]);
    expect(playback.every((step) => step.shown.includes('boss'))).toBe(true);
    expect(playback[removals.length].shown).not.toContain('plate');
    removals.forEach((step, i) => step.partIds.forEach((id) => expect(playback[i + 1].shown).not.toContain(id)));
    expect(new Set(playback.at(-1)!.shown)).toEqual(new Set(f.plan.partIds));
    expect(JSON.stringify(f.plan)).toBe(before);
    expect(repair.steps.every((step) => step.number > 0 && !step.unproven)).toBe(true);
  });

  it('uses measured removal directions and reverses only the arrows of affected parts', async () => {
    const f = await fixture(bracket({ cover: true }), 'plate');
    const repair = buildRepairPlan(f.plan, f.removal, 'plate', { geometry: f.geometry, boxes: f.boxes })!;
    const out = new Set<string>();

    for (const step of repair.steps.filter((s) => s.repairPhase === 'remove')) {
      const target = step.partIds.find((id) => f.geometry.moves[id]);

      if (target) {
        const motion = f.geometry.moves[target];
        const ways = target === 'plate' ? motion.exit! : motion.local;
        const dir = motion.dirs[ways.findIndex((way) => way.every((id) => out.has(id) || step.partIds.includes(id)))];
        const move = step.moves.find((m) => m.partId === target)!;

        expect(move.offset.map((v) => Math.sign(v))).toEqual(dir.map((v) => Math.sign(v)));
      }

      expect(step.moves.every((move) => step.partIds.includes(move.partId))).toBe(true);
      expect(step.arrows.length).toBeGreaterThan(0);
      step.partIds.forEach((id) => out.add(id));
    }
  });

  it('returns no plan for absent targets or incomplete measurements', async () => {
    const f = await fixture(bracket(), 'plate');

    expect(buildRepairPlan(f.plan, f.removal, 'missing', f.geometry)).toBeNull();
    expect(buildRepairPlan(f.plan, f.removal, 'plate', { ...f.geometry, timedOut: true })).toBeNull();
  });
});

describe('repair guide preparation', () => {
  it('prepares the bare replacement print and its hosted inserts in isolation', async () => {
    const f = await fixture(bracket(), 'boss');
    const hosted = f.geometry.chains.sleeves.filter((sleeve) => sleeve.kind === 'insert' && sleeve.host === 'boss');
    const repair = buildRepairPlan(f.plan, f.removal, 'boss', { geometry: f.geometry, boxes: f.boxes })!;
    const prepared = repair.steps.find((step) => step.kind === 'inserts')!;
    const swapIndex = repair.steps.findIndex((step) => step.repairPhase === 'swap');
    const installed = repair.steps.findIndex((step) => step.repairPhase === 'reassemble' && step.kind !== 'inserts');
    const item = f.plan.items.find((entry) => entry.partIds.includes(hosted[0].id))!;

    expect(hosted).toHaveLength(2);
    expect(prepared).toBeDefined();
    expect(repair.steps.indexOf(prepared)).toBeGreaterThan(swapIndex);
    expect(repair.steps.indexOf(prepared)).toBeLessThan(installed);
    expect(prepared.partIds).toEqual(hosted.map((sleeve) => sleeve.id));
    expect(prepared.contextIds).toEqual(['boss']);
    expect(prepared.callout).toEqual([{ key: item.key, qty: 2 }]);
    expect(prepared.tools).toContain(f.plan.tools.find((tool) => tool.icon === 'soldering-iron')!.id);
    expect(prepared.moves.find((move) => move.partId === 'boss')).toBeUndefined();
    expect(prepared.shownIds).toEqual(['boss', ...hosted.map((sleeve) => sleeve.id)]);
    expect(prepared.arrows).toHaveLength(2);
    expect(prepared.arrows.map((arrow) => arrow.to)).toEqual(hosted.map((sleeve) => boxCenter(f.boxes[sleeve.id])));
    expect(buildAlongSteps(repair, [])[repair.steps.indexOf(prepared)].tools).toContain('Soldering iron');
    expect(new Set(buildAlongSteps(repair, []).at(-1)!.shown)).toEqual(new Set(f.plan.partIds));
  });

  it('leaves the other three quadruped legs assembled', async () => {
    const { parts } = quadrupedFixture();
    const target = parts.find((part) => part.id.startsWith('fl-') && part.kind !== 'hardware')!.id;
    const f = await fixture(parts, target);
    const repair = buildRepairPlan(f.plan, f.removal, target, { geometry: f.geometry, boxes: f.boxes })!;

    expect(parts).toHaveLength(81);
    expect(repair).not.toBeNull();

    const removed = repair.steps.filter((step) => step.repairPhase === 'remove').flatMap((step) => step.partIds);

    expect(removed.every((id) => id.startsWith('fl-'))).toBe(true);
    expect(repair.steps.find((step) => step.kind === 'inserts')?.partIds).toEqual(
      f.geometry.chains.sleeves
        .filter((sleeve) => sleeve.kind === 'insert' && sleeve.host === target)
        .map((sleeve) => sleeve.id),
    );
    expect(
      buildAlongSteps(repair, [])
        .filter((_, i) => repair.steps[i].kind !== 'inserts')
        .every((step) => step.shown.includes('body')),
    ).toBe(true);
    expect(new Set(buildAlongSteps(repair, []).at(-1)!.shown)).toEqual(new Set(f.plan.partIds));
  });

  it('names the bought replacement from the arm guide and offers no print action', async () => {
    const { parts, joints } = servoArm();
    const target = 'arm2-servo';
    const f = await fixture(parts, target, joints);
    const repair = buildRepairPlan(f.plan, f.removal, target, { geometry: f.geometry, boxes: f.boxes })!;
    const item = f.plan.items.find((entry) => entry.partIds.includes(target))!;
    const swap = buildAlongSteps(repair, joints).find((step) => step.repairPhase === 'swap')!;

    expect(repair.repair).toEqual({ partId: target, printed: false });
    expect(swap.callout).toEqual([{ qty: 1, name: item.name }]);
    expect(item.name).toContain('STS3215');
    expect(swap.printPartId).toBeUndefined();
    expect(
      buildAlongSteps(repair, joints)
        .filter((step) => step.repairPhase === 'reassemble')
        .flatMap((step) => step.servos)
        .some((servo) => servo.partId === target),
    ).toBe(true);
    expect(new Set(buildAlongSteps(repair, joints).at(-1)!.shown)).toEqual(new Set(f.plan.partIds));
  });

  it('rejects a filtered guide order that would close the cover before replacing the target', async () => {
    const f = await fixture(bracket({ cover: true }), 'plate');
    const reversed = { ...f.plan, steps: [...f.plan.steps].reverse() };

    expect(buildRepairPlan(reversed, f.removal, 'plate', { geometry: f.geometry, boxes: f.boxes })).toBeNull();
  });
});
