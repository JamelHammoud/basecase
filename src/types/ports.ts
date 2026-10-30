export type PortVec = [number, number, number];

export type PortKind = 'bore' | 'boss' | 'face' | 'output' | 'hole_circle' | 'screw';

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
