import { ALIGN_AXES } from '../components/alignActions';
import type { ScenePart } from '../types/robotics';

export interface SelectionFacts {
  selected: number;
  grouped: boolean;
  parts: number;
}

type Need = (facts: SelectionFacts) => boolean;

const atLeast =
  (n: number): Need =>
  (facts) =>
    facts.selected >= n;

const NEEDS = new Map<string, Need>([
  ['select-all', (facts) => facts.parts > 0],
  ['copy', atLeast(1)],
  ['cut', atLeast(1)],
  ['mirror', atLeast(1)],
  ['group', atLeast(2)],
  ['ungroup', (facts) => facts.grouped],
  ['union', atLeast(2)],
  ['subtract', atLeast(1)],
  ['intersect', atLeast(2)],
  ['floor', atLeast(1)],
  ['stack', (facts) => facts.selected === 1],
  ['zoom-selection', atLeast(1)],
  ...ALIGN_AXES.flatMap(({ spread, aligns }): Array<[string, Need]> => [
    [spread.id, atLeast(3)],
    ...aligns.map((a): [string, Need] => [a.id, atLeast(1)]),
  ]),
]);

export const selectionFacts = (selected: ScenePart[], parts: ScenePart[]): SelectionFacts => ({
  selected: selected.length,
  grouped: selected.some((p) => !!p.group),
  parts: parts.length,
});

export const canRunOnSelection = (commandId: string, facts: SelectionFacts) => NEEDS.get(commandId)?.(facts) ?? true;
