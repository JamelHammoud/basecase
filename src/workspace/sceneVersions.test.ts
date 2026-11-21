import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { sheetPart } from '../sheet/sheet.fixtures';
import {
  captureVersion,
  emptyVersionGraph,
  joinVersionGraphs,
  readVersionGraph,
  restoreVersion,
  type VersionScene,
} from './sceneVersions';

const part = (id: string, x = 0): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [x, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 10, depth: 20 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

const scene = (parts: ScenePart[]): VersionScene => ({
  parts,
  project: DEFAULT_PROJECT,
  annotations: [],
  globalGoal: '',
});

const named = (label: string) => ({ label, at: '2026-11-16T00:00:00.000Z' });

describe('content-addressed scene versions', () => {
  it('recovers an arm bracket without changing the captured state', () => {
    const before = scene([part('bracket')]);
    const baseline = captureVersion(emptyVersionGraph(), before, named('Arm bracket'));
    const edited = captureVersion(baseline, scene([part('bracket', 12)]), named('Moved bracket'));

    expect(restoreVersion(edited, baseline.head!)).toEqual(before);
    expect(restoreVersion(edited).parts[0].position).toEqual([12, 0, 0]);
    expect(baseline.versions).toHaveProperty(baseline.head!);
    expect(Object.keys(baseline.versions)).toHaveLength(1);
  });

  it('recovers a rover after serialization and keeps unchanged part content once', () => {
    const parts = Array.from({ length: 100 }, (_, i) => part(`rover-${i}`));
    const baseline = captureVersion(emptyVersionGraph(), scene(parts), named('Rover'));
    const edited = captureVersion(baseline, scene([part('rover-0', 25), ...parts.slice(1)]), named('Wheelbase'));
    const reopened = readVersionGraph(JSON.stringify(edited));

    expect(restoreVersion(reopened, baseline.head!).parts).toEqual(parts);
    expect(Object.keys(edited.content).length - Object.keys(baseline.content).length).toBe(2);
    expect(restoreVersion(reopened).parts[0].position[0]).toBe(25);
  });

  it('retains project records and unavailable local artifact references without reading files', () => {
    const before: VersionScene = {
      ...scene([part('mount')]),
      project: {
        ...DEFAULT_PROJECT,
        skeleton: { frame: 'z-up' as const, joints: [], pairs: [] },
        policies: [
          {
            id: 'policy-unavailable',
            name: 'Walk',
            task: 'walk',
            robot: 'rover',
            robotName: 'Rover',
            command: [0, 0, 0],
            trainedSteps: 100,
            createdAt: named('').at,
            fingerprint: 'original',
          },
        ],
      },
    };
    const graph = captureVersion(emptyVersionGraph(), before, named('Skeleton'));

    expect(restoreVersion(readVersionGraph(JSON.stringify(graph)))).toEqual(before);
  });

  it('joins simultaneous agent lanes without losing either completed design', () => {
    const base = captureVersion(emptyVersionGraph(), scene([part('chassis')]), named('Before agents'));
    const left = captureVersion(base, scene([part('chassis'), part('camera')]), named('Camera'));
    const right = captureVersion(base, scene([part('chassis'), part('gripper')]), named('Gripper'));
    const joined = joinVersionGraphs(left, right);

    expect(joined.head).toBe(left.head);
    expect(restoreVersion(joined, right.head!).parts.map((p) => p.id)).toEqual(['chassis', 'gripper']);
    expect(Object.keys(joined.versions)).toHaveLength(3);
    expect(joinVersionGraphs(right, left).versions).toEqual(joined.versions);
  });

  it('retains both designs when restore is recorded as another version', () => {
    const first = captureVersion(emptyVersionGraph(), scene([part('leg')]), named('Short leg'));
    const next = captureVersion(first, scene([part('leg', 40)]), named('Long leg'));
    const restored = captureVersion(next, restoreVersion(next, first.head!), named('Restored short leg'));

    expect(restored.versions[restored.head!].parents).toEqual([next.head]);
    expect(restoreVersion(restored, next.head!).parts[0].position[0]).toBe(40);
  });
});

describe('scene version integrity and representation', () => {
  it('rejects damaged content, missing parents and a forged version before recovery', () => {
    const graph = captureVersion(emptyVersionGraph(), scene([part('arm')]), named('Arm'));
    const contentKey = Object.keys(graph.content)[0];
    const damaged = { ...graph, content: { ...graph.content, [contentKey]: '{}' } };
    const version = graph.versions[graph.head!];
    const forged = { ...graph, versions: { [graph.head!]: { ...version, label: 'Forged' } } };
    const missing = { ...graph, head: 'a'.repeat(64) };

    expect(() => readVersionGraph(JSON.stringify(damaged))).toThrow();
    expect(() => restoreVersion(damaged)).toThrow();
    expect(() => readVersionGraph(JSON.stringify(forged))).toThrow();
    expect(() => readVersionGraph(JSON.stringify(missing))).toThrow();
    expect(() => readVersionGraph('{')).toThrow();
  });

  it('keeps imported assembly identities and sheet manufacturing data across shared versions', () => {
    const group = {
      id: 'assembly',
      name: 'Imported arm',
      onshape: { did: 'd', wvm: 'v' as const, wvmid: 'v', eid: 'e' },
    };
    const chassis = sheetPart({ id: 'chassis', sheet: { material: 'aluminum-6061', thicknessMm: 3 } });
    const shoulder = { ...part('shoulder'), group };
    const tool = { ...part('tool'), group, robotLink: { robot: 'arm', link: 'tool', version: 1 } };
    const joint = {
      id: 'elbow',
      name: 'Elbow',
      type: 'revolute' as const,
      parent: ['shoulder'],
      child: ['tool'],
      origin: [0, 0, 0] as [number, number, number],
      axis: [0, 0, 1] as [number, number, number],
      onshape: { mate: 'original-mate' },
    };
    const original = { ...scene([chassis, shoulder, tool]), project: { ...DEFAULT_PROJECT, joints: [joint] } };
    const graph = captureVersion(emptyVersionGraph(), original, named('Assembly and chassis'));

    expect(restoreVersion(readVersionGraph(JSON.stringify(graph)))).toEqual(original);
  });

  it('does not substitute the current design for a missing historical record', () => {
    const graph = captureVersion(emptyVersionGraph(), scene([part('arm')]), named('Arm'));
    const record = graph.versions[graph.head!].record;
    const content = { ...graph.content };

    delete content[record];

    expect(() => readVersionGraph(JSON.stringify({ ...graph, content }))).toThrow();
    expect(() => restoreVersion(graph, 'missing')).toThrow();
  });

  it('refuses nonfinite edits and unbounded version metadata before capture', () => {
    const base = emptyVersionGraph();

    expect(() => captureVersion(base, scene([part('arm', Number.NaN)]), named('Arm'))).toThrow();
    expect(() => captureVersion(base, scene([]), named('x'.repeat(201)))).toThrow();
    expect(() => captureVersion(base, scene([]), { ...named('Arm'), at: 'not-a-date' })).toThrow();
    expect(() => captureVersion(base, scene([]), { ...named('Arm'), run: '../run' })).toThrow();
    expect(base).toEqual(emptyVersionGraph());
  });

  it('measures incremental content growth on a shared-part fixture', () => {
    const parts = Array.from({ length: 1000 }, (_, i) => part(`fixture-${i}`));
    const started = performance.now();
    const baseline = captureVersion(emptyVersionGraph(), scene(parts), named('Shared baseline'));
    const baselineMs = performance.now() - started;
    const editStarted = performance.now();
    const edited = captureVersion(baseline, scene([part('fixture-0', 10), ...parts.slice(1)]), named('One edit'));
    const editMs = performance.now() - editStarted;
    const baselineBytes = new TextEncoder().encode(JSON.stringify(baseline)).byteLength;
    const editedBytes = new TextEncoder().encode(JSON.stringify(edited)).byteLength;
    const fullCopiesBytes = new TextEncoder().encode(
      JSON.stringify([scene(parts), scene([part('fixture-0', 10), ...parts.slice(1)])]),
    ).byteLength;

    expect(Object.keys(edited.content).length - Object.keys(baseline.content).length).toBe(2);
    expect(editedBytes - baselineBytes).toBeLessThan(baselineBytes / 3);
    console.info(
      JSON.stringify({ fixtureParts: parts.length, baselineMs, editMs, baselineBytes, editedBytes, fullCopiesBytes }),
    );
  });

  it('treats an old scene as an empty graph without rewriting a record', () => {
    expect(emptyVersionGraph()).toEqual({ format: 1, head: null, versions: {}, content: {} });
  });
});
