export type PortVec = [number, number, number];

export type PortKind = 'bore' | 'boss' | 'face' | 'output' | 'hole_circle' | 'screw' | 'connector';

export type ConnectorType = '5264-3' | 'jst-eh-3' | 'xt60' | 'ec5' | 'dc-barrel' | 'wire';

export type ConnectorRole = 'bus-in' | 'bus-out' | 'power-in' | 'power-out';

export interface Port {
  name: string;
  position: PortVec;
  axis: PortVec;
  kind: PortKind;
  diameterMm?: number;
  thread?: string;
  depthMm?: number;
  count?: number;
  pitchDiameterMm?: number;
  ref?: PortVec;
  connector?: ConnectorType;
  role?: ConnectorRole;
}

export type MateType = 'fastened' | 'coaxial' | 'face' | 'press_fit' | 'slider';

export interface PartMate {
  port: string;
  target: string;
  targetPort: string;
  type: MateType;
  turns?: number;
  offset?: number;
  flip?: boolean;
}

export interface MirrorLink {
  id: string;
  axis: 'x' | 'y' | 'z';
}

export interface PartRelations {
  mirrorOf?: MirrorLink;
  mates?: PartMate[];
  frame?: string;
}
