import { CaseCheckPool } from '../caseChecksClient';
import type { WorkbenchJob } from '../caseCheckJob';
import { StartupLease } from '../../workspace/startupLease';
import type { WorkbenchResult } from './rehearsal';

export class WorkbenchSession {
  private readonly lease = new StartupLease();
  private readonly pool: () => CaseCheckPool;

  constructor(pool: () => CaseCheckPool = () => new CaseCheckPool()) {
    this.pool = pool;
  }

  cancel() {
    this.lease.cancel();
  }

  async run(
    prepare: () => Promise<WorkbenchJob | null>,
    accept: (result: WorkbenchResult, current: () => boolean) => Promise<void>,
  ): Promise<void> {
    const ticket = this.lease.claim();
    const current = () => this.lease.current(ticket);
    const job = await prepare();

    if (!job || !current()) return;

    const pool = this.pool();

    this.lease.retain(ticket, () => pool.dispose());

    try {
      const reply = await pool.run(0, job);

      if (current()) await accept(reply.result, current);
    } finally {
      this.lease.finish(ticket);
    }
  }
}
