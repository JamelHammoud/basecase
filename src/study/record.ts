import { validVisibilityResult, validVisibilityRecord } from './visibilityRecord';
import { validCameraLens } from './cameraChoices';
import { restoreSavedRuns, validSavedRuns } from './recordRuns';
import { validSheetFields } from '../sheet/validation';
import type { ProjectSettings } from '../types/robotics';
import type { StudyKnob, StudyRecord, StudyRow } from './types';
import { validateStudyKnobs } from './knobs';
import {
  boundedInteger,
  finiteTree,
  finiteValue,
  optionalString,
  recordValue,
  stringValue,
  vectorValue,
} from './recordValues';

export { validateStudyKnobs } from './knobs';

const nonnegative = (value: unknown) => finiteValue(value) && value >= 0;
const statusValue = (value: unknown) => ['pass', 'warn', 'fail', 'not run'].includes(String(value));
const optionalNumber = (value: unknown) => value === undefined || finiteValue(value);

function validPart(value: unknown): boolean {
  if (!recordValue(value) || !recordValue(value.dimensions)) return false;

  return (
    stringValue(value.id) &&
    stringValue(value.name) &&
    stringValue(value.kind) &&
    vectorValue(value.position) &&
    vectorValue(value.rotation) &&
    [value.dimensions.width, value.dimensions.height, value.dimensions.depth].every(nonnegative) &&
    typeof value.visible === 'boolean' &&
    typeof value.locked === 'boolean' &&
    ['solid', 'reference', 'cutout'].includes(String(value.role)) &&
    validSheetFields(value) &&
    (value.cameraLens === undefined || validCameraLens(value.cameraLens))
  );
}

const optionalLabels = (value: unknown) => value === undefined || (Array.isArray(value) && value.every(stringValue));
const optionalArray = (value: unknown) => value === undefined || Array.isArray(value);

function validCheckItem(value: unknown): boolean {
  return (
    recordValue(value) &&
    stringValue(value.text) &&
    optionalLabels(value.ids) &&
    optionalString(value.joint) &&
    (value.status === undefined || value.status === 'warn' || value.status === 'fail')
  );
}

function validCheck(value: unknown): boolean {
  if (!recordValue(value)) return false;

  const itemsValid = value.items === undefined || (Array.isArray(value.items) && value.items.every(validCheckItem));

  return (
    stringValue(value.check) &&
    stringValue(value.detail) &&
    statusValue(value.status) &&
    optionalLabels(value.ids) &&
    optionalNumber(value.hours) &&
    optionalString(value.agentText) &&
    optionalArray(value.dots) &&
    optionalArray(value.envelopes) &&
    itemsValid
  );
}

function validMetrics(value: unknown): boolean {
  if (!recordValue(value) || !nonnegative(value.massG) || !statusValue(value.torque)) return false;

  const numbers = ['worstShare', 'servosUsd', 'sizedUsd', 'tipDeg'];

  if (!numbers.every((key) => optionalNumber(value[key])) || !optionalString(value.worstJoint)) return false;

  if (value.sim === undefined || stringValue(value.sim)) return true;

  return (
    recordValue(value.sim) &&
    (value.sim.fellAt === null || nonnegative(value.sim.fellAt)) &&
    optionalNumber(value.sim.worstShare) &&
    optionalString(value.sim.worstJoint)
  );
}

function validRow(value: unknown): boolean {
  if (!recordValue(value)) return false;

  return (
    stringValue(value.key) &&
    stringValue(value.sceneKey) &&
    stringValue(value.label) &&
    nonnegative(value.costUsd) &&
    nonnegative(value.massG) &&
    optionalNumber(value.runtimeMinutes) &&
    optionalNumber(value.volts) &&
    optionalString(value.error) &&
    validMetrics(value.metrics) &&
    validVisibilityResult(value.visibility) &&
    validSavedRuns(value.runs) &&
    Array.isArray(value.checks) &&
    value.checks.length <= 10000 &&
    value.checks.every(validCheck)
  );
}

function validBase(value: unknown): boolean {
  if (!recordValue(value) || !recordValue(value.project) || value.project.study !== undefined) return false;

  return Array.isArray(value.parts) && value.parts.length <= 100000 && value.parts.every(validPart);
}

function validRows(value: Record<string, unknown>, knobs: StudyKnob[]): boolean {
  if (!Array.isArray(value.rows) || value.rows.length > 64 || !validRow(value.current)) return false;

  const validSelection = (row: unknown) =>
    recordValue(row) &&
    Array.isArray(row.selection) &&
    row.selection.length === knobs.length &&
    row.selection.every((index, i) => boundedInteger(index, knobs[i].values.length - 1));
  const current = value.current as Record<string, unknown>;

  return (
    value.rows.length <= (value.total as number) &&
    Array.isArray(current.selection) &&
    current.selection.length === 0 &&
    value.rows.every((row) => validRow(row) && validSelection(row)) &&
    new Set(value.rows.map((row) => row.key)).size === value.rows.length
  );
}

function validRecord(value: unknown): value is StudyRecord {
  if (!recordValue(value) || !validateStudyKnobs(value.knobs) || !validBase(value.base)) return false;

  return (
    boundedInteger(value.seed, 4294967295) &&
    boundedInteger(value.total, 64) &&
    stringValue(value.baseKey) &&
    optionalString(value.caseId) &&
    optionalString(value.caseKey) &&
    validRows(value, value.knobs) &&
    validVisibilityRecord(value) &&
    finiteTree(value)
  );
}

function restoredRow(row: StudyRow): StudyRow {
  const runs = restoreSavedRuns(row.runs);

  return runs === row.runs ? row : { ...row, runs };
}

export function readStudyRecord(value: unknown): StudyRecord | undefined {
  if (!validRecord(value)) return undefined;

  const current = restoredRow(value.current);
  const rows = value.rows.map(restoredRow);
  const unchanged = current === value.current && rows.every((row, i) => row === value.rows[i]);

  return unchanged ? value : { ...value, current, rows };
}

export function withValidStudy(project: ProjectSettings): ProjectSettings {
  if (project.study === undefined) return project;

  const study = readStudyRecord(project.study);

  if (study === project.study) return project;

  if (study) return { ...project, study };

  const rest = { ...project };

  delete rest.study;

  return rest;
}
