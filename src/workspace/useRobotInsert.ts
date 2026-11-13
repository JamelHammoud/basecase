import { useEffect, useRef, useState } from 'react';
import { ARTICULATED_PARTS } from '../data/articulatedParts';
import { loadOnshape } from '../onshape/loadOnshape';
import { isOnshapeLink } from '../onshape/onshapeLink';
import { loadSimReady, type SimReadyImport } from '../simready/loadAsset';
import { prepareParts } from '../three/partMesh/prepare';
import type { SimReadyAsset } from '../simready/search';
import type { CatalogItem, RobotJoint, ScenePart } from '../types/robotics';
import {
  importRobot,
  RobotChoiceError,
  type ImportedRobot,
  type LocalFile,
  type RobotPreset,
} from '../utils/robotImport';
import { rememberImportedRobot, robotPreviewImage } from '../utils/robotPreview';
import { useLatestRef } from '../utils/useLatestRef';
import { whenIdle } from '../utils/whenIdle';
import { attempt, plural } from './helpers';
import { articulatedShift, importOffset, palmOf, placeRobot } from './robotPlacement';
import type { Vec3 } from './types';
import type { WorkspaceCore } from './useWorkspaceCore';
import { useLeader } from './useLeader';
import { errorMessage } from '../utils/errorMessage';

export type RobotSource =
  | { kind: 'url'; url: string; name?: string; entry?: string }
  | { kind: 'files'; files: LocalFile[]; entry?: string }
  | { kind: 'simready'; asset: Pick<SimReadyAsset, 'url' | 'name' | 'maker' | 'license'> };

export type ImportRobotResult = ImportedRobot | string;

interface PlacedRig {
  parts: ScenePart[];
  joints: RobotJoint[];
}

export interface RobotFiles {
  name: string;
  files: LocalFile[];
  at?: Vec3;
}

export interface RobotChoice {
  source: Exclude<RobotSource, { kind: 'simready' }>;
  at?: Vec3;
  choices: string[];
}

function rememberPreview(robot: ImportedRobot, url: string) {
  whenIdle(() => void savePreview(robot, url));
}

function savePreview(robot: ImportedRobot, url: string) {
  return robotPreviewImage(robot.parts, 320)
    .then(
      (thumbnail) =>
        thumbnail &&
        rememberImportedRobot({
          url,
          name: robot.name,
          joints: robot.joints.length,
          thumbnail,
          importedAt: new Date().toISOString(),
        }),
    )
    .catch(() => {});
}

const sourceName = (source: RobotSource) => {
  if (source.kind === 'simready') return source.asset.name;

  return source.kind === 'url' && source.name ? source.name : 'robot';
};

async function loadRobot(source: RobotSource, say: (m: string) => void): Promise<SimReadyImport> {
  if (source.kind === 'simready') return loadSimReady(source.asset, say);

  if (source.kind === 'url' && isOnshapeLink(source.url))
    return { robot: await loadOnshape(source.url, say), isObject: false };

  const robot = await importRobot(source, { name: source.kind === 'url' ? source.name : undefined, onProgress: say });

  return { robot, isObject: false };
}

const insertedMessage = (robot: ImportedRobot, joints: RobotJoint[]) =>
  `Inserted ${robot.name} with ${plural(joints.length, 'joint', 'joints')}${robot.notes.length ? `. Missing ${plural(robot.notes.length, 'file', 'files')}` : ''}`;

async function downloadArticulated(item: CatalogItem) {
  const src = ARTICULATED_PARTS[item.componentId!];
  const outcome = await attempt(() =>
    importRobot({ kind: 'url', url: src.url }, { name: item.name, rotate: src.rotate, color: src.color }),
  );

  return outcome.ok ? outcome.value : null;
}

