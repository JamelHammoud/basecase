import type { Command } from '../components/CommandPalette';
import {
  CrosshairIcon,
  GridIcon,
  HandIcon,
  KeyboardIcon,
  PackageIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PlusIcon,
  RotateIcon,
  SearchIcon,
  SettingsIcon,
  ShapeIcon,
  SparklesIcon,
} from '../design-system';
import { CAMERA_VIEWS } from '../data/cameraViews';
import { CATEGORY_LABELS, PART_CATALOG, catalogKey, hardwareVariant } from '../data/catalog';
import { HARDWARE_BY_TYPE, hardwareName } from '../data/hardware';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

function panelCommands({ core, ui }: CommandInputs): Command[] {
  const { studio, tool } = core;

  return [
    ...CAMERA_VIEWS.map((v) => ({
      id: `view-${v.id}`,
      group: 'View',
      label: `${v.label} View`,
      shortcut: v.shortcut,
      icon: <ShapeIcon className={ic} />,
      keywords: 'camera',
      run: () => ui.setCameraView(v.id),
    })),
    {
      id: 'find-parts',
      group: 'View',
      label: 'Find Parts',
      shortcut: '⌘F',
      icon: <SearchIcon className={ic} />,
      keywords: 'search catalog servo screw component hardware',
      run: ui.findParts,
    },
    {
      id: 'toggle-left',
      group: 'View',
      label: studio.isLeftOpen ? 'Hide Sidebar' : 'Show Sidebar',
      shortcut: '⌘B',
      icon: <PanelLeftIcon className={ic} />,
      run: ui.toggleLeft,
    },
    {
      id: 'toggle-right',
      group: 'View',
      label: studio.isRightOpen ? 'Hide Inspector' : 'Show Inspector',
      shortcut: '⌘I',
      icon: <PanelRightIcon className={ic} />,
      run: ui.toggleRight,
    },
    {
      id: 'build',
      group: 'View',
      label: 'Open Build',
      icon: <PackageIcon className={ic} />,
      keywords: 'bom bill of materials budget buy price amazon print filament',
      run: () => tool.openRightTab('build'),
    },
    {
      id: 'agent',
      group: 'View',
      label: 'Open Agent',
      icon: <SparklesIcon className={ic} />,
      keywords: 'ai chat',
      run: () => tool.openRightTab('acp'),
    },
  ];
}

function displayCommands({ core, ui }: CommandInputs): Command[] {
  const { studio } = core;
  const orbit = studio.trackpadMode === 'orbit-scroll';

  return [
    {
      id: 'toggle-grid',
      group: 'View',
      label: studio.showGrid ? 'Hide Grid' : 'Show Grid',
      icon: <GridIcon className={ic} />,
      run: ui.toggleGrid,
    },
    {
      id: 'zoom-selection',
      group: 'View',
      label: 'Zoom to Selection',
      shortcut: 'Z',
      icon: <CrosshairIcon className={ic} />,
      run: ui.focusSelected,
    },
    {
      id: 'toggle-trackpad',
      group: 'View',
      label: orbit ? 'Scroll to Pan' : 'Scroll to Orbit',
      icon: orbit ? <HandIcon className={ic} /> : <RotateIcon className={ic} />,
      keywords: 'trackpad two-finger gesture',
      run: ui.toggleTrackpad,
    },
    {
      id: 'settings',
      group: 'App',
      label: 'Settings',
      shortcut: '⌘,',
      icon: <SettingsIcon className={ic} />,
      keywords: 'preferences grid snap trackpad',
      run: () => studio.openSettings(),
    },
    {
      id: 'agent-settings',
      group: 'App',
      label: 'Agent Settings',
      icon: <SettingsIcon className={ic} />,
      keywords: 'claude offline command target height',
      run: () => studio.openSettings('agent'),
    },
    {
      id: 'shortcuts',
      group: 'App',
      label: 'Keyboard Shortcuts',
      shortcut: '?',
      icon: <KeyboardIcon className={ic} />,
      run: () => studio.openSettings('shortcuts'),
    },
  ];
}

function catalogCommands({ core, actions }: CommandInputs): Command[] {
  const { creation } = actions;

  return [
    ...PART_CATALOG.filter((item) => !item.hardware).map((item) => ({
      id: `add-${catalogKey(item)}`,
      group: 'Add Part',
      label: item.name,
      icon: <PlusIcon className={ic} />,
      keywords: `${CATEGORY_LABELS[item.category].label} ${item.description} ${item.keywords ?? ''}`,
      run: () => creation.addCatalogItem(item),
    })),
    ...PART_CATALOG.filter((item) => item.hardware).flatMap((item) =>
      HARDWARE_BY_TYPE[item.hardware!.type].sizes.map((size) => {
        const v = hardwareVariant(item, size);

        return {
          id: `add-${catalogKey(item)}-${size}`,
          group: 'Add Hardware',
          label: hardwareName(v.hardware!),
          icon: <PlusIcon className={ic} />,
          keywords: `hardware ${size.toLowerCase()} ${item.description}`,
          run: () => creation.addCatalogItem(v),
        };
      }),
    ),
    ...core.studio.customModels.map((m) => ({
      id: `model-${m.id}`,
      group: 'Insert Model',
      label: m.name,
      icon: <ShapeIcon className={ic} />,
      run: () => creation.placeCustomModel(m),
    })),
  ];
}

export const viewCommands = (inputs: CommandInputs): Command[] => [
  ...panelCommands(inputs),
  ...displayCommands(inputs),
  ...catalogCommands(inputs),
];
