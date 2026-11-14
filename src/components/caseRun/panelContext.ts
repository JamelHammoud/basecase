import { useSyncExternalStore } from 'react';
import type { ConsoleSignal } from '../../cases/console/format';
import type { CaseAction, PanelKind, PanelOf } from '../../cases/console/panelKinds';
import type { SignalBus } from '../../cases/console/signalBus';
import type { SignalScope } from '../../cases/console/signalNames';
import type { CaseWorld } from '../../cases/worldSet';
import type { Simulation } from '../../sim/useSimulation';
import type { RobotJoint, ScenePart } from '../../types/robotics';
import type { Cases } from '../../workspace/useCases';
import type { CameraTiles } from '../cameras/useCameraTiles';

export interface StudioPanelContext {
  cases: Cases;
  cameras: CameraTiles;
  onShowRobots: () => void;
}

export interface PanelContext {
  bus: SignalBus;
  signals: readonly ConsoleSignal[];
  scope: SignalScope;
  inputs: readonly string[];
  brief: string;
  world: CaseWorld;
  sim: Simulation;
  parts: ScenePart[];
  joints: RobotJoint[];
  fire: (action: CaseAction) => void;
  can: (action: CaseAction) => boolean;
  seek?: (time: number) => void;
  studio: StudioPanelContext | null;
}

export interface PanelViewProps<K extends PanelKind> {
  panel: PanelOf<K>;
  ctx: PanelContext;
}

const busAt = (bus: SignalBus, version: number): SignalBus => ({ ...bus, version: () => version });

export function useBus(bus: SignalBus): SignalBus {
  const version = useSyncExternalStore(bus.subscribe, bus.version, bus.version);

  return busAt(bus, version);
}

const busKeys = new WeakMap<SignalBus, number>();
let busCount = 0;

export const busKey = (bus: SignalBus) => {
  if (!busKeys.has(bus)) busKeys.set(bus, ++busCount);

  return busKeys.get(bus);
};

const scopeText = ({ scope, inputs }: PanelContext) =>
  [inputs, [...scope.declared], [...scope.probes]].map((list) => [...list].sort().join(',')).join('|');

export const codeFrameKey = (ctx: PanelContext, source: string) => {
  const text = `${scopeText(ctx)}\n${source}`;
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);

  return `${busKey(ctx.bus)}:${text.length}:${(hash >>> 0).toString(36)}`;
};
