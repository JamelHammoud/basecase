export interface RobotLinkRef {
  robot: string;
  link: string;
  url?: string;
  rotate?: Array<[string, number]>;
  version: number;
  fixedMates?: string[];
  onshape?: string[];
}

export interface OnshapeSource {
  did: string;
  wvm: 'w' | 'v';
  wvmid: string;
  eid: string;
}

export interface PartGroup {
  id: string;
  name: string;
  onshape?: OnshapeSource;
}

export interface OnshapeMate {
  mate: string;
  gone?: boolean;
}
