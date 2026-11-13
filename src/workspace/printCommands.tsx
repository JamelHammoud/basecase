import type { Command } from '../components/CommandPalette';
import { PrinterIcon } from '../design-system';
import { groupNames } from '../print/merge/mergeText';
import type { CommandInputs } from './sceneCommands';

export function fitTestCommands({ core }: Pick<CommandInputs, 'core'>): Command[] {
  if (!core.printing.canFitTest) return [];

  return [
    {
      id: 'print-fit-test',
      group: 'Scene',
      label: 'Print Fit Test',
      icon: <PrinterIcon className="w-4 h-4" />,
      keywords: 'fit test coupon tolerance pocket servo insert bearing screw hole clearance plate',
      run: () => void core.printing.startFitTest(),
    },
  ];
}

export function mergeCommands({ core }: Pick<CommandInputs, 'core'>): Command[] {
  const { merges } = core.printing;
  const names = new Map(core.parts.map((p) => [p.id, p.name]));
  const nameOf = (id: string) => names.get(id) ?? id;

  return merges.groups.map((g) => ({
    id: `merge-${g.ids.join('-')}`,
    group: 'Scene',
    label: `Merge ${groupNames(g, nameOf)}`,
    icon: <PrinterIcon className="w-4 h-4" />,
    keywords: 'merge combine union consolidate one print fewer parts screws',
    run: () => void merges.merge(g),
  }));
}
