export interface ClosableFrame {
  close(): void;
}

export class LatestFrameQueue<T extends { frame: ClosableFrame; modelId: string; camera?: string; producer?: object }> {
  private pending = new Map<string, T>();
  private producers = new WeakMap<object, number>();
  private producerSequence = 0;
  private onDrop: (job: T) => void;
  private running = false;
  private closed = false;
  private run: (job: T) => Promise<void>;

  constructor(run: (job: T) => Promise<void>, onDrop: (job: T) => void = () => undefined) {
    this.run = run;
    this.onDrop = onDrop;
  }

  push(job: T) {
    if (this.closed) {
      this.drop(job);

      return;
    }

    const key = this.key(job);
    const previous = this.pending.get(key);

    if (previous) this.drop(previous);

    this.pending.delete(key);

    if (this.pending.size >= 32) this.dropOldest();

    this.pending.set(key, job);
    void this.drain();
  }

  private key(job: T) {
    const producer = job.producer;

    if (producer && !this.producers.has(producer)) this.producers.set(producer, ++this.producerSequence);

    return JSON.stringify([producer ? this.producers.get(producer) : 0, job.camera ?? '', job.modelId]);
  }

  private drop(job: T) {
    try {
      job.frame.close();
    } finally {
      this.onDrop(job);
    }
  }

  removeProducer(producer: object) {
    for (const [key, job] of this.pending) {
      if (job.producer !== producer) continue;

      this.pending.delete(key);
      this.drop(job);
    }
  }

  private dropOldest() {
    const entry = this.pending.entries().next().value;

    if (!entry) return;

    this.pending.delete(entry[0]);
    this.drop(entry[1]);
  }

  private async drain() {
    if (this.running) return;

    this.running = true;

    try {
      while (this.pending.size && !this.closed) {
        const [key, job] = this.pending.entries().next().value!;

        this.pending.delete(key);
        await this.run(job).catch(() => undefined);
        job.frame.close();
      }
    } finally {
      this.running = false;
    }
  }

  close() {
    this.closed = true;

    for (const job of this.pending.values()) this.drop(job);

    this.pending.clear();
  }
}
