import { useEffect, useState } from 'react';
import { getComponentMesh } from '../../three/componentMeshes';
import type { MeshMeasure } from '../../three/meshMeasure';
import type { ProjectSettings, ScenePart } from '../../types/robotics';
import { buildPrintReport, type PrintReport } from '../../utils/printReport';

const SETTLE_MS = 120;
const CHUNK = 6;

const measured = new WeakMap<ScenePart, MeshMeasure>();

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const cacheable = (part: ScenePart) => part.kind !== 'component' || !part.componentId || !!getComponentMesh(part.componentId);

export interface BuildReportInput {
  parts: ScenePart[];
  project: ProjectSettings;
  measure: (ids?: string[]) => Record<string, MeshMeasure>;
  getTriangles: (id: string) => Float32Array | null;
}

async function measureParts(input: BuildReportInput, cancelled: () => boolean) {
  const missing = input.parts.filter((p) => !measured.has(p));

  for (let i = 0; i < missing.length && !cancelled(); i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    const results = input.measure(chunk.map((p) => p.id));

    for (const part of chunk) {
      const result = results[part.id];

      if (result && cacheable(part)) measured.set(part, result);
    }

    await yieldToMain();
  }

  return Object.fromEntries(input.parts.flatMap((p) => (measured.has(p) ? [[p.id, measured.get(p)!]] : [])));
}

async function printReport(input: BuildReportInput, cancelled: () => boolean): Promise<PrintReport | null> {
  for (let i = 0; i < input.parts.length && !cancelled(); i += CHUNK) {
    buildPrintReport(input.parts.slice(i, i + CHUNK), input.project, input.getTriangles);
    await yieldToMain();
  }

  return cancelled() ? null : buildPrintReport(input.parts, input.project, input.getTriangles);
}

export function useBuildReport(input: BuildReportInput) {
  const [measures, setMeasures] = useState<Record<string, MeshMeasure>>({});
  const [print, setPrint] = useState<PrintReport | null>(null);
  const { parts, project, measure, getTriangles } = input;

  useEffect(() => {
    let stopped = false;
    const cancelled = () => stopped;
    const current = { parts, project, measure, getTriangles };
    const timer = window.setTimeout(async () => {
      const nextMeasures = await measureParts(current, cancelled);

      if (stopped) return;

      setMeasures(nextMeasures);

      const report = await printReport(current, cancelled);

      if (report) setPrint(report);
    }, SETTLE_MS);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [parts, project, measure, getTriangles]);

  return { measures, print };
}
