export interface ListPrice {
  usd: number;
  per: number;
  store: string;
  url: string;
  seen: string;
}

export const LIST_PRICES: Record<string, ListPrice> = {
  'component:feetech-sts3215|c018': {
    usd: 21.99,
    per: 1,
    store: 'Waveshare (ST3215, the same 12 V 30 kg·cm servo)',
    url: 'https://www.waveshare.com/st3215-servo.htm',
    seen: '2026-10-17',
  },
  'component:feetech-sts3215|c001': {
    usd: 21.99,
    per: 1,
    store: 'Seeed Studio',
    url: 'https://www.seeedstudio.com/STS3215-19kg-cm-7-4V-Serial-Servo-p-6338.html',
    seen: '2026-10-17',
  },
  'component:feetech-sts3215|c044': {
    usd: 21.99,
    per: 1,
    store: 'Seeed Studio',
    url: 'https://www.seeedstudio.com/Feetech-ST-3215-C044-Heavy-Duty-Servo-7-4V-1-191-Gear-Reduction-p-6460.html',
    seen: '2026-10-17',
  },
  'component:waveshare-bus-servo-adapter-a': {
    usd: 4.99,
    per: 1,
    store: 'Waveshare',
    url: 'https://www.waveshare.com/bus-servo-adapter-a.htm',
    seen: '2026-10-17',
  },
  'component:raspberry-pi-5': {
    usd: 110,
    per: 1,
    store: 'PiShop.us (4 GB)',
    url: 'https://www.pishop.us/product/raspberry-pi-5-4gb/',
    seen: '2026-10-17',
  },
  'component:raspberry-pi-camera-3': {
    usd: 29.25,
    per: 1,
    store: 'Adafruit',
    url: 'https://www.adafruit.com/product/5657',
    seen: '2026-10-17',
  },
  'component:raspberry-pi-camera-3-wide': {
    usd: 38.5,
    per: 1,
    store: 'Adafruit (Wide option)',
    url: 'https://www.adafruit.com/product/5657',
    seen: '2026-10-17',
  },
  'component:adafruit-bno085': {
    usd: 29.5,
    per: 1,
    store: 'Adafruit',
    url: 'https://www.adafruit.com/product/4754',
    seen: '2026-10-17',
  },
  'supply:pi5-active-cooler': {
    usd: 13.5,
    per: 1,
    store: 'Adafruit',
    url: 'https://www.adafruit.com/product/5815',
    seen: '2026-10-17',
  },
  'supply:pi5-camera-cable-200': {
    usd: 2.7,
    per: 1,
    store: 'Adafruit',
    url: 'https://www.adafruit.com/product/5818',
    seen: '2026-10-17',
  },
  'supply:stemma-qt-cable': {
    usd: 0.95,
    per: 1,
    store: 'Adafruit (100 mm)',
    url: 'https://www.adafruit.com/product/4210',
    seen: '2026-10-17',
  },
  'supply:buck-5v-5a': {
    usd: 32.95,
    per: 1,
    store: 'Pololu (D24V50F5)',
    url: 'https://www.pololu.com/product/2851',
    seen: '2026-10-17',
  },
  'supply:lipo-3s-2200': {
    usd: 29.99,
    per: 1,
    store: 'ReadyMadeRC (Gens Ace 25C)',
    url: 'https://readymaderc.com/products/details/gens-ace-2200mah-3s-lipo-battery',
    seen: '2026-10-17',
  },
  'supply:lipo-balance-charger': {
    usd: 35.99,
    per: 1,
    store: 'RaceDayQuads (ToolkitRC M4AC)',
    url: 'https://www.racedayquads.com/products/toolkitrc-m4ac-30w-2-5a-2-4s-ac-smart-charger-xt60',
    seen: '2026-10-17',
  },
  'supply:lipo-safe-bag': {
    usd: 10.99,
    per: 1,
    store: 'RaceDayQuads (RDQ LiPo Bag)',
    url: 'https://www.racedayquads.com/products/rdq-lipo-bag-choose-your-color',
    seen: '2026-10-17',
  },
  'supply:xt60-pigtail': {
    usd: 3.99,
    per: 1,
    store: 'RaceDayQuads (Flywoo male + female pair)',
    url: 'https://www.racedayquads.com/products/flywoo-xt60h-14awg-black-pigtail-2pcs-male-female',
    seen: '2026-10-17',
  },
  'supply:wire-18awg-silicone': {
    usd: 2.49,
    per: 1,
    store: 'RaceDayQuads (1 ft red + 1 ft black)',
    url: 'https://www.racedayquads.com/products/silicone-wire-2-ft-red-and-black-pair',
    seen: '2026-10-17',
  },
  'supply:round-lcd-128': {
    usd: 14.99,
    per: 1,
    store: 'Waveshare',
    url: 'https://www.waveshare.com/1.28inch-lcd-module.htm',
    seen: '2026-10-17',
  },
  'supply:microsd-64gb': {
    usd: 34.25,
    per: 1,
    store: 'B&H (SanDisk Extreme; search summary)',
    url: 'https://www.bhphotovideo.com/c/product/1770151-REG/sandisk_sdsqxah_064g_an6ma_64gb_extreme_uhs_i_microsdxc.html',
    seen: '2026-10-17',
  },
  'supply:filament-pla': {
    usd: 22.99,
    per: 1000,
    store: 'Bambu Lab US (PLA Basic; search summary)',
    url: 'https://us.store.bambulab.com/products/pla-basic-filament?id=565815336288092179',
    seen: '2026-10-17',
  },
  'supply:filament-petg': {
    usd: 18.99,
    per: 1000,
    store: 'Bambu Lab US (PETG HF; search summary)',
    url: 'https://us.store.bambulab.com/products/petg-hf',
    seen: '2026-10-17',
  },
  'supply:filament-tpu': {
    usd: 41.99,
    per: 1000,
    store: 'Bambu Lab US (TPU 95A HF; search summary)',
    url: 'https://us.store.bambulab.com/products/tpu-95a-hf',
    seen: '2026-10-17',
  },
  'hardware:socket_head|M3': {
    usd: 4.43,
    per: 100,
    store: 'Bolt Depot (A2 stainless; search summary)',
    url: 'https://www.boltdepot.com/Metric_socket_cap_Stainless_steel_18-8_(A-2)_3mm_x_0.5mm.aspx',
    seen: '2026-10-17',
  },
};

export function listPriceFor(key: string): ListPrice | undefined {
  if (LIST_PRICES[key]) return LIST_PRICES[key];

  if (key.startsWith('hardware:')) {
    const [type, size] = key.split('|');

    return LIST_PRICES[`${type}|${size}`];
  }

  return undefined;
}
