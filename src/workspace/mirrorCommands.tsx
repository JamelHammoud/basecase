import type { Command } from '../components/CommandPalette';
import { MirrorPlaneItems } from '../components/MirrorPlaneItems';
import { MirrorIcon, type ContextMenuEntry } from '../design-system';
import { lastPlaneView } from '../mirror/plane';
import type { Mirror } from './useMirror';

export const mirrorMenuEntry = (mirror: Mirror): ContextMenuEntry => ({
  label: 'Mirror',
  icon: <MirrorIcon />,
  submenuWidth: 180,
  submenu: (close) => (
    <MirrorPlaneItems
      current={lastPlaneView()}
      onPick={(view) => {
        close();
        mirror.mirrorSelected(view);
      }}
    />
  ),
});

export const mirrorCommand = (mirror: Mirror): Command => ({
  id: 'mirror',
  group: 'Selection',
  label: 'Mirror',
  icon: <MirrorIcon />,
  keywords: 'symmetry symmetric flip opposite side left right twin copy',
  run: () => mirror.mirrorSelected(),
});
