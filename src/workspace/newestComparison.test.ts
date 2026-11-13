import { describe, expect, it } from 'vitest';
import { newestComparison } from './newestComparison';

const settled = (key: string, passes: number) => ({ key, tabId: 'other', comparison: passes });

describe('newestComparison', () => {
  it('keep the shown rows when an edit is undone while its run is still going', () => {
    const runs = newestComparison<number>();

    expect(runs.want('F1')).toBe(true);
    expect(runs.settle(settled('F1', 20))).toBe(true);

    expect(runs.want('F2')).toBe(true);
    expect(runs.view().running).toBe(true);

    expect(runs.want('F1')).toBe(false);
    expect(runs.view()).toEqual({ result: settled('F1', 20), running: false });

    expect(runs.settle(settled('F2', 0))).toBe(false);
    expect(runs.view()).toEqual({ result: settled('F1', 20), running: false });
  });

  it('take a redone edit’s run when it lands after the undo and redo', () => {
    const runs = newestComparison<number>();

    runs.want('F1');
    runs.settle(settled('F1', 20));
    runs.want('F2');
    runs.want('F1');

    expect(runs.want('F2')).toBe(true);
    expect(runs.settle(settled('F2', 0))).toBe(true);
    expect(runs.view()).toEqual({ result: settled('F2', 0), running: false });
  });

  it('keep the last rows when the newest run fails, and ignore an older run’s failure', () => {
    const runs = newestComparison<number>();

    runs.want('F1');
    runs.settle(settled('F1', 20));
    runs.want('F2');
    runs.want('F3');

    expect(runs.fail('F2')).toBe(false);
    expect(runs.view().running).toBe(true);
    expect(runs.fail('F3')).toBe(true);
    expect(runs.view()).toEqual({ result: settled('F1', 20), running: false });
  });
});
