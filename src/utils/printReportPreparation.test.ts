import { afterEach, expect, it, vi } from 'vitest';
import { roverParts, roverShapes, projectPrinter } from '../print/project.fixtures';
import { DEFAULT_PROJECT } from '../types/robotics';
import { analysisHandlers } from '../three/analysis/analysisOps';
import { printReportsIn } from '../three/analysis/analysisPool';
import { buildPrintReport } from './printReport';
import { printReportOf } from './printReportPreparation';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('prepares complete plate reports through the analysis boundary without scene geometry or unrelated settings', async () => {
  vi.stubGlobal('window', {});

  const prepare = vi.spyOn(analysisHandlers, 'printReport');
  const parts = roverParts().map((part) => ({ ...part, note: 'private scene note' }));
  const shapes = roverShapes(parts);
  const fetch = (_ids: string[], faces?: Record<string, [number, number, number][]>) => printReportsIn(shapes, faces);
  const ctx = { project: DEFAULT_PROJECT, printer: projectPrinter };
  const report = await printReportOf(parts, ctx, fetch);

  expect(report).toEqual(buildPrintReport(parts, ctx));
  expect(report.plan.plates.map((plate) => plate.material)).toEqual(['PLA', 'TPU']);
  expect(prepare).toHaveBeenCalledOnce();
  expect(JSON.stringify(prepare.mock.calls[0][0])).not.toContain('private scene note');
  expect(Object.keys(prepare.mock.calls[0][0].entries[0].part).sort()).toEqual(['id', 'material', 'name', 'print']);
  expect(prepare.mock.calls[0][0].entries.map(({ part }) => Reflect.get(part, 'material'))).toEqual(['PLA', 'TPU']);
  expect(Object.keys(prepare.mock.calls[0][0].ctx.project).sort()).toEqual(['infillPct', 'material', 'printProcess']);
});

it('keeps copies, manual placement, skipped parts and changed process settings fresh across concurrent reports', async () => {
  vi.stubGlobal('window', {});

  const original = roverParts();
  const changed = original.map((part) => ({
    ...part,
    print:
      part.id === 'body' ? { copies: 3, plate: 1, at: [30, 40] as [number, number], turned: true } : { skip: true },
  }));
  const ctx = { project: DEFAULT_PROJECT, printer: projectPrinter };
  const next = { ...ctx, project: { ...DEFAULT_PROJECT, infillPct: 70 } };
  const shapes = roverShapes(original);
  const fetch = () => printReportsIn(shapes);
  const [before, after, settings] = await Promise.all([
    printReportOf(original, ctx, fetch),
    printReportOf(changed, next, fetch),
    printReportOf(original, next, fetch),
  ]);

  expect(before).toEqual(buildPrintReport(original, ctx));
  expect(after).toEqual(buildPrintReport(changed, next));
  expect(settings).toEqual(buildPrintReport(original, next));
  expect(after.parts.map((part) => [part.id, part.copies])).toEqual([['body', 3]]);
  expect(after.plan.plates.flatMap((plate) => plate.items)).toHaveLength(3);
  expect(after.plan.plates[0].items[0]).toMatchObject({ id: 'body', x: 30, y: 40, yaw: 90 });
  expect(after.totals.grams).toBeGreaterThan(before.parts[0].grams);
});

it('reuses an unchanged prepared report across callers while returning independently owned results', async () => {
  vi.stubGlobal('window', {});

  const prepare = vi.spyOn(analysisHandlers, 'printReport');
  const parts = roverParts().map((part) => ({ ...part, id: `shared-${part.id}` }));
  const shapes = roverShapes(parts);
  const available = await printReportsIn(shapes);
  let release = () => {};
  const later = new Promise<typeof available>((resolve) => {
    release = () => resolve(structuredClone(available));
  });
  const fetch = vi.fn().mockReturnValue(later);
  const ctx = { project: DEFAULT_PROJECT, printer: { ...projectPrinter, label: 'Owned report' } };
  const one = printReportOf(parts, ctx, fetch);
  const two = printReportOf(parts, ctx, fetch);

  expect(fetch).toHaveBeenCalledOnce();
  release();

  const [first, second] = await Promise.all([one, two]);

  expect(prepare).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledOnce();
  first.parts[0].check.pose.down[0] = 999;
  first.plan.plates[0].items[0].matrix[0] = 999;
  expect(second).toEqual(buildPrintReport(parts, ctx));
  expect(await printReportOf([...parts], { ...ctx, printer: { ...ctx.printer } }, fetch)).toEqual(second);
  expect(prepare).toHaveBeenCalledOnce();
});

