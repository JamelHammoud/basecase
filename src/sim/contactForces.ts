import { hashOf } from '../skills/hash';
import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';

export interface ForceChannel {
  signal: string;
  jaws: number[];
  target: number[];
  peak: boolean;
  ceilingN?: number;
}

export interface ForceEvidence {
  version: 1;
  caseKey: string;
  modelKey: string;
  channels: ForceChannel[];
  runtime?: string;
  timestep?: number;
  physicsKey?: string;
}

export class ContactForces {
  readonly evidence: ForceEvidence;
  readonly values: Float64Array;
  readonly peaks: Float64Array;
  private readonly bodyIndex: Int32Array;
  private readonly buffer: InstanceType<MainModule['DoubleBuffer']>;
  private readonly lookup = new Map<number, number[]>();

  constructor(mj: MainModule, model: MjModel, bodyIds: number[], evidence: ForceEvidence) {
    this.evidence = {
      ...structuredClone(evidence),
      runtime: mj.mj_versionString(),
      timestep: model.opt.timestep,
      physicsKey: hashOf({
        mass: Array.from(model.body_mass),
        friction: Array.from(model.geom_friction),
        effort: Array.from(model.actuator_forcerange),
      }),
    };
    this.values = new Float64Array(evidence.channels.length);
    this.peaks = new Float64Array(evidence.channels.length);
    this.bodyIndex = new Int32Array(model.nbody).fill(-1);
    this.buffer = new mj.DoubleBuffer(6);
    bodyIds.forEach((id, index) => {
      this.bodyIndex[id] = index;
    });
    evidence.channels.forEach((channel, index) => {
      for (const jaw of channel.jaws)
        for (const target of channel.target) {
          const key = this.pair(jaw, target);
          const indices = this.lookup.get(key) ?? [];

          indices.push(index);
          this.lookup.set(key, indices);
        }
    });
  }

  private pair(a: number, b: number) {
    return a < b ? a * this.bodyIndex.length + b : b * this.bodyIndex.length + a;
  }

  sample(mj: MainModule, model: MjModel, data: MjData) {
    const contacts = data.contact;
    const input = { mj, model, data, contacts, geomBodies: model.geom_bodyid };
    const count = data.ncon;

    this.values.fill(0);

    try {
      for (let i = 0; i < count; i++) this.contact(input, i);
    } finally {
      contacts.delete();
    }

    this.values.forEach((value, i) => {
      this.peaks[i] = Math.max(this.peaks[i], value);
    });
  }

  private contact(
    input: { mj: MainModule; model: MjModel; data: MjData; contacts: MjData['contact']; geomBodies: Int32Array },
    i: number,
  ) {
    const { mj, model, data, contacts, geomBodies } = input;
    const contact = contacts.get(i);

    if (!contact) return;

    try {
      if (contact.efc_address < 0) return;

      const a = this.bodyIndex[geomBodies[contact.geom1]];
      const b = this.bodyIndex[geomBodies[contact.geom2]];

      if (a < 0 || b < 0) return;

      const channels = this.lookup.get(this.pair(a, b));

      if (!channels) return;

      mj.mj_contactForce(model, data, i, this.buffer);

      const normal = Math.max(0, (this.buffer.GetView() as Float64Array)[0]);

      for (const index of channels) this.values[index] += normal;
    } finally {
      contact.delete();
    }
  }

  signals(): Record<string, number> {
    return Object.fromEntries(
      this.evidence.channels.map((c, i) => [c.signal, c.peak ? this.peaks[i] : this.values[i]]),
    );
  }

  reset() {
    this.values.fill(0);
    this.peaks.fill(0);
  }

  dispose() {
    this.buffer.delete();
  }
}

export const liveForceSignals = (engine: { forces: ContactForces | null }, playback: unknown) =>
  playback ? undefined : engine.forces?.signals();
