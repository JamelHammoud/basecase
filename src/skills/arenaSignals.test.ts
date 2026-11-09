import type { MainModule } from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import type { SimEngine } from '../sim/engine';
import { signalReader } from './arenaSignals';

function contactEngine() {
  const made: { freed: boolean }[] = [];
  const contact = (geom1: number, geom2: number) => ({ geom1, geom2, delete: () => undefined });
  const contacts = [contact(1, 0), contact(0, 1)];
  const data = {
    ncon: contacts.length,
    get contact() {
      const vec = { freed: false, get: (i: number) => contacts[i], delete: () => (vec.freed = true) };

      made.push(vec);

      return vec;
    },
  };
  const engine = {
    model: { geom_bodyid: [0, 2] },
    data,
    sim: { bodies: [{ name: 'foot', parts: ['foot'] }], robots: [], joints: [] },
  } as unknown as SimEngine;
  const ids: Record<string, number> = { foot: 2, floor: 0 };
  const mj = {
    mjtObj: { mjOBJ_BODY: { value: 1 }, mjOBJ_JOINT: { value: 3 }, mjOBJ_GEOM: { value: 5 } },
    mj_name2id: (_model: unknown, _kind: number, name: string) => ids[name] ?? -1,
  } as unknown as MainModule;

  return { made, read: signalReader({ mj, engine, robot: 'r' }, { kind: 'contact', part: 'foot', with: 'floor' }) };
}

describe('contact signal', () => {
  it('frees the contact list it reads, so long Arena runs keep their memory flat', () => {
    const { made, read } = contactEngine();

    for (let i = 0; i < 100; i++) expect(read()).toBe(1);

    expect(made).toHaveLength(100);
    expect(made.every((v) => v.freed)).toBe(true);
  });
});
