import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { RobotPoseState, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import {
  driveAccess,
  driveOffer,
  FALL_CHECK_SECONDS,
  FALL_CHECK_SETTLE_SECONDS,
  fallCheckCommands,
  fallCheckPassed,
  policyCommand,
  type DriveAccess,
  type DriveOffer,
  type VelocityDrive,
} from './driveAccess';
import type { DriveSetup } from './drive';
import { commandFromPad, isIdle, mergeCommands, sameCommand, type DriveClass } from './driveKeys';
import type { DriveCommand } from './driveTypes';
import type { Controller, SimStats } from './engine';
import type { SimModel } from './mjcfTypes';
import type { SimRequest } from './sim.worker';
import type { RunOptions, SimRun, SimStatus } from './useSimulation';
import type { FrameHook, SimFrame } from './useSimWorker';

export type DriveStatus = 'off' | 'checking' | 'on' | 'teach' | 'none';

export type VelocitySource = () => Promise<VelocityDrive | null>;

export type Autopilot = (frame: SimFrame) => DriveCommand;

export interface SimDrive {
  status: DriveStatus;
  active: boolean;
  cls: DriveClass | null;
  offer: DriveOffer;
  fell: boolean;
  start: () => Promise<boolean>;
  stop: () => void;
  respawn: () => void;
  setKeys: (command: DriveCommand) => void;
  follow: (autopilot: Autopilot) => void;
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
  frameHookRef: React.RefObject<FrameHook | null>;
  startSim: () => Promise<void>;
  setController: (c: Controller) => void;
  runOn: (model: SimModel, opts: RunOptions) => Promise<SimRun>;
  velocity?: React.RefObject<VelocitySource | null>;
}

const IDLE: DriveCommand = { v: [0, 0, 0] };

function firstPad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;

  return [...navigator.getGamepads()].find((p) => p?.connected) ?? null;
}

function manualCommand(keys: DriveCommand, cls: DriveClass): DriveCommand {
  const pad = firstPad();

  return mergeCommands(keys, pad ? commandFromPad(pad, cls) : null);
}

function steered(
  autopilot: React.RefObject<Autopilot | null>,
  manual: DriveCommand,
  frame?: SimFrame,
): DriveCommand | null {
  if (!isIdle(manual)) autopilot.current = null;

  const auto = autopilot.current;

  if (!auto) return manual;

  return frame ? auto(frame) : null;
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
  const latest = useRef(inputs);
  const keysCommand = useRef<DriveCommand>(IDLE);
  const sent = useRef<DriveCommand>(IDLE);
  const clsRef = useRef<DriveClass | null>(null);
  const topSpeed = useRef<number | null>(null);
  const autopilot = useRef<Autopilot | null>(null);
  const [seenSimStatus, setSeenSimStatus] = useState(simStatus);

  if (seenSimStatus !== simStatus) {
    setSeenSimStatus(simStatus);
    setDriveStatus((s) => (simStatus === 'off' ? 'off' : s));
  }

  useLayoutEffect(() => {
    latest.current = inputs;
  });

  const push = useCallback(
    (frame?: SimFrame) => {
      const current = clsRef.current;
      const merged = current && steered(autopilot, manualCommand(keysCommand.current, current), frame);

      if (!merged || sameCommand(merged, sent.current)) return;

      sent.current = merged;
      send({ type: 'command', ...(topSpeed.current === null ? merged : policyCommand(merged, topSpeed.current)) });
    },
    [send],
  );

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
    autopilot.current = null;
    keysCommand.current = IDLE;
    sent.current = IDLE;
    viewportRef.current?.followPart(null);
  }, [simStatus, viewportRef]);

  const begin = useCallback(
    (access: Extract<DriveAccess, { kind: 'ready' | 'policy' }>) => {
      const controller: Controller =
        access.kind === 'policy'
          ? { kind: 'policy', policy: access.velocity.policy, robot: access.robot }
          : { kind: 'drive', setup: access.setup };

      clsRef.current = access.cls;
      topSpeed.current = access.kind === 'policy' ? access.velocity.topSpeed : null;
      autopilot.current = null;
      keysCommand.current = IDLE;
      sent.current = IDLE;
      setCls(access.cls);
      latest.current.setController(controller);
      latest.current.send({ type: 'respawn', robot: robotKey });
      viewportRef.current?.followPart(access.followPart);
      setDriveStatus('on');
    },
    [robotKey, viewportRef],
  );

  const start = useCallback(async () => {
    const { parts, rig, pose, startSim, runOn, velocity } = latest.current;

    if (!modelRef.current) await startSim();

    const model = modelRef.current;

    if (!model) return false;

    const ready = (await velocity?.current?.()) ?? null;
    const access = driveAccess({ rig, parts, model, robotKey, start: pose?.values, velocity: ready });

    if (access.kind === 'teach' || access.kind === 'none') {
      setDriveStatus(access.kind);

      return false;
    }

    if (access.kind === 'ready' && access.needsFallCheck) setDriveStatus('checking');

    if (
      access.kind === 'ready' &&
      access.needsFallCheck &&
      !(await staysUp(runOn, model, { setup: access.setup, robotKey }))
    ) {
      setDriveStatus('teach');

      return false;
    }

    begin(access);

    return true;
  }, [modelRef, robotKey, begin]);

  const stop = useCallback(() => {
    keysCommand.current = IDLE;
    autopilot.current = null;
    clsRef.current = null;
    topSpeed.current = null;
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

  const follow = useCallback((next: Autopilot) => {
    if (clsRef.current) autopilot.current = next;
  }, []);

  const robotStat = stats?.robots.find((r) => r.key === robotKey) ?? stats?.robots[0];
  const offered = driveOffer({ rig: inputs.rig, parts: inputs.parts, robotKey, velocityReady: false });

  return {
    status: driveStatus,
    active,
    cls,
    offer: driveStatus === 'teach' && offered === 'drive' ? 'teach' : offered,
    fell: active && !!robotStat && robotStat.fellAt !== null,
    start,
    stop,
    respawn,
    setKeys,
    follow,
  };
}
