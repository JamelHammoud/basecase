const MAX_VALUES = 262_144;
const MAX_ROWS = 32_768;

interface SampleInput {
  timestep: number;
  duration: number;
  actuators: number[];
  sample: (time: number, ctrl: Float64Array) => void;
}

export class LinearControlSamples {
  private readonly times: Float64Array;
  private readonly values: Float64Array;
  private readonly width: number;
  private readonly timestep: number;
  private readonly actuators: number[];

  static prepare(input: SampleInput): LinearControlSamples | null {
    const rows = Math.ceil(input.duration / input.timestep) + 1;
    const width = Math.max(0, ...input.actuators) + 1;

    if (input.timestep <= 0 || !Number.isFinite(rows) || rows > MAX_ROWS || rows * width > MAX_VALUES) return null;

    return new LinearControlSamples(input, rows, width);
  }

  private constructor(input: SampleInput, rows: number, width: number) {
    this.timestep = input.timestep;
    this.actuators = input.actuators;
    this.width = width;
    this.times = new Float64Array(rows);
    this.values = new Float64Array(rows * width);

    let time = 0;

    for (let i = 0; i < rows; i++) {
      this.times[i] = time;
      input.sample(time, this.values.subarray(i * width, (i + 1) * width));
      time += input.timestep;
    }
  }

  apply(time: number, ctrl: Float64Array): boolean {
    const row = Math.round(time / this.timestep);

    if (row < 0 || row >= this.times.length || this.times[row] !== time) return false;

    for (const actuator of this.actuators) ctrl[actuator] = this.values[row * this.width + actuator];

    return true;
  }
}
