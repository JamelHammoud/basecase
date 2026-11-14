import { stageCase } from '../cases/caseCast';
import { filmImage } from '../cases/filmImage';
import { filmBoxes } from '../cases/filmstrip';
import { worldItem } from '../cases/schema';
import { tryRecordOf, type StoredTry } from '../cases/tryFile';
import type { TrySegment } from '../cases/tryLabels';
import { loadRecording, loadStrip } from '../cases/tryStore';
import type { Recording } from '../sim/recorder';
import { encodeBitmap } from '../utils/imageEncode';
import { ruleSegments, type SegmentingScene } from './trySegmenting';

export interface TryRequestContext {
  cases: { sceneId: string };
  segmentingScene: () => Promise<SegmentingScene | null>;
}

interface Fitted {
  scene: SegmentingScene;
  recording: Recording;
}

const STRIP_SIDE = 1200;

async function stripPng(id: string): Promise<string | null> {
  const strip = await loadStrip(id).catch(() => null);

  if (!strip) return null;

  return encodeBitmap({ bitmap: await createImageBitmap(strip), maxSide: STRIP_SIDE, type: 'image/png' });
}

async function drawnFilm(stored: StoredTry, { scene, recording }: Fitted) {
  const kase = scene.cases.find((c) => c.id === stored.case?.id);
  const world = kase ? stageCase(kase, { rig: scene.rig, parts: scene.parts }, scene.partners).kase.world.objects : [];

  return filmImage({ model: scene.model, recording, boxes: filmBoxes(scene.parts, world.map(worldItem)) });
}

export function tryLooker(ctx: TryRequestContext) {
  let scene: Promise<SegmentingScene | null> | null = null;
  const recordings = new Map<string, Promise<Recording | null>>();

  const sceneNow = () => (scene ??= ctx.segmentingScene().catch(() => null));

  const recordingOf = (id: string) => {
    if (!recordings.has(id))
      recordings.set(
        id,
        loadRecording(id).catch(() => null),
      );

    return recordings.get(id)!;
  };

  const fitted = async (stored: StoredTry): Promise<Fitted | null> => {
    if (stored.sceneId !== ctx.cases.sceneId) return null;

    const current = await sceneNow();
    const recording = current && (await recordingOf(stored.id));

    return current && recording && recording.nbody === current.model.bodies.length
      ? { scene: current, recording }
      : null;
  };

  const ruleSegmentsOf = async (stored: StoredTry): Promise<TrySegment[] | null> => {
    const fit = await fitted(stored);

    return fit ? ruleSegments(tryRecordOf(stored), fit.recording, fit.scene).catch(() => null) : null;
  };

  const film = async (stored: StoredTry): Promise<string | null> => {
    const kept = await stripPng(stored.id).catch(() => null);

    if (kept) return kept;

    const fit = await fitted(stored);

    return fit ? drawnFilm(stored, fit).catch(() => null) : null;
  };

  return { ruleSegments: ruleSegmentsOf, film };
}

export type TryLooker = ReturnType<typeof tryLooker>;
