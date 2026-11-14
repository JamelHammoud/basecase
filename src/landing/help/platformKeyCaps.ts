import { platformKeys } from '../../design-system/platformKeys';
import { IS_MAC } from '../../utils/os';

export function showPlatformKeys(root: ParentNode, mac = IS_MAC) {
  if (mac) return;

  for (const combo of root.querySelectorAll('[data-keys]')) {
    const caps = [...combo.querySelectorAll('kbd')];
    const keys = platformKeys(
      caps.map((cap) => cap.textContent ?? ''),
      false,
    );

    caps.forEach((cap, index) => (cap.textContent = keys[index]));
  }
}
