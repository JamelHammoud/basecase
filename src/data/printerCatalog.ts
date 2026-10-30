import type { PrinterModel } from './printers';

export const PRINTER_CATALOG_SOURCE = { slicer: 'Bambu Studio', version: '02.08.04.61' };

export const PRINTER_MODELS: PrinterModel[] = [
  {
    id: 'anker-m5',
    maker: 'Anker',
    name: 'Anker M5',
    bed: [
      [0, 0],
      [235, 0],
      [235, 235],
      [0, 235],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Anker',
    presets: {
      machine: 'Anker M5 0.4 nozzle',
      process: '0.20mm Standard @Anker',
      processes: [
        {
          name: '0.10mm Detail @Anker',
          layer: 0.1,
        },
        {
          name: '0.15mm Fast @Anker',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Anker',
          layer: 0.2,
        },
        {
          name: '0.25mm Draft @Anker',
          layer: 0.25,
        },
        {
          name: '0.30mm Superdraft @Anker',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Anker',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Anker',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Anker',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Anker',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Anker',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'anker-m5c',
    maker: 'Anker',
    name: 'Anker M5C',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Anker',
    presets: {
      machine: 'Anker M5C 0.4 nozzle',
      process: '0.20mm Standard @Anker',
      processes: [
        {
          name: '0.10mm Detail @Anker',
          layer: 0.1,
        },
        {
          name: '0.15mm Fast @Anker',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Anker',
          layer: 0.2,
        },
        {
          name: '0.25mm Draft @Anker',
          layer: 0.25,
        },
        {
          name: '0.30mm Superdraft @Anker',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Anker',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Anker',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Anker',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Anker',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Anker',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'anycubic-4max-pro',
    maker: 'Anycubic',
    name: 'Anycubic 4Max Pro',
    bed: [
      [0, 0],
      [270, 0],
      [270, 205],
      [0, 205],
    ],
    height: 200,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Anycubic',
    presets: {
      machine: 'Anycubic 4Max Pro 0.4 nozzle',
      process: '0.20mm Standard @Anycubic 4MaxPro',
      processes: [
        {
          name: '0.20mm Standard @4MaxPro',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Anycubic',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Anycubic',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Anycubic',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Anycubic',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Anycubic',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'anycubic-4max-pro-2',
    maker: 'Anycubic',
    name: 'Anycubic 4Max Pro 2',
    bed: [
      [0, 0],
      [270, 0],
      [270, 210],
      [0, 210],
    ],
    height: 190,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Anycubic',
    presets: {
      machine: 'Anycubic 4Max Pro 2 0.4 nozzle',
      process: '0.20mm Standard @Anycubic 4MaxPro2',
      processes: [
        {
          name: '0.15mm Optimal @Anycubic 4MaxPro2',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Anycubic 4MaxPro2',
          layer: 0.2,
        },
        {
          name: '0.30mm Draft @Anycubic 4MaxPro2',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Anycubic',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Anycubic',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Anycubic',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Anycubic',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Anycubic',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'anycubic-chiron',
    maker: 'Anycubic',
    name: 'Anycubic Chiron',
    bed: [
      [0, 0],
      [400, 0],
      [400, 400],
      [0, 400],
    ],
    height: 450,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Anycubic',
    presets: {
      machine: 'Anycubic Chiron 0.4 nozzle',
      process: '0.20mm Standard @Anycubic Chiron',
      processes: [
        {
          name: '0.15mm Optimal @Anycubic Chiron',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Anycubic Chiron',
          layer: 0.2,
        },
        {
          name: '0.30mm Draft @Anycubic Chiron',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Anycubic',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Anycubic',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Anycubic',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Anycubic',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Anycubic',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'anycubic-i3-mega-s',
    maker: 'Anycubic',
    name: 'Anycubic i3 Mega S',
    bed: [
      [0, 0],
      [210, 0],
      [210, 210],
      [0, 210],
    ],
    height: 205,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Anycubic',
    presets: {
      machine: 'Anycubic i3 Mega S 0.4 nozzle',
      process: '0.20mm Standard @Anycubic i3MegaS',
      processes: [
        {
          name: '0.15mm Optimal @Anycubic i3MegaS',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Anycubic i3MegaS',
          layer: 0.2,
        },
        {
          name: '0.30mm Draft @Anycubic i3MegaS',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Anycubic',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Anycubic',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Anycubic',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Anycubic',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Anycubic',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'anycubic-kobra-2',
    maker: 'Anycubic',
    name: 'Anycubic Kobra 2',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Anycubic',
    presets: {
      machine: 'Anycubic Kobra 2 0.4 nozzle',
      process: '0.20mm Standard @Anycubic Kobra2',
      processes: [
        {
          name: '0.15mm Optimal @Anycubic Kobra2',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Anycubic Kobra2',
          layer: 0.2,
        },
        {
          name: '0.30mm Draft @Anycubic Kobra2',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Anycubic',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Anycubic',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Anycubic',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Anycubic',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Anycubic',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'anycubic-kobra-max',
    maker: 'Anycubic',
    name: 'Anycubic Kobra Max',
    bed: [
      [0, 0],
      [400, 0],
      [400, 400],
      [0, 400],
    ],
    height: 450,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Anycubic',
    presets: {
      machine: 'Anycubic Kobra Max 0.4 nozzle',
      process: '0.20mm Standard @Anycubic KobraMax',
      processes: [
        {
          name: '0.15mm Optimal @Anycubic KobraMax',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Anycubic KobraMax',
          layer: 0.2,
        },
        {
          name: '0.30mm Draft @Anycubic KobraMax',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Anycubic',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Anycubic',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Anycubic',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Anycubic',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Anycubic',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'anycubic-kobra-plus',
    maker: 'Anycubic',
    name: 'Anycubic Kobra Plus',
    bed: [
      [0, 0],
      [300, 0],
      [300, 300],
      [0, 300],
    ],
    height: 350,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Anycubic',
    presets: {
      machine: 'Anycubic Kobra Plus 0.4 nozzle',
      process: '0.20mm Standard @Anycubic KobraPlus',
      processes: [
        {
          name: '0.20mm Standard @Anycubic KobraPlus',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Anycubic',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Anycubic',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Anycubic',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Anycubic',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Anycubic',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'anycubic-vyper',
    maker: 'Anycubic',
    name: 'Anycubic Vyper',
    bed: [
      [0, 0],
      [250, 0],
      [250, 255],
      [0, 255],
    ],
    height: 265,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Anycubic',
    presets: {
      machine: 'Anycubic Vyper 0.4 nozzle',
      process: '0.20mm Standard @Anycubic Vyper',
      processes: [
        {
          name: '0.15mm Optimal @Anycubic Vyper',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Anycubic Vyper',
          layer: 0.2,
        },
        {
          name: '0.30mm Draft @Anycubic Vyper',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Anycubic',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Anycubic',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Anycubic',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Anycubic',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Anycubic',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-a1',
    maker: 'Bambu Lab',
    name: 'Bambu Lab A1',
    bed: [
      [0, 0],
      [256, 0],
      [256, 256],
      [0, 256],
    ],
    height: 256,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab A1 0.4 nozzle',
      process: '0.20mm Standard @BBL A1',
      processes: [
        {
          name: '0.08mm Extra Fine @BBL A1',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @BBL A1',
          layer: 0.12,
        },
        {
          name: '0.16mm High Quality @BBL A1',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL A1',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @BBL A1',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @BBL A1',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @BBL A1',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @BBL A1',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @BBL A1',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL A1',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU @BBL A1',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-a1-mini',
    maker: 'Bambu Lab',
    name: 'Bambu Lab A1 mini',
    bed: [
      [0, 0],
      [180, 0],
      [180, 180],
      [0, 180],
    ],
    height: 180,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab A1 mini 0.4 nozzle',
      process: '0.20mm Standard @BBL A1M',
      processes: [
        {
          name: '0.08mm Extra Fine @BBL A1M',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @BBL A1M',
          layer: 0.12,
        },
        {
          name: '0.16mm High Quality @BBL A1M',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL A1M',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @BBL A1M',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @BBL A1M',
          layer: 0.28,
        },
      ],
      filaments: {
        PETG: {
          name: 'Generic PETG @BBL A1M',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL A1M',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU @BBL A1M',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-a2l',
    maker: 'Bambu Lab',
    name: 'Bambu Lab A2L',
    bed: [
      [0, 0],
      [330, 0],
      [330, 320],
      [0, 320],
    ],
    height: 325,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab A2L 0.4 nozzle',
      process: '0.20mm Standard @BBL A2L',
      processes: [
        {
          name: '0.08mm High Quality @BBL A2L',
          layer: 0.08,
        },
        {
          name: '0.12mm High Quality @BBL A2L',
          layer: 0.12,
        },
        {
          name: '0.16mm Standard @BBL A2L',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL A2L',
          layer: 0.2,
        },
        {
          name: '0.24mm Standard @BBL A2L',
          layer: 0.24,
        },
      ],
      filaments: {
        PETG: {
          name: 'Generic PETG @BBL A2L',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL A2L 0.4 nozzle',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU @BBL A2L',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-h2c',
    maker: 'Bambu Lab',
    name: 'Bambu Lab H2C',
    bed: [
      [0, 0],
      [330, 0],
      [330, 320],
      [0, 320],
    ],
    height: 325,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab H2C 0.4 nozzle',
      process: '0.20mm Standard @BBL H2C',
      processes: [
        {
          name: '0.08mm High Quality @BBL H2C',
          layer: 0.08,
        },
        {
          name: '0.12mm High Quality @BBL H2C',
          layer: 0.12,
        },
        {
          name: '0.16mm Standard @BBL H2C',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL H2C',
          layer: 0.2,
        },
        {
          name: '0.24mm Standard @BBL H2C',
          layer: 0.24,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @BBL H2C 0.4 nozzle',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @BBL H2C 0.4 nozzle',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @BBL H2C 0.4 nozzle',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL H2C',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU @BBL H2C 0.4 nozzle',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-h2d',
    maker: 'Bambu Lab',
    name: 'Bambu Lab H2D',
    bed: [
      [0, 0],
      [350, 0],
      [350, 320],
      [0, 320],
    ],
    height: 325,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab H2D 0.4 nozzle',
      process: '0.20mm Standard @BBL H2D',
      processes: [
        {
          name: '0.08mm Extra Fine @BBL H2D',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @BBL H2D',
          layer: 0.12,
        },
        {
          name: '0.16mm Standard @BBL H2D',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL H2D',
          layer: 0.2,
        },
        {
          name: '0.24mm Standard @BBL H2D',
          layer: 0.24,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @BBL H2D',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @BBL H2D',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @BBL H2D',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL H2D',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU @BBL H2D',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-h2d-pro',
    maker: 'Bambu Lab',
    name: 'Bambu Lab H2D Pro',
    bed: [
      [0, 0],
      [350, 0],
      [350, 320],
      [0, 320],
    ],
    height: 325,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab H2D Pro 0.4 nozzle',
      process: '0.20mm Standard @BBL H2DP',
      processes: [
        {
          name: '0.08mm Extra Fine @BBL H2DP',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @BBL H2DP',
          layer: 0.12,
        },
        {
          name: '0.16mm Standard @BBL H2DP',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL H2DP',
          layer: 0.2,
        },
        {
          name: '0.24mm Standard @BBL H2DP',
          layer: 0.24,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @BBL H2DP',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @BBL H2DP',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @BBL H2DP',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL H2DP',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU @BBL H2DP',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-h2s',
    maker: 'Bambu Lab',
    name: 'Bambu Lab H2S',
    bed: [
      [0, 0],
      [340, 0],
      [340, 320],
      [0, 320],
    ],
    height: 340,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab H2S 0.4 nozzle',
      process: '0.20mm Standard @BBL H2S',
      processes: [
        {
          name: '0.08mm High Quality @BBL H2S',
          layer: 0.08,
        },
        {
          name: '0.12mm High Quality @BBL H2S',
          layer: 0.12,
        },
        {
          name: '0.16mm Standard @BBL H2S',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL H2S',
          layer: 0.2,
        },
        {
          name: '0.24mm Standard @BBL H2S',
          layer: 0.24,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @BBL H2S 0.4 nozzle',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @BBL H2S 0.4 nozzle',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @BBL H2S',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL H2S',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU @BBL H2S',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-p1p',
    maker: 'Bambu Lab',
    name: 'Bambu Lab P1P',
    bed: [
      [0, 0],
      [256, 0],
      [256, 256],
      [0, 256],
    ],
    height: 250,
    keepOut: [
      [
        [0, 0],
        [18, 0],
        [18, 28],
        [0, 28],
      ],
    ],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab P1P 0.4 nozzle',
      process: '0.20mm Standard @BBL P1P',
      processes: [
        {
          name: '0.08mm Extra Fine @BBL P1P',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @BBL P1P',
          layer: 0.12,
        },
        {
          name: '0.16mm High Quality @BBL P1P',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL P1P',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @BBL P1P',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @BBL P1P',
          layer: 0.28,
        },
      ],
      filaments: {
        ASA: {
          name: 'Bambu ASA @BBL X1C 0.4 nozzle',
          density: 1.05,
        },
        PETG: {
          name: 'Bambu PETG Basic @BBL X1C',
          density: 1.25,
        },
        PLA: {
          name: 'Overture PLA @BBL P1P',
          density: 1.2,
        },
        ABS: {
          name: 'PolyLite ABS @BBL P1P',
          density: 1.03,
        },
        TPU: {
          name: 'Bambu TPU 90A @BBL P1P',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-p1s',
    maker: 'Bambu Lab',
    name: 'Bambu Lab P1S',
    bed: [
      [0, 0],
      [256, 0],
      [256, 256],
      [0, 256],
    ],
    height: 250,
    keepOut: [
      [
        [0, 0],
        [18, 0],
        [18, 28],
        [0, 28],
      ],
    ],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab P1S 0.4 nozzle',
      process: '0.20mm Standard @BBL X1C',
      processes: [
        {
          name: '0.08mm Extra Fine @BBL X1C',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @BBL X1C',
          layer: 0.12,
        },
        {
          name: '0.16mm High Quality @BBL X1C',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL X1C',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @BBL X1C',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @BBL X1C',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL P1S 0.4 nozzle',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-p2s',
    maker: 'Bambu Lab',
    name: 'Bambu Lab P2S',
    bed: [
      [0, 0],
      [256, 0],
      [256, 256],
      [0, 256],
    ],
    height: 256,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab P2S 0.4 nozzle',
      process: '0.20mm Standard @BBL P2S',
      processes: [
        {
          name: '0.08mm High Quality @BBL P2S',
          layer: 0.08,
        },
        {
          name: '0.12mm High Quality @BBL P2S',
          layer: 0.12,
        },
        {
          name: '0.16mm Standard @BBL P2S',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL P2S',
          layer: 0.2,
        },
        {
          name: '0.24mm Standard @BBL P2S',
          layer: 0.24,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @BBL P2S',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @BBL P2S',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @BBL P2S',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL P2S',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU @BBL P2S',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-x1',
    maker: 'Bambu Lab',
    name: 'Bambu Lab X1',
    bed: [
      [0, 0],
      [256, 0],
      [256, 256],
      [0, 256],
    ],
    height: 250,
    keepOut: [
      [
        [0, 0],
        [18, 0],
        [18, 28],
        [0, 28],
      ],
    ],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab X1 0.4 nozzle',
      process: '0.20mm Standard @BBL X1C',
      processes: [
        {
          name: '0.08mm Extra Fine @BBL X1C',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @BBL X1C',
          layer: 0.12,
        },
        {
          name: '0.16mm High Quality @BBL X1C',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL X1C',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @BBL X1C',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @BBL X1C',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL X1',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-x1-carbon',
    maker: 'Bambu Lab',
    name: 'Bambu Lab X1 Carbon',
    bed: [
      [0, 0],
      [256, 0],
      [256, 256],
      [0, 256],
    ],
    height: 250,
    keepOut: [
      [
        [0, 0],
        [18, 0],
        [18, 28],
        [0, 28],
      ],
    ],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab X1 Carbon 0.4 nozzle',
      process: '0.20mm Standard @BBL X1C',
      processes: [
        {
          name: '0.08mm Extra Fine @BBL X1C',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @BBL X1C',
          layer: 0.12,
        },
        {
          name: '0.16mm High Quality @BBL X1C',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL X1C',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @BBL X1C',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @BBL X1C',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL X1C',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-x1e',
    maker: 'Bambu Lab',
    name: 'Bambu Lab X1E',
    bed: [
      [0, 0],
      [256, 0],
      [256, 256],
      [0, 256],
    ],
    height: 250,
    keepOut: [
      [
        [0, 0],
        [18, 0],
        [18, 28],
        [0, 28],
      ],
    ],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab X1E 0.4 nozzle',
      process: '0.20mm Standard @BBL X1C',
      processes: [
        {
          name: '0.08mm Extra Fine @BBL X1C',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @BBL X1C',
          layer: 0.12,
        },
        {
          name: '0.16mm High Quality @BBL X1C',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL X1C',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @BBL X1C',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @BBL X1C',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @BBL X1E',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @BBL X1E',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL X1C',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'bambu-lab-x2d',
    maker: 'Bambu Lab',
    name: 'Bambu Lab X2D',
    bed: [
      [0, 0],
      [256, 0],
      [256, 256],
      [0, 256],
    ],
    height: 261,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: 'Textured PEI Plate',
    vendor: 'BBL',
    presets: {
      machine: 'Bambu Lab X2D 0.4 nozzle',
      process: '0.20mm Standard @BBL X2D',
      processes: [
        {
          name: '0.08mm High Quality @BBL X2D',
          layer: 0.08,
        },
        {
          name: '0.12mm High Quality @BBL X2D',
          layer: 0.12,
        },
        {
          name: '0.16mm Standard @BBL X2D',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @BBL X2D',
          layer: 0.2,
        },
        {
          name: '0.24mm Standard @BBL X2D',
          layer: 0.24,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @BBL X2D 0.4 nozzle',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @BBL X2D 0.4 nozzle',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @BBL X2D 0.4 nozzle',
          density: 1.27,
        },
        PLA: {
          name: 'Bambu PLA Basic @BBL X2D 0.4 nozzle',
          density: 1.26,
        },
        TPU: {
          name: 'Generic TPU @BBL X2D 0.4 nozzle',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-cr-6-max',
    maker: 'Creality',
    name: 'Creality CR-6 Max',
    bed: [
      [5, 5],
      [395, 5],
      [395, 395],
      [5, 395],
    ],
    height: 400,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality CR-6 Max 0.4 nozzle',
      process: '0.20mm Normal @Creality CR-6',
      processes: [
        {
          name: '0.10mm HighDetail @Creality CR-6',
          layer: 0.1,
        },
        {
          name: '0.12mm Detail @Creality 0.4 CR-6',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Creality CR-6 0.4',
          layer: 0.16,
        },
        {
          name: '0.20mm Normal @Creality CR-6',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Creality CR-6',
          layer: 0.24,
        },
        {
          name: '0.28mm SuperDraft @Creality CR-6',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality CR-6',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality CR-6',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality CR-6',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-cr-6-se',
    maker: 'Creality',
    name: 'Creality CR-6 SE',
    bed: [
      [5, 0],
      [230, 0],
      [230, 235],
      [5, 235],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality CR-6 SE 0.4 nozzle',
      process: '0.20mm Normal @Creality CR-6',
      processes: [
        {
          name: '0.10mm HighDetail @Creality CR-6',
          layer: 0.1,
        },
        {
          name: '0.12mm Detail @Creality 0.4 CR-6',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Creality CR-6 0.4',
          layer: 0.16,
        },
        {
          name: '0.20mm Normal @Creality CR-6',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Creality CR-6',
          layer: 0.24,
        },
        {
          name: '0.28mm SuperDraft @Creality CR-6',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality CR-6',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality CR-6',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality CR-6',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-cr-10-max',
    maker: 'Creality',
    name: 'Creality CR-10 Max',
    bed: [
      [0, 0],
      [450, 0],
      [450, 450],
      [0, 450],
    ],
    height: 470,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality CR-10 Max 0.4 nozzle',
      process: '0.20mm Standard @Creality CR10Max',
      processes: [
        {
          name: '0.12mm Fine @Creality CR10Max',
          layer: 0.12,
        },
        {
          name: '0.15mm Optimal @Creality CR10Max',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Creality CR10Max',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Creality CR10Max',
          layer: 0.24,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-cr-10-v2',
    maker: 'Creality',
    name: 'Creality CR-10 V2',
    bed: [
      [0, 0],
      [300, 0],
      [300, 300],
      [0, 300],
    ],
    height: 400,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality CR-10 V2 0.4 nozzle',
      process: '0.20mm Standard @Creality CR10V2',
      processes: [
        {
          name: '0.16mm Optimal @Creality CR10V2',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Creality CR10V2',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-ender-3-s1',
    maker: 'Creality',
    name: 'Creality Ender-3 S1',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 270,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality Ender-3 S1 0.4 nozzle',
      process: '0.20mm Standard @Creality Ender3S1',
      processes: [
        {
          name: '0.16mm Optimal @Creality Ender3S1',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Creality Ender3S1',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-ender-3-s1-pro',
    maker: 'Creality',
    name: 'Creality Ender-3 S1 Pro',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 270,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality Ender-3 S1 Pro 0.4 nozzle',
      process: '0.20mm Standard @Creality Ender3S1Pro',
      processes: [
        {
          name: '0.16mm Optimal @Creality Ender3S1Pro',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Creality Ender3S1Pro',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-ender-3-v2',
    maker: 'Creality',
    name: 'Creality Ender-3 V2',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality Ender-3 V2 0.4 nozzle',
      process: '0.20mm Standard @Creality Ender3V2',
      processes: [
        {
          name: '0.12mm Fine @Creality Ender3V2',
          layer: 0.12,
        },
        {
          name: '0.15mm Optimal @Creality Ender3V2',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Creality Ender3V2',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Creality Ender3V2',
          layer: 0.24,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-ender-3-v3',
    maker: 'Creality',
    name: 'Creality Ender-3 V3',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4, 0.6],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality Ender-3 V3 0.4 nozzle',
      process: '0.20mm Standard @Creality Ender3V3 0.4 nozzle',
      processes: [
        {
          name: '0.20mm Standard @Creality Ender3V3',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-ender-3-v3-ke',
    maker: 'Creality',
    name: 'Creality Ender-3 V3 KE',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 245,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality Ender-3 V3 KE 0.4 nozzle',
      process: '0.20mm Standard @Creality Ender3V3KE',
      processes: [
        {
          name: '0.20mm Standard @Creality Ender3V3KE',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-ender-3-v3-plus',
    maker: 'Creality',
    name: 'Creality Ender-3 V3 Plus',
    bed: [
      [0, 0],
      [300, 0],
      [300, 300],
      [0, 300],
    ],
    height: 330,
    keepOut: [],
    nozzles: [0.4, 0.6],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality Ender-3 V3 Plus 0.4 nozzle',
      process: '0.20mm Standard @Creality Ender3V3Plus',
      processes: [
        {
          name: '0.20mm Standard @Creality Ender3V3Plus',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-ender-5',
    maker: 'Creality',
    name: 'Creality Ender-5',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 300,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality Ender-5 0.4 nozzle',
      process: '0.20mm Standard @Creality Ender5',
      processes: [
        {
          name: '0.16mm Optimal @Creality Ender5',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Creality Ender5',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-ender-5-plus',
    maker: 'Creality',
    name: 'Creality Ender-5 Plus',
    bed: [
      [0, 0],
      [350, 0],
      [350, 350],
      [0, 350],
    ],
    height: 400,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality Ender-5 Plus 0.4 nozzle',
      process: '0.20mm Standard @Creality Ender5Plus',
      processes: [
        {
          name: '0.16mm Optimal @Creality Ender5Plus',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Creality Ender5Plus',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-ender-5-s1',
    maker: 'Creality',
    name: 'Creality Ender-5 S1',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 300,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality Ender-5 S1 0.4 nozzle',
      process: '0.20mm Standard @Creality Ender5S1',
      processes: [
        {
          name: '0.16mm Optimal @Creality Ender5S1',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Creality Ender5S1',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-ender-5s',
    maker: 'Creality',
    name: 'Creality Ender-5S',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 300,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality Ender-5S 0.4 nozzle',
      process: '0.20mm Standard @Creality Ender5S',
      processes: [
        {
          name: '0.16mm Optimal @Creality Ender5S',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Creality Ender5S',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-ender-6',
    maker: 'Creality',
    name: 'Creality Ender-6',
    bed: [
      [0, 0],
      [250, 0],
      [250, 250],
      [0, 250],
    ],
    height: 400,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality Ender-6 0.4 nozzle',
      process: '0.20mm Standard @Creality Ender6',
      processes: [
        {
          name: '0.16mm Optimal @Creality Ender6',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Creality Ender6',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-k1',
    maker: 'Creality',
    name: 'Creality K1',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4, 0.6, 0.8],
    enclosed: true,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality K1 0.4 nozzle',
      process: '0.20mm Standard @Creality K1 0.4 nozzle',
      processes: [
        {
          name: '0.16mm Optimal @Creality K1 0.4 nozzle',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Creality K1 0.4 nozzle',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-k1-max',
    maker: 'Creality',
    name: 'Creality K1 Max',
    bed: [
      [0, 0],
      [300, 0],
      [300, 300],
      [0, 300],
    ],
    height: 300,
    keepOut: [],
    nozzles: [0.4, 0.6, 0.8],
    enclosed: true,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality K1 Max 0.4 nozzle',
      process: '0.20mm Standard @Creality K1Max 0.4 nozzle',
      processes: [
        {
          name: '0.16mm Optimal @Creality K1Max 0.4 nozzle',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Creality K1Max 0.4 nozzle',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Creality K1Max 0.4 nozzle',
          layer: 0.24,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'creality-k1c',
    maker: 'Creality',
    name: 'Creality K1C',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4, 0.6, 0.8],
    enclosed: true,
    bedType: null,
    vendor: 'Creality',
    presets: {
      machine: 'Creality K1C 0.4 nozzle',
      process: '0.20mm Standard @Creality K1C 0.4 nozzle',
      processes: [
        {
          name: '0.20mm Standard @Creality K1C',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Creality',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Creality',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Creality',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Creality',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Creality',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune',
    maker: 'Elegoo',
    name: 'Elegoo Neptune',
    bed: [
      [0, 0],
      [210, 0],
      [210, 210],
      [0, 210],
    ],
    height: 200,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune 0.4 nozzle',
      process: '0.20mm Standard @Elegoo Neptune',
      processes: [
        {
          name: '0.08mm Extra Fine @Elegoo Neptune',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Elegoo Neptune',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Elegoo Neptune',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Elegoo Neptune',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Elegoo Neptune',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Elegoo Neptune',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune-2',
    maker: 'Elegoo',
    name: 'Elegoo Neptune 2',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune 2 0.4 nozzle',
      process: '0.20mm Standard @Elegoo Neptune2',
      processes: [
        {
          name: '0.08mm Extra Fine @Elegoo Neptune2',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Elegoo Neptune2',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Elegoo Neptune2',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Elegoo Neptune2',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Elegoo Neptune2',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Elegoo Neptune2',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune-2d',
    maker: 'Elegoo',
    name: 'Elegoo Neptune 2D',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune 2D 0.4 nozzle',
      process: '0.20mm Standard @Elegoo Neptune2D',
      processes: [
        {
          name: '0.08mm Extra Fine @Elegoo Neptune2D',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Elegoo Neptune2D',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Elegoo Neptune2D',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Elegoo Neptune2D',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Elegoo Neptune2D',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Elegoo Neptune2D',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune-2s',
    maker: 'Elegoo',
    name: 'Elegoo Neptune 2S',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune 2S 0.4 nozzle',
      process: '0.20mm Standard @Elegoo Neptune2S',
      processes: [
        {
          name: '0.08mm Extra Fine @Elegoo Neptune2S',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Elegoo Neptune2S',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Elegoo Neptune2S',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Elegoo Neptune2S',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Elegoo Neptune2S',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Elegoo Neptune2S',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune-3',
    maker: 'Elegoo',
    name: 'Elegoo Neptune 3',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 280,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune 3 0.4 nozzle',
      process: '0.20mm Standard @Elegoo Neptune3',
      processes: [
        {
          name: '0.08mm Extra Fine @Elegoo Neptune3',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Elegoo Neptune3',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Elegoo Neptune3',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Elegoo Neptune3',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Elegoo Neptune3',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Elegoo Neptune3',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune-3-max',
    maker: 'Elegoo',
    name: 'Elegoo Neptune 3 Max',
    bed: [
      [0, 0],
      [420, 0],
      [420, 420],
      [0, 420],
    ],
    height: 500,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune 3 Max 0.4 nozzle',
      process: '0.20mm Standard @Elegoo Neptune3Max',
      processes: [
        {
          name: '0.08mm Extra Fine @Elegoo Neptune3Max',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Elegoo Neptune3Max',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Elegoo Neptune3Max',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Elegoo Neptune3Max',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Elegoo Neptune3Max',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Elegoo Neptune3Max',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune-3-plus',
    maker: 'Elegoo',
    name: 'Elegoo Neptune 3 Plus',
    bed: [
      [0, 0],
      [320, 0],
      [320, 320],
      [0, 320],
    ],
    height: 400,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune 3 Plus 0.4 nozzle',
      process: '0.20mm Standard @Elegoo Neptune3Plus',
      processes: [
        {
          name: '0.08mm Extra Fine @Elegoo Neptune3Plus',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Elegoo Neptune3Plus',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Elegoo Neptune3Plus',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Elegoo Neptune3Plus',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Elegoo Neptune3Plus',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Elegoo Neptune3Plus',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune-3-pro',
    maker: 'Elegoo',
    name: 'Elegoo Neptune 3 Pro',
    bed: [
      [0, 0],
      [225, 0],
      [225, 225],
      [0, 225],
    ],
    height: 280,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune 3 Pro 0.4 nozzle',
      process: '0.20mm Standard @Elegoo Neptune3Pro',
      processes: [
        {
          name: '0.08mm Extra Fine @Elegoo Neptune3Pro',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Elegoo Neptune3Pro',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Elegoo Neptune3Pro',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Elegoo Neptune3Pro',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Elegoo Neptune3Pro',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Elegoo Neptune3Pro',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune-4',
    maker: 'Elegoo',
    name: 'Elegoo Neptune 4',
    bed: [
      [0, 0],
      [225, 0],
      [225, 225],
      [0, 225],
    ],
    height: 265,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune 4 0.4 nozzle',
      process: '0.20mm Standard @Elegoo Neptune4 0.4 nozzle',
      processes: [
        {
          name: '0.20mm Standard @Elegoo Neptune4 0.4 nozzle',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune-4-max',
    maker: 'Elegoo',
    name: 'Elegoo Neptune 4 Max',
    bed: [
      [0, 0],
      [420, 0],
      [420, 420],
      [0, 420],
    ],
    height: 480,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune 4 Max 0.4 nozzle',
      process: '0.20mm Standard @Elegoo Neptune4Max 0.4 nozzle',
      processes: [
        {
          name: '0.20mm Standard @Elegoo Neptune4Max 0.4 nozzle',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune-4-plus',
    maker: 'Elegoo',
    name: 'Elegoo Neptune 4 Plus',
    bed: [
      [0, 0],
      [320, 0],
      [320, 320],
      [0, 320],
    ],
    height: 385,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune 4 Plus 0.4 nozzle',
      process: '0.20mm Standard @Elegoo Neptune4 Plus 0.4 nozzle',
      processes: [
        {
          name: '0.20mm Standard @Elegoo Neptune4 Plus 0.4 nozzle',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune-4-pro',
    maker: 'Elegoo',
    name: 'Elegoo Neptune 4 Pro',
    bed: [
      [0, 0],
      [235, 0],
      [235, 230],
      [0, 230],
    ],
    height: 265,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune 4 Pro 0.4 nozzle',
      process: '0.20mm Standard @Elegoo Neptune4Pro 0.4 nozzle',
      processes: [
        {
          name: '0.20mm Standard @Elegoo Neptune4Pro 0.4 nozzle',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'elegoo-neptune-x',
    maker: 'Elegoo',
    name: 'Elegoo Neptune X',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 300,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Elegoo',
    presets: {
      machine: 'Elegoo Neptune X 0.4 nozzle',
      process: '0.20mm Standard @Elegoo NeptuneX',
      processes: [
        {
          name: '0.08mm Extra Fine @Elegoo NeptuneX',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Elegoo NeptuneX',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Elegoo NeptuneX',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Elegoo NeptuneX',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Elegoo NeptuneX',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Elegoo NeptuneX',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Elegoo',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Elegoo',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Elegoo',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-a10-m',
    maker: 'Geeetech',
    name: 'Geeetech A10 M',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 260,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech A10 M 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-a10-pro',
    maker: 'Geeetech',
    name: 'Geeetech A10 Pro',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 260,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech A10 Pro 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-a10-t',
    maker: 'Geeetech',
    name: 'Geeetech A10 T',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 260,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech A10 T 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-a20',
    maker: 'Geeetech',
    name: 'Geeetech A20',
    bed: [
      [0, 0],
      [250, 0],
      [250, 250],
      [0, 250],
    ],
    height: 260,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech A20 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-a20-m',
    maker: 'Geeetech',
    name: 'Geeetech A20 M',
    bed: [
      [0, 0],
      [250, 0],
      [250, 250],
      [0, 250],
    ],
    height: 260,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech A20 M 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-a20-t',
    maker: 'Geeetech',
    name: 'Geeetech A20 T',
    bed: [
      [0, 0],
      [250, 0],
      [250, 250],
      [0, 250],
    ],
    height: 260,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech A20 T 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-a30-m',
    maker: 'Geeetech',
    name: 'Geeetech A30 M',
    bed: [
      [0, 0],
      [320, 0],
      [320, 320],
      [0, 320],
    ],
    height: 420,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech A30 M 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-a30-pro',
    maker: 'Geeetech',
    name: 'Geeetech A30 Pro',
    bed: [
      [0, 0],
      [320, 0],
      [320, 320],
      [0, 320],
    ],
    height: 420,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech A30 Pro 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-a30-t',
    maker: 'Geeetech',
    name: 'Geeetech A30 T',
    bed: [
      [0, 0],
      [320, 0],
      [320, 320],
      [0, 320],
    ],
    height: 420,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech A30 T 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-m1',
    maker: 'Geeetech',
    name: 'Geeetech M1',
    bed: [
      [0, 0],
      [105, 0],
      [105, 105],
      [0, 105],
    ],
    height: 95,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech M1 0.4 nozzle',
      process: '0.20mm Standard @Geeetech M1',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech M1',
          layer: 0.08,
        },
        {
          name: '0.10mm Fine @Geeetech M1',
          layer: 0.1,
        },
        {
          name: '0.16mm Optimal @Geeetech M1',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech M1',
          layer: 0.2,
        },
        {
          name: '0.25mm Draft @Geeetech M1',
          layer: 0.25,
        },
      ],
      filaments: {
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-mizar',
    maker: 'Geeetech',
    name: 'Geeetech Mizar',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 260,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech Mizar 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-mizar-m',
    maker: 'Geeetech',
    name: 'Geeetech Mizar M',
    bed: [
      [0, 0],
      [255, 0],
      [255, 255],
      [0, 255],
    ],
    height: 260,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech Mizar M 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-mizar-max',
    maker: 'Geeetech',
    name: 'Geeetech Mizar Max',
    bed: [
      [0, 0],
      [320, 0],
      [320, 320],
      [0, 320],
    ],
    height: 400,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech Mizar Max 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-mizar-pro',
    maker: 'Geeetech',
    name: 'Geeetech Mizar Pro',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 260,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech Mizar Pro 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-mizar-s',
    maker: 'Geeetech',
    name: 'Geeetech Mizar S',
    bed: [
      [0, 0],
      [255, 0],
      [255, 255],
      [0, 255],
    ],
    height: 260,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech Mizar S 0.4 nozzle',
      process: '0.20mm Standard @Geeetech common',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech common',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Geeetech common',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Geeetech common',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech common',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Geeetech common',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Geeetech common',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'geeetech-thunder',
    maker: 'Geeetech',
    name: 'Geeetech Thunder',
    bed: [
      [0, 0],
      [250, 0],
      [250, 250],
      [0, 250],
    ],
    height: 260,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: false,
    bedType: null,
    vendor: 'Geeetech',
    presets: {
      machine: 'Geeetech Thunder 0.4 nozzle',
      process: '0.20mm Standard @Geeetech Thunder',
      processes: [
        {
          name: '0.08mm Extra Fine @Geeetech Thunder',
          layer: 0.08,
        },
        {
          name: '0.10mm Fine @Geeetech Thunder',
          layer: 0.1,
        },
        {
          name: '0.16mm Optimal @Geeetech Thunder',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Geeetech Thunder',
          layer: 0.2,
        },
        {
          name: '0.25mm Draft @Geeetech Thunder',
          layer: 0.25,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Geeetech',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Geeetech',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Geeetech',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Geeetech_FastSpeed',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Geeetech',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'prusa-mini',
    maker: 'Prusa',
    name: 'Prusa MINI',
    bed: [
      [0, 0],
      [180, 0],
      [180, 180],
      [0, 180],
    ],
    height: 180,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Prusa',
    presets: {
      machine: 'Prusa MINI 0.4 nozzle',
      process: '0.20mm Standard @MINI',
      processes: [
        {
          name: '0.20mm Standard @MINI',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Prusa',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Prusa',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Prusa',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Prusa',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Prusa',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'prusa-mk3s',
    maker: 'Prusa',
    name: 'Prusa MK3S',
    bed: [
      [0, 0],
      [250, 0],
      [250, 210],
      [0, 210],
    ],
    height: 210,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Prusa',
    presets: {
      machine: 'Prusa MK3S 0.4 nozzle',
      process: '0.20mm Standard @MK3S',
      processes: [
        {
          name: '0.20mm Standard @MK3S',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Prusa',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Prusa',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Prusa',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Prusa',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Prusa',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'qidi-q1-pro',
    maker: 'Qidi',
    name: 'Qidi Q1 Pro',
    bed: [
      [0, 0],
      [245, 0],
      [245, 245],
      [0, 245],
    ],
    height: 240,
    keepOut: [
      [
        [25, 245],
        [25, 240],
        [115, 240],
        [115, 245],
        [208, 245],
        [208, 240],
        [245, 240],
        [245, 245],
        [208, 245],
      ],
    ],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: null,
    vendor: 'Qidi',
    presets: {
      machine: 'Qidi Q1 Pro 0.4 nozzle',
      process: '0.20mm Standard @Qidi Q1 Pro',
      processes: [
        {
          name: '0.12mm Fine @Qidi Q1 Pro',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Qidi Q1 Pro',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Qidi Q1 Pro',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Qidi Q1 Pro',
          layer: 0.24,
        },
        {
          name: '0.25mm Draft @Qidi Q1 Pro',
          layer: 0.25,
        },
        {
          name: '0.28mm Extra Draft @Qidi Q1 Pro',
          layer: 0.28,
        },
        {
          name: '0.30mm Extra Draft @Qidi Q1 Pro',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Qidi Q1 Pro 0.4 nozzle',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Qidi Q1 Pro 0.4 nozzle',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Qidi Q1 Pro 0.4 nozzle',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Qidi Q1 Pro 0.4 nozzle',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Qidi Q1 Pro 0.4 nozzle',
          density: 1.22,
        },
      },
    },
  },
  {
    id: 'qidi-x-cf-pro',
    maker: 'Qidi',
    name: 'Qidi X-CF Pro',
    bed: [
      [0, 0],
      [300, 0],
      [300, 250],
      [0, 250],
    ],
    height: 300,
    keepOut: [],
    nozzles: [0.4],
    enclosed: true,
    bedType: null,
    vendor: 'Qidi',
    presets: {
      machine: 'Qidi X-CF Pro 0.4 nozzle',
      process: '0.20mm Standard @Qidi XCFPro',
      processes: [
        {
          name: '0.12mm Fine @Qidi XCFPro',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Qidi XCFPro',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Qidi XCFPro',
          layer: 0.2,
        },
        {
          name: '0.25mm Draft @Qidi XCFPro',
          layer: 0.25,
        },
        {
          name: '0.30mm Extra Draft @Qidi XCFPro',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Qidi',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Qidi',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Qidi',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Qidi',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Qidi',
          density: 1.22,
        },
      },
    },
  },
  {
    id: 'qidi-x-max',
    maker: 'Qidi',
    name: 'Qidi X-Max',
    bed: [
      [0, 0],
      [300, 0],
      [300, 250],
      [0, 250],
    ],
    height: 300,
    keepOut: [],
    nozzles: [0.4],
    enclosed: true,
    bedType: null,
    vendor: 'Qidi',
    presets: {
      machine: 'Qidi X-Max 0.4 nozzle',
      process: '0.20mm Standard @Qidi XMax',
      processes: [
        {
          name: '0.12mm Fine @Qidi XMax',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Qidi XMax',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Qidi XMax',
          layer: 0.2,
        },
        {
          name: '0.25mm Draft @Qidi XMax',
          layer: 0.25,
        },
        {
          name: '0.30mm Extra Draft @Qidi XMax',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Qidi',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Qidi',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Qidi',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Qidi',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Qidi',
          density: 1.22,
        },
      },
    },
  },
  {
    id: 'qidi-x-max-3',
    maker: 'Qidi',
    name: 'Qidi X-Max 3',
    bed: [
      [0, 0],
      [325, 0],
      [325, 325],
      [0, 325],
    ],
    height: 315,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: null,
    vendor: 'Qidi',
    presets: {
      machine: 'Qidi X-Max 3 0.4 nozzle',
      process: '0.20mm Standard @Qidi XMax3',
      processes: [
        {
          name: '0.12mm Fine @Qidi XMax3',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Qidi XMax3',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Qidi XMax3',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Qidi XMax3',
          layer: 0.24,
        },
        {
          name: '0.25mm Draft @Qidi XMax3',
          layer: 0.25,
        },
        {
          name: '0.28mm Extra Draft @Qidi XMax3',
          layer: 0.28,
        },
        {
          name: '0.30mm Extra Draft @Qidi XMax3',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Qidi',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Qidi',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Qidi',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Qidi',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Qidi',
          density: 1.22,
        },
      },
    },
  },
  {
    id: 'qidi-x-plus',
    maker: 'Qidi',
    name: 'Qidi X-Plus',
    bed: [
      [0, 0],
      [270, 0],
      [270, 200],
      [0, 200],
    ],
    height: 200,
    keepOut: [],
    nozzles: [0.4],
    enclosed: true,
    bedType: null,
    vendor: 'Qidi',
    presets: {
      machine: 'Qidi X-Plus 0.4 nozzle',
      process: '0.20mm Standard @Qidi XPlus',
      processes: [
        {
          name: '0.12mm Fine @Qidi XPlus',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Qidi XPlus',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Qidi XPlus',
          layer: 0.2,
        },
        {
          name: '0.25mm Draft @Qidi XPlus',
          layer: 0.25,
        },
        {
          name: '0.30mm Extra Draft @Qidi XPlus',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Qidi',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Qidi',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Qidi',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Qidi',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Qidi',
          density: 1.22,
        },
      },
    },
  },
  {
    id: 'qidi-x-plus-3',
    maker: 'Qidi',
    name: 'Qidi X-Plus 3',
    bed: [
      [0, 0],
      [280, 0],
      [280, 280],
      [0, 280],
    ],
    height: 270,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: null,
    vendor: 'Qidi',
    presets: {
      machine: 'Qidi X-Plus 3 0.4 nozzle',
      process: '0.20mm Standard @Qidi XPlus3',
      processes: [
        {
          name: '0.12mm Fine @Qidi XPlus3',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Qidi XPlus3',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Qidi XPlus3',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Qidi XPlus3',
          layer: 0.24,
        },
        {
          name: '0.25mm Draft @Qidi XPlus3',
          layer: 0.25,
        },
        {
          name: '0.28mm Extra Draft @Qidi XPlus3',
          layer: 0.28,
        },
        {
          name: '0.30mm Extra Draft @Qidi XPlus3',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Qidi',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Qidi',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Qidi',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Qidi',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Qidi',
          density: 1.22,
        },
      },
    },
  },
  {
    id: 'qidi-x-plus-4',
    maker: 'Qidi',
    name: 'Qidi X-Plus 4',
    bed: [
      [0, 0],
      [305, 0],
      [305, 305],
      [0, 305],
    ],
    height: 280,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: null,
    vendor: 'Qidi',
    presets: {
      machine: 'Qidi X-Plus 4 0.4 nozzle',
      process: '0.20mm Standard @Qidi XPlus4',
      processes: [
        {
          name: '0.12mm Fine @Qidi XPlus4',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Qidi XPlus4',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Qidi XPlus4',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Qidi XPlus4',
          layer: 0.24,
        },
        {
          name: '0.25mm Draft @Qidi XPlus4',
          layer: 0.25,
        },
        {
          name: '0.28mm Extra Draft @Qidi XPlus4',
          layer: 0.28,
        },
        {
          name: '0.30mm Extra Draft @Qidi XPlus4',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Qidi X-Plus 4 0.4 nozzle',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Qidi X-Plus 4 0.4 nozzle',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Qidi X-Plus 4 0.4 nozzle',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Qidi X-Plus 4 0.4 nozzle',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Qidi',
          density: 1.22,
        },
      },
    },
  },
  {
    id: 'qidi-x-smart-3',
    maker: 'Qidi',
    name: 'Qidi X-Smart 3',
    bed: [
      [0, 0],
      [175, 0],
      [175, 180],
      [0, 180],
    ],
    height: 170,
    keepOut: [],
    nozzles: [0.2, 0.4, 0.6, 0.8],
    enclosed: true,
    bedType: null,
    vendor: 'Qidi',
    presets: {
      machine: 'Qidi X-Smart 3 0.4 nozzle',
      process: '0.20mm Standard @Qidi XSmart3',
      processes: [
        {
          name: '0.12mm Fine @Qidi XSmart3',
          layer: 0.12,
        },
        {
          name: '0.16mm Optimal @Qidi XSmart3',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Qidi XSmart3',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Qidi XSmart3',
          layer: 0.24,
        },
        {
          name: '0.25mm Draft @Qidi XSmart3',
          layer: 0.25,
        },
        {
          name: '0.28mm Extra Draft @Qidi XSmart3',
          layer: 0.28,
        },
        {
          name: '0.30mm Extra Draft @Qidi XSmart3',
          layer: 0.3,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Qidi',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Qidi',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Qidi',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Qidi',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Qidi',
          density: 1.22,
        },
      },
    },
  },
  {
    id: 'tronxy-x5sa-400-marlin-firmware',
    maker: 'Tronxy',
    name: 'Tronxy X5SA 400 Marlin Firmware',
    bed: [
      [0, 0],
      [400, 0],
      [400, 400],
      [0, 400],
    ],
    height: 400,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Tronxy',
    presets: {
      machine: 'Tronxy X5SA 400 0.4 nozzle',
      process: '0.20mm Standard @Tronxy',
      processes: [
        {
          name: '0.08mm Extra Fine @Tronxy',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Tronxy',
          layer: 0.12,
        },
        {
          name: '0.15mm Optimal @Tronxy',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Tronxy',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Tronxy',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Tronxy',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Tronxy',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Tronxy',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Tronxy',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Tronxy',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Tronxy',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'troodon-2-0-klipper',
    maker: 'Vivedino',
    name: 'Troodon 2.0 - Klipper',
    bed: [
      [0, 0],
      [350, 0],
      [350, 350],
      [0, 350],
    ],
    height: 330,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Vivedino',
    presets: {
      machine: 'Troodon 2.0 Klipper 0.4 nozzle',
      process: '0.20mm Standard @Troodon2',
      processes: [
        {
          name: '0.08mm Extra Fine @Troodon2',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Troodon2',
          layer: 0.12,
        },
        {
          name: '0.15mm Optimal @Troodon2',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Troodon2',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Troodon2',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Troodon2',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Troodon',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Troodon',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Troodon',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Troodon',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Troodon',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'troodon-2-0-rrf',
    maker: 'Vivedino',
    name: 'Troodon 2.0 - RRF',
    bed: [
      [0, 0],
      [350, 0],
      [350, 350],
      [0, 350],
    ],
    height: 330,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Vivedino',
    presets: {
      machine: 'Troodon 2.0 RRF 0.4 nozzle',
      process: '0.20mm Standard @Troodon2',
      processes: [
        {
          name: '0.08mm Extra Fine @Troodon2',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Troodon2',
          layer: 0.12,
        },
        {
          name: '0.15mm Optimal @Troodon2',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Troodon2',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Troodon2',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Troodon2',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Troodon',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Troodon',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Troodon',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Troodon',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Troodon',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'voron-0-1',
    maker: 'Voron',
    name: 'Voron 0.1',
    bed: [
      [0, 0],
      [120, 0],
      [120, 120],
      [0, 120],
    ],
    height: 120,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Voron',
    presets: {
      machine: 'Voron 0.1 0.4 nozzle',
      process: '0.20mm Standard @Voron',
      processes: [
        {
          name: '0.08mm Extra Fine @Voron',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Voron',
          layer: 0.12,
        },
        {
          name: '0.15mm Optimal @Voron',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Voron',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Voron',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Voron',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Voron',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Voron',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Voron',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Voron',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Voron',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'voron-2-4-250',
    maker: 'Voron',
    name: 'Voron 2.4 250',
    bed: [
      [0, 0],
      [250, 0],
      [250, 250],
      [0, 250],
    ],
    height: 225,
    keepOut: [],
    nozzles: [0.4],
    enclosed: true,
    bedType: null,
    vendor: 'Voron',
    presets: {
      machine: 'Voron 2.4 250 0.4 nozzle',
      process: '0.20mm Standard @Voron',
      processes: [
        {
          name: '0.08mm Extra Fine @Voron',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Voron',
          layer: 0.12,
        },
        {
          name: '0.15mm Optimal @Voron',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Voron',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Voron',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Voron',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Voron',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Voron',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Voron',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Voron',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Voron',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'voron-2-4-300',
    maker: 'Voron',
    name: 'Voron 2.4 300',
    bed: [
      [0, 0],
      [300, 0],
      [300, 300],
      [0, 300],
    ],
    height: 275,
    keepOut: [],
    nozzles: [0.4],
    enclosed: true,
    bedType: null,
    vendor: 'Voron',
    presets: {
      machine: 'Voron 2.4 300 0.4 nozzle',
      process: '0.20mm Standard @Voron',
      processes: [
        {
          name: '0.08mm Extra Fine @Voron',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Voron',
          layer: 0.12,
        },
        {
          name: '0.15mm Optimal @Voron',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Voron',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Voron',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Voron',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Voron',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Voron',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Voron',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Voron',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Voron',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'voron-2-4-350',
    maker: 'Voron',
    name: 'Voron 2.4 350',
    bed: [
      [0, 0],
      [350, 0],
      [350, 350],
      [0, 350],
    ],
    height: 325,
    keepOut: [],
    nozzles: [0.4],
    enclosed: true,
    bedType: null,
    vendor: 'Voron',
    presets: {
      machine: 'Voron 2.4 350 0.4 nozzle',
      process: '0.20mm Standard @Voron',
      processes: [
        {
          name: '0.08mm Extra Fine @Voron',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Voron',
          layer: 0.12,
        },
        {
          name: '0.15mm Optimal @Voron',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Voron',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Voron',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Voron',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Voron',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Voron',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Voron',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Voron',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Voron',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'voron-trident-250',
    maker: 'Voron',
    name: 'Voron Trident 250',
    bed: [
      [0, 0],
      [250, 0],
      [250, 250],
      [0, 250],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4],
    enclosed: true,
    bedType: null,
    vendor: 'Voron',
    presets: {
      machine: 'Voron Trident 250 0.4 nozzle',
      process: '0.20mm Standard @Voron',
      processes: [
        {
          name: '0.08mm Extra Fine @Voron',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Voron',
          layer: 0.12,
        },
        {
          name: '0.15mm Optimal @Voron',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Voron',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Voron',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Voron',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Voron',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Voron',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Voron',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Voron',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Voron',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'voron-trident-300',
    maker: 'Voron',
    name: 'Voron Trident 300',
    bed: [
      [0, 0],
      [300, 0],
      [300, 300],
      [0, 300],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4],
    enclosed: true,
    bedType: null,
    vendor: 'Voron',
    presets: {
      machine: 'Voron Trident 300 0.4 nozzle',
      process: '0.20mm Standard @Voron',
      processes: [
        {
          name: '0.08mm Extra Fine @Voron',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Voron',
          layer: 0.12,
        },
        {
          name: '0.15mm Optimal @Voron',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Voron',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Voron',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Voron',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Voron',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Voron',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Voron',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Voron',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Voron',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'voron-trident-350',
    maker: 'Voron',
    name: 'Voron Trident 350',
    bed: [
      [0, 0],
      [350, 0],
      [350, 350],
      [0, 350],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4],
    enclosed: true,
    bedType: null,
    vendor: 'Voron',
    presets: {
      machine: 'Voron Trident 350 0.4 nozzle',
      process: '0.20mm Standard @Voron',
      processes: [
        {
          name: '0.08mm Extra Fine @Voron',
          layer: 0.08,
        },
        {
          name: '0.12mm Fine @Voron',
          layer: 0.12,
        },
        {
          name: '0.15mm Optimal @Voron',
          layer: 0.15,
        },
        {
          name: '0.20mm Standard @Voron',
          layer: 0.2,
        },
        {
          name: '0.24mm Draft @Voron',
          layer: 0.24,
        },
        {
          name: '0.28mm Extra Draft @Voron',
          layer: 0.28,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Voron',
          density: 1.04,
        },
        ASA: {
          name: 'Generic ASA @Voron',
          density: 1.04,
        },
        PETG: {
          name: 'Generic PETG @Voron',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Voron',
          density: 1.24,
        },
        TPU: {
          name: 'Generic TPU @Voron',
          density: 1.24,
        },
      },
    },
  },
  {
    id: 'voxelab-aquila-x2',
    maker: 'Voxelab',
    name: 'Voxelab Aquila X2',
    bed: [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ],
    height: 250,
    keepOut: [],
    nozzles: [0.4],
    enclosed: false,
    bedType: null,
    vendor: 'Voxelab',
    presets: {
      machine: 'Voxelab Aquila X2 0.4 nozzle',
      process: '0.20mm Standard @Voxelab AquilaX2',
      processes: [
        {
          name: '0.16mm Optimal @Voxelab AquilaX2',
          layer: 0.16,
        },
        {
          name: '0.20mm Standard @Voxelab AquilaX2',
          layer: 0.2,
        },
      ],
      filaments: {
        ABS: {
          name: 'Generic ABS @Voxelab',
          density: 1.1,
        },
        PETG: {
          name: 'Generic PETG @Voxelab',
          density: 1.27,
        },
        PLA: {
          name: 'Generic PLA @Voxelab',
          density: 1.24,
        },
      },
    },
  },
];
