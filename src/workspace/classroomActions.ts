import { classroomDesign } from '../classroom/designSettings';
import { worldAssetJson, sceneWorldAssets } from '../cases/worldAssets';
import { classroomFileClient } from '../classroom/fileClient';
import type { ClassroomSource } from '../classroom/source';
import { downloadBytes } from '../utils/downloadBytes';
import { errorMessage } from '../utils/errorMessage';
import type { WorkspaceCore } from './useWorkspaceCore';

function sourceOf(core: WorkspaceCore): ClassroomSource {
  const { parts, project, scene, simTraining, viewportRef } = core;
  const assignment = project.assignment?.assignment;
  const kase = assignment?.bundle.case ?? simTraining.cases.active;
  const worldAssets = assignment ? {} : sceneWorldAssets({ cases: kase ? [kase] : [] });
  const json = Object.entries(worldAssets)
    .map(([hash, asset]) => `${JSON.stringify(hash)}:${worldAssetJson(asset)}`)
    .join(',');

  return {
    design: classroomDesign(project),
    source: {
      slug: 'classroom',
      title: scene.sceneName,
      robotName: scene.sceneName,
      parts,
      joints: project.joints ?? [],
      kase,
    },
    triangles: Object.fromEntries(
      parts.flatMap((part) => {
        const triangles = viewportRef.current?.partTriangles(part.id);

        return triangles ? [[part.id, triangles]] : [];
      }),
    ),
    worldAssets: assignment?.bundle.worldAssets ?? `{${json}}`,
  };
}

async function resolvedSource(core: WorkspaceCore): Promise<ClassroomSource> {
  const parts = core.parts;
  const project = core.project;
  const missing = await core.viewportRef.current?.meshesReady();

  if (!missing || missing.length) throw new Error('Load the robot’s meshes before exporting.');

  if (core.docs.partsRef.current !== parts || core.docs.projectRef.current !== project)
    throw new Error('The scene changed. Export again.');

  return sourceOf(core);
}

export async function exportClassroom(core: WorkspaceCore, submit = false) {
  const client = classroomFileClient();

  try {
    const input = await resolvedSource(core);
    const context = core.project.assignment;

    if (submit && !context) throw new Error('Import an assignment first.');

    if (!submit && core.project.budgetUsd === undefined) throw new Error('Set a budget in Build first.');

    const bytes =
      submit && context
        ? await client.call('submit', { input, ...context })
        : await client.call('exportAssignment', { input, budgetUsd: core.project.budgetUsd! });

    if (submit) await core.studio.handleOf(core.workspaceId)?.flush();

    downloadBytes(bytes, submit ? 'robot.casesubmit' : 'assignment.caseclass', 'application/json');
  } catch (error) {
    core.showToast(errorMessage(error), { tone: 'error' });
  } finally {
    client.dispose();
  }
}

export const openClassroom = () => window.open('/classroom', '_blank', 'noopener');
