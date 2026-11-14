import { sha256, type TryRecord } from '../cases/tries';
import type { StoredTry } from '../cases/tryFile';
import type { TrySegment } from '../cases/tryLabels';
import { loadStoredTry } from '../cases/tryStore';
import type { TryFlag } from '../datasets/tryFlags';
import type { Recording } from '../sim/recorder';
import { ruleSegments, type SegmentingScene } from './trySegmenting';

export interface OpenLabels {
  segments: TrySegment[];
  flags: TryFlag[];
}

export async function timelineFlags(stored: StoredTry | null, model: { xml: string }): Promise<TryFlag[]> {
  if (!stored) return [];

  const changed = stored.robot.modelHash !== (await sha256(model.xml));

  return [...(stored.flags ?? []), ...(changed ? [{ kind: 'model' as const, at: 0 }] : [])];
}

export async function openLabels(record: TryRecord, recording: Recording, scene: SegmentingScene): Promise<OpenLabels> {
  const stored = await loadStoredTry(record.id).catch(() => null);
  const segments = stored?.labels?.segments ?? (await ruleSegments(record, recording, scene).catch(() => []));

  return { segments, flags: await timelineFlags(stored, scene.model) };
}
