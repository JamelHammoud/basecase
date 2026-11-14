import type { InputSource } from '../sim/inputTypes';

const session = () => import('./voiceSession');

export const voiceInputSource: InputSource = {
  id: 'voice',
  read: () => null,
  open: async () => (await session()).openVoice(),
  close: () => void session().then(({ closeVoice }) => closeVoice()),
};
