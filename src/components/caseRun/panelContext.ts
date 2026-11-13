import { useSyncExternalStore } from 'react';
import type { ConsoleSignal } from '../../cases/console/format';
import type { CaseAction, PanelKind, PanelOf } from '../../cases/console/panelKinds';
import type { SignalBus } from '../../cases/console/signalBus';
import type { SignalScope } from '../../cases/console/signalNames';
import type { Simulation } from '../../sim/useSimulation';
import type { RobotJoint, ScenePart } from '../../types/robotics';
import type { Cases } from '../../workspace/useCases';
import type { CameraTiles } from '../cameras/useCameraTiles';

export interface PanelContext {
  bus: SignalBus;
  signals: readonly ConsoleSignal[];
  scope: SignalScope;
  inputs: readonly string[];
  cases: Cases;
  sim: Simulation;
  parts: ScenePart[];
  joints: RobotJoint[];
  cameras: CameraTiles;
  fire: (action: CaseAction) => void;
  can: (action: CaseAction) => boolean;
  onBrowseRobots: () => void;
}

export interface PanelViewProps<K extends PanelKind> {
  panel: PanelOf<K>;
  ctx: PanelContext;
}

export const useBus = (bus: SignalBus) => useSyncExternalStore(bus.subscribe, bus.version, bus.version);

const busKeys = new WeakMap<SignalBus, number>();
let busCount = 0;

export const busKey = (bus: SignalBus) => {
  if (!busKeys.has(bus)) busKeys.set(bus, ++busCount);

  return busKeys.get(bus);
};

export const codeFrameKey = (bus: SignalBus, source: string) => {
  let hash = 0x811c9dc5;

  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 0x01000193);

  return `${busKey(bus)}:${source.length}:${(hash >>> 0).toString(36)}`;
};
