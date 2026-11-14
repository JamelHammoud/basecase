import type { CodeReport } from '../cases/console/codeBridge';
import {
  codePanelsOf,
  withCodePanel,
  withoutCodePanel,
  type CodeEdit,
  type CodePlace,
} from '../cases/console/codeEdits';
import { codePanelKey, codeReport, codeReportsWatched } from '../cases/console/codeReports';
import type { CaseConsole } from '../cases/console/format';
import { OVERLAY_ANCHORS, type OverlayAnchor } from '../cases/console/format';
import { checkedConsole } from '../cases/console/layoutEdits';
import type { Case } from '../cases/schema';
import { caseNamed } from './agentCaseRun';
import type { Cases } from './useCases';
import type { CaseRun } from './useCaseRun';

type Payload = Record<string, unknown>;

export interface CaseCodeContext {
  cases: Pick<Cases, 'cases' | 'active' | 'open'>;
  caseRun: Pick<CaseRun, 'open' | 'enterCase'>;
  commitConsole: (caseId: string, console: CaseConsole | undefined) => void;
  report?: (key: string, source: string, since: number) => Promise<CodeReport | null>;
}

export const LOAD_MS = 12_000;
export const SETTLE_MS = 2_000;

const REMOUNT_MS = 1_000;

const POLL_MS = 100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function settledReport(key: string, source: string, since = 0, wait = sleep): Promise<CodeReport | null> {
  for (let waited = 0; waited < LOAD_MS; waited += POLL_MS) {
    const report = codeReport(key, source, waited < REMOUNT_MS ? since : 0);

    if (report?.failed) return report;

    if (report?.loaded) {
      await wait(SETTLE_MS);

      return codeReport(key, source);
    }

    await wait(POLL_MS);
  }

  return codeReport(key, source);
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function pickCase(payload: Payload, cases: CaseCodeContext['cases']): Case | string {
  const wanted = text(payload.case);
  const kase = wanted
    ? caseNamed(cases.cases, wanted)
    : (cases.active ?? (cases.cases.length === 1 ? cases.cases[0] : null));

  if (kase) return kase;

  if (!cases.cases.length) return 'This scene has no Case. Make one with create_case first.';

  return `Name the Case with case: ${cases.cases.map((c) => `${c.name} (${c.id})`).join(', ')}.`;
}

function readPlace(value: unknown): CodePlace | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const v = value as Payload;

  if (OVERLAY_ANCHORS.includes(v.overlay as OverlayAnchor))
    return {
      overlay: v.overlay as OverlayAnchor,
      ...(num(v.width) === undefined ? {} : { width: num(v.width) }),
      ...(num(v.height) === undefined ? {} : { height: num(v.height) }),
      ...(v.pointer === true ? { pointer: true } : {}),
    };

  if (v.side === 'left' || v.side === 'right')
    return { side: v.side, ...(num(v.size) === undefined ? {} : { size: num(v.size) }) };

  return undefined;
}

const checked = (kase: Case, edit: CodeEdit): Case | string =>
  edit.ok ? checkedConsole(kase, edit.console) : edit.problem;

function runIt(kase: Case, ctx: CaseCodeContext) {
  if (ctx.caseRun.open && ctx.cases.active?.id === kase.id) return;

  if (ctx.cases.active?.id !== kase.id) ctx.cases.open(kase.id);

  ctx.caseRun.enterCase(kase.id);
}

const UNLOADED: CodeReport = { loaded: false, failed: null, errors: [], logs: [], refused: [] };

async function writeCaseCode(payload: Payload, ctx: CaseCodeContext) {
  const kase = pickCase(payload, ctx.cases);

  if (typeof kase === 'string') return { ok: false, problem: kase };

  const panel = String(payload.panel ?? '');
  const source = typeof payload.source === 'string' ? payload.source : '';
  const write = {
    panel,
    source,
    title: text(payload.title),
    height: num(payload.height),
    place: readPlace(payload.place),
  };
  const next = checked(kase, withCodePanel(kase.console, write));

  if (typeof next === 'string') return { ok: false, problem: next };

  const since = codeReportsWatched();

  ctx.commitConsole(next.id, next.console);
  runIt(next, ctx);

  const report = (await (ctx.report ?? settledReport)(codePanelKey(next.id, panel), source, since)) ?? UNLOADED;

  return {
    ok: true,
    case: next.id,
    panel,
    running: true,
    loaded: report.loaded && !report.failed,
    errors: report.errors,
    logs: report.logs,
    refused: report.refused,
  };
}

function placeOf(c: CaseConsole, id: string) {
  for (const area of c.layout.areas) {
    const overlay = 'canvas' in area ? area.overlays?.find((o) => o.panel === id) : undefined;

    if (overlay) return { overlay: overlay.anchor };
  }

  const at = c.layout.areas.findIndex((a) => 'canvas' in a);
  const side = c.layout.areas.findIndex((a) => 'panels' in a && a.panels.includes(id));

  return { side: side < at ? 'left' : 'right' };
}

function readCaseCode(payload: Payload, ctx: CaseCodeContext) {
  const kase = pickCase(payload, ctx.cases);

  if (typeof kase === 'string') return { ok: false, problem: kase };

  const panels = codePanelsOf(kase.console);
  const wanted = text(payload.panel);
  const sole = panels.length === 1 ? panels[0] : undefined;
  const panel = wanted ? panels.find((p) => p.id === wanted) : sole;

  if (panel)
    return {
      ok: true,
      case: kase.id,
      panel: panel.id,
      title: panel.title,
      place: placeOf(kase.console!, panel.id),
      source: panel.source,
    };

  if (wanted)
    return { ok: false, problem: `${kase.name} has no code panel named ${wanted}.`, panels: panels.map((p) => p.id) };

  return {
    ok: true,
    case: kase.id,
    panels: panels.map((p) => ({
      id: p.id,
      title: p.title,
      place: placeOf(kase.console!, p.id),
      bytes: new TextEncoder().encode(p.source).length,
    })),
  };
}

function deleteCaseCode(payload: Payload, ctx: CaseCodeContext) {
  const kase = pickCase(payload, ctx.cases);

  if (typeof kase === 'string') return { ok: false, problem: kase };

  const panel = String(payload.panel ?? '');
  const next = checked(kase, withoutCodePanel(kase.console, panel));

  if (typeof next === 'string') return { ok: false, problem: next };

  ctx.commitConsole(next.id, next.console);

  return { ok: true, case: next.id, panel, panels: codePanelsOf(next.console).map((p) => p.id) };
}

export const CASE_CODE_HANDLERS: Record<string, (payload: Payload, ctx: CaseCodeContext) => unknown> = {
  write_case_code: writeCaseCode,
  read_case_code: readCaseCode,
  delete_case_code: deleteCaseCode,
};
