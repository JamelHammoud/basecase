const finite = (value) => typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));

function polygonOf(text) {
  const tokens = text.replace(/^(points|polygon)=/i, '').split(',');
  const points = tokens.map((token) => token.trim().split('x'));

  if (points.length < 3 || points.some((point) => point.length !== 2 || !point.every(finite))) return null;

  const polygon = points.map((point) => point.map(Number));
  const area = polygon.reduce((sum, [x, y], index) => {
    const [nx, ny] = polygon[(index + 1) % polygon.length];

    return sum + x * ny - nx * y;
  }, 0);

  return area === 0 ? null : polygon;
}

function volumeOf(text, height) {
  const fields = text.split(';').map((field) => field.trim());
  const range = fields.length === 2 ? fields[0].split('..') : ['', ''];

  if (fields.length > 2 || range.length !== 2 || range.some((token) => token !== '' && !finite(token))) return null;

  const zMin = Math.max(0, Math.min(height, range[0] === '' ? 0 : Number(range[0])));
  const zMax = Math.max(0, Math.min(height, range[1] === '' ? height : Number(range[1])));
  const polygon = polygonOf(fields.at(-1));

  return polygon && zMin < zMax ? { polygon, zMin, zMax } : null;
}

function clearanceOf(machine) {
  const keys = ['extruder_clearance_radius', 'extruder_clearance_dist_to_rod', 'extruder_clearance_height_to_rod'];
  const values = keys.map((key) => machine[key]);

  if (values.some((value) => value !== undefined && (!finite(value) || Number(value) < 0))) return null;

  return { radius: Math.max(Number(values[0] ?? 0), Number(values[1] ?? 0)), height: Number(values[2] ?? 0) };
}

function activeDefinition(machine, mode, definition) {
  if (mode !== 'per_extruder') return String(definition).trim();

  const perExtruder = machine.extruder_bed_exclude_volumes ?? [];

  return !Array.isArray(perExtruder) || perExtruder.some((value) => String(value).trim());
}

export function obstacleSettings(machine) {
  const mode = machine.bed_exclude_volume_mode ?? 'shared';
  const definition = machine.bed_exclude_volumes ?? '';

  if (!activeDefinition(machine, mode, definition)) return {};

  if (mode !== 'shared' || typeof definition !== 'string') return { obstacleUnsupported: true };

  const height = Number(machine.printable_height);
  const specs = definition
    .split(/[|\n]/)
    .map((spec) => spec.trim())
    .filter(Boolean);
  const obstacles = specs.map((spec) => volumeOf(spec, height));
  const clearance = clearanceOf(machine);

  if (!Number.isFinite(height) || height <= 0 || !obstacles.length || obstacles.some((volume) => !volume) || !clearance)
    return { obstacleUnsupported: true };

  const toolheadClearance = clearance.radius > 0 || clearance.height > 0 ? { toolheadClearance: clearance } : {};

  return { obstacles, ...toolheadClearance };
}

export function brimSettings(process) {
  if (process.brim_type === 'no_brim') return { brimClearance: 0 };

  const width = Number(process.brim_width ?? 0);
  const gap = Number(process.brim_object_gap ?? 0);

  if (!Number.isFinite(width) || !Number.isFinite(gap) || width < 0 || gap < 0) return { obstacleUnsupported: true };

  return { brimClearance: width > 0 ? width + gap : 0 };
}
