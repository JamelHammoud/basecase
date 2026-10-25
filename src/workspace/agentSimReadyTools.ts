import { isRobotUrl, knownAsset, searchSimReady, type SimReadyAsset } from '../simready/search';
import type { ImportRobotResult, RobotSource } from './useRobotInsert';
import type { Vec3 } from './types';

type Payload = Record<string, unknown>;

export interface SimReadyToolContext {
  setAction: (action: string) => void;
  importRobot: (source: RobotSource, at?: Vec3) => Promise<ImportRobotResult>;
}

const MAX_RESULTS = 20;

function assetLine(a: SimReadyAsset, i: number): string {
  const size = a.sizeMm ? `W ${a.sizeMm[0]} × D ${a.sizeMm[2]} × H ${a.sizeMm[1]} mm` : 'size unknown';
  const mass = a.massKg ? ` · ${Math.round(a.massKg * 1000) / 1000} kg` : '';
  const caption = a.caption ? `\n   ${a.caption}` : '';

  return `${i + 1}. ${a.name} — ${a.maker || 'unknown maker'} · ${size}${mass} · ${a.license || 'license not stated'}${caption}\n   url: ${a.url}`;
}

export async function findObjects(ctx: SimReadyToolContext, payload: Payload) {
  const query = String(payload.query ?? '').trim();
  const shelf = payload.kind === 'robot' ? 'robots' : 'objects';
  const limit = Math.min(MAX_RESULTS, Math.max(1, Number(payload.limit) || 8));

  ctx.setAction(`Searching SimReady for ${query || shelf}`);

  const found = await searchSimReady({ query, shelf, limit }).catch(() => null);

  if (!found) return { text: 'Couldn’t reach SimReady Central. Try again later.' };

  if (!found.length) return { text: `No SimReady ${shelf} match "${query}".` };

  return { text: `${found.map(assetLine).join('\n')}\n\nInsert one with insert_object(url).` };
}

function agentPoint(v: unknown): Vec3 | undefined {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => Number.isFinite(n))) return undefined;

  const [x, y, z] = v as number[];

  return [x, z, -y];
}

export async function insertObject(ctx: SimReadyToolContext, payload: Payload) {
  const url = String(payload.url ?? '');

  if (!/^https:\/\/huggingface\.co\/datasets\//.test(url)) return { text: 'Give the url from find_objects.' };

  const asset = knownAsset(url);

  ctx.setAction(`Inserting ${asset.name}`);

  const got = await ctx.importRobot({ kind: 'simready', asset }, agentPoint(payload.position));

  if (typeof got === 'string') return { text: got };

  const kg = got.parts.reduce((s, p) => s + (p.massG ?? 0), 0) / 1000;
  const ids = got.parts.map((p) => p.id).join(', ');
  const kind =
    isRobotUrl(url) || got.joints.length ? `${got.joints.length} joints (call get_rig)` : 'moves freely in simulate';

  return {
    text: `Inserted ${got.name}: ${got.parts.length} parts (group "${got.name}"), ${Math.round(kg * 1000) / 1000} kg, ${kind}.\nPart ids: ${ids}`,
  };
}
