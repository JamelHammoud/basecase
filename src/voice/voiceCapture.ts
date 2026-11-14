import { listen, VOICE_SAMPLE_RATE, type Listening, type VoiceModel } from './voiceModel';

export interface Capture {
  stop: () => void;
}

interface CaptureInput extends Omit<Listening, 'sampleRate'> {
  model: VoiceModel;
  source: (context: AudioContext) => AudioNode;
}

const CAPTURE_PROCESSOR = 'voice-capture';
const CHUNK_SECONDS = 0.1;
const MICROPHONE: MediaStreamConstraints = {
  audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  video: false,
};

const stopTracks = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop());

async function requestMicrophone(): Promise<MediaStream | null> {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;

  if (!devices?.getUserMedia) return null;

  return devices.getUserMedia(MICROPHONE).catch(() => null);
}

function voiceContext(): AudioContext {
  try {
    return new AudioContext({ sampleRate: VOICE_SAMPLE_RATE });
  } catch {
    return new AudioContext();
  }
}

async function wire(context: AudioContext, { model, source, ...listening }: CaptureInput): Promise<Capture> {
  await context.audioWorklet.addModule(new URL('./voiceCapture.worklet.js', import.meta.url));

  const recognizer = listen(model, { ...listening, sampleRate: context.sampleRate });
  const input = source(context);
  const node = new AudioWorkletNode(context, CAPTURE_PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    channelCountMode: 'explicit',
    processorOptions: { recognizerId: recognizer.id, chunkSeconds: CHUNK_SECONDS },
  });

  model.registerPort(node.port);
  input.connect(node);
  void context.resume();

  return {
    stop: () => {
      input.disconnect();
      node.port.close();
      recognizer.remove();
      void context.close();
    },
  };
}

export async function startCapture(input: CaptureInput): Promise<Capture> {
  const context = voiceContext();

  return wire(context, input).catch((error: unknown) => {
    void context.close();

    throw error;
  });
}

export async function captureMicrophone(input: Omit<CaptureInput, 'source'>): Promise<Capture | null> {
  const stream = await requestMicrophone();

  if (!stream) return null;

  const capture = await startCapture({ ...input, source: (context) => context.createMediaStreamSource(stream) }).catch(
    () => null,
  );

  if (!capture) {
    stopTracks(stream);

    return null;
  }

  return {
    stop: () => {
      capture.stop();
      stopTracks(stream);
    },
  };
}
