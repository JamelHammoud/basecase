import { createBambuConnect } from './bambuConnect.mjs';
import { createBambuLan } from './bambuLan.mjs';
import { createMoonraker } from './moonraker.mjs';
import { createOctoPrint } from './octoprint.mjs';
import { createPrusaLink } from './prusalink.mjs';

export { BAMBU_MODELS, discoverPrinters } from './discover.mjs';

export const CONNECTION_KINDS = ['bambu-connect', 'bambu-lan', 'moonraker', 'prusalink', 'octoprint'];

const FACTORIES = {
  'bambu-connect': (printer) => createBambuConnect(printer),
  'bambu-lan': (printer, secret) => createBambuLan(printer, secret),
  moonraker: createMoonraker,
  prusalink: createPrusaLink,
  octoprint: createOctoPrint,
};

export function connectorFor(printer, secret) {
  const factory = FACTORIES[printer?.connection?.kind];

  if (!factory) throw new Error('Choose how Basecase connects to this printer.');

  return factory(printer, secret || undefined);
}
