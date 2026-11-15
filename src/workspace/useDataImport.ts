import { useEffect, useRef, useState } from 'react';
import { plural } from '../../electron/plural.mjs';
import { sha256 } from '../cases/tries';
import { keepTries, loadTries } from '../cases/tryStore';
import { TRIES_LABEL } from '../cases/tryStore/types';
import type { TryOrigin } from '../cases/tryFile';
import { openDataImport, type DataImportRun } from '../datasets/import/dataImportClient';
import type { SourceSummary } from '../datasets/import/dataImportJobs';
import type { BuiltTries } from '../datasets/import/importedTries';
import { importStep, matchInput, robotTypePreset } from '../datasets/import/importPlan';
import { matchKey, type JointPairs, type TargetJoint } from '../datasets/import/jointMatch';
import type { ImportSource } from '../datasets/import/readSource';
import { hubBridge } from '../hub/hubBridge';
import { hubDatasetRef, hubImportSource } from '../datasets/import/hubSource';
import { keepImportedImages } from '../datasets/import/keepImportedImages';
import { addMembers, type Dataset } from '../datasets/datasetFile';
import { saveDataset } from '../datasets/datasetStore';
import { isRoboflowLink } from '../roboflow/roboflowLink';
import { roboflowImportSource } from '../roboflow/roboflowBridge';
import type { SimModel } from '../sim/mjcfTypes';
import { errorMessage } from '../utils/errorMessage';
import { indexedDbStore } from '../utils/keyValueStore';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { RobotPreset } from '../utils/robotImport/presets';
import { dataSourceOf } from './dataImportSource';
import type { RobotInsert, RobotSource } from './useRobotInsert';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { Vec3 } from './types';

const matches = indexedDbStore<JointPairs>({
  database: 'basecase-joint-matches',
  store: 'matches',
  label: TRIES_LABEL,
});

const SAFE_ID = /^[\w-]{1,128}$/;
const ORIGIN_NAME_CHARS = 256;

const importing = (name: string) => `Importing ${name}…`;

export interface MatchSheet {
  source: string;
  names: string[];
  targets: Array<TargetJoint & { label: string }>;
  joints: JointPairs;
}

interface Loaded {
  source: ImportSource;
  origin?: TryOrigin;
}

const originName = (name: string) =>
  name.length > ORIGIN_NAME_CHARS ? `${name.slice(0, ORIGIN_NAME_CHARS - 1)}…` : name;

const importedMessage = (built: BuiltTries, added: number) =>
  built.refused
    ? `Imported ${plural(added, 'try', 'tries')}. Skipped ${plural(built.refused, 'episode')} out of range.`
    : `Imported ${plural(added, 'try', 'tries')}`;

async function importImages(core: WorkspaceCore, run: DataImportRun) {
  const active = core.simTraining.cases.active;
  const result = await keepImportedImages(run, {
    caseId: active?.id ?? null,
    sceneId: SAFE_ID.test(core.scene.sceneId) ? core.scene.sceneId : null,
    objects: active?.world.objects.map(({ id, name }) => ({ id, name })) ?? [],
  });

  core.toasts.dismissToast();
  core.triesView.openDataset(result.dataset.id);

  return result.dataset;
}

async function loadRoboflow(core: WorkspaceCore, url: string): Promise<Loaded | null> {
  const source = await roboflowImportSource(url, () => core.studio.openSettings('accounts', 'roboflow'));

  return source && { source };
}

type ImportLoaded = (name: string, load: () => Promise<Loaded | null>) => Promise<boolean>;

interface ImportWork {
  core: WorkspaceCore;
  run: DataImportRun;
  loaded: Loaded;
  summary: SourceSummary;
  build: (model: SimModel) => Promise<string[] | undefined>;
  offerRobot: (name: string, preset: RobotPreset | null) => void;
}

async function finishImport({ core, run, loaded, summary, build, offerRobot }: ImportWork) {
  const images: Dataset | null = summary.images ? await importImages(core, run) : null;

  if (images && summary.episodes === 0) return;

  const sim = core.simTraining.sim;
  const model = sim.modelNow() ?? (await sim.buildModel().catch(() => null));

  if (!model) return offerRobot(loaded.source.name, robotTypePreset(summary.robotType));

  const ids = await build(model);

  if (images && ids) await saveDataset(addMembers(images, ids));
}

function importPickedFiles(importLoaded: ImportLoaded, files: File[]) {
  const name = files.map((f) => f.name).join(', ');

  void importLoaded(name, async () => ({
    source: { kind: 'files', name, files: files.map((blob) => ({ path: blob.name, blob })) },
  }));
}

