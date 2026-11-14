import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { touchTheDots } from '../cases/testing';
import { jitteredWorld, worldRandom } from '../cases/caseRandom';
import { cameraViews } from '../cameras/views';
import { worldItem, type Case } from '../cases/schema';
import { imageClasses, resolveImageScene } from './imageScene';

const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const kase = (): Case => {
  const base = touchTheDots(robot);
  const object = {
    ...base.world.objects[0],
    id: 'tomato',
    name: 'Tomato',
    behavior: 'dynamic' as const,
    rotation: [0, 90, 0] as [number, number, number],
    points: { handle: [10, 0, 0] as [number, number, number] },
    colors: [
      { name: 'ripe', color: '#ff0000' },
      { name: 'unripe', color: '#00ff00' },
    ],
  };

  return {
    ...base,
    world: { objects: [object] },
    images: { cameraTolerance: { mm: 2, deg: 1 }, distractors: [{ ...object, id: 'leaf', colors: undefined }] },
  };
};
const input = () => ({
  parts: robot.parts,
  joints: robot.joints,
  kase: kase(),
  views: cameraViews(robot.parts, []),
  seed: 42,
});

describe('seeded image scene', () => {
  it('reproduces every sampled value and leaves its source untouched', () => {
    const source = input();
    const before = JSON.stringify(source);
    const first = resolveImageScene(source);

    expect(resolveImageScene(source)).toEqual(first);
    expect(JSON.stringify(source)).toBe(before);
    expect(resolveImageScene({ ...source, seed: 43 })).not.toEqual(first);
    expect(first.world[0].position).toEqual(jitteredWorld(source.kase, worldRandom(42)).world.objects[0].position);
    expect(first.appearance).not.toEqual(resolveImageScene({ ...source, seed: 43 }).appearance);
    expect(first.views).not.toEqual(source.views);
  });

  it('keeps class ids stable across color choices and labels points in the moved object frame', () => {
    const source = input();
    const classes = imageClasses(source);
    const seen = new Set<string>();

    for (let seed = 0; seed < 20; seed++) {
      const scene = resolveImageScene({ ...source, seed });
      const object = scene.world.find((p) => p.id === 'tomato')!;
      const instance = scene.instances.find((p) => p.partId === 'tomato')!;
      const cls = classes.find((c) => c.id === instance.classId)!;

      seen.add(cls.name);
      expect(scene.classes).toEqual(classes);
      expect(object.color).toBe(cls.name === 'ripe' ? '#ff0000' : '#00ff00');
      expect(instance.keypoints.handle[0]).toBeCloseTo(object.position[0]);
      expect(instance.keypoints.handle[2]).toBeCloseTo(object.position[2] - 10);
      expect(scene.instances.some((i) => i.partId === 'leaf')).toBe(false);
    }

    expect([...seen].sort()).toEqual(['ripe', 'unripe']);
  });

  it('labels each visible robot link with its joint frame and filters hidden or cutout parts', () => {
    const source = input();
    const scene = resolveImageScene(source);
    const joint = source.joints[0];
    const child = scene.instances.find((i) => i.partId === joint.child[0])!;

    expect(child.keypoints[joint.name]).toEqual(joint.origin);
    expect(scene.instances.filter((i) => source.parts.some((p) => p.id === i.partId))).toHaveLength(
      source.parts.filter((p) => p.visible && p.role === 'solid').length,
    );
    expect(
      resolveImageScene({ ...source, parts: source.parts.map((p) => ({ ...p, visible: false })) }).instances.every(
        (i) => !source.parts.some((p) => p.id === i.partId),
      ),
    ).toBe(true);
  });

  it('groups meshes of an imported link under one named instance', () => {
    const source = input();
    const parts = source.parts
      .slice(0, 2)
      .map((part) => ({ ...part, robotLink: { robot: 'arm', link: 'gripper', version: 1 } }));
    const scene = resolveImageScene({ ...source, parts });
    const link = scene.instances.find((i) => i.partId === parts[0].id)!;

    expect(link.partIds).toEqual(parts.map((p) => p.id));
    expect(scene.classes.find((c) => c.id === link.classId)?.name).toBe('gripper');
    expect(scene.instances.some((i) => i.partId === parts[1].id)).toBe(false);
  });

  it('keeps semantic alternatives distinct even when their RGB colors match', () => {
    const source = input();

    source.kase.world.objects[0].colors = [
      { name: 'ripe', color: '#ff0000' },
      { name: 'unripe', color: '#ff0000' },
    ];

    const seen = new Set(
      Array.from({ length: 20 }, (_, seed) => {
        const scene = resolveImageScene({ ...source, seed });
        const instance = scene.instances.find((i) => i.partId === 'tomato')!;

        return scene.classes.find((c) => c.id === instance.classId)!.name;
      }),
    );

    expect([...seen].sort()).toEqual(['ripe', 'unripe']);
  });

  it('preserves source mesh geometry while sampling distractor presence and static jitter', () => {
    const source = input();
    const mesh = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
      baseSize: [1, 1, 1] as [number, number, number],
    };
    const world = source.kase.world.objects.map((o) => ({ ...worldItem(o), mesh, note: 'Mesh source' }));
    const extra = source.kase.images!.distractors![0];

    extra.behavior = 'static';

    const scenes = Array.from({ length: 20 }, (_, seed) => resolveImageScene({ ...source, world, seed }));
    const visible = scenes.flatMap((scene) => scene.world.filter((p) => p.id === extra.id));

    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(20);
    expect(new Set(visible.map((p) => JSON.stringify(p.position))).size).toBeGreaterThan(1);
    expect(scenes.every((scene) => scene.world[0].mesh === mesh)).toBe(true);
    expect(scenes[0].world[0].note).toBe('Mesh source');
    expect(scenes[0].classes.find((c) => c.name === 'ripe')?.kind).toBe(source.kase.world.objects[0].kind);
  });

  it('holds calibrated cameras still when no mount tolerance is declared', () => {
    const source = input();

    source.kase.images = undefined;
    expect(resolveImageScene(source).views).toEqual(source.views);
    expect(resolveImageScene({ ...source, seed: 43 }).views).toEqual(source.views);
  });

  it('supports an ordinary scene without a Case', () => {
    const source = input();
    const world = source.kase.world.objects.map(worldItem);

    expect(resolveImageScene({ ...source, kase: undefined, world }).world).toEqual(world);
  });
});
