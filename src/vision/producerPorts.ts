export class ProducerPorts {
  private ports = new Map<number, MessagePort>();
  private onFrame: (message: Record<string, unknown>, port: MessagePort, producerId: number) => void;
  private onDetach: (port: MessagePort) => void;

  constructor(
    onFrame: (message: Record<string, unknown>, port: MessagePort, producerId: number) => void,
    onDetach: (port: MessagePort) => void,
  ) {
    this.onFrame = onFrame;
    this.onDetach = onDetach;
  }

  attach(producerId: number, port: MessagePort) {
    this.detach(producerId);
    this.ports.set(producerId, port);
    port.onmessage = ({ data }) => {
      if (data?.type === 'detach') {
        this.detach(producerId);

        return;
      }

      if (data?.type === 'frame' && data.frame) this.onFrame(data, port, producerId);
    };
    port.start();
  }

  has(producerId: number, port: MessagePort) {
    return this.ports.get(producerId) === port;
  }

  detach(producerId: number) {
    const port = this.ports.get(producerId);

    if (!port) return;

    this.ports.delete(producerId);
    port.onmessage = null;
    this.onDetach(port);
    port.close();
  }

  close() {
    for (const producerId of this.ports.keys()) this.detach(producerId);
  }
}
