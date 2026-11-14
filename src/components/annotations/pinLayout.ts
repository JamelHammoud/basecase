import type { SceneAnnotation, ScenePart } from '../../types/robotics';
import { annotationWorldPosition } from '../../utils/aiHandoff';
import type { Viewport3DHandle } from '../Viewport3D';

export const CARD_WIDTH = 320;
export const DRAFT_KEY = '__draft__';

type ScreenPoint = { x: number; y: number; visible: boolean };

export interface LayoutState {
  shown: SceneAnnotation[];
  parts: ScenePart[];
  draft: { position: [number, number, number] } | null;
  activeId: string | null;
}

function cardOffset(anchor: ScreenPoint, layer: { width: number; height: number }, cardHeight: number) {
  const flipped = anchor.x + 42 + CARD_WIDTH > layer.width - 12;
  const left = Math.max(12, flipped ? anchor.x - 12 - CARD_WIDTH : anchor.x + 42);
  const top = Math.max(60, Math.min(layer.height - cardHeight - 96, anchor.y - 40));

  return `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

function pinTargets({ shown, parts, draft }: LayoutState) {
  const keys: string[] = shown.map((a) => a.id);
  const points = shown.map((a) => annotationWorldPosition(a, parts));

  if (draft) {
    keys.push(DRAFT_KEY);
    points.push(draft.position);
  }

  return { keys, points };
}

const anchorKey = ({ draft, activeId }: LayoutState) => (draft ? DRAFT_KEY : activeId);

function placePin(el: HTMLElement | undefined, p: ScreenPoint) {
  if (!el) return;

  el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
  el.style.visibility = p.visible ? 'visible' : 'hidden';
}

interface PinElements {
  layer: HTMLElement;
  card: HTMLElement | null;
  pins: Map<string, HTMLElement>;
}

export function watchPinLayout(
  viewport: Pick<Viewport3DHandle, 'projectPoints' | 'onRender'>,
  state: LayoutState,
  { layer, card, pins }: PinElements,
) {
  if (!state.shown.length && !state.draft) return () => {};

  const { keys, points } = pinTargets(state);
  const anchorAt = keys.indexOf(anchorKey(state) as string);
  const layout = () => {
    const projected = viewport.projectPoints(points);

    keys.forEach((key, i) => placePin(pins.get(key), projected[i]));

    const anchor = anchorAt === -1 ? null : projected[anchorAt];

    if (!card || !anchor) return;

    card.style.transform = cardOffset(
      anchor,
      { width: layer.clientWidth, height: layer.clientHeight },
      card.offsetHeight,
    );
    card.style.visibility = 'visible';
  };
  const stop = viewport.onRender(layout);
  const observer = new ResizeObserver(layout);

  observer.observe(layer);

  if (card) observer.observe(card);

  layout();

  return () => {
    stop();
    observer.disconnect();
  };
}
