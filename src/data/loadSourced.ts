import { platformBridge } from '../utils/platformBridge';
import { registerSourced } from './sourcedItems';

let loaded: Promise<void> | null = null;

export function loadSourced(): Promise<void> {
  loaded ??= platformBridge
    .listSourced()
    .then(registerSourced)
    .catch(() => undefined);

  return loaded;
}
