import React, { useState } from 'react';
import { lastAtOrBefore } from '../../../dataLayers/track';
import { messageTree } from '../../../topics/messageTree';
import { useBus, type PanelViewProps } from '../panelContext';
import { MessageTreeRows } from './MessageTreeRows';
import { Titled } from './PanelTitle';
import { secondsText } from './topicRows';

export const MessagePanel: React.FC<PanelViewProps<'message'>> = ({ panel, ctx }) => {
  const bus = useBus(ctx.bus);
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const topic = bus.topics?.()?.topic(panel.topic) ?? null;
  const head = bus.playhead();
  const message = topic && head ? lastAtOrBefore(topic.t, head.at) : -1;

  if (!topic || message < 0) return null;

  const flip = (path: string) =>
    setFlipped((was) => {
      const next = new Set(was);

      if (!next.delete(path)) next.add(path);

      return next;
    });

  return (
    <Titled title={panel.title}>
      <div data-testid="message-tree" data-topic={topic.topic} data-at={secondsText(topic.t[message])}>
        <div className="h-[28px] flex items-center justify-between gap-3 text-[12px] text-white/50">
          <span className="min-w-0 truncate">{topic.topic}</span>
          <span className="shrink-0 tabular-nums">{secondsText(topic.t[message])} s</span>
        </div>
        <MessageTreeRows nodes={messageTree(topic, message)} depth={0} path="" opening={{ flipped, flip }} />
      </div>
    </Titled>
  );
};
