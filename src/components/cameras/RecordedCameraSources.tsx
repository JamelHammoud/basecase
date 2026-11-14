import React from 'react';
import type { CaseConsole } from '../../cases/console/format';
import type { StoredTry, TryVideo } from '../../cases/tryFile';
import { consoleVisionCameras } from '../../workspace/useConsoleVision';
import type { TryTimeline } from '../../workspace/useTryTimeline';
import { RecordedCameraTile } from './RecordedCameraTile';

interface RecordedCameraSourcesProps {
  active: boolean;
  recorded: StoredTry | null;
  console: CaseConsole;
  timeline: TryTimeline;
}

function shown(console: CaseConsole, video: TryVideo) {
  return console.panels.some(
    (panel) => panel.kind === 'camera' && (panel.signal === 'camera.*' || panel.signal === `camera.${video.camera}`),
  );
}

export const RecordedCameraSources: React.FC<RecordedCameraSourcesProps> = ({
  active,
  recorded,
  console,
  timeline,
}) => {
  const requested = new Set(consoleVisionCameras(console));
  const videos = recorded?.videos?.filter((video) => requested.has(video.camera) && !shown(console, video)) ?? [];

  if (!active || !recorded || !timeline.open || !videos.length) return null;

  return (
    <div hidden>
      {videos.map((video) => (
        <RecordedCameraTile
          key={`${recorded.id}:${video.camera}:${video.path}`}
          id={recorded.id}
          video={video}
          source={recorded.source}
          time={timeline.recording?.t[timeline.frame] ?? 0}
        />
      ))}
    </div>
  );
};
