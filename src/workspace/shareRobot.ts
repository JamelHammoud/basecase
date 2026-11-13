import type { Case } from '../cases/schema';
import { sha256 } from '../cases/tries';
import { galleryBundleOf, requireCase } from '../gallery/buildBundle';
import { galleryBundleBytes, parseGalleryBundle, type GalleryBundle } from '../gallery/galleryBundle';
import { SHARED_ROBOT_FILE, sharedRobotLink } from '../gallery/galleryLinks';
import type { GalleryTrained } from '../gallery/galleryTrained';
import { hubBridge } from '../hub/hubBridge';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import { robotPartIds } from '../sim/robotPackage/buildRobotPackage';
import type { Skill } from '../skills/artifacts';
import { isSkill } from '../skills/bundle';
import type { SkillRecord } from '../skills/skillRecords';
import type { SkillRow } from '../skills/skillRows';
import type { PolicyRecord, ProjectSettings, ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { fileSafe } from './helpers';

export interface ShareSource {
  sceneId: string;
  sceneName: string;
  parts: ScenePart[];
  project: ProjectSettings;
  kase: Case | null;
  model: () => Promise<SimModel>;
  triangles: (id: string) => Float32Array | null;
  meshesReady: () => Promise<unknown>;
  policies: { load: (id: string) => Promise<PolicySpec | null>; isStale: (record: PolicyRecord) => boolean };
  skillRows: SkillRow[];
  loadSkill: (hash: string) => Promise<Skill | null>;
}

const REPO_STEM_MAX = 72;

interface Candidate {
  at: string;
  load: () => Promise<GalleryTrained | null>;
}

const passedPolicy = (record: PolicyRecord, source: ShareSource) =>
  !!record.eval && record.eval.fellAt === null && !source.policies.isStale(record);

export const storedSkill = async (hash: string) => {
  const found = await platformBridge.getSkill(hash).catch(() => null);

  return isSkill(found) ? found : null;
};

function policyCandidates(source: ShareSource): Candidate[] {
  return (source.project.policies ?? [])
    .filter((record) => passedPolicy(record, source))
    .map((record) => ({
      at: record.createdAt,
      load: async () => {
        const spec = await source.policies.load(record.id);

        return spec && { kind: 'policy', record, spec };
      },
    }));
}

function skillCandidates(source: ShareSource): Candidate[] {
  return source.skillRows
    .flatMap((row): SkillRecord[] => (row.state.kind === 'ready' && row.record ? [row.record] : []))
    .map((record) => ({
      at: record.createdAt,
      load: async () => {
        const skill = await source.loadSkill(record.hash);

        return skill && { kind: 'skill', record, skill };
      },
    }));
}

export function latestTrained(source: ShareSource): Promise<GalleryTrained | null> {
  const newest = [...policyCandidates(source), ...skillCandidates(source)].sort((a, b) => b.at.localeCompare(a.at))[0];

  return newest ? newest.load() : Promise.resolve(null);
}

export async function shareRepoName(sceneId: string, sceneName: string, kase: Case): Promise<string> {
  const stem = fileSafe(sceneName).slice(0, REPO_STEM_MAX).replace(/-$/, '');

  return `${stem}-${(await sha256(`${sceneId}/${kase.id}/robot`)).slice(0, 6)}`;
}

export async function sharedRobotBundle(source: ShareSource): Promise<GalleryBundle> {
  const { sceneName } = source;
  const kase = requireCase(source.kase);
  const model = await source.model();
  const ids = new Set(robotPartIds(model));
  const robotName = model.robots.length === 1 ? model.robots[0].name : sceneName;

  await source.meshesReady();

  return galleryBundleOf({
    slug: await shareRepoName(source.sceneId, sceneName, kase),
    title: `${kase.name}: ${robotName}`,
    robotName,
    parts: source.parts.filter((p) => ids.has(p.id)),
    joints: source.project.joints ?? [],
    kase,
    triangles: source.triangles,
    trained: await latestTrained(source),
  });
}

export async function publishSharedRobot(bundle: GalleryBundle): Promise<string> {
  const bytes = galleryBundleBytes(bundle);

  parseGalleryBundle(JSON.parse(new TextDecoder().decode(bytes)));

  const published = await hubBridge.publish({ name: bundle.slug, files: { [SHARED_ROBOT_FILE]: bytes } });

  return sharedRobotLink(published.repo);
}
