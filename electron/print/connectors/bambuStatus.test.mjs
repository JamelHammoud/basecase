import { describe, expect, it } from 'vitest';
import { bambuStatus, bambuTrays, hmsCode, mergeReport, trayColor } from './bambuStatus.mjs';

const FULL_REPORT = {
  gcode_state: 'RUNNING',
  mc_percent: 42,
  layer_num: 30,
  total_layer_num: 120,
  mc_remaining_time: 75,
  subtask_name: 'left_leg',
  print_error: 0,
  hms: [],
  ams: {
    ams: [
      {
        id: '0',
        tray: [
          { id: '0', tray_type: 'PLA', tray_color: 'FF0000FF' },
          { id: '1' },
          { id: '2', tray_type: 'PETG', tray_color: '00AE42FF' },
          { id: '3', tray_type: 'TPU', tray_color: '161616FF' },
        ],
      },
      { id: '1', tray: [{ id: '0', tray_type: 'ASA', tray_color: 'ffffff' }] },
    ],
  },
  vt_tray: { id: '254', tray_type: 'PLA', tray_color: '898989FF' },
};

describe('Bambu reports', () => {
  it('merges partial deltas into the cached state', () => {
    const full = mergeReport({}, FULL_REPORT);
    const delta = mergeReport(full, { mc_percent: 43, layer_num: 31, command: 'push_status' });

    expect(delta.mc_percent).toBe(43);
    expect(delta.layer_num).toBe(31);
    expect(delta.subtask_name).toBe('left_leg');
    expect(delta.ams.ams).toHaveLength(2);
    expect(full.mc_percent).toBe(42);

    const nested = mergeReport(delta, { ams: { tray_now: '2' } });

    expect(nested.ams.tray_now).toBe('2');
    expect(nested.ams.ams).toHaveLength(2);
  });

  it('maps a running print to a status', () => {
    const status = bambuStatus(mergeReport({}, FULL_REPORT));

    expect(status).toMatchObject({
      state: 'printing',
      progress: 0.42,
      layer: 30,
      totalLayers: 120,
      remainingMin: 75,
      job: 'left_leg',
    });
    expect(status.message).toBeUndefined();
  });

  it('reads AMS trays and the external spool', () => {
    expect(bambuTrays(FULL_REPORT)).toEqual([
      { slot: 0, type: 'PLA', color: '#ff0000' },
      { slot: 2, type: 'PETG', color: '#00ae42' },
      { slot: 3, type: 'TPU', color: '#161616' },
      { slot: 4, type: 'ASA', color: '#ffffff' },
      { slot: 254, type: 'PLA', color: '#898989' },
    ]);
    expect(trayColor('FF0000FF')).toBe('#ff0000');
    expect(trayColor('')).toBeUndefined();
  });

  it('maps every gcode state', () => {
    const states = { IDLE: 'idle', PREPARE: 'preparing', SLICING: 'preparing', PAUSE: 'paused', FINISH: 'finished' };

    for (const [gcode, state] of Object.entries(states)) {
      expect(bambuStatus({ gcode_state: gcode }).state).toBe(state);
    }

    expect(bambuStatus({ gcode_state: 'IDLE', mc_percent: 100, subtask_name: 'old' })).toEqual({ state: 'idle' });
  });

  it('turns print errors and HMS entries into a sentence', () => {
    const failed = bambuStatus({ gcode_state: 'FAILED', print_error: 0x0300400c });

    expect(failed.state).toBe('failed');
    expect(failed.message).toBe('The printer reported an error (0300-400C). Check the printer screen.');

    const hms = bambuStatus({ gcode_state: 'PAUSE', hms: [{ attr: 0x03000100, code: 0x00010001 }] });

    expect(hms.message).toBe('The printer reported an error (HMS 0300-0100-0001-0001). Check the printer screen.');
    expect(hmsCode({ attr: 0x0c0003_00, code: 0x0002_0001 })).toBe('0C00-0300-0002-0001');
  });
});
