export interface BldcMotor {
  componentId: string;
  short: string;
  kv: number;
  peakA: number;
  ratedA: number;
  maxV: number;
  rotorKgM2: number;
  diameterMm: number;
  bodyMm: number;
  faceInMesh: number;
  rearShaftMm: number;
  shaftMm: number;
  faceBolts: { circleMm: number; m: number; count: number };
  source: string;
}

export interface BldcDriver {
  componentId: string;
  short: string;
  peakA: number;
  ratedA: number;
  volts: [number, number];
  thicknessMm: number;
}

export const BLDC_MOTORS: BldcMotor[] = [
  {
    componentId: 'odrive-d6374',
    short: 'D6374',
    kv: 150,
    peakA: 90,
    ratedA: 50,
    maxV: 48,
    rotorKgM2: 1.1e-4,
    diameterMm: 63,
    bodyMm: 74,
    faceInMesh: 30,
    rearShaftMm: 16,
    shaftMm: 10,
    faceBolts: { circleMm: 44, m: 4, count: 4 },
    source: 'https://docs.odriverobotics.com/v/latest/hardware/odrive-motors.html',
  },
];

export const BLDC_DRIVERS: BldcDriver[] = [
  {
    componentId: 'mjbots-moteus-c1',
    short: 'moteus-c1',
    peakA: 20,
    ratedA: 14,
    volts: [10, 51],
    thicknessMm: 9.5,
  },
  {
    componentId: 'mjbots-moteus-r4',
    short: 'moteus-r4',
    peakA: 100,
    ratedA: 32,
    volts: [10, 44],
    thicknessMm: 13.35,
  },
];

export const ENCODER_ID = 'adafruit-as5600';

export const motorById = (id: string) => BLDC_MOTORS.find((m) => m.componentId === id);

export const driverByShort = (short: string) => BLDC_DRIVERS.find((d) => d.short === short);

export const torqueConstant = (motor: BldcMotor) => 8.27 / motor.kv;
