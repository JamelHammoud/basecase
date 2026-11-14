import React from 'react';
import { OPERATOR_KEY, useOperatorCamera } from '../../../cameras/operator/operatorCamera';
import { RecordedCameraTile } from '../../cameras/RecordedCameraTile';
import { CameraTile } from '../../cameras/CameraTile';
import { OperatorTile } from '../../cameras/OperatorTile';
import type { PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';

export const CameraPanel: React.FC<PanelViewProps<'camera'>> = ({ panel, ctx }) => {
  const cameras = ctx.studio?.cameras;
  const operator = useOperatorCamera();
  const timeline = ctx.studio?.cases.timeline;
  const recorded = ctx.studio?.recorded;
  const id = recorded?.id ?? null;
  const videos = recorded?.videos ?? [];

  if (!cameras) return null;

  const key = panel.signal.slice('camera.'.length);
  const views = cameras.views.filter((v) => key === '*' || v.key === key);
  const stream = !id && key === OPERATOR_KEY ? operator.stream : null;
  const clips = videos.filter((video) => key === '*' || video.camera === key);
  const shown = id && videos.length ? [] : views;

  return (
    <Titled title={panel.title}>
      <div className="flex flex-col gap-2">
        {stream && <OperatorTile stream={stream} label={operator.label} large={false} fill />}
        {id &&
          clips.map((video) => (
            <RecordedCameraTile
              key={`${id}:${video.camera}:${video.path}`}
              id={id}
              video={video}
              source={recorded!.source}
              time={timeline?.recording?.t[timeline.frame] ?? 0}
            />
          ))}
        {shown.map((view) => (
          <CameraTile key={view.key} {...cameras.tile(view)} fill />
        ))}
      </div>
    </Titled>
  );
};
