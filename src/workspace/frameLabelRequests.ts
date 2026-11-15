export class FrameLabelRequests {
  #version = 0;

  invalidate() {
    this.#version++;
  }

  capture() {
    const version = this.#version;

    return () => version === this.#version;
  }

  async read<T>(wait: Promise<void>, load: () => Promise<T>): Promise<T | undefined> {
    const valid = this.capture();

    await wait;

    if (!valid()) return undefined;

    const value = await load();

    return valid() ? value : undefined;
  }
}
