import type { PrinterSetup } from '../data/printers';
import type { ProjectSettings } from '../types/robotics';
import { itemName, jobSpec, type JobSpec } from './job';
import type { PrintPlan } from './plan';
import type { PrinterStatus } from './printBridge';

const FALLBACK_COLOR = '#EEEEEE';

function trayColor(color: string): string {
  const rgb = color.replace(/^#/, '').slice(0, 6);

  return /^[0-9a-f]{6}$/i.test(rgb) ? `#${rgb.toUpperCase()}` : FALLBACK_COLOR;
}

export function projectJobSpec(
  plan: PrintPlan,
  setup: PrinterSetup,
  project: ProjectSettings,
  trays: PrinterStatus['trays'] = [],
): JobSpec {
  const spec = jobSpec(plan, setup, project);

  if (spec.groups.length < 2) return spec;

  const materials = spec.groups.map((g) => g.material);
  const slots = [...trays].filter((t) => t.slot >= 0 && t.slot < 254).sort((a, b) => a.slot - b.slot);
  const ordered = materials.map((type) => ({ type, tray: slots.find((t) => t.type.toUpperCase().startsWith(type)) }));

  ordered.sort((a, b) => (a.tray?.slot ?? Infinity) - (b.tray?.slot ?? Infinity));

  const filamentIndex = new Map(ordered.map(({ type }, i) => [type, i + 1]));
  const filaments = ordered.map(({ type, tray }) => ({
    type,
    color: tray ? trayColor(tray.color) : FALLBACK_COLOR,
    preset: spec.printer?.filaments[type] ?? `Generic ${type}`,
  }));
  const material = materials[0];
  const file = {
    key: material,
    plates: plan.plates.map((p) => ({ number: p.number, name: `Plate ${p.number}` })),
    items: plan.plates.flatMap((p) =>
      p.items.map((it) => ({
        id: it.id,
        name: itemName(it.name, it.copy),
        matrix: it.matrix,
        plate: p.number,
        filament: filamentIndex.get(p.material)!,
      })),
    ),
    project: {
      filaments,
      settings: {
        printer_settings_id: spec.printer?.machine ?? '',
        print_settings_id: spec.printer?.process ?? '',
        printer_model: setup.model.name,
        nozzle_diameter: [String(setup.nozzle)],
        printable_area: setup.model.bed.map(([x, y]) => `${x}x${y}`),
        printable_height: String(setup.model.height),
        curr_bed_type: setup.model.bedType ?? '',
        sparse_infill_density: `${project.infillPct}%`,
      },
    },
  };

  return {
    ...spec,
    project: true,
    files: [file],
    groups: [{ material, plates: plan.plates.map((p) => ({ number: p.number, local: p.number, hash: p.hash })) }],
  };
}
