import { encodeRecording } from '../cases/recordingFile';
import { toMj } from '../sim/mjcfFrames';
import { visibilityFixture } from './visibilityFixtures';

export async function visibilityMatrixInput(index: number, options: { near?: boolean; repeat?: boolean } = {}) {
  const fixture = await visibilityFixture(index);

  if (options.near) {
    const target = fixture.model.bodies.findIndex((body) => body.world?.includes('target'));

    for (let i = 0; i < 4; i++)
      fixture.recording.poses.set(toMj([0, 200, -2.005]), (i * fixture.model.bodies.length + target) * 7);
  }

  if (options.repeat) {
    const repeated = Array.from({ length: 256 - fixture.parts.length - fixture.world.length }, (_, i) => ({
      ...fixture.parts[0],
      id: `repeat-${i}`,
      position: [10000 + i * 100, 0, 0] as [number, number, number],
    }));

    fixture.parts.push(...repeated);
  }

  const { recording, ...scene } = fixture;

  return { index, scene, recording: Array.from(encodeRecording(recording)) };
}
