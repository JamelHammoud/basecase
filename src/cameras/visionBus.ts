import type { SignalBus } from '../cases/console/signalBus';
import { matches } from '../cases/console/signalNames';
import * as defaultVision from './visionSession';

export function withVisionSignals<T extends SignalBus>(
  bus: T,
  cameras: string[],
  vision: {
    cameraVisionSignals: (cameras: string[]) => Record<string, number>;
    onCameraVision: (listener: () => void) => () => void;
  } = defaultVision,
): T {
  const { cameraVisionSignals, onCameraVision } = vision;
  let version = 0;

  return {
    ...bus,
    read: (id: string) => (id.startsWith('vision.') ? cameraVisionSignals(cameras)[id] : bus.read(id)),
    expand: (pattern: string) => {
      if (!pattern.startsWith('vision.')) return bus.expand(pattern);

      return Object.keys(cameraVisionSignals(cameras)).filter((id) => matches(pattern, id));
    },
    version: () => bus.version() + version,
    subscribe: (listen: () => void) => {
      const stopBus = bus.subscribe(listen);
      const stopVision = onCameraVision(() => {
        version++;
        listen();
      });

      return () => {
        stopBus();
        stopVision();
      };
    },
  };
}
