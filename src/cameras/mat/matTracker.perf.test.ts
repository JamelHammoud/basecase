import { describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../../cases/caseBuilder';
import { stageCase } from '../../cases/caseCast';
import { caseMat } from '../../cases/mat/matLayout';
import { matCamera, testDetector } from '../../cases/mat/matTesting';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { buildRig } from '../../utils/kinematics';
import { renderMatFrame } from './matFrames';
import { createMatTracker, trackMat } from './matTracker';

const WIDTH = 1280;
const HEIGHT = 720;
const FRAMES = 60;
const CAMERA_PERIOD_MS = 1000 / 30;

describe('tracking speed', () => {
  it('tracks 720p frames faster than a 30 fps camera delivers them', async () => {
    const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
    const rig = buildRig(rover.joints, rover.parts);
    const built = buildCase({ goal: 'reach', world: 'floor' }, builderRobot(rig, rover.parts));

    if (!built.ok) throw new Error(built.problem);

    const staged = stageCase(built.kase, { rig, parts: rover.parts }, []).kase;
    const mat = caseMat(staged, { rig, parts: rover.parts }, 'a4')!;
    const camera = matCamera(mat);
    const base = { x: mat.base.center[0], z: mat.base.center[2], yaw: Math.atan2(mat.base.up[0], mat.base.up[1]) };
    const frames = [0, 1, 2].map((seed) => renderMatFrame({ mat, camera, width: WIDTH, height: HEIGHT, base, seed }));
    const detector = await testDetector();
    const tracker = createMatTracker(trackMat(mat));
    const started = performance.now();

    for (let i = 0; i < FRAMES; i++) {
      tracker.push(detector.detect(frames[i % frames.length], WIDTH, HEIGHT), { width: WIDTH, height: HEIGHT }, i / 30);
    }

    const perFrame = (performance.now() - started) / FRAMES;

    console.log(`tracking: ${perFrame.toFixed(1)} ms per ${WIDTH}×${HEIGHT} frame`);
    expect(perFrame).toBeLessThan(CAMERA_PERIOD_MS);
  });
});
