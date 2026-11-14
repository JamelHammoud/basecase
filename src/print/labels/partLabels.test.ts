import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { buildGuidePlan } from '../../guide/guidePlan';
import { approximateScene } from '../../guide/guideScene';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { shapeKey } from '../shapeKey';
import { labelFixture } from './label.fixtures';
import { lettersOf, platesOf, writePlates as write } from './labelPlates.fixtures';
import { labelsKey, lettersToWrite, partLetters, unlabeledNote } from './partLetters';

function modelText(bytes: Uint8Array): string {
  return strFromU8(unzipSync(bytes)['3D/3dmodel.model']);
}

function triangleCounts(bytes: Uint8Array): Record<string, number> {
  const objects = modelText(bytes).split('<object ').slice(1);

  return Object.fromEntries(objects.map((o) => [/name="([^"]+)"/.exec(o)![1], o.split('<triangle ').length - 1]));
}

const parts = labelFixture();

describe('letters on printed parts', () => {
  it('gives a mirrored left and right bracket different letters, each the guide’s', () => {
    const plan = buildGuidePlan(approximateScene('Bot', parts, []), 'PLA');
    const letters = partLetters(plan, parts);
    const guideLetter = (id: string) => plan.items.find((i) => i.partIds.includes(id))!.label;

    expect(letters['bracket-left']).not.toBe(letters['bracket-right']);
    expect(letters['bracket-left']).toBe(guideLetter('bracket-left'));
    expect(letters['bracket-right']).toBe(guideLetter('bracket-right'));
  });

  it('labels the tray, and says why the exposed parts print without theirs', async () => {
    const letters = lettersOf(parts);
    const { files, unlabeled } = await write(parts, letters);
    const plain = await write(parts);
    const [labeled, bare] = [triangleCounts(files.PLA), triangleCounts(plain.files.PLA)];

    expect(labeled['Body Tray']).toBeGreaterThan(bare['Body Tray']);
    expect(labeled['Spare Tag']).toBe(bare['Spare Tag']);
    expect(unlabeled.map((u) => u.id).sort()).toEqual(['bracket-left', 'bracket-right', 'lid', 'tag']);
    expect(unlabeledNote(letters.tag, 'face')).toBe(
      `Letter ${letters.tag} left off: no flat face is hidden, free and big enough`,
    );
  });

  it('leaves a part with Don’t label as it was', async () => {
    const off = parts.map((p) => (p.id === 'tray' ? { ...p, print: { noLabel: true } } : p));
    const letters = lettersOf(off);
    const { files, unlabeled } = await write(off, letters);

    expect(letters.tray).toBeUndefined();
    expect(unlabeled.some((u) => u.id === 'tray')).toBe(false);
    expect(triangleCounts(files.PLA)['Body Tray']).toBe(triangleCounts((await write(off)).files.PLA)['Body Tray']);
  });

  it('keeps plate hashes and tracker keys with labels on, off or turned off per part', async () => {
    const off = parts.map((p) => ({ ...p, print: { noLabel: true } }));
    const on = await platesOf(parts, { ...DEFAULT_PROJECT, labelParts: true });
    const none = await platesOf(off, { ...DEFAULT_PROJECT, labelParts: false });

    expect(on.report.plan.plates.map((p) => p.hash)).toEqual(none.report.plan.plates.map((p) => p.hash));
    expect(parts.map(shapeKey)).toEqual(off.map(shapeKey));
  });

  it('keys slices by what the letters depend on, so a stale slice is never sent', () => {
    const on = { ...DEFAULT_PROJECT, labelParts: true };
    const offTray = parts.map((p) => (p.id === 'tray' ? { ...p, print: { noLabel: true } } : p));

    expect(labelsKey({ ...DEFAULT_PROJECT, labelParts: false }, parts, 'guide-1')).toBe('');
    expect(labelsKey(on, parts, 'guide-1')).toBe(labelsKey(on, labelFixture(), 'guide-1'));
    expect(labelsKey(on, parts, 'guide-1')).not.toBe(labelsKey(on, parts, 'guide-2'));
    expect(labelsKey(on, parts, 'guide-1')).not.toBe(labelsKey(on, offTray, 'guide-1'));
  });

  it('keys plates written without the guide plan as unlabeled, so a later lettered slice is never stale', async () => {
    const plan = buildGuidePlan(approximateScene('Bot', parts, []), 'PLA');
    const write = (guidePlan: () => Promise<typeof plan | null>, project = DEFAULT_PROJECT) =>
      lettersToWrite({ project, parts, guidePlan, key: 'guide-1' });

    expect(await write(async () => null)).toEqual({ key: '' });
    expect(await write(() => Promise.reject(new Error('stopped')))).toEqual({ key: '' });
    expect(await write(async () => plan, { ...DEFAULT_PROJECT, labelParts: false })).toEqual({ key: '' });
    expect(await write(async () => plan)).toEqual({ letters: lettersOf(parts), key: 'guide-1' });
  });

  it('writes the same faces and letters for the same scene', async () => {
    const [a, b] = [await write(parts, lettersOf(parts)), await write(labelFixture(), lettersOf(labelFixture()))];

    expect(modelText(a.files.PLA)).toBe(modelText(b.files.PLA));
    expect(a.unlabeled).toEqual(b.unlabeled);
  });
});
