export class AdapterMissing extends Error {
  constructor(name, what) {
    super(`Needs ${what} (adapter "${name}")`);
    this.adapter = name;
  }
}
