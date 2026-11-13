import React from 'react';
import { useScrollFade } from '../../design-system';
import { CommentsSection } from './CommentsSection';
import { NotesSection } from './NotesSection';
import type { InspectorProps } from './types';

export const SceneInspector: React.FC<InspectorProps> = (props) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const { globalGoal, onChangeGoal } = props;

  return (
    <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <NotesSection value={globalGoal} rows={6} onChange={onChangeGoal} />

      <CommentsSection {...props} list={props.annotations} />
    </div>
  );
};
