import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import { castEye, compactEye, rayCast, type Compact, type Eye, type RayCast } from './eyes';
import { DEFAULT_SCAN_HZ } from './lidar';

export interface Scan {
  values: Float32Array;
  points: Float32Array;
  counts: number[];
}

interface ScanSlot {
  compact: Compact;
  offset: number;
  periodS: number;
  next: number;
  points: Float32Array;
  hits: number;
}

export class Scanner {
  readonly values: Float32Array;

  version = 0;

  private readonly run: RayCast;

  private readonly slots: ScanSlot[];

  private last = -Infinity;

  private constructor(run: RayCast, slots: ScanSlot[], width: number) {
    this.run = run;
    this.slots = slots;
    this.values = new Float32Array(width).fill(1);
  }

  static create(mj: MainModule, model: MjModel, data: MjData, scans: Eye[] | undefined): Scanner | null {
    const placed = (scans ?? [])
      .map((eye) => ({ eye, body: mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value, eye.body) }))
      .filter((p) => p.body >= 0);

    if (!placed.length) return null;

    let offset = 0;
    const slots = placed.map(({ eye, body }): ScanSlot => {
      const compact = compactEye(eye, body);
      const slot = {
        compact,
        offset,
        periodS: 1 / (eye.scan?.rateHz ?? DEFAULT_SCAN_HZ),
        next: -Infinity,
        points: new Float32Array(compact.rays * 3),
        hits: 0,
      };

      offset += compact.rays;

      return slot;
    });
    const most = Math.max(...slots.map((s) => s.compact.index.length));

    return new Scanner(rayCast(mj, model, data, most), slots, offset);
  }

  tick(): boolean {
    const time = this.run.data.time;

    if (time < this.last) for (const s of this.slots) s.next = -Infinity;

    this.last = time;

    const due = this.slots.filter((s) => time + 1e-9 >= s.next);

    if (!due.length) return false;

    this.run.mj.mj_kinematics(this.run.model, this.run.data);

    for (const slot of due) this.cast(slot, time);

    this.version++;

    return true;
  }

  latest(): Scan {
    const points = new Float32Array(this.slots.reduce((n, s) => n + s.hits * 3, 0));
    let at = 0;

    for (const s of this.slots) {
      points.set(s.points.subarray(0, s.hits * 3), at);
      at += s.hits * 3;
    }

    return { values: this.values.slice(), points, counts: this.slots.map((s) => s.hits) };
  }

  dispose() {
    this.run.geomid.delete();
    this.run.dist.delete();
  }

  private cast(slot: ScanSlot, time: number) {
    const { compact: c, offset, points } = slot;

    this.values.fill(1, offset, offset + c.rays);
    slot.hits = 0;
    slot.next = time + slot.periodS;

    castEye(this.run, c, (ray, d, k, world) => {
      this.values[offset + ray] = d / c.rangeM;

      const at = slot.hits * 3;

      points[at] = (world.origin[0] + world.dirs[k * 3] * d) * 1000;
      points[at + 1] = (world.origin[2] + world.dirs[k * 3 + 2] * d) * 1000;
      points[at + 2] = -(world.origin[1] + world.dirs[k * 3 + 1] * d) * 1000;
      slot.hits++;
    });
  }
}