it('releases a failed report preparation without discarding the next explicit request', async () => {
  vi.stubGlobal('window', {});

  const prepare = vi.spyOn(analysisHandlers, 'printReport').mockImplementationOnce(() => {
    throw new Error('report fixture failure');
  });
  const parts = roverParts();
  const shapes = roverShapes(parts);
  const fetch = () => printReportsIn(shapes);
  const ctx = { project: DEFAULT_PROJECT, printer: { ...projectPrinter, label: 'Failure report' } };

  await expect(printReportOf(parts, ctx, fetch)).rejects.toThrow('report fixture failure');
  expect(await printReportOf(parts, ctx, fetch)).toEqual(buildPrintReport(parts, ctx));
  expect(prepare).toHaveBeenCalledTimes(2);
});

it('shares pending shape failures and prepares changed geometry independently before another explicit request', async () => {
  const parts = roverParts().map((part) => ({ ...part, id: `pending-${part.id}` }));
  const shapes = roverShapes(parts);
  const available = await printReportsIn(shapes);
  let reject = (_reason: Error) => {};
  const waiting = new Promise<typeof available>((_resolve, fail) => {
    reject = fail;
  });
  const fetch = vi.fn().mockReturnValueOnce(waiting).mockResolvedValue(available);
  const ctx = { project: DEFAULT_PROJECT, printer: projectPrinter };
  const one = printReportOf(parts, ctx, fetch);
  const two = printReportOf(parts, ctx, fetch);
  const failed = Promise.allSettled([one, two]);
  const changed = parts.map((part) => ({ ...part, dimensions: { ...part.dimensions, width: 999 } }));

  await printReportOf(changed, ctx, fetch);
  expect(fetch).toHaveBeenCalledTimes(2);
  reject(new Error('shape preparation failed'));
  expect(await failed).toEqual([
    { status: 'rejected', reason: new Error('shape preparation failed') },
    { status: 'rejected', reason: new Error('shape preparation failed') },
  ]);
  expect(await printReportOf(parts, ctx, fetch)).toEqual(buildPrintReport(parts, ctx));
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('keeps another source independent when the previous source is cancelled during shape preparation', async () => {
  const parts = roverParts().map((part) => ({ ...part, id: `source-${part.id}` }));
  const available = await printReportsIn(roverShapes(parts));
  let reject = (_reason: Error) => {};
  const waiting = new Promise<typeof available>((_resolve, fail) => {
    reject = fail;
  });
  const before = vi.fn().mockReturnValue(waiting);
  const after = vi.fn().mockResolvedValue(available);
  const ctx = { project: DEFAULT_PROJECT, printer: projectPrinter };
  const old = printReportOf(parts, ctx, before);
  const failed = expect(old).rejects.toThrow('source cancelled');
  const next = Promise.allSettled([printReportOf(parts, ctx, after)]);

  reject(new Error('source cancelled'));
  await failed;
  expect(after).toHaveBeenCalledOnce();
  expect(await next).toEqual([{ status: 'fulfilled', value: buildPrintReport(parts, ctx) }]);
});

it('retains the successful shape identity when an independent source finishes after its report', async () => {
  vi.stubGlobal('window', {});

  const prepare = vi.spyOn(analysisHandlers, 'printReport');
  const parts = roverParts().map((part) => ({ ...part, id: `late-source-${part.id}` }));
  const available = await printReportsIn(roverShapes(parts));
  let release = () => {};
  const waiting = new Promise<typeof available>((resolve) => {
    release = () => resolve(structuredClone(available));
  });
  const before = vi.fn().mockReturnValue(waiting);
  const after = vi.fn().mockResolvedValue(available);
  const ctx = { project: DEFAULT_PROJECT, printer: projectPrinter };
  const old = printReportOf(parts, ctx, before);
  const next = await printReportOf(parts, ctx, after);

  release();
  expect(await old).toEqual(next);
  expect(before).toHaveBeenCalledOnce();
  expect(after).toHaveBeenCalledOnce();
  expect(prepare).toHaveBeenCalledOnce();
});
