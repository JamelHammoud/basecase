export const DEFAULT_FLEET_ADDRESS = 'http://127.0.0.1:7440';

export function fleetAddress(value: string): string | null {
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

    if (url.username || url.password || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')))
      return null;

    return url.origin;
  } catch {
    return null;
  }
}

export const savedFleetAddress = () => localStorage.getItem('fleet-address') ?? DEFAULT_FLEET_ADDRESS;

export function openFleet() {
  const address = fleetAddress(savedFleetAddress());

  if (address) window.open(`${address}/fleet`, '_blank', 'noopener');
}
