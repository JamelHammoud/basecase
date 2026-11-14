import type { Case } from '../cases/schema';
import { errorMessage } from '../utils/errorMessage';
import { caseNamed } from './agentCaseRun';
import { trainingImageInput, type TrainingImageInput } from './trainingImageInput';

interface ImageResult {
  frameSet: { id: string };
  dataset: { id: string };
  classCounts: Record<string, number>;
}

interface ImageContext {
  cases: {
    cases: Case[];
    active: Case | null;
    images: { make: (input: TrainingImageInput, kase: Case) => Promise<ImageResult> };
  };
  setAction: (action: string) => void;
}

async function makeImages(payload: Record<string, unknown>, ctx: ImageContext) {
  try {
    const input = trainingImageInput(payload);
    const wanted = payload.case;

    if (wanted !== undefined && (typeof wanted !== 'string' || !wanted.trim() || wanted.length > 120))
      throw new Error('Choose a Case by name or id.');

    const kase = typeof wanted === 'string' ? caseNamed(ctx.cases.cases, wanted) : ctx.cases.active;

    if (!kase) throw new Error('Open a Case or choose one by name.');

    ctx.setAction('Making training images');

    const result = await ctx.cases.images.make(input, kase);

    return { ok: true, frame_set: result.frameSet.id, dataset: result.dataset.id, class_counts: result.classCounts };
  } catch (error) {
    return { ok: false, problem: errorMessage(error) };
  }
}

export const IMAGE_HANDLERS = { make_images: makeImages };
