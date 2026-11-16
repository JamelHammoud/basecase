import type { Page } from 'playwright-core';
import { expect } from 'vitest';

interface OperateWindow {
  __studio: { drive: (command: { v: number[] } | null) => void };
  __fakeRobotLink: {
    statuses: Array<Array<number | null>>;
    units: Record<string, { statuses: Array<Array<number | null>> }>;
  };
}

export async function driveRecordableMotion(page: Page, unit?: string) {
  const started = await page.evaluate((unit) => {
    const w = window as unknown as OperateWindow;

    w.__studio.drive({ v: [1, 0, 0] });

    return { at: performance.now(), frame: (unit ? w.__fakeRobotLink.units[unit] : w.__fakeRobotLink).statuses.length };
  }, unit);

  await expect
    .poll(
      () =>
        page.evaluate(
          ({ at, frame, unit }) => {
            const fleet = (window as unknown as OperateWindow).__fakeRobotLink;
            const statuses = (unit ? fleet.units[unit] : fleet).statuses.slice(frame);
            const positions = statuses.flatMap((s) => (s[0] === null ? [] : [s[0]]));

            return (
              performance.now() - at > 2000 &&
              statuses.length >= 25 &&
              Math.max(...positions) - Math.min(...positions) > 40
            );
          },
          { ...started, unit },
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  await page.evaluate(() => (window as unknown as OperateWindow).__studio.drive(null));
}
