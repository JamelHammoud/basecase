import { afterEach, describe, expect, it, vi } from 'vitest';
import { presetCase } from '../cases/caseBuilder';
import { openTestFrame, type TestFrame } from '../cases/console/fixtures/codeFrames';
import { createSignalBus } from '../cases/console/signalBus';
import type { Case } from '../cases/schema';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { CASE_CODE_HANDLERS, type CaseCodeContext } from './agentCaseCodeRequests';
import { consolesOf, docFromParts, pushHistory, trackedOf, travelProject, withCaseConsoles } from './docHistory';
import type { DocState } from './types';

const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;

const roverCase = (): Case => ({
  ...presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts),
  id: 'remote',
  name: 'Remote',
});

const opened: TestFrame[] = [];

afterEach(() => opened.splice(0).forEach((f) => f.close()));

function studio({ running = true } = {}) {
  let project: ProjectSettings = { ...DEFAULT_PROJECT, cases: [roverCase()] };
  let doc: DocState = docFromParts([]);
  const calls = { open: vi.fn(), enterCase: vi.fn() };
  const ctx = (): CaseCodeContext => ({
    cases: { cases: project.cases!, active: project.cases![0], open: calls.open },
    caseRun: { open: running, enterCase: calls.enterCase },
    commitConsole: (id, console) => {
      doc = pushHistory(doc, doc.parts, { ...trackedOf(project), consoles: consolesOf(project.cases, [id]) });
      project = { ...project, cases: withCaseConsoles(project.cases, { [id]: console }) };
    },
    report: async (_key, source) => {
      const frame = openTestFrame(source, {
        bus: createSignalBus(),
        scope: { declared: new Set(), probes: new Set(), inputs: new Set(['code']) },
      });

      opened.push(frame);
      await vi.waitFor(() => expect(frame.bridge.report().loaded || frame.bridge.report().failed).toBeTruthy());

      return frame.bridge.report();
    },
  });

  const undo = (codeOnly = false) => {
    const moved = travelProject(doc, project, { direction: 'undo', codeOnly });

    if (!moved) return;

    doc = moved.doc;
    project = moved.project;
  };

  const editParts = (parts: ScenePart[]) => {
    doc = pushHistory(doc, parts, trackedOf(project));
  };

  const renameCase = (name: string) => {
    project = { ...project, cases: project.cases!.map((c) => ({ ...c, name })) };
  };

  const write = (payload: Record<string, unknown>) =>
    CASE_CODE_HANDLERS.write_case_code({ panel: 'remote', ...payload }, ctx()) as Promise<Record<string, unknown>>;
  const read = () => CASE_CODE_HANDLERS.read_case_code({ panel: 'remote' }, ctx()) as Record<string, unknown>;

  return { write, read, undo, editParts, renameCase, calls, parts: () => doc.parts, history: () => doc.past.length };
}

describe('write_case_code', () => {
  it('replies with a syntax error and the line it’s on', async () => {
    const app = studio();
    const reply = await app.write({ source: '<p>Remote</p>\n<script>\nconst = 1;\n</script>' });

    expect(reply).toMatchObject({ ok: true, case: 'remote', panel: 'remote', running: true, loaded: false });
    expect(reply.errors).toEqual([{ message: expect.stringMatching(/Unexpected token|Unexpected/), line: 2 }]);
  });

  it('lists a bridge call the studio refused, with why, and the console lines', async () => {
    const reply = await studio().write({
      source: `<script>console.log('ready', { keys: 4 }); basecase.action('launch');</script>`,
    });

    expect(reply).toMatchObject({ ok: true, loaded: true, errors: [] });
    expect(reply.refused).toEqual(['action refused: launch is no action']);
    expect(reply.logs).toEqual(['ready {"keys":4}']);
  });

  it('reloads the panel of a running Case without opening it again, so the try keeps running', async () => {
    const app = studio({ running: true });

    await app.write({ source: '<button>Wave</button>' });
    expect(app.calls.open).not.toHaveBeenCalled();
    expect(app.calls.enterCase).not.toHaveBeenCalled();

    const idle = studio({ running: false });

    await idle.write({ source: '<button>Wave</button>' });
    expect(idle.calls.enterCase).toHaveBeenCalledWith('remote');
  });

  it('makes each write one undo step, so undo restores the previous source', async () => {
    const app = studio();

    await app.write({ source: '<button>Wave</button>' });
    await app.write({ source: '<button>Wave</button><button>Sit</button>' });
    expect(app.history()).toBe(2);
    expect(app.read().source).toBe('<button>Wave</button><button>Sit</button>');

    app.renameCase('Rover Remote');
    app.undo();
    expect(app.read().source).toBe('<button>Wave</button>');
    app.undo();
    expect(app.read()).toMatchObject({ ok: false, problem: 'Rover Remote has no code panel named remote.' });
  });

  it('undoes only the code writes while the Case runs, leaving the parts edit before them alone', async () => {
    const app = studio();
    const parts = rover.parts.slice(0, 2);

    app.editParts(parts);
    await app.write({ source: '<button>Wave</button>' });
    app.undo(true);
    app.undo(true);
    expect(app.parts()).toBe(parts);
    expect(app.history()).toBe(1);
    app.undo();
    expect(app.parts()).toEqual([]);
  });

  it('refuses an oversized source through parseCase, and changes nothing', async () => {
    const app = studio();
    const reply = await app.write({ source: `<p>${'x'.repeat(256 * 1024)}</p>` });

    expect(reply).toEqual({
      ok: false,
      problem: expect.stringMatching(/^console\.panels\[\d+\]\.source must be at most 256 KB/),
    });
    expect(app.history()).toBe(0);
  });
});
