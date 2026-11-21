import React from 'react';
import { MultiInspector } from './inspector/MultiInspector';
import { PartInspector } from './inspector/PartInspector';
import { SceneInspector } from './inspector/SceneInspector';
import type { InspectorProps } from './inspector/types';
import { ParametersSection } from './inspector/ParametersSection';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';

const body = (props: InspectorProps) => {
  if (props.selectedParts.length > 1) return <MultiInspector {...props} />;

  if (props.part) return <PartInspector {...props} part={props.part} />;

  return <SceneInspector {...props} />;
};

export const Inspector: React.FC<InspectorProps> = (props) => (
  <div className="flex flex-col flex-1 min-h-0">
    {props.parameters && !IS_WEB_DEMO && <ParametersSection controls={props.parameters} part={props.part} />}
    {body(props)}
  </div>
);
