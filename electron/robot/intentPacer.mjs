import { radiansFromCounts } from './robotSpec.mjs';

export const PACE_MS = 30;

export function measuredRadians(status, ids) {
  const joints = Array.isArray(status?.joints) ? status.joints : [];

  return ids.map((id) => {
    const position = joints.find((j) => j?.id === id)?.position;

    return typeof position === 'number' ? radiansFromCounts(position) : 0;
  });
}

export class IntentPacer {
  constructor({ ids, write, measured, everyMs = PACE_MS }) {
    this.ids = ids;
    this.write = write;
    this.measured = measured;
    this.values = null;
    this.driving = false;
    this.timer = setInterval(() => this.tick(), everyMs);
  }

  drive() {
    if (this.driving) return;

    this.driving = true;
    this.values = measuredRadians(this.measured(), this.ids);
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
