import type { ProjectSettings, SceneAnnotation, ScenePart } from '../../../types/robotics';
import { lastDownload } from '../../../utils/downloadBytes';
import { base64ToBytes, bytesToBase64 } from '../../../utils/base64';
import { pickNextFiles } from '../../../utils/pickFiles';
import { newSceneId } from '../../../utils/sceneIds';
import type { Studio } from '../types';

interface DevRecord {
  id?: string;
  name?: string;
  parts: ScenePart[];
  project?: ProjectSettings;
  annotations?: SceneAnnotation[];
}

interface DroppedFile {
  name: string;
  base64: string;
}

const cadSources = (parts: ScenePart[]) =>
  parts
    .filter((p) => p.cad)
    .map(({ id, name, color, role, position, rotation, dimensions, cad }) => ({
      id,
      name,
      color,
      role,
      position,
      rotation,
      dimensions,
      cad: { language: cad!.language, code: cad!.code, originOffset: cad!.originOffset, baseSize: cad!.baseSize },
    }));

const partSummaries = (parts: ScenePart[]) =>
  parts.map(({ id, name, kind, role, visible, group, componentId }) => ({
    id,
    name,
    kind,
    role,
    visible,
    group: group?.name,
    componentId,
  }));

function lastDownloadFile() {
  const file = lastDownload();

  return file && { name: file.name, base64: bytesToBase64(file.bytes) };
}

export default function sceneStudio(studio: Studio) {
  const parts = () => studio().core.docs.partsRef.current;
  const part = (id: string) => parts().find((p) => p.id === id);

  return {
    parts: () => partSummaries(parts()),
    sceneRecord: () => ({ parts: parts(), project: studio().core.docs.projectRef.current, annotations: [] }),
    cadSources: () => cadSources(parts()),
    load: (record: DevRecord) =>
      studio().core.loadSeed({
        sceneId: record.id ?? newSceneId(),
        sceneName: record.name ?? 'Untitled',
        globalGoal: '',
        parts: record.parts,
        annotations: record.annotations ?? [],
        project: record.project,
      }),
    clear: () => {
      const { core } = studio();

      core.docs.clearDocument();
      core.setSelectedIds([]);
    },
    select: (ids: string[]) => studio().core.setSelectedIds(ids),
    selection: () => studio().core.selectedIds,
    mates: (id: string) => part(id)?.mates ?? [],
    pose: (id: string) => {
      const found = part(id);

      return found && { position: found.position, rotation: found.rotation };
    },
    dropFiles: (files: DroppedFile[]) =>
      studio().routeFiles(files.map((f) => new File([new Uint8Array(base64ToBytes(f.base64))], f.name))),
    pickFiles: (files: DroppedFile[]) =>
      pickNextFiles(
        files.map(({ name, base64 }) => new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name)),
      ),
    lastDownload: () => lastDownloadFile(),
  };
}
