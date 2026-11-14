import type { ReactNode } from 'react';
import { bomCart } from '../components/build/cart';
import { knownPurchases } from '../components/build/usePurchases';
import type { Command } from '../components/CommandPalette';
import { ExternalLinkIcon, PackageIcon, RefreshIcon } from '../design-system';
import { isBuilt } from '../guide/guidePlan';
import { buildBom } from '../utils/bom';
import { openLink } from '../utils/openLink';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

function buyAllCommand({ core }: CommandInputs): Command[] {
  const { parts, project, printing } = core;
  const bom = buildBom({ parts, project, purchases: knownPurchases() ?? {}, measures: printing.measures });
  const { amazonUrl } = bomCart(bom.lines);

  if (!amazonUrl) return [];

  return [
    {
      id: 'buy-all',
      group: 'Scene',
      label: 'Buy All',
      icon: <ExternalLinkIcon className={ic} />,
      keywords: 'amazon cart order shop purchase bill of materials bom parts store',
      run: () => openLink(amazonUrl),
    },
  ];
}

function buildAlongCommand({ core }: CommandInputs): Command[] {
  if (!core.parts.some(isBuilt)) return [];

  return [
    {
      id: 'build-along',
      group: 'Scene',
      label: 'Build Along',
      icon: <PackageIcon className={ic} />,
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

  if (!guide.record)
    return parts.some(isBuilt) ? [make('guide-make', 'Make Build Guide', <PackageIcon className={ic} />)] : [];

  const open: Command = {
    id: 'guide-open',
    group: 'Scene',
    label: 'Open Build Guide',
    icon: <PackageIcon className={ic} />,
    keywords: GUIDE_KEYWORDS,
    run: () => void guide.open(),
  };

  return guide.stale ? [open, make('guide-update', 'Update Build Guide', <RefreshIcon className={ic} />)] : [open];
}

export const buildCommands = (inputs: CommandInputs): Command[] => [
  ...guideCommands(inputs),
  ...buildAlongCommand(inputs),
  ...buyAllCommand(inputs),
];
