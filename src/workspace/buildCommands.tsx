import { powerReplayCommands } from './powerReplayCommands';
import { setSupplierOffersOpen } from '../components/build/offerDialog';
import { cableCommands } from './cableCommands';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { ReactNode } from 'react';
import { bomCart } from '../components/build/cart';
import { knownPurchases } from '../components/build/usePurchases';
import type { Command } from '../components/CommandPalette';
import { ExternalLinkIcon, PackageIcon, RefreshIcon, PlusIcon } from '../design-system';
import { isBuilt } from '../guide/guidePlan';
import { buildBom } from '../utils/bom';
import { openLink } from '../utils/openLink';
import type { CommandInputs } from './sceneCommands';
import { currentWiring } from '../readiness/currentWiring';

function buyAllCommand({ core }: CommandInputs): Command[] {
  const { parts, project, printing } = core;
  const input = { parts, project, purchases: knownPurchases() ?? {}, measures: printing.measures };
  const bom = buildBom({ ...input, wiring: currentWiring(core.readiness) });
  const { amazonUrl } = bomCart(bom.lines);

  if (!amazonUrl) return [];

  return [
    {
      id: 'buy-all',
      group: 'Scene',
      label: 'Buy All',
      icon: <ExternalLinkIcon />,
      keywords: 'amazon cart order shop purchase bill of materials bom parts store',
      run: async () => {
        const wiring = await core.viewportRef.current?.wiring({ parts, project });

        if (parts !== core.docs.partsRef.current || project !== core.docs.projectRef.current) return;

        const cart = bomCart(buildBom({ ...input, wiring }).lines);

        if (cart.amazonUrl) openLink(cart.amazonUrl);
      },
    },
  ];
}

function buildAlongCommand({ core }: CommandInputs): Command[] {
  if (!core.parts.some(isBuilt)) return [];

  return [
    {
      id: 'create-build',
      group: 'Scene',
      label: 'Make Build',
      icon: <PackageIcon />,
      keywords: 'kit frozen assembly progress',
      run: () => {
        core.tool.openRightTab('build');
        core.buildAlong.requestCreate();
      },
    },
    {
      id: 'build-along',
      group: 'Scene',
      label: 'Build Along',
      icon: <PackageIcon />,
      keywords: 'build guide assembly instructions steps servo bus ids assemble kit',
      run: () => void core.buildAlong.open(),
    },
  ];
}

const GUIDE_KEYWORDS = 'build guide assembly instructions pdf manual steps';

function guideCommands({ core }: CommandInputs): Command[] {
  const { guide, parts, tool } = core;
  const make = (id: string, label: string, icon: ReactNode): Command => ({
    id,
    group: 'Scene',
    label,
    icon,
    keywords: GUIDE_KEYWORDS,
    run: () => {
      tool.openRightTab('build');
      void guide.generate();
    },
  });

  if (guide.progress) return [];

  if (!guide.record) return parts.some(isBuilt) ? [make('guide-make', 'Make Build Guide', <PackageIcon />)] : [];

  const open: Command = {
    id: 'guide-open',
    group: 'Scene',
    label: 'Open Build Guide',
    icon: <PackageIcon />,
    keywords: GUIDE_KEYWORDS,
    run: () => void guide.open(),
  };

  return guide.stale ? [open, make('guide-update', 'Update Build Guide', <RefreshIcon />)] : [open];
}

function supplierOfferCommands({ core }: CommandInputs): Command[] {
  if (core.buildAlong?.frozen) return [];

  return [
    {
      id: 'supplier-offers',
      group: 'Scene',
      label: 'Supplier Offers',
      icon: <PackageIcon />,
      keywords: 'quote import purchasing csv supplier arrival',
      run: () => {
        core.tool.openRightTab('build');
        setSupplierOffersOpen(true);
      },
    },
  ];
}

export const buildCommands = (inputs: CommandInputs): Command[] => [
  ...powerReplayCommands(inputs),
  ...supplierOfferCommands(inputs),
  ...(inputs.core.buildAlong?.frozen
    ? [
        {
          id: 'repair-build',
          group: 'Scene' as const,
          label: 'Repair Build',
          icon: <PackageIcon />,
          keywords: 'repair revision replace retained build',
          run: () => {
            inputs.core.tool.openRightTab('build');
            inputs.core.buildAlong.requestRepair();
          },
        },
      ]
    : []),

  ...(inputs.core.cradle?.available
    ? [
        {
          id: 'make-assembly-cradle',
          group: 'Scene' as const,
          label: 'Make Assembly Cradle',
          icon: <PackageIcon />,
          keywords: 'assembly fixture cradle tooling print',
          run: inputs.core.cradle.show,
        },
      ]
    : []),
  ...(inputs.core.project.electronicsBoard
    ? [
        {
          id: 'edit-board',
          group: 'Scene',
          label: 'Edit Board',
          icon: <PackageIcon />,
          keywords: 'electronics pcb kicad outline placement',
          run: () => void inputs.actions.board.define(),
        },
        ...(!IS_WEB_DEMO
          ? [
              {
                id: 'route-board',
                group: 'Scene' as const,
                label: 'Route Board',
                icon: <PackageIcon />,
                keywords: 'electronics pcb kicad local copper',
                run: () => void inputs.actions.board.route(),
              },
            ]
          : []),
        {
          id: 'import-board',
          group: 'Scene',
          label: 'Import Board',
          icon: <PackageIcon />,
          keywords: 'electronics pcb kicad routed copper',
          run: () => void inputs.actions.board.importBoard(),
        },
        {
          id: 'arrange-board',
          group: 'Scene',
          label: 'Arrange Board',
          icon: <RefreshIcon />,
          keywords: 'electronics pcb kicad placement',
          run: () => void inputs.actions.board.arrange(),
        },
      ]
    : []),
  ...(!inputs.core.project.electronicsBoard && inputs.core.parts.length
    ? [
        {
          id: 'define-board',
          group: 'Scene',
          label: 'Define Board',
          icon: <PlusIcon />,
          keywords: 'electronics pcb kicad outline placement',
          run: () => void inputs.actions.board.define(),
        },
      ]
    : []),
  ...cableCommands(inputs),
  ...guideCommands(inputs),
  ...buildAlongCommand(inputs),
  ...buyAllCommand(inputs),
];
