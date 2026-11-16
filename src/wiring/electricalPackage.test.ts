import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { electricalScenes } from './electricalFixtures';
import { electricalPackage } from './electricalPackage';
import { so101 } from './fixtures';
import { wiringNetlist } from './netlist';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';
import { electricalSnapshot } from './electricalSnapshot';

describe('editable electrical package', () => {
  it.each(electricalScenes())(
    'writes self-contained reproducible source and KiCad files for $name',
    async ({ scene }) => {
      const before = structuredClone(scene);
      const result = await electricalPackage(scene);
      const reopened = await electricalPackage(JSON.parse(JSON.stringify(scene)));
      const files = unzipSync(result.bytes);
      const read = (path: string) => new TextDecoder().decode(files[path]);
      const requirements = JSON.parse(read('robot/requirements.json'));

      expect(Object.keys(files).sort()).toEqual([
        'robot/README.txt',
        'robot/requirements.json',
        'robot/robot.kicad_pro',
        'robot/robot.kicad_sch',
        'robot/robot.kicad_sym',
        'robot/source.json',
        'robot/sym-lib-table',
      ]);
      expect(read('robot/robot.kicad_sch')).toContain('(version 20250114)');
      expect(read('robot/robot.kicad_sch')).not.toContain('PWR_FLAG');
      expect(read('robot/sym-lib-table')).toContain('${KIPRJMOD}/robot.kicad_sym');
      expect(requirements.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(requirements.sourceFingerprint).toBe(createHash('sha256').update(read('robot/source.json')).digest('hex'));
      expect(requirements.validator).toEqual({ name: 'kicad-cli', version: '9.0.6', status: 'not-run' });
      expect(requirements.projection.electricalVerdict).toBe('not-established');
      expect(result.bytes).toEqual(reopened.bytes);
      expect(scene).toEqual(before);
    },
  );

  it('binds electrical inputs and pin-map evidence to the source fingerprint', async () => {
    const scene = so101();
    const before = await electricalPackage(scene);

    scene.project.tether = { volts: 6, amps: 1 };

    const changed = await electricalPackage(scene);

    expect(changed.sourceFingerprint).not.toBe(before.sourceFingerprint);
  });

  it.each(electricalScenes())(
    'preserves the electrical package across a real scene-file save and reopen for $name',
    async ({ name, scene }) => {
      const before = await electricalPackage(electricalSnapshot(scene));
      const file = await encodeSceneFile(sharedScene({ ...scene, name, globalGoal: '', annotations: [] }));
      const reopened = await decodeSceneFile(file);
      const after = await electricalPackage(electricalSnapshot({ parts: reopened.parts, project: reopened.project! }));

      expect(after.bytes).toEqual(before.bytes);
    },
  );

  it('includes supplied wiring and ignores object-property insertion order in its fingerprint', async () => {
    const scene = so101();
    const wiring = wiringNetlist(scene);
    const before = await electricalPackage({ ...scene, wiring });
    const reordered = {
      ...scene,
      project: Object.fromEntries(Object.entries(scene.project).reverse()) as typeof scene.project,
    };

    const reorderedPackage = await electricalPackage(reordered);

    expect(reorderedPackage.sourceFingerprint).toBe(before.sourceFingerprint);
    expect(reorderedPackage.bytes).toEqual(before.bytes);
    wiring.buses[0].nets.pop();
    expect((await electricalPackage({ ...scene, wiring })).sourceFingerprint).not.toBe(before.sourceFingerprint);
  });
});
