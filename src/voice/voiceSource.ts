import type { InputSource } from '../sim/inputTypes';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';

export const VOICE_DESKTOP_ONLY = 'Voice works only in the desktop app.';

const session = () => import('./voiceSession');

export const voiceInputSource: InputSource = {
  id: 'voice',
  read: () => null,
  open: async () => (IS_WEB_DEMO ? VOICE_DESKTOP_ONLY : (await session()).openVoice()),
  close: () => void session().then(({ closeVoice }) => closeVoice()),
};
