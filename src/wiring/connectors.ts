import { componentPorts } from '../data/componentPorts';
import type { ConnectorRole, ConnectorType, Port, PortVec } from '../types/ports';
import type { ProjectSettings, ScenePart } from '../types/robotics';

export const CONNECTOR_NAMES: Record<ConnectorType, string> = {
  '5264-3': '5264 3-pin',
  'jst-eh-3': 'JST EH 3-pin',
  xt60: 'XT60',
  ec5: 'EC5',
  'dc-barrel': '5.5 × 2.1 mm barrel',
  wire: 'wire',
};

export interface NetEnd {
  id: string | null;
  name: string;
  connector: ConnectorType;
  port?: Port;
}

export interface CableRoute {
  points: PortVec[];
  requiredMm: number | null;
  cableSupplyId: string | null;
  lengthMm: number | null;
  status: 'pass' | 'fail' | 'unresolved';
  reason: string | null;
  limitingPose: Record<string, number>;
}

export interface WiringRouteSpec {
  from: { partId: string; port: string };
  to: { partId: string; port: string };
  supplyId?: string;
  anchors?: Array<{ partId: string; position: PortVec }>;
}

export interface Net {
  from: NetEnd;
  to: NetEnd;
  route?: CableRoute;
}

export interface BusServo {
  id: string;
  busId: number | null;
}

export interface BusChain {
  connector: ConnectorType;
  adapter: string | null;
  servos: BusServo[];
  nets: Net[];
}

export interface PowerTree {
  source: NetEnd | null;
  battery: boolean;
  nets: Net[];
}

export interface Netlist {
  buses: BusChain[];
  power: PowerTree;
  unmatched: string[];
}

export interface WiringScene {
  parts: ScenePart[];
  project: ProjectSettings;
}

export const portOf = (p: ScenePart, role: ConnectorRole): Port | undefined =>
  p.kind === 'component' ? componentPorts(p.componentId).find((port) => port.role === role) : undefined;

export const endOf = (p: ScenePart, port: Port): NetEnd => ({
  id: p.id,
  name: p.name,
  connector: port.connector!,
  port: { ...port, position: [...port.position], axis: [...port.axis] },
});

export const busIn = (p: ScenePart) => portOf(p, 'bus-in');

export const isBusAdapter = (p: ScenePart) => !!portOf(p, 'bus-out') && !busIn(p);
