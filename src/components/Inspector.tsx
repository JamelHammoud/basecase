import React from 'react';
import { MultiInspector } from './inspector/MultiInspector';
import { PartInspector } from './inspector/PartInspector';
import { SceneInspector } from './inspector/SceneInspector';
import type { InspectorProps } from './inspector/types';

export const Inspector: React.FC<InspectorProps> = (props) => {
  if (props.selectedParts.length > 1) return <MultiInspector {...props} />;

  if (props.part) return <PartInspector {...props} part={props.part} />;

  return <SceneInspector {...props} />;
};
