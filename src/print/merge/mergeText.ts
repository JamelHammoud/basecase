import { joinAnd } from '../../assembly/reportText';
import { plural } from '../../../electron/plural.mjs';
import { mergeSavings, type LeftOut, type MergeGroup } from './mergeTypes';

type NameOf = (id: string) => string;

const CM3 = 1000;

function whyText(left: LeftOut, nameOf: NameOf): string {
  const { why } = left;

  if (why.code === 'seals') return `so ${nameOf(why.part)} can go in`;

  if (why.code === 'stuck') return `so ${nameOf(why.part)} can come out`;

  if (why.code === 'bed') return 'to fit the bed';

  return `to save ${Math.round(why.mm3 / CM3)} cm³ of support`;
}

export const leftOutText = (left: LeftOut, nameOf: NameOf) =>
  `${nameOf(left.id)} stays separate ${whyText(left, nameOf)}`;

export function savingsItems(group: MergeGroup): string[] {
  const saved = mergeSavings(group);

  return [
    `−${plural(saved.parts, 'part')}`,
    `−${plural(saved.screws, 'screw')}`,
    saved.steps > 0 ? `−${plural(saved.steps, 'step')}` : '',
  ].filter(Boolean);
}

export const groupNames = (group: MergeGroup, nameOf: NameOf) => joinAnd(group.ids.map(nameOf));

export function mergeLines(groups: MergeGroup[], nameOf: NameOf): string[] {
  if (!groups.length) return [];

  return [
    'Could print as one part (merge_parts with these ids, only when the user asks):',
    ...groups.flatMap((g) => [
      `- ids=[${g.ids.join(', ')}] ${groupNames(g, nameOf)}: ${savingsItems(g).join(', ')}.`,
      ...g.left.map((l) => `  ${leftOutText(l, nameOf)}.`),
    ]),
  ];
}
