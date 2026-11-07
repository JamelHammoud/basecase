import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { RobotPoseState, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import {
  driveAccess,
  FALL_CHECK_SECONDS,
  FALL_CHECK_SETTLE_SECONDS,
  fallCheckCommands,
  fallCheckPassed,
  FELL_DRIVE_NOTE,
} from './driveAccess';
import type { DriveSetup } from './drive';
import { commandFromPad, mergeCommands, sameCommand, type DriveClass } from './driveKeys';
import type { DriveCommand } from './driveTypes';
import type { Controller, SimStats } from './engine';
import type { SimModel } from './mjcfTypes';
import type { SimRequest } from './sim.worker';
import type { RunOptions, SimRun, SimStatus } from './useSimulation';

export type DriveStatus = 'off' | 'checking' | 'on' | 'refused';

export interface SimDrive {
  status: DriveStatus;
  active: boolean;
  cls: DriveClass | null;
  note: string | null;
  fell: boolean;
  start: () => Promise<void>;
  stop: () => void;
  respawn: () => void;
  setKeys: (command: DriveCommand) => void;
}

interface DriveInputs {
  parts: ScenePart[];
  rig: Rig;
  pose: RobotPoseState | undefined;
  robotKey?: string;
  status: SimStatus;
  stats: SimStats | null;
  send: (msg: SimRequest) => void;
  viewportRef: React.RefObject<Viewport3DHandle | null>;
  modelRef: React.RefObject<SimModel | null>;
  frameHookRef: React.RefObject<(() => void) | null>;
  startSim: () => Promise<void>;
  setController: (c: Controller) => void;
  runOn: (model: SimModel, opts: RunOptions) => Promise<SimRun>;
}

const IDLE: DriveCommand = { v: [0, 0, 0] };

function firstPad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;

  return [...navigator.getGamepads()].find((p) => p?.connected) ?? null;
}

function restHeight(model: SimModel, key?: string): number {
  const robot = model.robots.find((r) => r.key === key) ?? model.robots[0];
  const body = model.bodies.find((b) => b.name === robot?.root);
  const lift = robot ? (model.initial.roots?.[robot.key]?.position?.[1] ?? 0) : 0;

  return ((body?.origin[1] ?? 0) + lift) / 1000;
}

async function staysUp(
  runOn: DriveInputs['runOn'],
  model: SimModel,
  { setup, robotKey }: { setup: DriveSetup; robotKey?: string },
): Promise<boolean> {
  const run = await runOn(model, {
    seconds: FALL_CHECK_SECONDS + FALL_CHECK_SETTLE_SECONDS,
    controller: { kind: 'drive', setup },
    commands: fallCheckCommands(),
  });

  return fallCheckPassed(run.stats, restHeight(model, robotKey), robotKey);
}

export function useDrive(inputs: DriveInputs): SimDrive {
  const { status: simStatus, send, viewportRef, modelRef, frameHookRef, stats, robotKey } = inputs;
  const [driveStatus, setDriveStatus] = useState<DriveStatus>('off');
  const [cls, setCls] = useState<DriveClass | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const latest = useRef(inputs);
  const keysCommand = useRef<DriveCommand>(IDLE);
  const sent = useRef<DriveCommand>(IDLE);
  const clsRef = useRef<DriveClass | null>(null);
  const [seenSimStatus, setSeenSimStatus] = useState(simStatus);

  if (seenSimStatus !== simStatus) {
    setSeenSimStatus(simStatus);
    setDriveStatus((s) => (simStatus === 'off' && s !== 'refused' ? 'off' : s));
  }

  useLayoutEffect(() => {
    latest.current = inputs;
  });

  const push = useCallback(() => {
    const pad = firstPad();
    const current = clsRef.current;

    if (!current) return;

    const merged = mergeCommands(keysCommand.current, pad ? commandFromPad(pad, current) : null);

    if (sameCommand(merged, sent.current)) return;

    sent.current = merged;
    send({ type: 'command', ...merged });
  }, [send]);

  const active = driveStatus === 'on' && simStatus === 'ready';

  useEffect(() => {
    frameHookRef.current = active ? push : null;

    return () => {
      frameHookRef.current = null;
    };
  }, [active, frameHookRef, push]);

  useEffect(() => {
    if (simStatus !== 'off') return;

    clsRef.current = null;
    keysCommand.current = IDLE;
    sent.current = IDLE;
    viewportRef.current?.followPart(null);
  }, [simStatus, viewportRef]);

  const start = useCallback(async () => {
    const { parts, rig, pose, startSim, setController, runOn } = latest.current;

    setNote(null);

    if (!modelRef.current) await startSim();

    const model = modelRef.current;

    if (!model) return;

    const access = driveAccess({ rig, parts, model, robotKey, start: pose?.values });

    if (access.kind === 'refused') {
      setNote(access.reason);
      setDriveStatus('refused');

      return;
    }

    if (access.needsFallCheck) setDriveStatus('checking');

    if (access.needsFallCheck && !(await staysUp(runOn, model, { setup: access.setup, robotKey }))) {
      setNote(FELL_DRIVE_NOTE);
      setDriveStatus('refused');

      return;
    }

    clsRef.current = access.cls;
    keysCommand.current = IDLE;
    sent.current = IDLE;
    setCls(access.cls);
    setController({ kind: 'drive', setup: access.setup });
    latest.current.send({ type: 'respawn', robot: robotKey });
    viewportRef.current?.followPart(access.followPart);
    setDriveStatus('on');
  }, [modelRef, robotKey, viewportRef]);

  const stop = useCallback(() => {
    keysCommand.current = IDLE;
    clsRef.current = null;
    viewportRef.current?.followPart(null);
    latest.current.setController({ kind: 'hold' });
    setDriveStatus('off');
  }, [viewportRef]);

  const respawn = useCallback(() => send({ type: 'respawn', robot: robotKey }), [send, robotKey]);

  const setKeys = useCallback(
    (command: DriveCommand) => {
      keysCommand.current = command;
      push();
    },
    [push],
  );

  const robotStat = stats?.robots.find((r) => r.key === robotKey) ?? stats?.robots[0];

  return {
    status: driveStatus,
    active,
    cls,
    note,
    fell: active && !!robotStat && robotStat.fellAt !== null,
    start,
    stop,
    respawn,
    setKeys,
  };
}
