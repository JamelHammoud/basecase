import { findPreset } from './slice.mjs';

const PROFILE_FIELDS = new Set([
  'type',
  'name',
  'inherits',
  'from',
  'setting_id',
  'instantiation',
  'compatible_printers',
  'compatible_printers_condition',
  'compatible_prints',
  'compatible_prints_condition',
]);

const valuesOf = (preset) => Object.fromEntries(Object.entries(preset).filter(([key]) => !PROFILE_FIELDS.has(key)));

function presetFor(slicer, printer, kind, name) {
  const preset = findPreset(slicer.profiles, kind, name, printer.vendor);

  if (!preset)
    throw new Error(`The slicer has no ${kind} profile named “${name}”. Update the slicer or pick another printer.`);

  return valuesOf(preset);
}

function filamentSettings(filaments) {
  const keys = [...new Set(filaments.flatMap(Object.keys))];

  return Object.fromEntries(
    keys.map((key) => {
      const value = filaments[0][key];

      return [key, Array.isArray(value) ? filaments.map((f) => (f[key] ?? value)[0]) : value];
    }),
  );
}

export function resolveProjectSettings(settings, slicer, printer) {
  const machine = presetFor(slicer, printer, 'machine', settings.printer_settings_id);
  const process = presetFor(slicer, printer, 'process', settings.print_settings_id);
  const filaments = settings.filament_settings_id.map((name) => presetFor(slicer, printer, 'filament', name));

  return {
    ...machine,
    ...process,
    ...filamentSettings(filaments),
    ...settings,
    different_settings_to_system: [
      'sparse_infill_density;curr_bed_type',
      ...filaments.map(() => 'filament_colour'),
      'nozzle_diameter;printable_area;printable_height',
    ],
  };
}
