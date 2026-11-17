import type { ElectricalFunction, ElectricalProjection, ElectricalRequirement } from './electricalTypes';
import type { ScenePart } from '../types/robotics';

export type BoardPoint = [number, number];
export type BoardTurn = 0 | 90 | 180 | 270;

export interface BoardBinding {
  pad: string;
  partId: string;
  port: string;
  pin: string;
}

export interface BoardPlacement {
  id: string;
  productId: string;
  position: BoardPoint;
  rotation: BoardTurn;
  locked: boolean;
  unplaced?: boolean;
  bindings: BoardBinding[];
}

export interface BoardHole {
  id: string;
  position: BoardPoint;
  diameterMm: number;
  keepoutMm: number;
  mountingParts?: { screw: string; spacer: string };
}

export interface BoardKeepout {
  id: string;
  min: BoardPoint;
  max: BoardPoint;
}

export interface ElectronicsBoard {
  schema: 1;
  routed?: import('./boardRoutingTypes').BoardRoutedSource;
  partId: string;
  outline: 'rectangle';
  side: 'top' | 'bottom';
  heightMm: { top: number; bottom: number };
  edgeClearanceMm: number;
  holes: BoardHole[];
  keepouts: BoardKeepout[];
  placements: BoardPlacement[];
}

export interface BoardPad {
  number: string;
  position: BoardPoint;
  diameterMm: number;
  drillMm: number;
  function: ElectricalFunction;
  unused?: string;
}

export interface BoardMate {
  componentId: string;
  variant: string | null;
  port: string;
  source: string;
  housing: string;
  pins: Record<string, string>;
}

export interface BoardProduct {
  id: string;
  maker: string;
  mpn: string;
  source: string;
  sourceLocator: string;
  footprint: string;
  courtyard: { min: BoardPoint; max: BoardPoint };
  heightMm: number;
  belowMm: number;
  access: { min: BoardPoint; max: BoardPoint; heightMm: number };
  boardThicknessMm: [number, number];
  pads: BoardPad[];
  mates: BoardMate[];
  componentId?: string;
  catalogId?: string;
  mounting?: BoardHole[];
  maximumA?: number;
  modelHeightMm?: number;
  modelTurnDeg?: number;
  modelOffset?: [number, number, number];
  unresolved?: string;
}

export interface BoardTerminal {
  reference: string;
  placementId: string;
  pad: string;
  endpoint: { reference: string; pin: string };
  net: string;
}

export interface BoardProjection {
  board: ElectronicsBoard;
  part: ScenePart | null;
  terminals: BoardTerminal[];
  requirements: ElectricalRequirement[];
  electrical: ElectricalProjection;
}
