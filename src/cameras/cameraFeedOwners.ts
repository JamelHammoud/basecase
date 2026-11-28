type CameraLink = () => MessagePort;

type ConnectCameras = (link: CameraLink | null) => void;

export function cameraFeedOwners() {
  const owners = new Map<object, string[]>();
  const links = new Map<ConnectCameras, Map<object, CameraLink>>();
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((listener) => listener());

  return {
    connect(owner: object, connect: ConnectCameras, link: CameraLink) {
      const connected = links.get(connect) ?? new Map<object, CameraLink>();

      connected.set(owner, link);
      links.set(connect, connected);
      connect(link);

      return () => {
        const current = [...connected.keys()].at(-1) === owner;

        connected.delete(owner);

        if (!connected.size) links.delete(connect);

        if (current) connect([...connected.values()].at(-1) ?? null);
      };
    },
    register(owner: object, cameras: string[]) {
      owners.set(owner, cameras);
      changed();

      return () => {
        owners.delete(owner);
        changed();
      };
    },
    covers(cameras: string[]) {
      return (
        cameras.length > 0 && cameras.every((camera) => [...owners.values()].some((keys) => keys.includes(camera)))
      );
    },
    subscribe(listener: () => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
