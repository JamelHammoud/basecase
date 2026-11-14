import { AgentChoice } from '../../types/robotics';
import { ComposerSubmit } from './Composer';
import { Draft } from './useDraft';
import { QueueControls, SendIntent, SendToAgent } from './types';

interface SubmitOptions {
  draft: Draft;
  queue: QueueControls;
  isBusy: boolean;
  onSend: SendToAgent;
  choice: AgentChoice;
  scrollToBottom: () => void;
}

export function useSubmit({ draft, queue, isBusy, onSend, choice, scrollToBottom }: SubmitOptions) {
  'use memo';

  const paramsOf = (content: ComposerSubmit) => ({ ...content, ...choice });

  const sendNow = async (content: ComposerSubmit) => {
    scrollToBottom();
    await onSend(paramsOf(content), 'now');
  };

  const submit = async (content: ComposerSubmit, intent: SendIntent) => {
    const slot = draft.editing;

    draft.finishEdit();

    if (slot && isBusy && intent !== 'now') {
      queue.put(slot, paramsOf(content));

      return;
    }

    if (isBusy && intent === 'queue') {
      await onSend(paramsOf(content), 'queue');

      return;
    }

    await sendNow(content);
  };

  return { submit, sendNow };
}
