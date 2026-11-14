import type { WorldLook, WorldLooks } from '../cases/worldSet';
import type { WorldItem } from './mjcfTypes';

const looked = new WeakMap<WorldItem, { look: WorldLook; item: WorldItem }>();

function withLook(item: WorldItem, look: WorldLook | undefined): WorldItem {
  if (!look) return item;

  const kept = looked.get(item);

  if (kept && kept.look.color === look.color && kept.look.visible === look.visible) return kept.item;

  const next: WorldItem = {
    ...item,
    ...(look.color ? { color: look.color } : {}),
    ...(look.visible === false ? { visible: false } : {}),
  };

  looked.set(item, { look, item: next });

  return next;
}

export const withLooks = (items: WorldItem[], looks: WorldLooks): WorldItem[] =>
  Object.keys(looks).length ? items.map((item) => withLook(item, looks[item.id])) : items;
