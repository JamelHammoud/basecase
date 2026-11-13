import type { Lens } from '../../cameras/lens';
import { lensLabel } from '../../cameras/lens';
import type { CameraView } from '../../cameras/views';
import type { ContextMenuEntry } from '../../design-system';
import { MenuItem } from '../../design-system/PopoverMenu';

export const LENS_CHOICES: Lens[] = [
  { model: 'pinhole', hfovDeg: 60 },
  { model: 'pinhole', hfovDeg: 90 },
  { model: 'fisheye', fovDeg: 180 },
  { model: 'fisheye', fovDeg: 235 },
];

const sameLens = (a: Lens, b: Lens) =>
  a.model === b.model &&
  Math.round(a.model === 'fisheye' ? a.fovDeg : a.hfovDeg) === Math.round(b.model === 'fisheye' ? b.fovDeg : b.hfovDeg);

export interface CameraMenuActions {
  lookThrough: (view: CameraView) => void;
  startRename: (view: CameraView) => void;
  reframe: (id: string) => void;
  setLens: (id: string, lens: Lens) => void;
  remove: (id: string) => void;
  setPartLens: (partId: string, lens: Lens | undefined) => void;
}

function lensSubmenu(view: CameraView, actions: CameraMenuActions): ContextMenuEntry {
  const choose = (lens: Lens | undefined) => {
    if (view.fixed) actions.setLens(view.fixed, lens ?? view.lens);
    else if (view.part) actions.setPartLens(view.part, lens);
  };

  return {
    label: 'Lens',
    submenu: (close) => (
      <>
        {view.part && <MenuItem label="Catalog Lens" onSelect={() => (choose(undefined), close())} />}
        {LENS_CHOICES.map((lens) => (
          <MenuItem
            key={lensLabel(lens)}
            label={lensLabel(lens)}
            checked={sameLens(lens, view.lens)}
            onSelect={() => {
              choose(lens);
              close();
            }}
          />
        ))}
      </>
    ),
  };
}

export function cameraMenu(view: CameraView, actions: CameraMenuActions): ContextMenuEntry[] {
  const fixed = view.fixed;
  const entries: ContextMenuEntry[] = [
    { heading: view.label },
    { label: 'Look Through', onSelect: () => actions.lookThrough(view) },
    { label: 'Rename', onSelect: () => actions.startRename(view) },
    lensSubmenu(view, actions),
  ];

  if (!fixed) return entries;

  return [
    ...entries,
    { label: 'Use Current View', onSelect: () => actions.reframe(fixed) },
    { divider: true },
    { label: 'Delete', tone: 'danger', onSelect: () => actions.remove(fixed) },
  ];
}
