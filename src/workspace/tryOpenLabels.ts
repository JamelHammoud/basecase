import { judgeUnjudged, type JudgeScene } from '../cases/judgeTry';
import type { Case } from '../cases/schema';
import { sha256, type TryRecord } from '../cases/tries';
import type { StoredTry } from '../cases/tryFile';
import type { TrySegment } from '../cases/tryLabels';
import { loadStoredTry, relabelTries } from '../cases/tryStore';
import type { TryFlag } from '../datasets/tryFlags';
import type { Recording } from '../sim/recorder';
import { ruleSegments, type SegmentingScene } from './trySegmenting';

export interface OpenLabels {
  segments: TrySegment[];
  flags: TryFlag[];
}

const needsJudging = (stored: StoredTry | null): stored is StoredTry =>
  !!stored && stored.outcome.verdict === 'unjudged' && !stored.labels?.judged && !stored.labels?.mark;

async function judgeOnOpen(stored: StoredTry | null, recording: Recording, scene: JudgeScene & { cases: Case[] }) {
  if (!needsJudging(stored)) return;

  const judged = await judgeUnjudged(scene.cases, recording, scene);

  if (judged) await relabelTries([{ id: stored.id, patch: { judged } }]);
}

export async function timelineFlags(stored: StoredTry | null, model: { xml: string }): Promise<TryFlag[]> {
  if (!stored) return [];

  const changed = stored.robot.modelHash !== (await sha256(model.xml));

  return [...(stored.flags ?? []), ...(changed ? [{ kind: 'model' as const, at: 0 }] : [])];
}

export async function openLabels(record: TryRecord, recording: Recording, scene: SegmentingScene): Promise<OpenLabels> {
  const stored = await loadStoredTry(record.id).catch(() => null);
  const segments = stored?.labels?.segments ?? (await ruleSegments(record, recording, scene).catch(() => []));

  judgeOnOpen(stored, recording, scene).catch(() => {});

  return { segments, flags: await timelineFlags(stored, scene.model) };
}
