import { expect, it, vi } from 'vitest';
import { plateMarker } from './usePrinting';
import { retainSentPrint } from './usePrintFleet';
import * as purchasing from '../components/build/usePurchases';
import { allocatePurchases } from '../../electron/backend/buildAllocations.mjs';
import { box } from '../sim/fixtures/parts';
import type { Purchases, PrintRecord } from '../types/robotics';
import type { Plate } from '../print/plan';
import type { MeshData } from '../print/threeMf';

it('records only the declared two copies when Mark Printed is clicked again during capture', async () => {
  let resolve: ((meshes: Record<string, MeshData>) => void) | undefined;
  const capture = new Promise<Record<string, MeshData>>((done) => {
    resolve = done;
  });
  const plate = {
    number: 1,
    material: 'PLA',
    hash: 'plate',
    items: [
      { id: 'tab', copy: 0 },
      { id: 'tab', copy: 1 },
    ],
  } as Plate;
  let stock: Purchases = {};
  let records: PrintRecord[] = [];
  const save = vi.spyOn(purchasing, 'allocatePurchase').mockImplementation(async (request) => {
    stock = allocatePurchases(stock, request);

    return stock;
  });
  const mark = plateMarker({
    parts: [box('tab', [0, 0, 0], [20, 5, 20], 1)],
    printer: { label: 'Fixture' },
    plateStatus: () => ({ state: 'new' }),
    marking: { current: new Set<string>() },
    viewport: () => ({ printMeshes: () => capture }),
    showToast: vi.fn(),
    setRecords: (update) => {
      records = update(records);
    },
  });

  try {
    const first = mark(plate, 'printed');
    const duplicate = mark(plate, 'printed');

    resolve?.({
      tab: { vertices: new Float32Array([0, 0, 0, 20, 0, 0, 0, 5, 0]), indices: new Uint32Array([0, 1, 2]) },
    });
    await Promise.all([first, duplicate]);
    expect(save).toHaveBeenCalledOnce();
    expect(records).toHaveLength(1);
    expect(records[0].copies).toHaveLength(2);
    expect(records[0].completion?.enteredAt).toEqual(expect.any(String));
    expect(Object.values(stock).flatMap((entry) => entry.printOutput?.record.copies ?? [])).toHaveLength(2);
  } finally {
    save.mockRestore();
  }
});

it('sends fit coupons without turning temporary coupon geometry into production stock', async () => {
  const viewport = vi.fn();
  const setRecords = vi.fn();
  const saved = vi.spyOn(purchasing, 'allocatePurchase');

  try {
    await retainSentPrint(
      { number: 1 } as Plate,
      { label: 'Fixture' },
      { recording: false, parts: [], labels: '', viewport, setRecords },
    );
    expect(viewport).not.toHaveBeenCalled();
    expect(setRecords).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
  } finally {
    saved.mockRestore();
  }
});

it('recovers original copy IDs when completion committed but the response never reached the scene', async () => {
  const plate = {
    number: 1,
    material: 'PLA',
    hash: 'plate',
    items: [
      { id: 'tab', copy: 0 },
      { id: 'tab', copy: 1 },
    ],
  } as Plate;
  let stock: Purchases = {};
  let records: PrintRecord[] = [];
  let interrupted = true;
  const saved = vi.spyOn(purchasing, 'allocatePurchase').mockImplementation(async (request) => {
    stock = allocatePurchases(stock, request);

    if (interrupted) {
      interrupted = false;

      throw new Error('Acknowledgment interrupted');
    }

    return stock;
  });
  const showToast = vi.fn();
  const mark = plateMarker({
    sceneId: 'scene-one',
    parts: [box('tab', [0, 0, 0], [20, 5, 20], 1)],
    printer: { label: 'Fixture' },
    plateStatus: () => ({ state: 'new' }),
    marking: { current: new Set<string>() },
    viewport: () => ({
      printMeshes: async () => ({
        tab: { vertices: new Float32Array([0, 0, 0, 20, 0, 0, 0, 5, 0]), indices: new Uint32Array([0, 1, 2]) },
      }),
    }),
    showToast,
    setRecords: (update) => {
      records = update(records);
    },
  });

  try {
    await mark(plate, 'printed');

    const original = Object.values(stock).find((entry) => entry.printOutput)!.printOutput!.record;

    expect(records).toEqual([]);
    expect(showToast).toHaveBeenCalledOnce();
    await mark(plate, 'printed');
    expect(Object.values(stock).filter((entry) => entry.printOutput)).toHaveLength(1);
    expect(records).toEqual([original]);
    expect(records[0].copies).toHaveLength(2);
    expect(records[0].copies!.map((copy) => copy.id)).toEqual(original.copies!.map((copy) => copy.id));
  } finally {
    saved.mockRestore();
  }
});
