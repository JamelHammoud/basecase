import React from 'react';
import { Section, TextArea, useScrollFade } from '../../design-system';
import { CommentsSection } from './CommentsSection';
import type { InspectorProps } from './types';

export const SceneInspector: React.FC<InspectorProps> = (props) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const { globalGoal, onChangeGoal } = props;

  return (
    <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <Section title="Project description" collapsible defaultOpen={false}>
        <TextArea
          rows={6}
          value={globalGoal}
          onChange={(e) => onChangeGoal(e.target.value, true)}
          onBlur={(e) => onChangeGoal(e.target.value, false)}
        />
      </Section>

      <CommentsSection {...props} list={props.annotations} />
    </div>
  );
};
