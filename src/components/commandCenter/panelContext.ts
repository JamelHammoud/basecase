import { useSyncExternalStore } from 'react';
import type { ConsoleSignal } from '../../cases/console/format';
import type { CaseAction, PanelKind, PanelOf } from '../../cases/console/panelKinds';
import type { SignalBus } from '../../cases/console/signalBus';
import type { Simulation } from '../../sim/useSimulation';
import type { RobotJoint, ScenePart } from '../../types/robotics';
import type { Cases } from '../../workspace/useCases';
import type { CameraTiles } from '../cameras/useCameraTiles';

export interface PanelContext {
  bus: SignalBus;
  signals: readonly ConsoleSignal[];
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
