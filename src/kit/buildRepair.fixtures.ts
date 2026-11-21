import { box, fixtureTriangles } from '../sim/fixtures/parts';
import { componentSize } from '../data/components';
import { weld } from '../print/threeMf';
import { analyzeWiring } from '../wiring/routeAnalysis';
import { editableNets, routeIdentity, updateRoute } from '../wiring/routeEditing';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import { kitFixture } from './kit.fixtures';
import { freezeBuildKit, readFrozenKit } from './frozenKit';

export const repairDesigns = [
  'differential rover',
  'SO-101-style arm',
  'quadruped',
  'hexapod',
  'biped',
  'pan-tilt camera',
  'gripper',
  'conveyor mechanism',
  'mixed-servo arm',
  'repeated limb modules',
];

export async function repairKitFixture(
  name = repairDesigns[0],
  change: 'source' | 'geometry' | 'variant' | 'wiring' | 'presentation' = 'source',
) {
  const job = kitFixture(name, (parts) => [
    ...parts,
    {
      ...box('service-plate', [1000, 20, 0], [change === 'geometry' ? 31 : 30, 4, 20], 10),
      name: change === 'presentation' ? 'Renamed plate' : 'service-plate',
    },
    {
      ...box('service-servo', [500, 90, 0], [20, 40, 20], 50),
      kind: 'component',
      componentId: 'feetech-sts3215',
      componentVariant: change === 'variant' ? 'c018' : 'c001',
      dimensions: componentSize('feetech-sts3215'),
    },
  ]);

  job.project.labelParts = false;

  if (change === 'wiring') {
    const net = editableNets(job).find((entry) => entry.to.id === 'service-servo' && entry.from.id)!;
    const identity = routeIdentity(net)!;

    job.project = { ...job.project, joints: job.project.joints?.map((joint) => ({ ...joint, range: [0, 0] })) };
    job.project = updateRoute(job, identity, {
      supplyId: 'waveshare-servo-cable-5264-900',
      anchors: [{ partId: net.from.id!, position: [0, 40, 0] }],
    });

    const model = fixturePackageJob({ id: name, parts: job.parts, joints: job.project.joints ?? [] }).job.model;

    job.mapInput = { ...job.mapInput, project: job.project, model };
    job.wiring = analyzeWiring(job, []);
  }

  job.checks = {
    status: 'ready',
    checks: [],
    blockers: [],
    notes: [],
    ignored: [],
    ignoredRules: [],
    findings: [],
    rows: [],
    fingerprint: 'fixture-checks',
    checkedAt: '2026-11-20T12:00:00Z',
  };
  job.checksFingerprint = job.checks.fingerprint;

  const triangles = fixtureTriangles(job.parts);
  const meshes = Object.fromEntries(job.parts.map((part) => [part.id, weld(triangles(part.id)!)]));
  const content = await freezeBuildKit({ job, meshes });

  return { job, content, kit: readFrozenKit(content) };
}
