import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

export function checkedFleetOrigin(value) {
  const origin = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);

  if (
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    (origin.protocol !== 'https:' && !(loopback && origin.protocol === 'http:'))
  )
    throw new Error('Fleet address refused');

  return origin.origin;
}

function statusOf(event) {
  if (event.event === 'link') return event.state === 'connected' ? 'online' : 'offline';

  if (event.event === 'status') return event.fault_latched ? 'fault' : 'online';

  return null;
}

export class StudioPublisher {
  constructor(options) {
    this.origin = checkedFleetOrigin(options.origin);
    this.org = options.org;
    this.token = options.token;
    this.units = new Map(Object.entries(options.units));
    this.pending = new Map();
    this.generations = new Map();
    this.active = new Map();
    this.last = new Map();
    this.closed = false;

    if (
      this.units.size > 32 ||
      !/^[0-9a-f-]{36}$/.test(this.org) ||
      !/^[\w-]{43}$/.test(this.token) ||
      ![...this.units.values()].every((id) => /^[0-9a-f-]{36}$/.test(id))
    )
      throw new Error('Fleet publisher configuration refused');
  }

  async request(suffix, body) {
    const response = await fetch(`${this.origin}/v1/${this.org}/${suffix}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error('Fleet publish refused');

    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;

    for (;;) {
      const chunk = await reader.read();

      if (chunk.done) break;

      size += chunk.value.length;

      if (size > 4096) {
        await reader.cancel();

        throw new Error('Fleet response refused');
      }

      chunks.push(Buffer.from(chunk.value));
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  publish(event) {
    const robot = this.units.get(event.unit);
    const status = statusOf(event);
    const now = Date.now();
    const last = this.last.get(robot);

    if (this.closed || !robot || !status) return Promise.resolve();

    if (event.event === 'status' && last?.status === status && now - last.time < 1000)
      return this.active.get(robot) ?? Promise.resolve();

    this.last.set(robot, { time: now, status });
    this.pending.set(robot, {
      robot,
      status,
      reconnect: this.pending.get(robot)?.reconnect || (event.event === 'link' && event.state === 'connected'),
      observedAt: new Date(now).toISOString(),
      event: randomUUID(),
    });

    if (this.active.has(robot)) return this.active.get(robot);

    const active = this.drain(robot).finally(() => this.active.delete(robot));

    this.active.set(robot, active);

    return active;
  }

  async drain(robot) {
    while (this.pending.has(robot) && !this.closed) {
      const update = this.pending.get(robot);

      this.pending.delete(robot);

      try {
        await this.sendUpdate(robot, update);
      } catch {
        continue;
      }
    }
  }

  async sendUpdate(robot, update) {
    if (update.reconnect) this.generations.delete(robot);

    if (!this.generations.has(robot))
      this.generations.set(robot, (await this.request(`generations/${robot}`, {})).generation);

    await this.request('status', [
      {
        robot,
        status: update.status,
        observedAt: update.observedAt,
        event: update.event,
        generation: this.generations.get(robot),
      },
    ]);
  }

  dispose() {
    this.closed = true;
    this.pending.clear();
  }
}

export function configuredStudioPublisher() {
  const file = process.env.BASECASE_FLEET_CONFIG;

  if (!file) return null;

  try {
    if (statSync(file).size > 65536) throw new Error('Fleet publisher configuration refused');

    return new StudioPublisher(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    process.stderr.write('Fleet publisher configuration refused\n');

    return null;
  }
}
