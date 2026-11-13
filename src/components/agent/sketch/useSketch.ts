import React, { useState } from 'react';
import { sketchFile } from './sketchFile';
import { InkedStroke } from './sketchStrokes';
import { focusPromptSoon } from '../focusPromptSoon';

interface SketchOptions {
  request: number;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
  onAttach: (files: File[]) => Promise<void>;
}

export function useSketch({ request, promptRef, onAttach }: SketchOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [strokes, setStrokes] = useState<InkedStroke[]>([]);
  const [seenRequest, setSeenRequest] = useState(0);

  if (request !== seenRequest) {
    setSeenRequest(request);
    setIsOpen(true);
  }

  const back = () => {
    setIsOpen(false);
    setStrokes([]);
    focusPromptSoon(promptRef);
  };

  const done = async () => {
    back();

    const file = await sketchFile(strokes);

    if (file) await onAttach([file]);
  };

  return {
    isOpen,
    strokes,
    open: () => setIsOpen(true),
    back,
    done,
    addStroke: (stroke: InkedStroke) => setStrokes((prev) => [...prev, stroke]),
    undo: () => setStrokes((prev) => prev.slice(0, -1)),
  };
}
