import type { WiringScene, Netlist } from './connectors';

export type ElectricalFunction = 'ground' | 'positive' | 'data';
export type ElectricalDirection = 'passive' | 'bidirectional' | 'power_in' | 'power_out';

export interface ElectricalPin {
  number: string;
  name: string;
  function: ElectricalFunction;
  direction: ElectricalDirection;
}

export interface ElectricalPortMap {
  port: string;
  connector: string;
  source: string;
  sourceLocator: string;
  pins: ElectricalPin[];
  basis?: 'requirement';
  maximumA?: number;
  maximumV?: number;
  outputV?: number;
  outputMaximumV?: number;
  terminals?: { input: string; output: string };
  unused?: Record<string, string>;
}

export interface ElectricalPartMap {
  componentId: string;
  variant?: string;
  ports: ElectricalPortMap[];
  common: ElectricalFunction[];
  unresolved?: string[];
}

export interface ElectricalEndpoint {
  offBoard?: boolean;
  footprint?: string;
  reference: string;
  partId: string | null;
  componentId: string | null;
  variant: string | null;
  name: string;
  port: string;
  map: ElectricalPortMap | null;
  moduleId?: string;
  sourcedItemId?: string;
}

export interface ElectricalNode {
  reference: string;
  pin: string;
}

export interface ElectricalNet {
  name: string;
  function: ElectricalFunction;
  nodes: ElectricalNode[];
  bus: number | null;
  buses: number[];
  nominalV: number | null;
  maximumV: number | null;
  declaredA: number | null;
  loadA: number | null;
  transientA: null;
  sourceReferences: string[];
  interfaceLimitA: number | null;
  standingServoEstimateA: number | null;
  modeledServoPeakA: number | null;
  currentModel: 'standing' | 'walk' | null;
  interfaceRatings: Array<{ reference: string; maximumA: number }>;
}

export interface ElectricalRequirement {
  code: string;
  partIds: string[];
  references: string[];
  detail: string;
}

export interface ElectricalPowerBudget {
  sourceName: string;
  sourceNominalV: number;
  sourceMaximumV: number;
  sourceDeclaredA: number | null;
  selectedRegulatorId: string | null;
  proposedServoNominalV: number;
  proposedServoMaximumV: number;
  proposedServoDeclaredA: number | null;
  estimatedSourceAverageA: number;
  estimatedSourcePeakA: number;
  estimatedServoPeakA: number;
  estimateBasis: 'existing-standing-model' | 'existing-walk-model';
  transientA: null;
}

export interface ElectricalProjection {
  schema: 1;
  endpoints: ElectricalEndpoint[];
  nets: ElectricalNet[];
  requirements: ElectricalRequirement[];
  wiring: Netlist;
  inputs: WiringScene;
  completeness: 'draft' | 'mapped';
  electricalVerdict: 'not-established';
  powerBudget: ElectricalPowerBudget | null;
}

export interface ElectricalInput extends WiringScene {
  meshFiles?: import('../three/componentMeshes').MeshFiles;
  wiring?: Netlist;
  pinMaps?: readonly ElectricalPartMap[];
  walk?: import('../utils/engineeringTypes').WalkSim;
}
