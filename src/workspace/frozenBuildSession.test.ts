import { expect, it } from 'vitest';
import { navigateFrozenHistory } from './frozenBuildSession';
import { createBuildStore } from '../kit/buildRecords';
import { memoryBuildStorage } from '../kit/buildStorage.fixtures';
import { repairKitFixture } from '../kit/buildRepair.fixtures';
import { frozenViewParts } from '../kit/frozenView';
import { frozenRepairPlayback } from './frozenRepairPlayback';
import { stepView, type Session } from './buildAlongSession';
import { canRecordRepair } from '../kit/buildRepairState';

it.each(['complete', 'cancelled', 'incomplete'] as const)(
  'reads %s repair history without changing the current repair',
  async (state) => {
    const source = await repairKitFixture();
    const target = await repairKitFixture(undefined, 'geometry');
    const store = createBuildStore(memoryBuildStorage());
    const build = await store.create('Robot', source.content);
    const record = await store.startRepair({
      id: build.id,
      target: target.content,
      request: crypto.randomUUID(),
      signal: new AbortController().signal,
    });
    const repair = { ...record.repairs![0], state };
    const current = { ...record, repairs: [repair, { ...record.repairs![0], id: 'later-repair' }] };
    const playback = frozenRepairPlayback(repair, source.kit, target.kit);
    const sourceParts = frozenViewParts(source.kit);
    const targetParts = frozenViewParts(target.kit);
    const session: Session = {
      ...playback,
      index: 0,
      camera: { position: [0, 0, 300], target: [0, 0, 0], hfovDeg: 45 },
      stepParts: [],
      views: playback.steps.map(stepView),
      frozen: { record, kit: source.kit, parts: sourceParts, repair },
      repairSession: {
        record: repair,
        source: source.kit,
        target: target.kit,
        sourceParts,
        targetParts,
        revisions: playback.revisions,
      },
    };
    const next = navigateFrozenHistory(session, playback.steps.length);
    const previous = navigateFrozenHistory(next, -playback.steps.length);

    expect(canRecordRepair(current, current.repairs[1])).toBe(true);
    expect(canRecordRepair(current, repair)).toBe(false);
    expect(canRecordRepair(current, undefined)).toBe(false);
    expect(canRecordRepair({ ...record, repairs: [repair] }, repair)).toBe(false);
    expect(next.frozen!.kit).toBe(target.kit);
    expect(next.frozen!.parts).toBe(targetParts);
    expect(previous.frozen!.kit).toBe(source.kit);
    expect(previous.frozen!.parts).toBe(sourceParts);
    expect(previous.frozen!.record).toBe(record);
    expect((await store.open(build.id)).record).toEqual(record);
  },
);
