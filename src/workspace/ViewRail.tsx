import type { LeftTab } from '../components/LeftSidebar';
import {
  IconButton,
  LayersIcon,
  LibraryIcon,
  NO_DRAG_REGION,
  ObjectsIcon,
  PartsIcon,
  RobotsIcon,
  type GlyphProps,
  SettingsIcon,
} from '../design-system';

const LEFT_VIEWS: Array<{ value: LeftTab; label: string; Icon: React.FC<GlyphProps> }> = [
  { value: 'parts', label: 'Parts', Icon: PartsIcon },
  { value: 'robots', label: 'Robots', Icon: RobotsIcon },
  { value: 'objects', label: 'Objects', Icon: ObjectsIcon },
  { value: 'layers', label: 'Layers', Icon: LayersIcon },
  { value: 'library', label: 'Library', Icon: LibraryIcon },
];

const RAIL_BUTTON = 'w-[36px]! h-[36px]! rounded-[10px]!';

interface ViewRailProps {
  isLeftOpen: boolean;
  leftTab: LeftTab;
  onPickView: (view: LeftTab) => void;
  onOpenSettings: () => void;
}

export function ViewRail({ isLeftOpen, leftTab, onPickView, onOpenSettings }: ViewRailProps) {
  return (
    <nav
      aria-label="Sidebar views"
      className="absolute left-[8px] top-[48px] bottom-[12px] w-[36px] flex flex-col items-center gap-[4px]"
      style={NO_DRAG_REGION}
    >
      {LEFT_VIEWS.map((v) => {
        const open = isLeftOpen && leftTab === v.value;

        return (
          <IconButton
            key={v.value}
            icon={<v.Icon filled={open} />}
            title={v.label}
            tooltipSide="right"
            size="md"
            variant="ghost"
            isToggled={open}
            className={RAIL_BUTTON}
            onClick={() => onPickView(v.value)}
          />
        );
      })}
      <div className="flex-1" />
      <IconButton
        icon={<SettingsIcon className="w-[18px] h-[18px]" />}
        title="Settings"
        shortcut="⌘,"
        tooltipSide="right"
        size="md"
        variant="ghost"
        className={RAIL_BUTTON}
        onClick={onOpenSettings}
      />
    </nav>
  );
}
