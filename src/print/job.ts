import type { PrinterSetup } from '../data/printers';
import type { ThreeMfFileSpec } from '../three/analysis/analysisOps';
import type { PrintMaterial, ProjectSettings } from '../types/robotics';
import type { JobGroup, JobPrinter } from './printBridge';
import type { Plate, PrintPlan } from './plan';

export interface JobSpec {
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
    machine: presets.machine,
    process,
    bedType: setup.model.bedType,
    filaments: Object.fromEntries(Object.entries(presets.filaments).map(([m, f]) => [m, f!.name])),
  };
}

const plateSizeOf = (setup: PrinterSetup): [number, number] => {
  const xs = setup.model.bed.map((p) => p[0]);
  const ys = setup.model.bed.map((p) => p[1]);

  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};

const itemName = (name: string, copy: number) => (copy ? `${name} (${copy + 1})` : name);

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
  const materials = [...new Set(plan.plates.map((p) => p.material))];
  const byMaterial = (m: PrintMaterial) => plan.plates.filter((p) => p.material === m);

  return {
    files: materials.map((m) => fileFor(m, byMaterial(m))),
    plateSize: plateSizeOf(setup),
    groups: materials.map((material) => ({
      material,
      plates: byMaterial(material).map((p) => ({ number: p.number, local: p.local, hash: p.hash })),
    })),
    printer: jobPrinter(setup, project),
  };
}
