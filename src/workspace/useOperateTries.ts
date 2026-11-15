import { useEffect, useEffectEvent, useRef } from 'react';
import { readStoredTry, type StoredTry } from '../cases/tryFile';
import { sha256 } from '../cases/tries';
import { keepTries, loadSession, noteStoredTry } from '../cases/tryStore';
import { useOperatorCamera } from '../cameras/operator/operatorCamera';
import { openDataImport } from '../datasets/import/dataImportClient';
import { connectedFrom } from '../robot/calibrationSession';
import { readOperateLog } from '../robot/operateLog';
import { operateEpisode, operatePlan, operateStored } from '../robot/operateTry';
import {
  cutOperateVideo,
  releaseOperateVideo,
  startOperateVideo,
  stopOperateVideo,
  type VideoSegment,
} from '../robot/operateVideo';
import {
  fleetSnapshot,
  recordRobotSample,
  robotSnapshot,
  selectedUnit,
  subscribeFleetEvents,
  subscribeRobot,
} from '../robot/robotStore';
import { connectedUnits, unitOfEvent } from '../robot/robotUnits';
import type { RobotEvent } from '../robot/robotState';
import { useRobot } from '../robot/useRobot';
import type { Simulation } from '../sim/useSimulation';
import type { RobotJoint } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import type { ShowToast } from './types';

interface OperateTriesInput {
  active: boolean;
  sceneId: string;
  joints: readonly RobotJoint[];
  sim: Simulation;
  showToast: ShowToast;
}

const SAFE_ID = /^[\w-]{1,128}$/;

const recordedTry = (event: RobotEvent): StoredTry | null =>
  event.event === 'recorded' ? readStoredTry(event.manifest) : null;

async function replayed(sim: Simulation, stored: StoredTry, video: VideoSegment | null) {
  const text = await loadSession(stored.id);
  const log = text ? readOperateLog(text) : null;

  if (!log?.statuses.length) return;

  const model = sim.modelNow() ?? (await sim.buildModel());
  const episode = operateEpisode(log, stored.robot.joints.length);
  const job = openDataImport();

  try {
    const recording = await job.replay({ model, episode, plan: operatePlan(stored.robot.joints, episode) });

    await keepTries([
      {
        stored: operateStored(stored, recording, video),
        recording,
        ...(video ? { videos: [{ camera: 'operator', bytes: video.bytes }] } : {}),
      },
    ]);
  } finally {
    job.close();
  }
}

export function useOperateTries({ active, sceneId, joints, sim, showToast }: OperateTriesInput) {
  const robot = useRobot();
  const camera = useOperatorCamera();
  const sent = useRef('');
  const stream = active && robot.link === 'connected' ? camera.stream : null;

  const sendScene = useEffectEvent(async (ids: string[]) => {
    const model = sim.modelNow() ?? (await sim.buildModel());

    recordRobotSample({
      scene: {
        sceneId: SAFE_ID.test(sceneId) ? sceneId : 'scene',
        robot: model.robots.map((r) => r.name).join(', ') || 'Robot',
        modelHash: await sha256(model.xml),
        joints: ids,
      },
    });
  });

  const syncScene = useEffectEvent(() => {
    const ids = active && robotSnapshot().link === 'connected' ? connectedFrom(joints) : null;
    const units = connectedUnits(fleetSnapshot())
      .map((u) => u.unit)
      .join();
    const key = ids ? `${sceneId}:${ids.join()}:${units}` : '';

    if (key === sent.current) return;

    sent.current = key;

    if (ids)
      void sendScene(ids).catch(() => {
        sent.current = '';
      });
  });

  useEffect(() => subscribeRobot(() => syncScene()), []);

  useEffect(() => syncScene(), [active, sceneId]);

  useEffect(() => {
    if (stream) startOperateVideo(stream);
  }, [stream]);

  useEffect(() => {
    if (!camera.stream) releaseOperateVideo();
  }, [camera.stream]);

  useEffect(() => {
    if (active && robot.link !== 'connected') stopOperateVideo();
  }, [active, robot.link]);

  const onRecorded = useEffectEvent(async (event: RobotEvent) => {
    const stored = recordedTry(event);
    const ours = stored?.sceneId === sceneId;
    const video = active && unitOfEvent(event) === selectedUnit() ? await cutOperateVideo() : null;

    if (!stored) return;

    if (!ours) return active ? noteStoredTry(stored) : undefined;

    await replayed(sim, stored, video);
  });

  const refuse = useEffectEvent((e: unknown) => showToast(errorMessage(e), { tone: 'error' }));

  useEffect(
    () =>
      subscribeFleetEvents((event) => {
        if (event.event === 'recorded') void onRecorded(event).catch(refuse);
      }),
    [],
  );
}
