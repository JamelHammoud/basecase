import { packParts } from '../three/packedMesh';
import type { BuildGuideRecord, ProjectSettings, ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { workerClient, type Reply } from '../utils/workerRpc';
import { guideFingerprint } from './guideFingerprint';
import { isBuilt } from './guidePlan';
import type { GuidePortMessage } from './guidePort';
import type { GuidePlan } from './guideTypes';
import type { GuideJob, GuideProgress, RenderedGuide } from './renderGuide';

export type { GuideProgress } from './renderGuide';

export interface GenerateGuideInput {
  title: string;
  parts: ScenePart[];
  project: ProjectSettings;
  onProgress?: (p: GuideProgress) => void;
  onCover?: (dataUrl: string) => void;
  signal?: AbortSignal;
  order?: () => Promise<GuideJob['order'] | null>;
}

export interface GeneratedGuide {
  record: BuildGuideRecord;
  plan: GuidePlan;
  saved: boolean;
  html: string;
}

type RenderPayload = { job: GuideJob; port: MessagePort };

type GuideHandlers = { render: (payload: RenderPayload) => Promise<Reply<RenderedGuide | null>> };

const localHandlers = async (): Promise<GuideHandlers> => {
  const { renderGuideOnPort } = await import('./guidePort');

  return { render: async ({ job, port }) => ({ result: await renderGuideOnPort(job, port) }) };
};

const client = workerClient<GuideHandlers>(
  () => new Worker(new URL('./guide.worker.ts', import.meta.url), { type: 'module' }),
  localHandlers,
);

const identities = new WeakMap<ScenePart, string>();
let nextIdentity = 1;

function identityOf(part: ScenePart): string {
  const known = identities.get(part);

  if (known) return known;

  const made = `p${nextIdentity++}`;

  identities.set(part, made);

  return made;
}

async function brandMark(): Promise<string> {
  try {
    const text = await (await fetch('/favicon.svg')).text();

    return text.replace(/<style>[\s\S]*?<\/style>/, '').replace('<path ', '<path fill="#111" ');
  } catch {
    return '';
  }
}

const newId = () => `guide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

function render(job: GuideJob, input: GenerateGuideInput): Promise<RenderedGuide | null> {
  const { port1, port2 } = new MessageChannel();
  const cancel = () => port1.postMessage({ type: 'cancel' } satisfies GuidePortMessage);

  port1.onmessage = ({ data }: MessageEvent<GuidePortMessage>) => {
    if (data.type === 'progress') input.onProgress?.(data.progress);

    if (data.type === 'cover') input.onCover?.(data.dataUrl);
  };
  input.signal?.addEventListener('abort', cancel, { once: true });

  return client.call('render', { job, port: port2 }, [port2]).finally(() => {
    input.signal?.removeEventListener('abort', cancel);
    port1.close();
  });
}

export async function generateGuide(input: GenerateGuideInput): Promise<GeneratedGuide | null> {
  const { title, project } = input;
  const parts = input.parts.filter(isBuilt);

  if (!parts.length) return null;

  input.onProgress?.({ share: 0, label: 'Measuring parts' });

  if (input.order) input.onProgress?.({ share: 0, label: 'Checking the build order' });

  const order = (await input.order?.().catch(() => null)) ?? undefined;
  const id = project.buildGuide?.id ?? newId();
  const job: GuideJob = {
    guideId: id,
    title,
    parts: packParts(parts),
    partKeys: Object.fromEntries(parts.map((p) => [p.id, identityOf(p)])),
    project,
    date: today(),
    mark: await brandMark(),
    order,
  };
  const rendered = await render(job, input);

  if (!rendered || input.signal?.aborted) return null;

  input.onProgress?.({ share: 0.97, label: 'Saving PDF' });

  const saved = await platformBridge.saveGuide({ id, html: rendered.html });
  const record: BuildGuideRecord = {
    id,
    pages: rendered.pages,
    steps: rendered.plan.steps.length,
    generatedAt: new Date().toISOString(),
    fingerprint: guideFingerprint(title, input.parts, project),
    coverDataUrl: rendered.coverDataUrl,
  };

  return { record, plan: rendered.plan, saved: saved.ok, html: rendered.html };
}
