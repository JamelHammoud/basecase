import React from 'react';
import { FloatingField } from '../../design-system';
import type { TagTarget } from './useTagTries';

interface TagTriesFieldProps {
  target: TagTarget | null;
  onDone: (text: string | null) => void;
}

export const TagTriesField: React.FC<TagTriesFieldProps> = ({ target, onDone }) =>
  target && <FloatingField x={target.x} y={target.y} name={target.before.join(', ')} label="Tags" onDone={onDone} />;
