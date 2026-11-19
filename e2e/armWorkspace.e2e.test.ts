import { afterAll, beforeAll, expect, it } from 'vitest';
import { armWorkspaceCase } from '../src/skills/armWorkspaceCases';
import { openApp, shown, type App } from './harness';
import { contactCommand } from './selfContactScene';

interface Studio {
  load: (record: unknown) => void;
  select: (ids: string[]) => void;
  sceneRecord: () => unknown;
  workspaceInspection: () => {
    count: number;
    selected: number | null;
    point: number[] | null;
    previewPoint: number[] | null;
    screen: { x: number; y: number; visible: boolean } | null;
  };
}

let app: App;

beforeAll(async () => {
  app = await openApp({ scenes: [] });
});

afterAll(async () => {
  await app?.close();
});

it(
  'inspects the selected tool through the palette, picks a canvas sample and plans its target through Skills',
  { retry: 0 },
  async () => {
    const fixture = armWorkspaceCase('three-axis');

    await app.page.evaluate(
      (record) => {
        const studio = (window as unknown as { __studio: Studio }).__studio;

        studio.load(record);
        studio.select(['link2']);
      },
      {
        name: 'Workspace arm',
        parts: fixture.input.parts,
        project: { ...fixture.input.project, pose: fixture.input.pose },
      },
    );

    const before = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord());

    await contactCommand(app, 'Inspect Workspace');
    await expect.poll(() => app.page.locator(shown('[data-testid="workspace-samples"]')).isVisible()).toBe(true);

    const sample = await app.page.evaluate(() =>
      (window as unknown as { __studio: Studio }).__studio.workspaceInspection(),
    );

    expect(sample.count).toBeGreaterThan(0);
    expect(sample.screen?.visible).toBe(true);
    await app.page.mouse.click(sample.screen!.x, sample.screen!.y);

    const preview = await app.page.evaluate(() =>
      (window as unknown as { __studio: Studio }).__studio.workspaceInspection(),
    );

    expect(preview.selected).not.toBeNull();
    expect(preview.previewPoint).not.toBeNull();
    preview.point!.forEach((v, i) => expect(preview.previewPoint![i]).toBeCloseTo(v, 2));
    expect(await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord())).toEqual(
      before,
    );
    await app.page.getByRole('button', { name: 'Plan Motion', exact: true }).click();
    await expect
      .poll(() =>
        app.page.locator(shown('[data-testid="skill-row"]')).filter({ hasText: 'Workspace target' }).isVisible(),
      )
      .toBe(true);
    expect(app.errors).toEqual([]);
  },
);
