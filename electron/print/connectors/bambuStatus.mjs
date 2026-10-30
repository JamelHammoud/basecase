import { finiteOrUndefined, withJob } from './shared.mjs';

const STATES = {
  IDLE: 'idle',
  PREPARE: 'preparing',
  SLICING: 'preparing',
  RUNNING: 'printing',
  PAUSE: 'paused',
  FINISH: 'finished',
  FAILED: 'failed',
};

const EXTERNAL_SLOT = 254;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function mergeReport(state, delta) {
  if (!isPlainObject(delta)) return state;

  const merged = { ...(isPlainObject(state) ? state : {}) };

  for (const [key, value] of Object.entries(delta)) {
    merged[key] = isPlainObject(value) ? mergeReport(merged[key], value) : value;
  }

  return merged;
}

export function trayColor(value) {
  const hex = /^#?([0-9a-f]{6})/i.exec(String(value ?? ''));

  return hex ? `#${hex[1].toLowerCase()}` : undefined;
}

function slotOf(id, fallback) {
  const number = finiteOrUndefined(id);

  return number === undefined ? fallback : number;
}

function tray(slot, data) {
  if (!data?.tray_type) return null;

  return { slot, type: String(data.tray_type), color: trayColor(data.tray_color) ?? '#000000' };
}

export function bambuTrays(print) {
  const units = Array.isArray(print?.ams?.ams) ? print.ams.ams : [];
  const trays = units.flatMap((unit, unitIndex) => {
    const unitSlot = slotOf(unit?.id, unitIndex) * 4;
    const slots = Array.isArray(unit?.tray) ? unit.tray : [];

    return slots.map((data, trayIndex) => tray(unitSlot + slotOf(data?.id, trayIndex), data));
  });

  trays.push(tray(EXTERNAL_SLOT, print?.vt_tray));

  return trays.filter(Boolean);
}

function hex4(value) {
  return (value & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

export function hmsCode({ attr, code }) {
  return [attr >>> 16, attr, code >>> 16, code].map(hex4).join('-');
}

export function bambuError(print) {
  const hms = Array.isArray(print?.hms) ? print.hms.filter((entry) => entry && Number.isFinite(entry.attr)) : [];

  if (hms.length) return `The printer reported an error (HMS ${hmsCode(hms[0])}). Check the printer screen.`;

  const code = Number(print?.print_error);

  if (!Number.isFinite(code) || code === 0) return undefined;

  return `The printer reported an error (${hex4(code >>> 16)}-${hex4(code)}). Check the printer screen.`;
}

export function bambuStatus(print) {
  const state = STATES[String(print?.gcode_state ?? '').toUpperCase()] ?? 'idle';
  const percent = finiteOrUndefined(print?.mc_percent);
  const trays = bambuTrays(print);
  const status = withJob(state, {
    progress: percent === undefined ? undefined : percent / 100,
    layer: finiteOrUndefined(print?.layer_num),
    totalLayers: finiteOrUndefined(print?.total_layer_num),
    remainingMin: finiteOrUndefined(print?.mc_remaining_time),
    job: print?.subtask_name || undefined,
    message: bambuError(print),
  });

  return trays.length ? { ...status, trays } : status;
}
