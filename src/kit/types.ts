import type { PreparedDrawings } from '../sheet/drawingsClient';
import type { DrawingManifest } from '../sheet/drawingTypes';
import type { PartSheet } from '../types/sheet';
import type { Netlist } from '../wiring/netlist';
import type { GuidePlan } from '../guide/guideTypes';
import type { JobSpec } from '../print/job';
import type { Readiness } from '../readiness/types';
import type { JointMapEntry, JointMapInput } from '../sim/robotPackage/jointMap';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, Purchases, ScenePart } from '../types/robotics';
import type { BomLine, PrintedPart } from '../utils/bom';
import type { PrintReport } from '../utils/printReport';

export interface KitJob {
  name: string;
  parts: ScenePart[];
  project: ProjectSettings;
  purchases: Purchases;
  measures: Record<string, MeshMeasure | undefined>;
  wiring?: Netlist;
  guide: { plan: GuidePlan; html: string; fingerprint: string; orderTimedOut?: boolean };
  print: PrintReport;
  spec: JobSpec;
  files: Record<string, Uint8Array>;
  mapInput: JointMapInput;
  checks: Readiness | null;
  checksFingerprint: string;
  labelNotes?: Record<string, string>;
  drawings?: PreparedDrawings;
  designFingerprint?: string;
}

export interface PackingRow {
  key: string;
  name: string;
  qty: number;
  unit: BomLine['unit'];
  partIds: string[];
  module: string | null;
  step: number | null;
  index: number | null;
}

export interface PrintedOutput {
  file: string;
  plate: number;
  copy: number;
}

export interface KitManifest {
  format: 'basecase-manufacturing-kit';
  schema: 1;
  design: { name: string; fingerprint: string };
  guide: GuidePlan;
  guideEvidence: { fingerprint: string; orderTimedOut: boolean };
  purchases: BomLine[];
  packing: PackingRow[];
  printed: Array<PrintedPart & { key: string; outputs: PrintedOutput[] }>;
  drawings?: DrawingManifest;
  sheets: Array<PartSheet & { partId: string; file: string }>;
  wiring?: Netlist;
  servos: Array<{ partId: string; entry: JointMapEntry }>;
  settings: Pick<ProjectSettings, 'material' | 'infillPct' | 'printProcess'>;
  printer: PrintReport['plan']['printer'];
  checks: { freshness: 'current' | 'stale' | 'not run'; result: Readiness | null };
  print: PrintReport['parts'];
  labelNotes: Record<string, string>;
}
