import { createHash } from 'node:crypto';
import loadMujoco from '@mujoco/mujoco';
import type { Page } from 'playwright-core';
import { BufferTarget, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output } from 'mediabunny';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { encodeRecording } from '../src/cases/recordingFile';
import type { StoredTry } from '../src/cases/tryFile';
import { SimEngine } from '../src/sim/engine';
import { Recorder } from '../src/sim/recorder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { modelOf } from '../src/skills/fixtureModels';
import { DEFAULT_PROJECT, type ScenePart } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import type { VisionManifest } from '../src/vision/manifest';

export function wristCamera(): ScenePart {
  return {
    id: 'wrist-camera',
    name: 'Wrist Camera',
    kind: 'component',
    category: 'perception',
    role: 'solid',
    componentId: 'raspberry-pi-camera-3',
    position: [0, 240, 20],
    rotation: [0, 0, 0],
    dimensions: { width: 25, height: 12, depth: 24 },
    color: '#333333',
    note: '',
    visible: true,
    locked: false,
  };
}

export function armWithWristCamera() {
  const robot = fixtureRobots().find((candidate) => candidate.id === 'arm-6dof')!;
  const camera = wristCamera();
  const parts = [...robot.parts, camera];
  const joints = robot.joints.map((joint) =>
    joint.id === 'arm5' ? { ...joint, child: [...joint.child, camera.id] } : joint,
  );
  const built = buildCase({ goal: 'pick', world: 'floor' }, builderRobot(buildRig(joints, parts), parts));

  if (!built.ok) throw new Error(built.problem);

  return { name: 'Vision Pick Up a Block', parts, project: { ...DEFAULT_PROJECT, joints, cases: [built.kase] } };
}

export const visionManifest = (bytes: Uint8Array, label = 'cup', id = 'rfdetr-nano'): VisionManifest => ({
  version: 1,
  id,
  kind: 'detect',
  adapter: 'generic',
  classes: [label],
  input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1], scale: 1 / 255 },
  model: {
    owner: 'example',
    repo: 'camera-fixture',
    revision: '0'.repeat(40),
    file: 'tiny.onnx',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  },
});

interface Packet {
  bytes: number[];
  type: 'key' | 'delta';
  timestamp: number;
  duration: number;
}

async function encodedFrames(page: Page) {
  return page.evaluate(async () => {
    const codecs = [
      { codec: 'avc1.42001e', source: 'avc' },
      { codec: 'vp09.00.10.08', source: 'vp9' },
    ] as const;
    const candidates = await Promise.all(
      codecs.map(async (codec) => ({
        ...codec,
        supported: (
          await VideoEncoder.isConfigSupported({
            codec: codec.codec,
            width: 64,
            height: 48,
            bitrate: 100000,
            framerate: 2,
          })
        ).supported,
      })),
    );
    const codec = candidates.find((candidate) => candidate.supported);

    if (!codec) throw new Error('The browser has no MP4 video encoder for the camera fixture.');

    const packets: Packet[] = [];
    let description: number[] = [];
    let failure: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        const bytes = new Uint8Array(chunk.byteLength);

        chunk.copyTo(bytes);
        packets.push({
          bytes: [...bytes],
          type: chunk.type,
          timestamp: chunk.timestamp / 1000000,
          duration: (chunk.duration ?? 500000) / 1000000,
        });

        if (metadata?.decoderConfig?.description)
          description = [...new Uint8Array(metadata.decoderConfig.description as ArrayBuffer)];
      },
      error: (error) => {
        failure = error;
      },
    });

    encoder.configure({ codec: codec.codec, width: 64, height: 48, bitrate: 100000, framerate: 2 });

    const canvas = new OffscreenCanvas(64, 48);
    const context = canvas.getContext('2d');

    if (!context) throw new Error('The camera fixture canvas could not open.');

    for (let index = 0; index < 4; index++) {
      context.fillStyle = index < 2 ? '#000000' : '#ffffff';
      context.fillRect(0, 0, 64, 48);

      const frame = new VideoFrame(canvas, { timestamp: index * 500000, duration: 500000 });

      encoder.encode(frame, { keyFrame: true });
      frame.close();
    }

    await encoder.flush();
    encoder.close();

    if (failure) throw failure;

    return { packets, description, codec: codec.codec, source: codec.source };
  });
}

export async function blackWhiteVideo(page: Page): Promise<Uint8Array> {
  const encoded = await encodedFrames(page);
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new EncodedVideoPacketSource(encoded.source);
  const decoderConfig: VideoDecoderConfig = {
    codec: encoded.codec,
    codedWidth: 64,
    codedHeight: 48,
    ...(encoded.description.length ? { description: new Uint8Array(encoded.description) } : {}),
  };

  output.addVideoTrack(source, { frameRate: 2 });
  await output.start();

  for (const [index, packet] of encoded.packets.entries()) {
    await source.add(
      new EncodedPacket(new Uint8Array(packet.bytes), packet.type, packet.timestamp, packet.duration),
      index === 0 ? { decoderConfig } : undefined,
    );
  }

  await output.finalize();

  return new Uint8Array(target.buffer!);
}

export async function recordedCameraFixture() {
  const robot = fixtureRobots().find((candidate) => candidate.id === 'arm-3dof')!;
  const model = modelOf(robot);
  const mj = await loadMujoco();
  const engine = new SimEngine(mj, model);

  try {
    engine.setController({ kind: 'hold' });

    const recorder = new Recorder(engine);

    engine.stepHook = recorder.hook;
    engine.step(2);

    const recording = recorder.finish();
    const stored: StoredTry = {
      version: 1,
      id: 'vision-video',
      sceneId: 'vision-video-scene',
      robot: { name: 'arm-3dof', modelHash: 'fixture', joints: robot.joints.map((joint) => joint.id) },
      case: null,
      source: 'operate',
      input: 'camera',
      startedAt: '2026-11-14T12:00:00Z',
      seconds: 2,
      rate: 50,
      frames: recording.frames,
      outcome: { verdict: 'unjudged', margin: null },
      seed: 1,
      sourceTry: null,
      faults: [],
      videos: [{ camera: 'operator', path: 'operator.mp4', from: 0, to: 2 }],
    };

    return {
      stored,
      recording: [...encodeRecording(recording)],
      scene: { name: 'Recorded Camera', parts: robot.parts, project: { ...DEFAULT_PROJECT, joints: robot.joints } },
    };
  } finally {
    engine.dispose();
  }
}
