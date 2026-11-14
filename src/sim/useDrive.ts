import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { RobotPoseState, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import {
  driveAccess,
  driveOffer,
  poseOffer,
  FALL_CHECK_SECONDS,
  FALL_CHECK_SETTLE_SECONDS,
  fallCheckCommands,
  fallCheckPassed,
  policyCommand,
  posePin,
  type DriveAccess,
  type DriveOffer,
  type VelocityDrive,
} from './driveAccess';
import type { DriveSetup, RobotDrive } from './drive';
import { isIdle, sameCommand, type DriveClass } from './driveKeys';
import type { DriveCommand } from './driveTypes';
import type { Controller, SimStats } from './engine';
import { onInputEvent } from './inputEvents';
import { closeInputs, openInputs, posesInputs, readInputs, STUDIO_INPUTS } from './inputSources';
import { inputRobot, pinFor } from './driveSession';
import type { SimModel } from './mjcfTypes';
import type { SimRequest } from './sim.worker';
import type { RunOptions, SimRun, SimStatus } from './useSimulation';
import type { FrameHook, SimFrame } from './useSimWorker';

export type DriveStatus = 'off' | 'checking' | 'on' | 'teach' | 'none';

export type VelocitySource = () => Promise<VelocityDrive | null>;

export interface DriveTeam {
  members: Array<{ slot: number; setup: RobotDrive }>;
  script: Array<{ at: number; command: DriveCommand }>;
}

export type Autopilot = (frame: SimFrame) => DriveCommand;

export interface DriveStartOptions {
  inputs?: readonly string[];
}

export interface SimDrive {
  status: DriveStatus;
  active: boolean;
  cls: DriveClass | null;
  offer: DriveOffer;
  offersPose: boolean;
  fell: boolean;
  start: (team?: DriveTeam, options?: DriveStartOptions) => Promise<boolean>;
  refusal: () => string | null;
  stop: () => void;
  respawn: () => void;
  setKeys: (command: DriveCommand) => void;
  setInputs: (ids: readonly string[] | null) => void;
  inputs: () => Record<string, DriveCommand | null>;
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
  startSim: (pin: string | null) => Promise<void>;
  pinned: () => string | null;
  setController: (c: Controller) => void;
  runOn: (model: SimModel, opts: RunOptions) => Promise<SimRun>;
  velocity?: React.RefObject<VelocitySource | null>;
}

const IDLE: DriveCommand = { v: [0, 0, 0] };

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

function passesFallCheck(
  runOn: DriveInputs['runOn'],
  model: SimModel,
  access: Extract<DriveAccess, { kind: 'ready' | 'policy' }>,
  robotKey?: string,
): Promise<boolean> {
  if (access.kind !== 'ready' || !access.needsFallCheck) return Promise.resolve(true);

  return staysUp(runOn, model, { setup: access.setup, robotKey });
}

function teamSetup(own: RobotDrive, team: DriveTeam | undefined): DriveSetup {
  if (!team?.members.length) return own;

  return { kind: 'team', members: [{ slot: 0, setup: own }, ...team.members] };
}

function controllerFor(access: Extract<DriveAccess, { kind: 'ready' | 'policy' }>, team?: DriveTeam): Controller {
  if (access.kind === 'policy') {
    const pose = access.pose ? { pose: access.pose } : {};

    return { kind: 'policy', policy: access.velocity.policy, robot: access.robot, ...pose };
  }

  return { kind: 'drive', setup: teamSetup(access.setup, team) };
}

function useDriveCommand(send: DriveInputs['send'], session: React.RefObject<readonly string[] | null>) {
  const keysCommand = useRef<DriveCommand>(IDLE);
  const sent = useRef<DriveCommand>(IDLE);
  const clsRef = useRef<DriveClass | null>(null);
  const topSpeed = useRef<number | null>(null);
  const inputIds = useRef<readonly string[]>(STUDIO_INPUTS);
  const readings = useRef<Record<string, DriveCommand | null>>({});
  const autopilot = useRef<Autopilot | null>(null);

  const push = useCallback(
    (frame?: SimFrame) => {
      const current = clsRef.current;

      if (!current) return;

      const moment = { cls: current, keys: keysCommand.current, ...(frame ? { time: frame.time } : {}) };
      const read = readInputs(session.current ?? inputIds.current, moment);
      const merged = steered(autopilot, read.command, frame);

      readings.current = read.readings;

      if (!merged || sameCommand(merged, sent.current)) return;

      sent.current = merged;
      send({ type: 'command', ...(topSpeed.current === null ? merged : policyCommand(merged, topSpeed.current)) });
    },
    [send, session],
  );

  const reset = useCallback((cls: DriveClass | null, speed: number | null) => {
    clsRef.current = cls;
    topSpeed.current = speed;
    autopilot.current = null;
    keysCommand.current = IDLE;
    sent.current = IDLE;
    readings.current = {};
  }, []);

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

  const setInputs = useCallback((ids: readonly string[] | null) => {
    inputIds.current = ids ?? STUDIO_INPUTS;
  }, []);

  const inputs = useCallback(() => readings.current, []);

  return { push, reset, setKeys, follow, setInputs, inputs, inputIds };
}

function closeSession(session: React.RefObject<readonly string[] | null>) {
  closeInputs(session.current ?? []);
  session.current = null;
}

async function grantedModel(
  inputs: DriveInputs,
  modelRef: React.RefObject<SimModel | null>,
  want: { pose: boolean; velocity: VelocityDrive | null },
): Promise<DriveAccess | null> {
  const { rig, parts, pose, robotKey, startSim, pinned } = inputs;

  const poseOnly = want.pose && !want.velocity;

  if (!modelRef.current || (pinned() && !poseOnly)) await startSim(poseOnly ? posePin({ rig, parts, robotKey }) : null);

  const access = (model: SimModel) =>
    driveAccess({ rig, parts, model, robotKey, start: pose?.values, velocity: want.velocity, pose: want.pose });
  const first = modelRef.current && access(modelRef.current);
  const pin = first && pinFor(first);

  if (!first || !pin) return first;

  await startSim(pin);

  return modelRef.current && access(modelRef.current);
}

export function useDrive(inputs: DriveInputs): SimDrive {
  const { status: simStatus, send, viewportRef, modelRef, frameHookRef, stats, robotKey } = inputs;
  const [driveStatus, setDriveStatus] = useState<DriveStatus>('off');
  const [cls, setCls] = useState<DriveClass | null>(null);
  const latest = useRef(inputs);
  const session = useRef<readonly string[] | null>(null);
  const { push, reset, setKeys, follow, setInputs, inputs: readInputsNow, inputIds } = useDriveCommand(send, session);
  const refused = useRef<string | null>(null);
  const [seenSimStatus, setSeenSimStatus] = useState(simStatus);

  if (seenSimStatus !== simStatus) {
    setSeenSimStatus(simStatus);
    setDriveStatus((s) => (simStatus === 'off' ? 'off' : s));
  }

  useLayoutEffect(() => {
    latest.current = inputs;
  });

  const active = driveStatus === 'on' && simStatus === 'ready';

  useEffect(() => {
    frameHookRef.current = active ? push : null;

    return () => {
      frameHookRef.current = null;
    };
  }, [active, frameHookRef, push]);

  useEffect(() => onInputEvent(({ name, value }) => send({ type: 'input', name, value })), [send]);

  useEffect(() => {
    if (simStatus !== 'off') return;

    reset(null, null);
    closeSession(session);
    viewportRef.current?.followPart(null);
  }, [simStatus, viewportRef, reset, session]);

  useEffect(() => () => closeSession(session), [session]);

  const begin = useCallback(
    (access: Extract<DriveAccess, { kind: 'ready' | 'policy' }>, team?: DriveTeam) => {
      const controller = controllerFor(access, team);

      reset(access.cls, access.kind === 'policy' ? access.velocity.topSpeed : null);
      setCls(access.cls);
      latest.current.setController(controller);
      latest.current.send({ type: 'respawn', robot: robotKey });

      if (team?.script.length && access.kind === 'ready')
        latest.current.send({ type: 'script', commands: team.script });

      viewportRef.current?.followPart(access.followPart);
      setDriveStatus('on');
    },
    [robotKey, viewportRef, reset],
  );

  const openSession = useCallback(
    async (ids: readonly string[], access: Extract<DriveAccess, { kind: 'ready' | 'policy' }>) => {
      if (session.current === ids) return true;

      closeSession(session);

      const { rig, parts } = latest.current;
      const robot = inputRobot(access, { rig, parts, viewport: viewportRef.current });

      session.current = ids;

      const refusal = await openInputs(ids, robot);

      if (session.current !== ids) return false;

      refused.current = refusal;
      session.current = refusal ? null : ids;

      return !refusal;
    },
    [session, viewportRef],
  );

  const start = useCallback(
    async (team?: DriveTeam, options?: DriveStartOptions) => {
      const { runOn, velocity } = latest.current;
      const ids = options?.inputs ?? session.current ?? inputIds.current;
      const ready = (await velocity?.current?.()) ?? null;
      const access = await grantedModel(latest.current, modelRef, { pose: posesInputs(ids), velocity: ready });
      const model = modelRef.current;

      refused.current = null;

      if (!access || !model) return false;

      if (access.kind === 'teach' || access.kind === 'none') {
        setDriveStatus(access.kind);

        return false;
      }

      if (access.kind === 'ready' && access.needsFallCheck) setDriveStatus('checking');

      if (!(await passesFallCheck(runOn, model, access, robotKey))) {
        setDriveStatus('teach');

        return false;
      }

      if (!(await openSession(ids, access))) {
        setDriveStatus('off');

        return false;
      }

      begin(access, team);

      return true;
    },
    [modelRef, robotKey, begin, inputIds, session, openSession],
  );

  const stop = useCallback(() => {
    reset(null, null);
    closeSession(session);
    viewportRef.current?.followPart(null);
    latest.current.setController({ kind: 'hold' });
    setDriveStatus('off');
  }, [viewportRef, reset, session]);

  const respawn = useCallback(() => send({ type: 'respawn', robot: robotKey }), [send, robotKey]);

  const robotStat = stats?.robots.find((r) => r.key === robotKey) ?? stats?.robots[0];
  const offered = driveOffer({ rig: inputs.rig, parts: inputs.parts, robotKey, velocityReady: false });

  return {
    status: driveStatus,
    active,
    cls,
    offer: driveStatus === 'teach' && offered === 'drive' ? 'teach' : offered,
    offersPose: poseOffer({ rig: inputs.rig, parts: inputs.parts, robotKey }),
    fell: active && !!robotStat && robotStat.fellAt !== null,
    start,
    refusal: () => refused.current,
    stop,
    respawn,
    setKeys,
    setInputs,
    inputs: readInputsNow,
    follow,
  };
}
