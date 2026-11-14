import { jointRadians } from './robotSpec.mjs';

export const PACE_MS = 30;
export const SILENT_HOST_MS = 1000;

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
  constructor({ write, everyMs = PACE_MS, silentHostMs = SILENT_HOST_MS }) {
    this.write = write;
    this.silentHostMs = silentHostMs;
    this.values = null;
    this.driving = false;
    this.heardAt = performance.now();
    this.timer = setInterval(() => this.tick(), everyMs);
  }

  drive(joints) {
    if (this.driving) return;

    this.driving = true;
    this.values = joints;
  }

  idle() {
    this.driving = false;
    this.values = null;
  }

  hold(joints) {
    if (this.driving) this.values = joints;
  }

  alive() {
    this.heardAt = performance.now();
  }

  tick() {
    if (performance.now() - this.heardAt > this.silentHostMs) return;

    if (this.driving && this.values) this.write({ cmd: 'intent', joints: this.values });
    else this.write({ cmd: 'heartbeat' });
  }

  stop() {
    clearInterval(this.timer);
  }
}
