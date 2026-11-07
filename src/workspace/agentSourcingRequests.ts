import { registerSourced, sourcedKey, unreferencedReason, type SourcedItem } from '../data/sourcedItems';
import { findingSignature, readinessText } from '../readiness/readiness';
import { forgetComponentMesh } from '../three/componentMeshes';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import type { ReadinessHandle } from './useReadiness';

type Payload = Record<string, unknown>;

interface SourcingContext {
  parts: () => ScenePart[];
  project: () => ProjectSettings;
  setProjectNow: (next: ProjectSettings) => void;
  setAction: (action: string) => void;
  readiness: ReadinessHandle;
}

function remember(item: SourcedItem, ctx: SourcingContext) {
  const project = ctx.project();
  const others = (project.sourced ?? []).filter((x) => x.id !== item.id);

  registerSourced([item]);
  ctx.setProjectNow({ ...project, sourced: [...others, item] });
}

function addQuantity(item: SourcedItem, qty: number, ctx: SourcingContext) {
  if (Number.isNaN(qty) || qty <= 0) return;

  const project = ctx.project();
  const key = sourcedKey(item);
  const rest = (project.extras ?? []).filter((x) => x.key !== key);

  ctx.setProjectNow({ ...project, extras: [...rest, { key, qty }] });
}

const statusText = (item: SourcedItem) => {
  const reason = unreferencedReason(item);

  return reason ? `Not referenceable yet: ${reason}.` : 'Referenceable.';
};

export async function addSourced(payload: Payload, ctx: SourcingContext) {
  ctx.setAction(`Sourcing ${String(payload.name ?? 'a part')}`);

  const item = await platformBridge.saveSourced(payload);

  remember(item, ctx);
  addQuantity(item, Number(payload.qty ?? 0), ctx);

  return {
    text: `Saved ${sourcedKey(item)} (${item.kind}, "Added by Agent"). Link ${item.link.status}${item.link.note ? `: ${item.link.note}` : ''}. ${statusText(item)}`,
  };
}

export async function importCad(payload: Payload, ctx: SourcingContext) {
  ctx.setAction(`Converting the CAD for ${String(payload.id)}`);

  const { item, members, mismatch } = await platformBridge.importMakerCad(payload);

  remember(item, ctx);
  forgetComponentMesh(item.id);

  const mesh = item.mesh!;
  const holes = mesh.ports.map((p) => `${p.name} ${p.thread ?? ''} Ø${p.diameterMm} at [${p.position.join(', ')}]`);

  return {
    text: [
      `Imported component:${item.id}: ${mesh.size.join(' × ')} mm, ${mesh.triangles} triangles, ${mesh.source} geometry, license ${mesh.license}.`,
      members.length > 1 ? `The archive had ${members.join(', ')}; used the largest. Pass member to pick another.` : '',
      mismatch
        ? `SIZE MISMATCH: ${mismatch}. Check the file and rotation before using it.`
        : 'Size matches the datasheet.',
      holes.length ? `Mounting holes (use these with fasten):\n${holes.join('\n')}` : 'No through-holes found.',
      'Place it with add_parts as this catalog key and look at it; if it faces the wrong way, run this again with rotate.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export async function readinessRequest(ctx: SourcingContext) {
  ctx.setAction('Checking if it can be built');

  const result = await ctx.readiness.checkNow();

  return { text: result ? readinessText(result) : 'The viewport is not ready.' };
}

export function disputeFinding(payload: Payload, ctx: SourcingContext) {
  const key = String(payload.key);
  const reason = String(payload.reason ?? '').slice(0, 400);
  const finding = ctx.readiness.latest()?.blockers.find((f) => f.key === key);

  if (!finding) return { text: `No open blocker "${key}". get_readiness lists them.` };

  const project = ctx.project();
  const decisions = project.readiness ?? {};

  ctx.setProjectNow({
    ...project,
    readiness: {
      ...decisions,
      disputes: {
        ...decisions.disputes,
        [key]: { reason, signature: findingSignature(finding, ctx.parts()), at: new Date().toISOString() },
      },
    },
  });

  return { text: 'Recorded. It stays a blocker until the user accepts it in the Build tab; say so in your reply.' };
}
