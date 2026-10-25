import React, { createContext, useContext } from 'react';
import { designerColor } from '../../design-system';
import type { AcpChatMessage } from '../../types/robotics';
import { designerSlots, type DesignerFocus } from '../../utils/designers';

interface Designers {
  colorOf: (callId: string) => string;
  focus: (focus: DesignerFocus | null) => void;
  opened: string | null;
  open: (callId: string | null) => void;
}

const fallback: Designers = { colorOf: () => designerColor(0), focus: () => {}, opened: null, open: () => {} };

const DesignersContext = createContext<Designers>(fallback);

export const DesignersProvider: React.FC<{
  messages: AcpChatMessage[];
  opened: string | null;
  onOpen: (callId: string | null) => void;
  onFocus: (focus: DesignerFocus | null) => void;
  children: React.ReactNode;
}> = ({ messages, opened, onOpen, onFocus, children }) => {
  const slots = designerSlots(messages);

  return (
    <DesignersContext
      value={{
        colorOf: (callId) => designerColor(slots.get(callId) ?? 0),
        focus: onFocus,
        opened,
        open: onOpen,
      }}
    >
      {children}
    </DesignersContext>
  );
};

export const useDesigners = () => useContext(DesignersContext);
