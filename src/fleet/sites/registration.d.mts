export interface VerticalFrame {
  kind: 'ellipsoid' | 'orthometric' | 'local';
  offsetM?: number;
  reference?: string;
}

export interface ControlPoint {
  local: [number, number, number];
  latitude: number;
  longitude: number;
  altitudeM: number;
}

export interface Registration {
  datum: 'WGS84';
  vertical: VerticalFrame;
  controls: [ControlPoint, ControlPoint];
  matrix: number[];
}

export interface FleetPose {
  frame: 'WGS84' | 'facility';
  quality: 'reported' | 'estimated';
  floor?: string;
  facility?: string;
  pointM?: [number, number, number];
  datum?: 'WGS84';
  vertical?: VerticalFrame;
  latitude?: number;
  longitude?: number;
  altitudeM?: number;
}

export function verticalOffset(frame: VerticalFrame): number;
export function registerControls(value: unknown): Registration;
export function checkedRegistration(value: unknown): Registration;
export function locatePose(
  pose: FleetPose,
  registration: Registration | null,
): { latitude: number; longitude: number; altitudeM: number; quality: string; floor?: string } | null;
