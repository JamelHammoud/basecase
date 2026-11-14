import { jointRadians } from './robotSpec.mjs';

export const PACE_MS = 30;

const CENTERED = { zero_counts: 2048, direction: 1 };

export function measuredRadians(status, ids, calibration = []) {
  const joints = Array.isArray(status?.joints) ? status.joints : [];

  return ids.map((id) => {
    const position = joints.find((j) => j?.id === id)?.position;
    const mount = calibration.find((j) => j.id === id) ?? CENTERED;

    return typeof position === 'number' ? jointRadians(position, mount) : 0;
  });
}

export class IntentPacer {
  constructor({ ids, write, measured, calibration = () => [], everyMs = PACE_MS }) {
    this.ids = ids;
    this.write = write;
    this.measured = measured;
    this.calibration = calibration;
    this.values = null;
    this.driving = false;
    this.timer = setInterval(() => this.tick(), everyMs);
  }

  drive() {
    if (this.driving) return;

    this.driving = true;
    this.values = measuredRadians(this.measured(), this.ids, this.calibration());
  }

  idle() {
    this.driving = false;
    this.values = null;
  }

  hold(joints) {
    if (this.driving) this.values = joints;
  }

  tick() {
    if (this.driving && this.values) this.write({ cmd: 'intent', joints: this.values });
    else this.write({ cmd: 'heartbeat' });
  }

  stop() {
    clearInterval(this.timer);
  }
}
