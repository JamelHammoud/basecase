import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ModelChanges } from './modelChanges.mjs';
import { saveModel } from './models.mjs';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'models-'));
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('ModelChanges', () => {
  it('skips the app’s own writes and sends only the record someone else changed', () => {
    const changes = new ModelChanges(dir);
    const mine = saveModel(dir, { id: 'arm', name: 'Arm', createdAt: '2026-11-13' });

    changes.wrote(mine.id, JSON.stringify(mine));

    expect(changes.changeOf('arm.json')).toBeNull();

    fs.writeFileSync(path.join(dir, 'arm.json'), '{"id":"arm","name":"Base"}');

    expect(changes.changeOf('arm.json')).toEqual({ id: 'arm', model: { id: 'arm', name: 'Base' } });
    expect(changes.changeOf('arm.json')).toBeNull();
  });

  it('reports a removed file once, and waits out a half-written one', () => {
    const changes = new ModelChanges(dir);

    fs.writeFileSync(path.join(dir, 'leg.json'), '{"id":"le');

    expect(changes.changeOf('leg.json')).toBeNull();

    fs.rmSync(path.join(dir, 'leg.json'));

    expect(changes.changeOf('leg.json')).toEqual({ id: 'leg', model: null });
    expect(changes.changeOf('leg.json')).toBeNull();
    expect(changes.changeOf('.DS_Store')).toBeNull();
  });
});
