const FIELDS = new Set(['holes', 'min_wall_mm', 'flat_base', 'symmetric', 'bodies', 'genus']);
const HOLE_FIELDS = new Set(['count', 'd', 'axis', 'through']);
const AXES = new Set(['x', 'y', 'z']);
const LIMIT = 100000;

const plain = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= LIMIT;
const count = (value) => finite(value) && Number.isInteger(value);
const optional = (value, check) => value === undefined || check(value);

function hole(value) {
  if (!plain(value) || Object.keys(value).some((key) => !HOLE_FIELDS.has(key))) return false;

  return (
    count(value.count) &&
    finite(value.d) &&
    value.d > 0 &&
    optional(value.axis, (axis) => AXES.has(axis)) &&
    optional(value.through, (through) => typeof through === 'boolean')
  );
}

export function validRenderExpect(value) {
  if (value === undefined) return true;

  if (!plain(value) || Object.keys(value).some((key) => !FIELDS.has(key))) return false;

  return (
    optional(value.holes, (holes) => Array.isArray(holes) && holes.length <= 64 && holes.every(hole)) &&
    optional(
      value.symmetric,
      (axes) => Array.isArray(axes) && axes.length <= 3 && axes.every((axis) => AXES.has(axis)),
    ) &&
    optional(value.min_wall_mm, finite) &&
    optional(value.flat_base, (flat) => typeof flat === 'boolean') &&
    optional(value.bodies, count) &&
    optional(value.genus, count)
  );
}
