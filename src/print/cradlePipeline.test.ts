import { beforeAll, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { loadManifold, type ManifoldApi } from '../wrap/manifold';
import { jobSpec } from './job';
import { prepareCradleJob } from './cradleJob';
import { writeCradlePlate } from './cradlePlate';
import { cradleJobFixture } from './cradleJob.fixtures';
import { CRADLE_ASSEMBLIES } from './cradle.fixtures';

let api: ManifoldApi;

beforeAll(async () => {
  api = await loadManifold();
});

describe('assembly cradle production pipeline', () => {
  it.each(CRADLE_ASSEMBLIES)(
    'prepares and writes %s with actual screw tools and retained source quantities',
    async (name) => {
      const job = cradleJobFixture(api, CRADLE_ASSEMBLIES.indexOf(name));
      const before = structuredClone(job);
      const prepared = await prepareCradleJob(job);
      const plates = jobSpec(prepared.report.plan, job.printer, job.project);
      const written = await writeCradlePlate({ prepared, plates });
      const archive = unzipSync(Object.values(written.files)[0]);
      const identity = JSON.parse(strFromU8(archive['Metadata/basecase-assembly-cradle.json']));
      const model = strFromU8(archive['3D/3dmodel.model']);

      expect(identity).toEqual(prepared.identity);
      expect(identity.sourceIds).toEqual(job.ids);
      expect(prepared.report.plan.plates[0].items).toHaveLength(1);
      expect(prepared.report.parts[0].check.minWallMm).toBeGreaterThanOrEqual(0.84);
      expect(prepared.metrics.triangles).toBeGreaterThan(12);
      expect(model).toContain('Assembly cradle');
      expect(model).toContain('<triangle ');

      const vertices = [...model.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map((match) =>
        match.slice(1).map(Number),
      );

      for (let axis = 0; axis < 3; axis++) {
        const coordinates = vertices.map((vertex) => vertex[axis]);

        expect(Math.max(...coordinates) - Math.min(...coordinates)).toBeCloseTo(identity.dimensionsMm[axis], 4);
      }

      expect(model).not.toContain('M3 screw');
      expect(job).toEqual(before);
    },
  );

  it('refuses an unproven step, undeclared rigidity, unsupported required tools and an oversized plate', async () => {
    const job = cradleJobFixture(api, 0);
    const unproven = structuredClone(job);

    unproven.plan.steps[0].unproven = true;
    await expect(prepareCradleJob(unproven)).rejects.toThrow('cradle:source');
    await expect(prepareCradleJob({ ...job, ids: job.parts.map((part) => part.id) })).rejects.toThrow('cradle:source');

    const pending = structuredClone(job);

    pending.parts[0].cad = {
      language: 'openscad',
      code: 'cube(10);',
      positions: [],
      indices: [],
      originOffset: [0, 0, 0],
      baseSize: [10, 10, 10],
      pending: true,
    };
    await expect(prepareCradleJob(pending)).rejects.toThrow('cradle:source');

    const nested = structuredClone(job);

    nested.parts[0] = {
      ...nested.parts[0],
      kind: 'boolean',
      boolean: { op: 'union', operands: [pending.parts[0], job.parts[0]] },
    };
    await expect(prepareCradleJob(nested)).rejects.toThrow('cradle:source');

    const tool = structuredClone(job);

    tool.plan.tools[0].icon = 'soldering-iron';
    await expect(prepareCradleJob(tool)).rejects.toThrow('cradle:tool');

    const small = structuredClone(job);

    small.printer.model.bed = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    await expect(prepareCradleJob(small)).rejects.toThrow('cradle:plate');
  });
});
