import React from 'react';
import { FloatingField } from '../../design-system';
import type { TagTarget } from './useTagTries';

interface TagTriesFieldProps {
  target: Pick<TagTarget, 'x' | 'y' | 'before'> | null;
  onDone: (text: string | null) => void;
}

export const TagTriesField: React.FC<TagTriesFieldProps> = ({ target, onDone }) =>
  target && <FloatingField x={target.x} y={target.y} name={target.before.join(', ')} label="Tags" onDone={onDone} />;
