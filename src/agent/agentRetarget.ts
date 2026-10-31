import { autoMapBones, KEYPOINT_LABELS, parseBvh, retarget, type Keypoint } from '../utils/mocap';
import {
  notesText,
  pointOfFor,
  previewStates,
  render,
  restore,
  scopeOf,
  type PoseContext,
  type PoseReply,
} from './agentPoseShared';

export interface RetargetPayload {
  robot?: string;
  text?: string;
  url?: string;
  file?: string;
  name?: string;
  start?: number;
  end?: number;
  fps?: number;
  in_place?: boolean;
  loop?: boolean;
  bones?: Partial<Record<Keypoint, string>>;
  joints?: Partial<Record<Keypoint, string>>;
  play?: boolean;
  preview?: { frames?: number; view?: string };
}

type Mocap = ReturnType<typeof parseBvh>;

type Retargeted = Exclude<ReturnType<typeof retarget>, string>;

async function bvhText(p: RetargetPayload): Promise<{ text: string } | { error: string }> {
  if (p.text) return { text: p.text };

  if (!p.url) return { error: 'Give the BVH as an evidence path or a URL.' };

  if (!URL.canParse(p.url) || new URL(p.url).protocol !== 'https:') return { error: 'Give the BVH as an https URL.' };

  const res = await fetch(p.url);

  if (!res.ok) return { error: `Couldn’t download the BVH (${res.status}).` };

  const text = await res.text();

  return text ? { text } : { error: 'Give the BVH as an evidence path or a URL.' };
}

function motionName(p: RetargetPayload): string {
  return (
    p.name ??
    (p.file ?? p.url ?? 'Motion')
      .split('/')
      .pop()!
      .replace(/\.bvh$/i, '')
  );
}

function unmatchedText(res: string, mocap: Mocap): string {
  const bones = autoMapBones(mocap);

  return `${res}\nBVH bones: ${mocap.bones.join(', ')}\nAuto-matched: ${Object.entries(bones)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')}`;
}

function retargetText(made: { name: string; duration: number; keyframes: unknown[] }, mocap: Mocap, res: Retargeted) {
  return (
    `${made.name}: ${made.duration} s from ${mocap.duration.toFixed(1)} s of motion (${mocap.bones.length} bones), ${made.keyframes.length} keyframes.` +
    `\nMatched: ${res.mapped.map((m) => `${KEYPOINT_LABELS[m.keypoint].toLowerCase()} ${m.bone} → ${m.joint}`).join('; ')}` +
    `\nMean miss per landmark: ${Object.entries(res.error)
      .map(([k, v]) => `${KEYPOINT_LABELS[k as Keypoint].toLowerCase()} ${v} mm`)
      .join(', ')}` +
    notesText(res.notes)
  );
}

export async function retargetRequest(ctx: PoseContext, p: RetargetPayload): Promise<PoseReply> {
  const scope = scopeOf(ctx, p.robot);

  if (typeof scope === 'string') return { text: scope };

  const source = await bvhText(p);

  if ('error' in source) return { text: source.error };

  const name = motionName(p);
  let mocap: Mocap;

  try {
    mocap = parseBvh(source.text, name);
  } catch (err) {
    return { text: `Couldn’t read the BVH: ${err instanceof Error ? err.message : String(err)}` };
  }

  const res = retarget(mocap, scope.rig, pointOfFor(scope.rig, ctx.viewport), {
    bones: p.bones,
    joints: p.joints,
    fps: p.fps,
    start: p.start,
    end: p.end,
    inPlace: p.in_place,
    loop: p.loop,
    name,
  });

  if (typeof res === 'string') return { text: unmatchedText(res, mocap) };

  let images: Promise<NonNullable<PoseReply['images']>> | undefined;

  if (p.preview) {
    images = render(ctx, scope, previewStates(res.animation, p.preview.frames, false), [p.preview.view ?? 'iso']);
    restore(ctx, scope);
  }

  const made = ctx.addAnimation({ ...res.animation, robot: scope.key });

  if (p.play !== false) ctx.play(made.id);

  return { text: retargetText(made, mocap, res), images: await images };
}