export function useDataImport(core: WorkspaceCore, robots: RobotInsert) {
  const { showToast, toasts, docs } = core;
  const [sheet, setSheet] = useState<MatchSheet | null>(null);
  const answer = useRef<((pairs: JointPairs | null) => void) | null>(null);

  useEffect(() => {
    const pending = answer;

    return () => {
      pending.current?.(null);
      pending.current = null;
    };
  }, []);

  const jointNames = () => Object.fromEntries((docs.projectRef.current.joints ?? []).map((j) => [j.id, j.name]));

  const offerRobot = (name: string, preset: RobotPreset | null) => {
    if (!preset) return showToast(`None of ${name}’s joints are in this scene`, { tone: 'error' });

    showToast(`${name} was recorded on ${preset.title}`, {
      action: {
        label: 'Import Robot',
        onClick: () => void robots.importRobotFrom({ kind: 'url', url: preset.url, name: preset.title }),
      },
    });
  };

  const askMatch = (ask: Omit<MatchSheet, 'targets'> & { targets: TargetJoint[] }) => {
    const labels = jointNames();

    answer.current?.(null);
    toasts.dismissToast();
    setSheet({ ...ask, targets: ask.targets.map((t) => ({ ...t, label: labels[t.id] ?? t.id })) });

    return new Promise<JointPairs | null>((resolve) => {
      answer.current = resolve;
    });
  };

  const settle = (pairs: JointPairs | null) => {
    setSheet(null);
    answer.current?.(pairs);
    answer.current = null;
  };

  const planFor = async (name: string, summary: SourceSummary, model: SimModel) => {
    const input = matchInput(summary, model, jointNames());
    const key = await sha256(matchKey(name, summary.names, input.targets));
    const remembered = (await matches.get(key).catch(() => null)) ?? null;
    const step = importStep({ input, model, robotType: summary.robotType, remembered });

    if (step.kind === 'ready') return step.plan;

    if (step.kind === 'no-robot') return offerRobot(name, step.preset);

    const pairs = await askMatch({ source: name, names: input.names, targets: input.targets, joints: step.joints });

    if (!pairs) return;

    await matches.put(key, pairs).catch(() => {});

    return { joints: pairs, unit: input.unit, spans: input.spans };
  };

  const keep = async (built: BuiltTries) => {
    const have = new Set((await loadTries()).map((t) => t.id));
    const fresh = built.kept.filter((k) => !have.has(k.stored.id));

    await keepTries(fresh);
    showToast(importedMessage(built, fresh.length));

    return built.kept.map((item) => item.stored.id);
  };

  const build = async (run: DataImportRun, loaded: Loaded, summary: SourceSummary, model: SimModel) => {
    const plan = await planFor(loaded.source.name, summary, model);

    if (!plan) return;

    showToast(importing(loaded.source.name), { tone: 'progress' });

    const built = await run.build({
      model,
      plan,
      target: {
        sceneId: SAFE_ID.test(core.scene.sceneId) ? core.scene.sceneId : 'scene',
        modelHash: await sha256(model.xml),
        origin: loaded.origin ?? { kind: 'file', name: originName(loaded.source.name), hash: summary.hash },
        startedAt: new Date().toISOString(),
      },
    });

    return keep(built);
  };

  const importLoaded = async (name: string, load: () => Promise<Loaded | null>): Promise<boolean> => {
    const run = openDataImport();

    showToast(importing(name), { tone: 'progress' });

    try {
      const loaded = await load();
      const summary = loaded && (await run.read(loaded.source));

      if (!loaded || !summary) {
        toasts.dismissToast();

        return false;
      }

      await finishImport({
        core,
        run,
        loaded,
        summary,
        build: (model) => build(run, loaded, summary, model),
        offerRobot,
      });
    } catch (e) {
      showToast(errorMessage(e), { tone: 'error' });
    } finally {
      run.close();
    }

    return true;
  };

  const importHubLink = (url: string) => {
    const ref = IS_WEB_DEMO ? null : hubDatasetRef(url);

    if (!ref) return Promise.resolve(false);

    return importLoaded(`${ref.owner}/${ref.repo}`, async () => {
      const reply = await hubBridge.datasetFiles(ref);
      const source = hubImportSource(reply);

      return source && { source, origin: { kind: 'hub', repo: reply.repo, revision: reply.revision } };
    });
  };

  const importOrRobot = async (source: RobotSource, at?: Vec3) => {
    if (source.kind === 'url' && !IS_WEB_DEMO && isRoboflowLink(source.url)) {
      await importLoaded(source.url, () => loadRoboflow(core, source.url));

      return;
    }

    const data = source.kind === 'url' ? null : await dataSourceOf(source);
    const done = data
      ? await importLoaded(data.name, async () => ({ source: data }))
      : source.kind === 'url' && (await importHubLink(source.url));

    if (!done) await robots.importRobotFrom(source, at);
  };

  return { sheet, settle, importOrRobot, importFiles: (files: File[]) => importPickedFiles(importLoaded, files) };
}

export type DataImport = ReturnType<typeof useDataImport>;
