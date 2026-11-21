import { validRoutePlan } from './boardRouteContract.mjs';
import { validFabricationRules, validRoutedRecord } from './boardRoutingRecord';
import type { ElectronicsBoard } from './boardTypes';
import type { ScenePart } from '../types/robotics';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const mm = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10_000;
const nonnegative = (value: unknown): value is number => mm(value) && value >= 0;
const point = (value: unknown) => Array.isArray(value) && value.length === 2 && value.every(mm);
const list = (value: unknown, max: number): value is unknown[] => Array.isArray(value) && value.length <= max;
const unique = (values: unknown[]) =>
  new Set(values.map((value) => (record(value) ? value.id : null))).size === values.length;

function binding(value: unknown) {
  return record(value) && text(value.pad) && text(value.partId) && text(value.port) && text(value.pin);
}

function placement(value: unknown) {
  return (
    record(value) &&
    text(value.id) &&
    text(value.productId) &&
    point(value.position) &&
    typeof value.rotation === 'number' &&
    [0, 90, 180, 270].includes(value.rotation) &&
    typeof value.locked === 'boolean' &&
    (value.unplaced === undefined || typeof value.unplaced === 'boolean') &&
    list(value.bindings, 128) &&
    value.bindings.every(binding)
  );
}

function hole(value: unknown) {
  return (
    record(value) &&
    text(value.id) &&
    point(value.position) &&
    mm(value.diameterMm) &&
    value.diameterMm > 0 &&
    nonnegative(value.keepoutMm) &&
    (value.mountingParts === undefined ||
      (record(value.mountingParts) && text(value.mountingParts.screw) && text(value.mountingParts.spacer)))
  );
}

function keepout(value: unknown) {
  if (!record(value) || !text(value.id) || !point(value.min) || !point(value.max)) return false;

  const min = value.min as [number, number];
  const max = value.max as [number, number];

  return min[0] < max[0] && min[1] < max[1];
}

const entries = (value: unknown, validate: (value: unknown) => boolean, max: number) =>
  list(value, max) && value.every(validate) && unique(value);
const heights = (value: unknown) => record(value) && nonnegative(value.top) && nonnegative(value.bottom);
const vector3 = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(mm);

function plainBoardShape(part: ScenePart) {
  const modifiers = ['deformers', 'edges', 'sheet', 'sheetTransform', 'sculptMesh', 'cad', 'mesh'] as const;

  return modifiers.every((key) => !part[key]);
}

export function validBoardDefinition(value: unknown): value is ElectronicsBoard {
  if (!record(value)) return false;

  return (
    value.schema === 1 &&
    text(value.partId) &&
    value.outline === 'rectangle' &&
    (value.side === 'top' || value.side === 'bottom') &&
    heights(value.heightMm) &&
    nonnegative(value.edgeClearanceMm) &&
    entries(value.holes, hole, 128) &&
    entries(value.keepouts, keepout, 128) &&
    entries(value.placements, placement, 256) &&
    validBoardElectricalRecords(value)
  );
}

export function validBoardPart(part: ScenePart) {
  const dimensions = [part.dimensions?.width, part.dimensions?.height, part.dimensions?.depth];

  return (
    part.kind === 'box' &&
    part.role === 'solid' &&
    dimensions.every((value) => mm(value) && value > 0) &&
    vector3(part.position) &&
    vector3(part.rotation) &&
    plainBoardShape(part)
  );
}

function validBoardElectricalRecords(value: Record<string, unknown>) {
  return (
    (value.fabrication === undefined || (value.fabrication !== null && validFabricationRules(value.fabrication))) &&
    (value.routing === undefined || validRoutePlan(value.routing)) &&
    (value.routed === undefined || validRoutedRecord(value.routed))
  );
}