export function useRobotInsert(core: WorkspaceCore, openPose: () => void) {
  const { docs, viewportRef, setSelectedIds, showToast, toasts, parts } = core;
  const { partsRef, projectRef, commitParts, updateProjectNow } = docs;
  const openPoseRef = useLatestRef(openPose);
  const frameNextRef = useRef(false);
  const leader = useLeader(core);
  const [importRobotOpen, setImportRobotOpen] = useState(false);
  const [robotChoice, setRobotChoice] = useState<RobotChoice | null>(null);
  const [robotFiles, setRobotFiles] = useState<RobotFiles | null>(null);

  useEffect(() => {
    if (!frameNextRef.current) return;

    frameNextRef.current = false;
    viewportRef.current?.frameAll();
  }, [parts, viewportRef]);

  const poseAction = (joints: RobotJoint[]) =>
    joints.length ? { label: 'Pose', onClick: () => openPoseRef.current() } : undefined;

  const takenJointIds = () => (projectRef.current.joints ?? []).map((j) => j.id);

  const insertRig = (placed: PlacedRig, frame: boolean) => {
    commitParts((prev) => [...prev, ...placed.parts]);
    updateProjectNow((p) => ({ ...p, joints: [...(p.joints ?? []), ...placed.joints] }));
    setSelectedIds(placed.parts.map((p) => p.id));

    if (frame) frameNextRef.current = true;
  };

  const loadAndPlace = async (source: RobotSource, at?: Vec3): Promise<ImportedRobot> => {
    showToast(`Importing ${sourceName(source)}…`, { tone: 'progress' });

    const { robot, isObject } = await loadRobot(source, (m) => showToast(m, { tone: 'progress' }));

    const shift = importOffset(robot.parts, at, partsRef.current);
    const placed = placeRobot({ parts: robot.parts, joints: robot.joints, shift, takenJointIds: takenJointIds() });

    await prepareParts(placed.parts);
    insertRig(placed, !at);

    if (source.kind === 'url') rememberPreview(robot, robot.parts[0]?.robotLink?.url ?? source.url);

    showToast(isObject ? `Inserted ${robot.name}` : insertedMessage(robot, placed.joints), {
      action: poseAction(placed.joints),
    });

    return { ...robot, ...placed };
  };

  const askWhichRobot = (choice: RobotChoice, ask: boolean) => {
    toasts.dismissToast();

    if (!ask) return;

    setRobotFiles(null);
    setRobotChoice(choice);
    setImportRobotOpen(true);
  };

  const importRobotFrom = async (source: RobotSource, at?: Vec3, { ask = true } = {}): Promise<ImportRobotResult> => {
    const outcome = await attempt(() => loadAndPlace(source, at));

    if (outcome.ok) return outcome.value;

    const { error } = outcome;

    if (error instanceof RobotChoiceError && source.kind !== 'simready') {
      askWhichRobot({ source, at, choices: error.choices }, ask);

      return `Several robots here. Pass one as entry: ${error.choices.join(', ')}`;
    }

    const message = errorMessage(error);

    showToast(message, { tone: 'error' });

    return message;
  };

  const addArticulated = async (item: CatalogItem, at: Vec3 | undefined, addFixed: () => void) => {
    showToast(`Adding ${item.name}…`, { tone: 'progress' });

    const robot = await downloadArticulated(item);

    if (!robot) {
      addFixed();
      showToast(`Added ${item.name} without its joints. Its model couldn’t be downloaded.`);

      return;
    }

    const palm = palmOf(robot.parts, robot.joints);
    const placed = placeRobot({
      parts: robot.parts,
      joints: robot.joints,
      shift: articulatedShift(robot.parts, at, partsRef.current),
      takenJointIds: takenJointIds(),
      decorate: (p) => (p.id === palm.id ? { ...p, componentId: item.componentId } : p),
    });

    await prepareParts(placed.parts);
    insertRig(placed, true);
    showToast(`Added ${item.name} with ${plural(placed.joints.length, 'joint', 'joints')}`, {
      action: poseAction(placed.joints),
    });
  };

  const pickRobot = (preset: RobotPreset | null) =>
    preset ? importRobotFrom({ kind: 'url', url: preset.url, name: preset.title }) : setImportRobotOpen(true);

  return {
    ...leader,
    importRobotFrom,
    addArticulated,
    pickRobot,
    importRobotOpen,
    robotChoice,
    robotFiles,
    openImportRobot: () => setImportRobotOpen(true),
    openRobotFiles: (loaded: RobotFiles) => {
      setRobotChoice(null);
      setRobotFiles(loaded);
      setImportRobotOpen(true);
    },
    closeImportRobot: () => {
      setImportRobotOpen(false);
      setRobotChoice(null);
      setRobotFiles(null);
    },
  };
}

export type RobotInsert = ReturnType<typeof useRobotInsert>;
