import React from 'react';
import type { SceneAnnotation, ScenePart } from '../../types/robotics';
import { COMPONENT_BY_ID } from '../../data/components';
import type { HardwareSpec } from '../../data/hardware';
import { HardwareConfigurator, HardwareSpecs } from '../HardwareConfigurator';
import { IconButton, useScrollFade, PlusIcon } from '../../design-system';
import { isTunable } from '../../agent/cadTune';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import { CommentsSection } from './CommentsSection';
import { DimensionsSection } from './DimensionsSection';
import { NotesSection } from './NotesSection';
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
          icon={<PlusIcon className="w-3.5 h-3.5" />}
          title="Add clearance hole"
          size="xs"
          onClick={onAddClearanceHole}
        />
      )
    }
  />
);

const canTune = (part: ScenePart) => !IS_WEB_DEMO && isTunable(part);

const PartInspectorBody: React.FC<PartInspectorProps & { partComments: SceneAnnotation[] }> = (props) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const { part, onUpdate, partComments } = props;
  const isImage = part.kind === 'image_plane';
  const hw = part.hardware;
  const comp = part.componentId ? COMPONENT_BY_ID[part.componentId] : undefined;
  const sized = !hw && !comp;
  const styled = !isImage && !comp;
  const tunable = canTune(part);

  return (
    <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <PartHeader {...props} />

      {isImage && <ImageSection part={part} onUpdate={onUpdate} />}

      {hw && <HardwareConfigurator spec={hw} onChange={props.onChangeHardware} />}

      {sized && <SizeSection part={part} onUpdate={onUpdate} isImage={isImage} />}

      {tunable && (
        <DimensionsSection
          key={`dimensions-${part.id}`}
          part={part}
          code={part.cad!.code}
          onTune={props.onTuneDimensions}
        />
      )}

      <PositionSection {...props} />

      <RotationSection part={part} onUpdate={onUpdate} />

      {styled && !hw && <ShapeSection part={part} onUpdate={onUpdate} />}

      {styled && <AppearanceSection part={part} onUpdate={onUpdate} parts={props.parts} />}

      {hw && <HardwareHoles hw={hw} onAddClearanceHole={props.onAddClearanceHole} />}

      {partComments.length > 0 && <CommentsSection {...props} list={partComments} />}

      <NotesSection
        key={`notes-${part.id}`}
        value={part.note ?? ''}
        rows={3}
        onChange={(note, live) => onUpdate({ note }, live)}
      />

      {comp && <ProductSection part={part} comp={comp} />}
    </div>
  );
};

export const PartInspector: React.FC<PartInspectorProps> = (props) => {
  const partComments = props.annotations.filter((a) => a.partId === props.part.id);

  return <PartInspectorBody {...props} partComments={partComments} />;
};
