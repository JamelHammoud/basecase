import type { CameraTrainingFrame } from '../cameras/trainingTypes';
import { LiveStage } from '../cameras/liveStage';
import { corridorAsset, edgeRegion } from './visibilityOracle';
import { applyCameraChoice } from './cameraChoices';
import type { visibilityMatrixInput } from './visibilityMatrixInput';
import { StudyVisibilitySession } from './visibilitySession';

function targetRegion(frame: CameraTrainingFrame) {
  const id = frame.instances.find((instance) => instance.instance === 'target')!.id;
  const coordinates: Array<[number, number]> = [];

  frame.instanceIds.forEach((value, i) => {
    if (value === id) coordinates.push([i % frame.width, Math.floor(i / frame.width)]);
  });

  if (!coordinates.length) return null;

  return [
    Math.min(...coordinates.map(([x]) => x)),
    Math.min(...coordinates.map(([, y]) => y)),
    Math.max(...coordinates.map(([x]) => x)) + 1,
    Math.max(...coordinates.map(([, y]) => y)) + 1,
  ];
}

let stage: LiveStage | null = null;

export async function visibilityMatrixChecks(
  input: (Awaited<ReturnType<typeof visibilityMatrixInput>> & { mesh: number[] }) | { close: true },
) {
  if ('close' in input) {
    stage?.dispose();
    stage = null;

    return null;
  }

  const fixture = input.scene;
  const regions: Array<number[] | null> = [];

  stage ??= new LiveStage();

  const renderer = stage;
  const session = new StudyVisibilitySession(() => ({
    setModel: (model) => renderer.setModel(model),
    setViews: (views) => renderer.setViews(views),
    setScene: (...args) => renderer.setScene(...args),
    dispose: () => renderer.setViews([]),
    training: async (request) => {
      const frame = await renderer.training(request);

      if (!request.isolate) regions.push(targetRegion(frame));

      return frame;
    },
  }));
  const asset = corridorAsset();
  const imported =
    input.index === 8 ? { hash: 'corridor', asset, position: [0, 0, 0] as [number, number, number] } : undefined;
  const source = {
    parts: fixture.parts,
    world: fixture.world,
    model: fixture.model,
    views: fixture.views,
    kase: fixture.kase,
    meshes: { 'raspberry-pi-camera-3': Uint8Array.from(input.mesh).buffer },
    imported,
  };
  const base = { parts: fixture.parts, project: fixture.project, triangles: {}, measures: {} };

  try {
    const key = await session.load({
      scene: source,
      stored: fixture.stored,
      bytes: Uint8Array.from(input.recording),
      candidates: 1,
      request: {
        tryId: fixture.stored.id,
        cameras: fixture.cameras.map((camera) => camera.id),
        targets: [{ id: 'target', minPixels: input.index === 7 ? 1 : 500 }],
        samples: input.index === 7 ? 2 : 4,
      },
    });
    const current = await session.measure(base);
    const reversed = applyCameraChoice(
      base,
      {
        id: 'turn',
        kind: 'camera_pose',
        part: 'eye',
        values: [{ position: fixture.cameras[0].position, rotation: [0, 0, 0] }],
      },
      0,
    );
    const chosen =
      input.index === 7
        ? applyCameraChoice(
            base,
            { id: 'lens', kind: 'camera_lens', part: 'eye', values: [{ model: 'pinhole', hfovDeg: 90 }] },
            0,
          )
        : reversed;
    const candidate = await session.measure(chosen);

    return {
      key,
      current,
      candidate,
      regions,
      edge: edgeRegion(),
      resources: {
        ...renderer.renderer.info.memory,
        programs: renderer.renderer.info.programs?.length,
        retainedPoseBytes: fixture.model.bodies.length * 7 * 8 * (input.index === 7 ? 2 : 4),
        recordingBytes: input.recording.length,
        resultBytes: new TextEncoder().encode(JSON.stringify({ current, candidate })).byteLength,
      },
    };
  } finally {
    session.dispose();
  }
}
