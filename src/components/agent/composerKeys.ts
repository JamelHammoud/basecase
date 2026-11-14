import type { ShortcutHandlers } from '../../app/shortcuts';
import type { SendIntent } from './types';

export interface ComposerKeyState {
  editing: boolean;
  isBusy: boolean;
  hasDraft: boolean;
  submit: (intent: SendIntent) => void;
  cancelEdit: () => void;
  stop: () => void;
}

export const composerKeyHandlers = (state: ComposerKeyState): ShortcutHandlers<boolean> => ({
  send: () => {
    state.submit('default');

    return true;
  },
  queue: () => {
    state.submit('queue');

    return true;
  },
  stop: () => {
    const stops = !state.editing && state.isBusy && !state.hasDraft;

    if (state.editing) state.cancelEdit();

    if (stops) state.stop();

    return state.editing || stops;
  },
});
