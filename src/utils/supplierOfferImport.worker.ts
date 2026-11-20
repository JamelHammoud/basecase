import { importOffers } from './supplierOfferCsv';

self.onmessage = (event: MessageEvent<{ text: string; source: string }>) => {
  try {
    self.postMessage({ offers: importOffers(event.data.text, event.data.source) });
  } catch (cause) {
    self.postMessage({ error: (cause as Error).message });
  }
};
