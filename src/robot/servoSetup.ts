import { useSyncExternalStore } from 'react';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { connectedFrom } from './calibrationSession';
import { isServoAsk, servoFamily, type RobotEvent, type RobotState, type RobotStatus } from './robotState';
import { connectRobot, receiveRobotEvent, robotSnapshot, selectedUnit, sendUnitCommand } from './robotStore';
import { subscribeUnitRobot } from './unitSubscription';
import { emulatedUnits } from './emulatedUnits';
import { sceneRobot } from './sceneRobot';
import { FACTORY_ID, SERVO_MODEL, servoAnswers, servoStepsToDo, servoWalk, type ServoWalkStep } from './servoWalk';

export type SelectParts = (ids: string[]) => void;

export interface ServoSetup {
  step: ServoWalkStep | null;
}

export interface ServoSetupOptions {
  joints: readonly RobotJoint[];
  parts?: readonly ScenePart[];
  select: SelectParts;
}

interface Walk extends ServoSetupOptions {
  unit: string;
  steps: ServoWalkStep[] | null;
  staleStatus: RobotStatus | null;
  written: number[];
  plugged: boolean;
  sent: boolean;
  stop: () => void;
}

let walk: Walk | null = null;
let snapshot: ServoSetup | null = null;
const listeners = new Set<() => void>();

function publish() {
  snapshot = walk ? { step: walk.steps?.[0] ?? null } : null;

  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export const servoSetup = () => snapshot;

export const useServoSetup = () => useSyncExternalStore(subscribe, servoSetup);

const answersAll = (state: RobotState) =>
  (state.spec?.ids ?? []).every((id) => servoAnswers(state.status?.joints ?? [], id));

export function canSetUpServos(joints: readonly RobotJoint[], state: RobotState): boolean {
  if (!sceneRobot(joints).ok) return false;

  if (state.link !== 'connected') return true;

  if (!servoFamily(state.spec)) return false;

  const settingUp = state.mode === 'look' || state.mode === 'set_up';

  return settingUp && Boolean(connectedFrom(joints)) && !answersAll(state);
}

export function endServoSetup() {
  const ending = walk;

  if (!ending) return;

  walk = null;
  ending.stop();

  if (ending.steps) ending.select([]);

  publish();
}

function showStep(current: Walk, steps: ServoWalkStep[]) {
  if (!steps.length) {
    endServoSetup();

    return;
  }

  Object.assign(current, { steps, plugged: false, sent: false });
  current.select(steps[0].link);
  publish();
}

async function send(current: Walk, command: Record<string, unknown>) {
  const reply = await sendUnitCommand(current.unit, command);

  if (!reply.ok && walk === current)
    receiveRobotEvent({ event: 'refused', unit: current.unit, message: reply.message });
}

function onStatus(current: Walk, state: RobotState) {
  const step = current.steps?.[0];
  const status = state.status?.joints ?? [];

  if (!step || current.sent || !current.written.every((id) => servoAnswers(status, id))) return;

  if (servoAnswers(status, FACTORY_ID)) {
    current.sent = true;
    void send(current, { cmd: 'assign_id', id: step.id, model: SERVO_MODEL[servoFamily(state.spec) ?? 'feetech'] });

    return;
  }

  if (!state.emulated || current.plugged) return;

  current.plugged = true;
  void send(current, { cmd: 'plug_in' });
}

function onEntering(current: Walk, state: RobotState) {
  const { status } = state;

  if (state.mode !== 'set_up' && state.pending !== 'set_up') {
    endServoSetup();

    return;
  }

  if (status?.mode !== 'set_up' || status === current.staleStatus) return;

  showStep(current, servoStepsToDo(servoWalk(current.joints), status.joints));

  if (walk === current) onStatus(current, state);
}

function onState() {
  const current = walk;

  if (!current) return;

  const state = robotSnapshot(current.unit);

  if (state.link !== 'connected') endServoSetup();
  else if (!current.steps) onEntering(current, state);
  else if (state.mode !== 'set_up') endServoSetup();
  else onStatus(current, state);
}

function onEvent(event: RobotEvent) {
  const current = walk;
  const step = current?.steps?.[0];

  if (!current) return;

  if (event.event === 'refused' || event.event === 'fault') {
    endServoSetup();

    return;
  }

  if (event.event !== 'assigned' || !step || !current.sent || event.id !== step.id) return;

  current.written = [...current.written, step.id];
  showStep(current, current.steps?.slice(1) ?? []);
}

async function connectFactory({ joints, parts = [], unit }: Walk): Promise<boolean> {
  const robot = sceneRobot(joints);

  if (!robot.ok || !isServoAsk(robot.spec)) return false;

  if (robotSnapshot(unit).link === 'connected') return true;

  const units = emulatedUnits({ choice: robot, joints, parts });
  const reply = await connectRobot({ ...robot.spec, ...units, factory: true }, robot.joints, unit);

  if (!reply.ok) receiveRobotEvent({ event: 'refused', unit, message: reply.message });

  return reply.ok;
}

function follow(current: Walk) {
  const state = robotSnapshot(current.unit);

  current.staleStatus = state.status;

  current.stop = subscribeUnitRobot(current.unit, (event) => {
    onEvent(event);

    if (walk === current) onState();
  });

  if (state.mode === 'look') void send(current, { cmd: 'enter', mode: 'set_up' });
  else onState();
}

export async function setUpServos({ joints, parts, select }: ServoSetupOptions): Promise<void> {
  if (walk || !canSetUpServos(joints, robotSnapshot())) return;

  const current: Walk = {
    unit: selectedUnit(),
    joints,
    parts,
    select,
    steps: null,
    staleStatus: null,
    written: [],
    plugged: false,
    sent: false,
    stop: () => {},
  };

  walk = current;
  publish();

  const connected = await connectFactory(current);

  if (walk !== current) return;

  const state = robotSnapshot(current.unit);
  const ready = connected && state.link === 'connected' && Boolean(connectedFrom(joints, current.unit));

  if (ready && (state.mode === 'look' || state.mode === 'set_up')) follow(current);
  else endServoSetup();
}
