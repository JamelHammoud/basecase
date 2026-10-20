import type { BuildGuideRecord, ProjectSettings, ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { solidSizeMm } from '../utils/sceneSize';
import { guideHtml } from './doc/guideDocument';
import { guideFingerprint } from './guideFingerprint';
import { buildGuidePlan, isBuilt } from './guidePlan';
import type { GuidePlan } from './guideTypes';
import { drawGuide } from './render/guideDrawings';
import { measureGuideScene } from './render/guideMeasure';
import { GuideRenderer } from './render/guideRenderer';

export interface GuideProgress {
  share: number;
  label: string;
}

export interface GenerateGuideInput {
  title: string;
  parts: ScenePart[];
  project: ProjectSettings;
  onProgress?: (p: GuideProgress) => void;
  isCancelled?: () => boolean;
}

export interface GeneratedGuide {
  record: BuildGuideRecord;
  plan: GuidePlan;
  saved: boolean;
  html: string;
}

const COVER_THUMB_PX = 360;
const MEASURE_SHARE = 0.15;
const DRAW_SHARE = 0.8;

async function brandMark(): Promise<string> {
  try {
    const text = await (await fetch('/favicon.svg')).text();

    return text.replace(/<style>[\s\S]*?<\/style>/, '').replace('<path ', '<path fill="#111" ');
  } catch {
    return '';
  }
}

async function thumbnail(dataUrl: string): Promise<string> {
  const img = new Image();

  img.src = dataUrl;
  await img.decode();

  const k = Math.min(1, COVER_THUMB_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');

  canvas.width = Math.round(img.naturalWidth * k);
  canvas.height = Math.round(img.naturalHeight * k);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/webp', 0.85);
}

const newId = () => `guide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export async function generateGuide(input: GenerateGuideInput): Promise<GeneratedGuide | null> {
  const { title, project } = input;
  const parts = input.parts.filter(isBuilt);
  const isCancelled = input.isCancelled ?? (() => false);
  const t0 = performance.now();
  const report = (share: number, label: string) => {
    console.error(`[guide] ${((performance.now() - t0) / 1000).toFixed(1)}s ${label}`);
    input.onProgress?.({ share, label });
  };

  if (!parts.length) return null;

  report(0.02, 'Measuring parts');

  const renderer = await GuideRenderer.create(parts);

  try {
    const geometry = await measureGuideScene(renderer, isCancelled);

    if (isCancelled()) return null;

    const plan = buildGuidePlan({ title, parts, joints: project.joints ?? [], ...geometry }, project.material);

    report(MEASURE_SHARE, 'Drawing steps');

    const drawings = await drawGuide(renderer, plan, geometry.boxes, {
      isCancelled,
      onProgress: ({ done, total }) =>
        report(
          MEASURE_SHARE + (DRAW_SHARE * done) / total,
          `Drawing step ${Math.max(1, done - 2)} of ${plan.steps.length}`,
        ),
    });

    if (!drawings) return null;

    const meta = {
      title,
      material: project.material,
      date: today(),
      sizeMm: solidSizeMm(parts) ?? undefined,
      mark: await brandMark(),
    };
    const { html, pages } = guideHtml({ plan, drawings, meta });
    const id = project.buildGuide?.id ?? newId();

    report(0.97, 'Saving PDF');

    const saved = await platformBridge.saveGuide({ id, html });
    const record: BuildGuideRecord = {
      id,
      pages,
      steps: plan.steps.length,
      generatedAt: new Date().toISOString(),
      fingerprint: guideFingerprint(title, input.parts, project),
      coverDataUrl: await thumbnail(drawings.cover.dataUrl),
    };

    return { record, plan, saved: saved.ok, html };
  } finally {
    renderer.dispose();
  }
}
