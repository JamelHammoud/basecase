export class EventHub {
  constructor() {
    this.listeners = new Set();
  }

  get size() {
    return this.listeners.size;
  }

  on(listener) {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {}
    }
  }
}
