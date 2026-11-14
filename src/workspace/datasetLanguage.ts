import type { TryRecord } from '../cases/tries';
import { loadStoredTry } from '../cases/tryStore';
import { episodeText, type EpisodeText } from '../datasets/language';
import type { Recording } from '../sim/recorder';
import { ruleSegments, type SegmentingScene } from './trySegmenting';

export async function tryText(
  brief: string,
  { record, recording }: { record: TryRecord; recording: Recording },
  scene: SegmentingScene,
): Promise<EpisodeText> {
  const labels = (await loadStoredTry(record.id).catch(() => null))?.labels;
  const ruled = labels?.segments ? [] : await ruleSegments(record, recording, scene).catch(() => []);

  return episodeText(brief, labels, ruled);
}
