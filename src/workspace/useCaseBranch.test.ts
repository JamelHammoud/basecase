import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { loadRecordingBytes } from '../cases/tryStore';
import type { Simulation } from '../sim/useSimulation';
import type { ContinuationTakeover } from '../sim/continuationSession';
import { StartupLease } from './startupLease';
import { useStartupLease } from './useStartupLease';
import { useCaseBranch, type BranchTryInput } from './useCaseBranch';

vi.mock('../cases/tryStore', () => ({ loadRecordingBytes: vi.fn() }));
vi.mock('./useStartupLease', () => ({ useStartupLease: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

function setup() {
  const lease = new StartupLease();
  const bytes = new Uint8Array([1, 2, 3]);
  const response = {
    branch: { version: 1, checkpoint: 'a'.repeat(64), frame: 50, time: 1 },
    controller: { kind: 'drive', setup: { kind: 'pose' } },
    started: 4,
    deadline: 14,
  } as ContinuationTakeover;
  const sim = {
    branch: vi.fn().mockResolvedValue(response),
    cancelBranch: vi.fn(),
    drive: { resume: vi.fn().mockReturnValue(true), stop: vi.fn() },
    play: vi.fn(),
    subscribeStop: vi.fn(),
    status: 'ready',
  };
  const options = {
    sim: sim as unknown as Simulation,
    scope: {},
    setPhase: vi.fn(),
    setStartedAt: vi.fn(),
    onRefuse: vi.fn(),
  };
  const input = {
    source: { id: 'source' },
    scoring: { kase: { task: { seconds: 10 } } },
    frame: 50,
    current: vi.fn().mockReturnValue(true),
    started: vi.fn(),
  } as unknown as BranchTryInput;
  let branch: ReturnType<typeof useCaseBranch> | undefined;

  vi.mocked(useStartupLease).mockReturnValue(lease);
  vi.mocked(loadRecordingBytes).mockResolvedValue(bytes);

  function Harness() {
    branch = useCaseBranch(options);

    return null;
  }

  renderToString(createElement(Harness));

  return { lease, bytes, response, sim, options, input, branch: branch! };
}

it('adopts retained control and the original clock, keeps the source immutable and retains the save lease when driving stops', async () => {
  const { branch, sim, input, options, bytes } = setup();
  const source = structuredClone(input.source);

  expect(await branch.start(input)).toBe(true);
  expect(sim.branch).toHaveBeenCalledWith(50, input.scoring.kase, bytes);
  expect(sim.drive.resume).toHaveBeenCalledOnce();
  expect(options.setStartedAt).toHaveBeenCalledWith(4);
  expect(input.started).toHaveBeenCalledOnce();
  expect(sim.play).toHaveBeenCalledOnce();
  expect(vi.mocked(useStartupLease).mock.calls.at(-1)![3]!()).toBe(true);
  expect(branch.valid(branch.context()!)).toBe(true);
  expect(input.source).toEqual(source);
  branch.clear();
  expect(branch.context()).toBeNull();
});

it.each(['cancel', 'selection', 'scope'])(
  'releases a restored temporary session after %s changes during startup',
  async (change) => {
    const { branch, sim, input, lease, response } = setup();
    let resolve: (value: ContinuationTakeover) => void = () => {};

    let announce = () => {};
    const entered = new Promise<void>((done) => {
      announce = done;
    });

    sim.branch.mockImplementation(() => {
      announce();

      return new Promise((done) => {
        resolve = done;
      });
    });

    const pending = branch.start(input);

    await entered;
    expect(sim.branch).toHaveBeenCalledOnce();

    if (change === 'cancel') branch.cancel();

    if (change === 'selection') vi.mocked(input.current).mockReturnValue(false);

    if (change === 'scope') lease.cancel();

    resolve(response);
    expect(await pending).toBe(false);
    expect(sim.cancelBranch).toHaveBeenCalled();
    expect(sim.drive.resume).not.toHaveBeenCalled();
    expect(branch.context()).toBeNull();
  },
);

it('refuses a missing source or unsupported drive without playing or retaining a branch', async () => {
  const { branch, sim, input } = setup();

  vi.mocked(loadRecordingBytes).mockResolvedValueOnce(null);
  expect(await branch.start(input)).toBe(false);
  expect(sim.branch).not.toHaveBeenCalled();
  sim.drive.resume.mockReturnValueOnce(false);
  expect(await branch.start(input)).toBe(false);
  expect(sim.cancelBranch).toHaveBeenCalledOnce();
  expect(sim.play).not.toHaveBeenCalled();
});
