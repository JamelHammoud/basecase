import { useEffect, useState } from 'react';
import { getComponentMesh } from '../../three/componentMeshes';
import type { MeshMeasure } from '../../three/meshMeasure';
import type { PrinterSetup } from '../../data/printers';
import type { ProjectSettings, ScenePart } from '../../types/robotics';
import { printReportOf, type PrintReport, type PrintShapes } from '../../utils/printReport';

const SETTLE_MS = 120;

const measured = new WeakMap<ScenePart, MeshMeasure>();

const cacheable = (part: ScenePart) => part.kind !== 'component' || !part.componentId || !!getComponentMesh(part.componentId);

export interface BuildReportInput {
  parts: ScenePart[];
  project: ProjectSettings;
  printer: PrinterSetup;
  measure: (ids?: string[]) => Promise<Record<string, MeshMeasure>>;
  printShapes: PrintShapes;
  enabled?: boolean;
  printParts?: ScenePart[];
}

async function measureParts(input: BuildReportInput) {
  const missing = input.parts.filter((p) => !measured.has(p));

  const results = missing.length ? await input.measure(missing.map((p) => p.id)) : {};

  for (const part of missing.filter((p) => cacheable(p) && results[p.id])) measured.set(part, results[part.id]);

  return Object.fromEntries(input.parts.flatMap((p) => (measured.has(p) ? [[p.id, measured.get(p)!]] : [])));
}

export function useBuildReport(input: BuildReportInput) {
  const [measures, setMeasures] = useState<Record<string, MeshMeasure>>({});
  const [print, setPrint] = useState<PrintReport | null>(null);
  const { parts, project, printer, measure, printShapes, enabled = true, printParts = parts } = input;

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    const current = { parts, project, printer, measure, printShapes };
    const timer = window.setTimeout(async () => {
      const nextMeasures = await measureParts(current);

      if (stopped) return;

      setMeasures(nextMeasures);

      const report = await printReportOf(printParts, { project, printer }, printShapes);

      if (!stopped) setPrint(report);
    }, SETTLE_MS);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [parts, printParts, project, printer, measure, printShapes, enabled]);

  return { measures, print };
}
