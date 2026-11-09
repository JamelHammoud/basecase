import type { TwinUnit } from './units';

export interface Payload {
  massKg: number;
  armM: number;
}

export interface ServoLog {
  family: TwinUnit['family'];
  dt: number;
  goalRad: number[];
  positionRad: number[];
  loadRatio: number[];
  volts: number[];
  temperatureC: number[];
  payload: Payload;
}

export const BOB_SIDE_M = 0.02;
export const LOG_DT = 0.01;

const SUBSTEP = 0.0002;
const FIRMWARE_EVERY = 5;
const GRAVITY = 9.81;
const COUPLING_DAMPING = 0.02;
const OUTPUT_DAMPING = 0.001;
const STUCK = 1e-3;
const COUNTS = 4096;

const loadInertia = (p: Payload) => p.massKg * (p.armM ** 2 + BOB_SIDE_M ** 2 / 6);

interface State {
  motor: number;
  motorVel: number;
  out: number;
  outVel: number;
  current: number;
  temp: number;
  duty: number;
}

function friction(unit: TwinUnit, options: { vel: number; push: number; loadNm: number; inertia: number }): number {
  const coulomb = unit.friction + unit.frictionLoad * Math.abs(options.loadNm);
  const stops = Math.abs(options.vel) < STUCK && Math.abs(options.push) <= unit.stickRatio * coulomb;

  if (stops) return -options.push - (options.inertia * options.vel) / SUBSTEP;

  return -coulomb * Math.sign(options.vel || options.push) - unit.viscous * options.vel;
}

export class HiddenTwin {
  private readonly unit: TwinUnit;
  private s: State;

  constructor(unit: TwinUnit, startRad: number) {
    this.unit = unit;
    this.s = { motor: startRad, motorVel: 0, out: startRad, outVel: 0, current: 0, temp: unit.thermal.startC, duty: 0 };
  }

  reading(): number {
    const q = (2 * Math.PI) / COUNTS;

    return Math.round((this.s.out + this.unit.biasRad) / q) * q;
  }

  private busVolts() {
    return this.unit.volts - this.unit.supplyOhm * Math.abs(this.s.current);
  }

  private motorTorque(): number {
    const u = this.unit;
    const r = u.resistance * (1 + u.thermal.alpha * (this.s.temp - 25));

    this.s.current = (this.s.duty * this.busVolts() - u.kt * this.s.motorVel) / r;
    this.s.temp +=
      (SUBSTEP * (this.s.current ** 2 * r - (this.s.temp - u.thermal.ambientC) / u.thermal.rth)) / u.thermal.cth;

    return u.kt * this.s.current;
  }

  private coupling(): number {
    const u = this.unit;
    const gap = this.s.motor - this.s.out;
    const half = u.backlashRad / 2;
    const engaged = Math.abs(gap) > half;
    const wound = engaged ? gap - Math.sign(gap) * half : 0;

    return (u.stiffness ?? 0) * wound + (engaged ? COUPLING_DAMPING * (this.s.motorVel - this.s.outVel) : 0);
  }

  private stepRigid(drive: number, payload: Payload) {
    const inertia = this.unit.armature + loadInertia(payload);
    const gravity = -payload.massKg * GRAVITY * payload.armM * Math.sin(this.s.out);
    const push = drive + gravity;
    const vel = this.s.motorVel;

    this.s.motorVel += (SUBSTEP * (push + friction(this.unit, { vel, push, loadNm: gravity, inertia }))) / inertia;
    this.s.motor += SUBSTEP * this.s.motorVel;
    this.s.out = this.s.motor;
    this.s.outVel = this.s.motorVel;
  }

  private stepCompliant(drive: number, payload: Payload) {
    const tc = this.coupling();
    const gravity = -payload.massKg * GRAVITY * payload.armM * Math.sin(this.s.out);
    const push = drive - tc;
    const vel = this.s.motorVel;
    const inertia = this.unit.armature;

    this.s.motorVel += (SUBSTEP * (push + friction(this.unit, { vel, push, loadNm: tc, inertia }))) / inertia;
    this.s.motor += SUBSTEP * this.s.motorVel;
    this.s.outVel += (SUBSTEP * (tc + gravity - OUTPUT_DAMPING * this.s.outVel)) / loadInertia(payload);
    this.s.out += SUBSTEP * this.s.outVel;
  }

  run(goalRad: number[], payload: Payload): ServoLog {
    const u = this.unit;
    const perTick = Math.round(LOG_DT / SUBSTEP);
    const lag = Math.round(u.delayS / SUBSTEP);
    const log: ServoLog = {
      family: u.family,
      dt: LOG_DT,
      goalRad,
      positionRad: [],
      loadRatio: [],
      volts: [],
      temperatureC: [],
      payload,
    };
    const stallA = (u.maxDuty * u.volts) / u.resistance;

    for (let tick = 0, n = 0; tick < goalRad.length; tick++) {
      log.positionRad.push(this.reading());
      log.loadRatio.push(this.s.current / stallA);
      log.volts.push(this.busVolts());
      log.temperatureC.push(this.s.temp);

      for (let k = 0; k < perTick; k++, n++) {
        const goal = goalRad[Math.max(0, Math.floor((n - lag) / perTick))];

        if (n % FIRMWARE_EVERY === 0)
          this.s.duty = Math.max(-u.maxDuty, Math.min(u.maxDuty, u.gain * (goal - this.reading())));

        const drive = this.motorTorque();

        if (u.stiffness === null) this.stepRigid(drive, payload);
        else this.stepCompliant(drive, payload);
      }
    }

    return log;
  }
}
