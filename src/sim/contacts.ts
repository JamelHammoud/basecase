import type { MjData, MjModel } from '@mujoco/mujoco';

function keepPair(a: number, b: number, pairs: Set<string>, out: number[]) {
  const key = `${Math.min(a, b)},${Math.max(a, b)}`;

  if (!(a >= 0 && b >= 0) || a === b || pairs.has(key)) return;

  pairs.add(key);
  out.push(a, b);
}

export class BodyContacts {
  private readonly bodyIndex: Int32Array;
  private readonly model: MjModel;

  constructor(model: MjModel, bodyIds: number[]) {
    this.model = model;
    this.bodyIndex = new Int32Array(model.nbody).fill(-1);
    bodyIds.forEach((id, index) => {
      this.bodyIndex[id] = index;
    });
  }

  sample(data: MjData): Int32Array {
    const pairs = new Set<string>();
    const out: number[] = [];
    const contacts = data.contact;

    for (let i = 0; i < data.ncon; i++) {
      const contact = contacts.get(i);

      if (contact && contact.dist <= 0 && contact.efc_address >= 0) {
        const a = this.bodyIndex[this.model.geom_bodyid[contact.geom1]];
        const b = this.bodyIndex[this.model.geom_bodyid[contact.geom2]];

        keepPair(a, b, pairs, out);
      }

      contact?.delete();
    }

    contacts.delete();

    return Int32Array.from(out);
  }
}
