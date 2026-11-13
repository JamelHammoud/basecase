import type { Command } from '../components/CommandPalette';
import { PrinterIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

export function printCommands({ core, actions }: CommandInputs): Command[] {
  const { exports } = actions;

  return [
    {
      id: 'export-3mf',
      group: 'Scene',
      label: 'Export 3MF Plates',
      icon: <PrinterIcon className={ic} />,
      keywords: 'print plates slicer bambu prusa orca download',
      run: () => void exports.export3mf(),
    },
    {
      id: 'lay-out-plates',
      group: 'Scene',
      label: 'Lay Out Plates',
      shortcut: '⌘P',
      icon: <PrinterIcon className={ic} />,
      keywords: 'print plates bed printer slice',
      run: () => core.printing.openMode(1),
    },
    {
      id: 'check-ready',
      group: 'Scene',
      label: 'Run Checks',
      icon: <PrinterIcon className={ic} />,
      keywords: 'ready to build buildable audit blockers build check assemble',
      run: () => {
        core.tool.setRightTab('build');
        void core.readiness.checkNow();
      },
    },
    ...(core.printing.canFitTest
      ? [
          {
            id: 'print-fit-test',
            group: 'Scene',
            label: 'Print Fit Test',
            icon: <PrinterIcon className={ic} />,
            keywords: 'fit test coupon tolerance pocket servo insert bearing screw hole clearance plate',
            run: () => void core.printing.startFitTest(),
          },
        ]
      : []),
    {
      id: 'slice-plates',
      group: 'Scene',
      label: 'Slice Plates',
      icon: <PrinterIcon className={ic} />,
      keywords: 'print slicer bambu studio orca gcode',
      run: () => void core.printing.job.runSlice(),
    },
  ];
}
