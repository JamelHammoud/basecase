import type { PrintReport } from '../utils/printReport';
import type { SliceRecord } from './printBridge';
import { duration } from '../utils/duration';
import { plural } from '../../electron/plural.mjs';

export function sliceText(report: PrintReport, record: SliceRecord): string {
  const byNumber = new Map(report.plan.plates.map((p) => [p.number, p]));
  const total = record.plates.reduce((t, p) => ({ s: t.s + p.seconds, g: t.g + p.grams }), { s: 0, g: 0 });
  const lines = [
    `Sliced ${plural(record.plates.length, 'plate')} for a ${report.printer.model.name} in ${record.slicer.name} ${record.slicer.version ?? ''}: ${duration(total.s, 'min')} of printing, ${Math.round(total.g)} g of filament.`.replace(
      ' :',
      ':',
    ),
  ];

  for (const p of record.plates) {
    const plate = byNumber.get(p.number);
    const names = [...new Set(plate?.items.map((it) => it.id) ?? [])].join(', ');
    const notes = [p.support && 'needs supports', ...p.warnings].filter(Boolean).join('; ');

    lines.push(
      `- Plate ${p.number} (${p.material}, ${duration(p.seconds, 'min')}, ${Math.round(p.grams)} g): ${names}${notes ? `. ${notes}` : ''}`,
    );
  }

  const failing = report.parts.filter((p) => !p.check.fits);

  if (failing.length) lines.push(`Not on any plate (too big): ${failing.map((p) => p.id).join(', ')}.`);

  return lines.join('\n');
}
