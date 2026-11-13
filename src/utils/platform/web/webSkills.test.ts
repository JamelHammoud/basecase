import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentDesign, skillFromTraining, skillHash } from '../../../skills/artifacts';
import { fixtureModel } from '../../../skills/fixtureModels';
import { kitEnvironment } from '../../../skills/kitEnvironment';
import { webRequest } from './webBackend';

const stored = vi.hoisted(() => new Map<string, unknown>());

vi.mock('./idb', () => ({
  idbGet: (store: string, key: string) => Promise.resolve(stored.get(`${store}/${key}`)),
  idbPut: (store: string, key: string, value: unknown) => Promise.resolve(void stored.set(`${store}/${key}`, value)),
  idbAll: () => Promise.resolve([]),
  idbDelete: () => Promise.resolve(),
}));

const model = fixtureModel('quad-servo');
const environment = kitEnvironment(model, 'stand');
const skill = skillFromTraining({
  name: 'Stand',
  start: null,
  current: currentDesign({ design: 'quad', model, environment }),
  environment,
  controller: { kind: 'hold' },
});
const hash = skillHash(skill);

const save = (body: unknown) => webRequest('/skill-save', { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => stored.clear());

describe('the web skill store', () => {
  it('keeps a skill under its hash and reads it back', async () => {
    expect((await save({ hash, text: JSON.stringify(skill) })).status).toBe(200);
    expect(await (await webRequest(`/skill?hash=${hash}`)).json()).toEqual(skill);
    expect([...stored.keys()]).toEqual([`skills/${hash}`]);
  });

  it('refuses crafted ids and files that aren’t skills, storing nothing', async () => {
    const text = JSON.stringify(skill);
    const crafted = ['../settings/purchases', '__proto__', hash.toUpperCase(), hash.slice(1), `${hash}/x`, 42, null];

    for (const id of crafted) {
      const res = await save({ hash: id, text });

      expect(res.status, String(id)).toBe(500);
      expect((await res.json()).error).toBe('A skill is named by its hash.');
    }

    expect((await save({ hash, text: '{"format":"basecase-skill"}' })).status).toBe(500);
    expect((await save({ hash, text: { format: 'basecase-skill' } })).status).toBe(500);
    expect((await webRequest('/skill?hash=..%2Fscenes%2Fa')).status).toBe(500);
    expect(stored.size).toBe(0);
  });
});
