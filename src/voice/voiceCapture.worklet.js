const INT16_SCALE = 0x8000;

class VoiceCapture extends globalThis.AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super();
    this.recognizerId = processorOptions.recognizerId;
    this.chunk = new Float32Array(Math.round(globalThis.sampleRate * processorOptions.chunkSeconds));
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];

    if (channel) this.take(channel);

    return true;
  }

  take(channel) {
    for (const sample of channel) {
      this.chunk[this.filled++] = sample * INT16_SCALE;

      if (this.filled === this.chunk.length) this.send();
    }
  }

  send() {
    const data = this.chunk;

    this.chunk = new Float32Array(data.length);
    this.filled = 0;
    this.port.postMessage(
      { action: 'audioChunk', recognizerId: this.recognizerId, data, sampleRate: globalThis.sampleRate },
      [data.buffer],
    );
  }
}

globalThis.registerProcessor('voice-capture', VoiceCapture);
