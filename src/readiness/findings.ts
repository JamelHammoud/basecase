import type { AssemblyReport } from '../assembly/assemblyReport';
import { isBlockingRank } from '../assembly/chainLines';
import type { Bom } from '../utils/bomTypes';
import type { CheckRow, EngineeringReport } from '../utils/engineeringTypes';
import { thinWallOf, type PrintReport } from '../utils/printReport';
import type { FitInterference } from '../utils/designedFits';
import type { Finding, FindingLevel } from './types';
import { engineeringFinding, ruleFinding } from './wording';
import { lengthLabel } from '../utils/size';

export function assemblyFindings(report: AssemblyReport): Finding[] {
  return report.lines.map((l) =>
    ruleFinding(l.code, isBlockingRank(l.rank) ? 'blocker' : 'note', { agentText: l.text, ids: l.ids }),
  );
}

const levelOf = (status: CheckRow['status']): FindingLevel => (status === 'fail' ? 'blocker' : 'note');

export function engineeringFindings(report: EngineeringReport): Finding[] {
  return report.rows.flatMap((row) => {
    if (row.status === 'pass' || row.status === 'not run') return [];

    if (row.items?.length && !row.itemsAreContext)
      return row.items.map((item) =>
        engineeringFinding(row.check, levelOf(item.status ?? row.status), {
          detail: item.text,
          ids: item.ids,
          fix: item.fix,
          joint: item.joint,
        }),
      );

    return [
      engineeringFinding(row.check, levelOf(row.status), {
        detail: row.detail,
        agentText: row.agentText,
        ids: row.ids,
      }),
    ];
  });
}

function partPrintFindings(p: PrintReport['parts'][number]): Finding[] {
  const ids = [p.id];
  const out: Finding[] = [];

  if (!p.check.fits)
    out.push(
      ruleFinding('bed', 'blocker', { agentText: `${p.name}: ${p.check.fitNote ?? 'doesn’t fit the plate'}`, ids }),
    );

  if (thinWallOf(p.check) === 'panel')
    out.push(
      ruleFinding('thin', 'blocker', {
        agentText: `${p.name}: walls under 0.84 mm, down to ${p.check.minWallMm.toFixed(2)} mm over about ${Math.round(p.check.thinAreaMm2)} mm². Thicken them to at least 0.84 mm.`,
        ids,
      }),
    );

  for (const note of p.notes) out.push(ruleFinding('edge', 'note', { agentText: `${p.name}: ${note}`, ids }));

  for (const issue of p.issues.filter((i) => i.startsWith('Add 45')))
    out.push(ruleFinding('support', 'note', { agentText: `${p.name}: ${issue}`, ids }));

  return out;
}

export function printFindings(report: PrintReport | null): Finding[] {
  return (report?.parts ?? []).flatMap(partPrintFindings);
}

export function fitFindings(items: FitInterference[]): Finding[] {
  return items.map((i) => {
    const depth = lengthLabel(i.depthMm);
    const ids = [i.a, i.b];

    if (i.screw)
      return ruleFinding('screw-in-part', 'note', {
        agentText: `${i.screw.id} goes ${depth} into ${i.screw.into}. Check it lands in a tapped hole.`,
        ids,
      });

    if (i.insert)
      return ruleFinding('insert-hole', 'blocker', {
        agentText: `${i.insert.id} needs a Ø${i.insert.needMm} hole; it has Ø${i.insert.holeMm}.`,
        ids,
      });

    return ruleFinding('clash', 'blocker', {
      text: `These parts overlap by ${depth}.`,
      agentText: `${i.a} and ${i.b} overlap by ${depth}.`,
      ids,
    });
  });
}

export function bomFindings(bom: Bom): Finding[] {
  const elsewhere = bom.madeElsewhere.map((m) =>
    ruleFinding('no-source', 'blocker', {
      agentText: `${m.name} has no source (${m.process}). Add it with add_sourced_item, or print it.`,
      ids: [m.id],
    }),
  );
  const standIns = bom.standIns.map((m) =>
    ruleFinding('stand-in', 'blocker', { agentText: `${m.name} is a stand-in, not a real part.`, ids: [m.id] }),
  );
  const unpriced = bom.lines.filter((l) => l.status === 'unchecked' && l.toBuy > 0 && l.estUsd === undefined);

  return [
    ...elsewhere,
    ...standIns,
    ...(unpriced.length
      ? [
          ruleFinding('no-price', 'note', {
            text: `No price for ${unpriced.map((l) => l.name).join(', ')}.`,
            agentText: `No price known for ${unpriced.map((l) => l.name).join(', ')}.`,
            ids: unpriced.flatMap((l) => l.partIds),
          }),
        ]
      : []),
  ];
}
