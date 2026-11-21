import { slicerOrder, type PrinterSetup } from '../data/printers';
import type { ThreeMfFileSpec } from '../three/analysis/analysisOps';
import type { PrintMaterial, ProjectSettings } from '../types/robotics';
import type { JobGroup, JobPrinter } from './printBridge';
import type { Plate, PrintPlan } from './plan';
import { materialGroups } from './materialGroups';
import { polygonBounds } from './polygonBounds';

export interface JobSpec {
  project?: boolean;
  files: ThreeMfFileSpec[];
  plateSize: [number, number];
  groups: Array<Omit<JobGroup, 'bytes'>>;
  printer: JobPrinter | null;
}

export function jobPrinter(setup: PrinterSetup, project: ProjectSettings): JobPrinter | null {
  const presets = setup.model.presets;

  if (!presets || setup.model.id === 'custom') return null;

  const process = presets.processes.some((p) => p.name === project.printProcess)
    ? project.printProcess!
    : presets.process;

  if (!process) return null;

  return {
    vendor: setup.model.vendor,
    slicers: slicerOrder(setup.model),
    machine: presets.machine,
    process,
    bedType: setup.model.bedType,
    filaments: Object.fromEntries(Object.entries(presets.filaments).map(([m, f]) => [m, f!.name])),
  };
}

const plateSizeOf = (setup: PrinterSetup): [number, number] => {
  const { w, d } = polygonBounds(setup.model.bed);

  return [w, d];
};

export const itemName = (name: string, copy: number) => (copy ? `${name} (${copy + 1})` : name);

function fileFor(material: PrintMaterial, plates: Plate[]): ThreeMfFileSpec {
  return {
    key: material,
    plates: plates.map((p) => ({ number: p.local, name: `Plate ${p.number}` })),
    items: plates.flatMap((p) =>
      p.items.map((it) => ({ id: it.id, name: itemName(it.name, it.copy), matrix: it.matrix, plate: p.local })),
    ),
  };
}

export function jobSpec(plan: PrintPlan, setup: PrinterSetup, project: ProjectSettings): JobSpec {
  const groups = [...materialGroups(plan.plates)];

  return {
    files: groups.map(([material, plates]) => fileFor(material, plates)),
    plateSize: plateSizeOf(setup),
    groups: groups.map(([material, plates]) => ({
      material,
      plates: plates.map((p) => ({ number: p.number, local: p.local, hash: p.hash })),
    })),
    printer: jobPrinter(setup, project),
  };
}
