import { emitInputEvent } from '../sim/inputEvents';
import { namedMidi } from './midiMessage';

let session = 0;
let detach: (() => void) | null = null;

function onMessage(event: MIDIMessageEvent) {
  const data = event.data;

  if (!data || data.length < 2) return;

  const named = namedMidi([data[0], data[1], data.length > 2 ? data[2] : 0]);

  if (named) emitInputEvent(named.name, named.value);
}

function listenTo(access: MIDIAccess) {
  const inputs = new Set<MIDIInput>();

  const add = (input: MIDIInput) => {
    if (inputs.has(input)) return;

    inputs.add(input);
    input.addEventListener('midimessage', onMessage);
  };

  const onState = (event: MIDIConnectionEvent) => {
    const port = event.port;

    if (port?.type === 'input' && port.state === 'connected') add(port as MIDIInput);
  };

  access.inputs.forEach(add);
  access.addEventListener('statechange', onState);

  return () => {
    access.removeEventListener('statechange', onState);
    inputs.forEach((input) => input.removeEventListener('midimessage', onMessage));
    inputs.clear();
  };
}

export function closeMidiDevices() {
  session += 1;
  detach?.();
  detach = null;
}

export function openMidiDevices() {
  closeMidiDevices();

  const mine = session;

  if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) return;

  void Promise.resolve()
    .then(() => navigator.requestMIDIAccess({ sysex: false }))
    .then(
      (access) => {
        if (mine === session) detach = listenTo(access);
      },
      () => undefined,
    );
}
