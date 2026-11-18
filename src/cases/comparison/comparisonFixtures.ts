import type { Recording } from '../../sim/recorder';
import { encodeTopicLog } from '../../topics/topicFile';
import { recordedTopic } from '../../topics/topicFixtures';
import { encodeRecording } from '../recordingFile';
import type { StoredTry } from '../tryFile';

export function comparisonFixture(options: {
  id: string;
  source?: StoredTry['source'];
  times: readonly number[];
  values: readonly number[];
  clipped?: boolean;
}) {
  const { id, times, values } = options;
  const topic = recordedTopic('/same', 'robot.Telemetry', [...times], {
    numbers: { speed: [...values] },
    labels: { state: times.map((_, i) => ['idle', 'trigger', 'running', 'done'][Math.min(i, 3)]) },
  });

  topic.clipped = options.clipped ?? false;

  const recording: Recording = {
    dt: 0.02,
    frames: times.length,
    nq: 0,
    nv: 0,
    nu: 0,
    nbody: 0,
    t: Float32Array.from(times),
    ctrl: new Float32Array(),
    qpos: new Float64Array(),
    qvel: new Float32Array(),
    poses: new Float32Array(),
    topics: encodeTopicLog({ topics: [topic] }),
    inputs: [{ at: times[0] + 1, name: 'trigger', value: true }],
  };
  const stored: StoredTry = {
    version: 1,
    id,
    sceneId: 'scene',
    robot: { name: id, modelHash: `model-${id}`, joints: [] },
    source: options.source ?? 'import',
    case: null,
    input: null,
    startedAt: '2026-11-17T10:00:00.000Z',
    seconds: times.at(-1)! - times[0],
    rate: 50,
    frames: times.length,
    outcome: { verdict: 'unjudged', margin: null },
    seed: 0,
    sourceTry: null,
    faults: [],
    origin: { kind: 'file', name: `${id}.mcap`, hash: id === 'a' ? 'a'.repeat(64) : 'b'.repeat(64) },
    policy: `policy-${id}`,
  };

  return { stored, bytes: encodeRecording(recording) };
}
