import type { Command } from '../components/CommandPalette';
import { PrinterIcon } from '../design-system';
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
