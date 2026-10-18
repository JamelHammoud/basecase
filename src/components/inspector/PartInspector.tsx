import React from 'react';
import { Plus } from 'lucide-react';
import type { SceneAnnotation, ScenePart } from '../../types/robotics';
import { COMPONENT_BY_ID } from '../../data/components';
import type { HardwareSpec } from '../../data/hardware';
import { HardwareConfigurator, HardwareSpecs } from '../HardwareConfigurator';
import { IconButton, Section, TextArea, useScrollFade } from '../../design-system';
import { CommentsSection } from './CommentsSection';
import { ImageSection, PartHeader, ProductSection, SizeSection } from './partSections';
import { AppearanceSection, PositionSection, RotationSection, ShapeSection } from './partTransformSections';
import type { InspectorProps } from './types';

type PartInspectorProps = InspectorProps & { part: ScenePart };

const HardwareHoles: React.FC<{ hw: HardwareSpec; onAddClearanceHole: () => void }> = ({ hw, onAddClearanceHole }) => (
  <HardwareSpecs
    spec={hw}
    collapsible
    holeAction={
      hw.type !== 'standoff_ff' && (
        <IconButton
          icon={<Plus className="w-3.5 h-3.5" />}
          title="Add clearance hole"
          size="xs"
          onClick={onAddClearanceHole}
        />
      )
    }
  />
);

const PartInspectorBody: React.FC<PartInspectorProps & { partComments: SceneAnnotation[] }> = (props) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const { part, onUpdate, partComments } = props;
  const isImage = part.kind === 'image_plane';
  const hw = part.hardware;
  const comp = part.componentId ? COMPONENT_BY_ID[part.componentId] : undefined;
  const sized = !hw && !comp;
  const styled = !isImage && !comp;

  return (
    <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <PartHeader {...props} isImage={isImage} />

      {isImage && <ImageSection part={part} onUpdate={onUpdate} />}

      {hw && <HardwareConfigurator spec={hw} onChange={props.onChangeHardware} />}

      {sized && <SizeSection part={part} onUpdate={onUpdate} isImage={isImage} />}

      <PositionSection {...props} />

      <RotationSection part={part} onUpdate={onUpdate} />

      {styled && !hw && <ShapeSection part={part} onUpdate={onUpdate} />}

      {styled && <AppearanceSection part={part} onUpdate={onUpdate} parts={props.parts} />}

      {hw && <HardwareHoles hw={hw} onAddClearanceHole={props.onAddClearanceHole} />}

      {partComments.length > 0 && <CommentsSection {...props} list={partComments} />}

      <Section title="Notes" collapsible defaultOpen={false}>
        <TextArea
          rows={3}
          value={part.note}
          onChange={(e) => onUpdate({ note: e.target.value }, true)}
          onBlur={(e) => onUpdate({ note: e.target.value }, false)}
        />
      </Section>

      {comp && <ProductSection part={part} comp={comp} />}
    </div>
  );
};

export const PartInspector: React.FC<PartInspectorProps> = (props) => {
  const partComments = props.annotations.filter((a) => a.partId === props.part.id);

  return <PartInspectorBody {...props} partComments={partComments} />;
};
