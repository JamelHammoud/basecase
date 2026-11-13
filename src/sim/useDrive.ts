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
import type { DriveSetup, RobotDrive } from './drive';
import { onPhonePress } from '../phone/phoneStore';
import { isIdle, sameCommand, type DriveClass } from './driveKeys';
import type { DriveCommand } from './driveTypes';
import type { Controller, SimStats } from './engine';
import { bodyAccess, bodyOffer, bodyPin } from './driveBody';
import { drivesBody, readInputs, STUDIO_INPUTS } from './inputSources';
import type { SimModel } from './mjcfTypes';
import type { SimRequest } from './sim.worker';
import { useDriveSources } from './useDriveSources';
import type { RunOptions, SimRun, SimStart, SimStatus } from './useSimulation';
import type { FrameHook, SimFrame } from './useSimWorker';

export type DriveStatus = 'off' | 'checking' | 'on' | 'teach' | 'none';

export type VelocitySource = () => Promise<VelocityDrive | null>;

export interface DriveTeam {
  members: Array<{ slot: number; setup: RobotDrive }>;
  script: Array<{ at: number; command: DriveCommand }>;
}

export type Autopilot = (frame: SimFrame) => DriveCommand;

export interface SimDrive {
  status: DriveStatus;
  active: boolean;
  cls: DriveClass | null;
  offer: DriveOffer;
  fell: boolean;
  start: (team?: DriveTeam) => Promise<boolean>;
  startWith: (ids: readonly string[]) => Promise<boolean>;
  canPose: boolean;
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
  startSim: (options?: SimStart) => Promise<void>;
  setController: (c: Controller) => void;
  runOn: (model: SimModel, opts: RunOptions) => Promise<SimRun>;
  velocity?: React.RefObject<VelocitySource | null>;
}

const IDLE: DriveCommand = { v: [0, 0, 0] };

const readyVelocity = async (velocity?: React.RefObject<VelocitySource | null>) =>
  (await velocity?.current?.()) ?? null;

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
  if (access.kind === 'policy') return { kind: 'policy', policy: access.velocity.policy, robot: access.robot };

  return { kind: 'drive', setup: teamSetup(access.setup, team) };
}

function useDriveCommand(send: DriveInputs['send']) {
  const keysCommand = useRef<DriveCommand>(IDLE);
  const sent = useRef<DriveCommand>(IDLE);
  const clsRef = useRef<DriveClass | null>(null);
  const topSpeed = useRef<number | null>(null);
  const inputIds = useRef<readonly string[]>(STUDIO_INPUTS);
  const own = useRef<readonly string[] | null>(null);
  const readings = useRef<Record<string, DriveCommand | null>>({});
  const autopilot = useRef<Autopilot | null>(null);

  const push = useCallback(
    (frame?: SimFrame) => {
      const current = clsRef.current;

      if (!current) return;

      const read = readInputs(own.current ?? inputIds.current, { cls: current, keys: keysCommand.current });
      const merged = steered(autopilot, read.command, frame);

      readings.current = read.readings;

      if (!merged || sameCommand(merged, sent.current)) return;

      sent.current = merged;
      send({ type: 'command', ...(topSpeed.current === null ? merged : policyCommand(merged, topSpeed.current)) });
    },
    [send],
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

  const ids = useCallback(() => own.current ?? inputIds.current, []);

  const setOwn = useCallback((next: readonly string[] | null) => {
    own.current = next;
  }, []);

  return { push, reset, setKeys, follow, setInputs, inputs, ids, setOwn };
}

function useStarts(attempt: (team?: DriveTeam) => Promise<boolean>, setOwn: (ids: readonly string[] | null) => void) {
  const busy = useRef(false);

  const oneAtATime = async (run: () => Promise<boolean>) => {
    if (busy.current) return false;

    busy.current = true;

    try {
      return await run();
    } finally {
      busy.current = false;
    }
  };

  const start = (team?: DriveTeam) => oneAtATime(() => attempt(team));

  const startWith = (using: readonly string[]) =>
    oneAtATime(async () => {
      setOwn(using);

      const started = await attempt();

      if (!started) setOwn(null);

      return started;
    });

  return { start, startWith };
}

export function useDrive(inputs: DriveInputs): SimDrive {
  const { status: simStatus, send, viewportRef, modelRef, frameHookRef, stats, robotKey } = inputs;
  const [driveStatus, setDriveStatus] = useState<DriveStatus>('off');
  const [cls, setCls] = useState<DriveClass | null>(null);
  const latest = useRef(inputs);
  const { push, reset, setKeys, follow, setInputs, inputs: readInputsNow, ids, setOwn } = useDriveCommand(send);
  const sources = useDriveSources(latest, viewportRef, push);
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

  useEffect(() => onPhonePress((button) => send({ type: 'input', name: 'phone', value: button })), [send]);

  useEffect(() => {
    if (simStatus !== 'off') return;

    sources.forget(ids());
    setOwn(null);
    reset(null, null);
    viewportRef.current?.followPart(null);
  }, [simStatus, viewportRef, reset, sources, ids, setOwn]);

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

  const attempt = useCallback(
    async (team?: DriveTeam) => {
      const { parts, rig, pose, startSim, runOn, velocity } = latest.current;

      const ready = await readyVelocity(velocity);
      const using = ids();
      const body = drivesBody(using);

      if (!modelRef.current)
        await (body ? sources.load(bodyPin({ rig, parts, robotKey, velocity: ready })) : startSim());

      const model = modelRef.current;

      if (!model) return false;

      const access = (body ? bodyAccess : driveAccess)({
        rig,
        parts,
        model,
        robotKey,
        start: pose?.values,
        velocity: ready,
      });

      if (access.kind === 'teach' || access.kind === 'none') {
        setDriveStatus(access.kind);

        return false;
      }

      await sources.pin(access);

      if (access.kind === 'ready' && access.needsFallCheck) setDriveStatus('checking');

      if (!(await passesFallCheck(runOn, modelRef.current ?? model, access, robotKey))) {
        setDriveStatus('teach');

        return false;
      }

      if (!(await sources.open(access, using))) {
        setDriveStatus('off');

        return false;
      }

      begin(access, team);

      return true;
    },
    [modelRef, robotKey, begin, ids, sources],
  );

  const { start, startWith } = useStarts(attempt, setOwn);

  const stop = useCallback(() => {
    sources.close(ids());
    setOwn(null);
    reset(null, null);
    viewportRef.current?.followPart(null);
    latest.current.setController({ kind: 'hold' });
    setDriveStatus('off');
  }, [viewportRef, reset, sources, ids, setOwn]);

  const respawn = useCallback(() => send({ type: 'respawn', robot: robotKey }), [send, robotKey]);

  const robotStat = stats?.robots.find((r) => r.key === robotKey) ?? stats?.robots[0];
  const offered = driveOffer({ rig: inputs.rig, parts: inputs.parts, robotKey, velocityReady: false });

  return {
    status: driveStatus,
    active,
    cls,
    offer: driveStatus === 'teach' && offered === 'drive' ? 'teach' : offered,
    fell: active && !!robotStat && robotStat.fellAt !== null,
    start,
    startWith,
    canPose: bodyOffer(inputs.rig, inputs.parts, robotKey),
    stop,
    respawn,
    setKeys,
    setInputs,
    inputs: readInputsNow,
    follow,
  };
}
