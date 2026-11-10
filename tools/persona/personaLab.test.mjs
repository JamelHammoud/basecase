import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { personaScore } from '../../verify/rehearsal/personaScore';
import { cleanEnv, personaTools, toolNames } from './claudeDriver.mjs';
import { devicePixelRatioOf, frameOf } from './frame.mjs';
import { runPersona } from './personaLab.mjs';
import { addFinding, createSession, withdrawFinding } from './session.mjs';

const png = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: { r: 27, g: 27, b: 27 } } })
    .png()
    .toBuffer();

function fakeScreen(width, height) {
  const calls = [];

  return {
    calls,
    screen: {
      screenshot: () => png(width, height),
      accessibilityTree: async () => '- button "Export"\n- button',
      click: async (x, y) => void calls.push(['click', x, y]),
      type: async (text) => void calls.push(['type', text]),
      press: async (key) => void calls.push(['press', key]),
      scroll: async (dx, dy) => void calls.push(['scroll', dx, dy]),
    },
  };
}

describe('PersonaLab offline parts', () => {
  it('reads the device pixel ratio from the screenshot width', () => {
    expect(devicePixelRatioOf(2960)).toBe(2);
    expect(devicePixelRatioOf(1480)).toBe(1);
    expect(devicePixelRatioOf(1280)).toBe(1);
    expect(devicePixelRatioOf(1850)).toBe(1.25);
    expect(devicePixelRatioOf(2960, '1')).toBe(1);
  });

  it('shows the model a CSS-sized frame', async () => {
    const frame = await frameOf(await png(2960, 1840));

    expect([frame.width, frame.height, frame.toCss]).toEqual([1480, 920, 1]);
  });

  it('caps a large frame and maps its points back to CSS pixels', async () => {
    const frame = await frameOf(await png(2400, 1200), 1);

    expect(frame.width).toBe(1568);
    expect(frame.toCss).toBeCloseTo(2400 / 1568);
  });

  it('clicks and reports in CSS pixels on a Retina screen', async () => {
    const { screen, calls } = fakeScreen(2960, 1840);
    const session = createSession({ screen, minutes: 1 });
    const shot = await session.handlers.look();

    await session.handlers.click({ x: 100, y: 200 });
    session.handlers.report({ where: 'Export', x: 100, y: 200, problem: 'Nothing happens on click.' });

    expect(shot.text).toMatch(/^Screenshot 1480 × 920/);
    expect(calls).toEqual([['click', 100, 200]]);
    expect(session.findings).toEqual([{ where: 'Export', problem: 'Nothing happens on click.', at: [100, 200] }]);
  });

  it('keeps one finding per control and needs where and problem', () => {
    const findings = [];

    addFinding(findings, { where: 'Export', problem: 'Dead click.', at: [10, 10] });
    addFinding(findings, { where: 'export', problem: 'Again.', at: [400, 400] });
    addFinding(findings, { where: 'Unlabelled button', problem: 'No name.', at: [14, 16] });
    addFinding(findings, { where: '', problem: 'No name.' });
    addFinding(findings, { where: 'Build', problem: '' });

    expect(findings.map((f) => f.where)).toEqual(['Export']);
  });

  it('withdraws a finding reported on the wrong control', () => {
    const findings = [];

    addFinding(findings, { where: 'Unitree Go1', problem: 'Blinks.', at: [127, 870] });
    withdrawFinding(findings, 'unitree go1');
    addFinding(findings, { where: 'Unitree Go2', problem: 'Blinks.', at: [127, 205] });

    expect(findings.map((f) => f.where)).toEqual(['Unitree Go2']);
  });

  it('counts down from the session length', () => {
    let t = 0;
    const session = createSession({ screen: fakeScreen(100, 100).screen, minutes: 2, now: () => t });

    t = 30000;
    expect(session.timeLeft()).toBe(90000);
    t = 200000;
    expect(session.timeLeft()).toBe(0);
  });

  it('runs a driver and returns its findings, which score against planted faults', async () => {
    const { screen } = fakeScreen(1480, 920);
    const driver = async ({ session, system, prompt }) => {
      expect(system).toMatch(/PersonaLab/);
      expect(prompt).toMatch(/Parts view/);
      await session.handlers.tree();
      await session.handlers.look();
      session.handlers.report({ where: 'Export', x: 50, y: 22, problem: 'Clicking it does nothing.' });
      session.handlers.report({ where: 'Unnamed button', x: 300, y: 300, problem: 'No label.' });
      session.handlers.finish();
    };
    const { findings } = await runPersona({ screen, goals: ['Try the Parts view.'], minutes: 1, driver });
    const planted = [
      { session: 0, kind: 'dead-click', name: 'Export', rect: { x: 20, y: 10, width: 60, height: 24 } },
      { session: 0, kind: 'label-removed', name: 'Build', rect: { x: 290, y: 290, width: 20, height: 20 } },
    ];
    const score = personaScore(planted, [{ session: 0, findings }]);

    expect([score.caught, score.precision]).toEqual([2, 1]);
  });

  it('gives Claude only the screen tools, without the parent session’s routing', () => {
    const tools = personaTools({});

    expect(toolNames(tools)).toEqual(
      ['look', 'tree', 'click', 'type', 'press', 'scroll', 'wait', 'report', 'withdraw', 'finish'].map(
        (n) => `mcp__persona__${n}`,
      ),
    );
    expect(Object.keys(cleanEnv({ HOME: '/home/me', CLAUDE_CODE_SESSION_ID: 'x', ANTHROPIC_BASE_URL: 'y' }))).toEqual([
      'HOME',
    ]);
  });
});
